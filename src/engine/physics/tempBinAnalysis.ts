// ─── ASHP Temperature Bin Analysis ────────────────────────────────────────────
// Distributes heating load across temperature bins for accurate COP-weighted
// electricity consumption and peak demand calculation.

import { DAYS_PER_MONTH } from './monthlyProfile';

// ─── Waterloo TMY Temperature Bin Hours ──────────────────────────────────────
// Source: CWEC 2020 weather file for Kitchener/Waterloo (Environment Canada)

export interface TempBin {
  tempC: number;
  hours: number;
}

export const WATERLOO_TEMP_BINS: TempBin[] = [
  { tempC: -25, hours: 15 },
  { tempC: -20, hours: 45 },
  { tempC: -15, hours: 120 },
  { tempC: -10, hours: 350 },
  { tempC: -5,  hours: 650 },
  { tempC: 0,   hours: 800 },
  { tempC: 5,   hours: 900 },
  { tempC: 10,  hours: 1100 },
  { tempC: 15,  hours: 1200 },
  { tempC: 20,  hours: 1800 },
  { tempC: 25,  hours: 1200 },
  { tempC: 30,  hours: 480 },
  { tempC: 35,  hours: 100 },
];
// Total: ~8,760 hours

// ─── COP Curves from Manufacturer Data ───────────────────────────────────────

export interface COPCurvePoint {
  tempC: number;
  cop: number;
  capacityFactor: number;
}

export const ASHP_COP_CURVES = {
  // Mitsubishi ZUBA-CENTRAL (cold climate rated to -25°C)
  mitsubishi_zuba: [
    { tempC: -25, cop: 1.4, capacityFactor: 0.55 },
    { tempC: -20, cop: 1.6, capacityFactor: 0.65 },
    { tempC: -15, cop: 2.0, capacityFactor: 0.75 },
    { tempC: -10, cop: 2.3, capacityFactor: 0.85 },
    { tempC: -5,  cop: 2.7, capacityFactor: 0.92 },
    { tempC: 0,   cop: 3.0, capacityFactor: 0.97 },
    { tempC: 5,   cop: 3.3, capacityFactor: 1.00 },
    { tempC: 10,  cop: 3.5, capacityFactor: 1.00 },
    { tempC: 15,  cop: 3.7, capacityFactor: 1.00 },
  ],
  // Daikin Altherma (moderate climate)
  daikin_altherma: [
    { tempC: -20, cop: 1.3, capacityFactor: 0.50 },
    { tempC: -15, cop: 1.7, capacityFactor: 0.65 },
    { tempC: -10, cop: 2.1, capacityFactor: 0.80 },
    { tempC: -5,  cop: 2.5, capacityFactor: 0.88 },
    { tempC: 0,   cop: 2.8, capacityFactor: 0.95 },
    { tempC: 5,   cop: 3.1, capacityFactor: 1.00 },
    { tempC: 10,  cop: 3.3, capacityFactor: 1.00 },
    { tempC: 15,  cop: 3.5, capacityFactor: 1.00 },
  ],
  // Generic cold-climate ASHP (default for Scout)
  generic_cold_climate: [
    { tempC: -25, cop: 1.3, capacityFactor: 0.50 },
    { tempC: -20, cop: 1.5, capacityFactor: 0.60 },
    { tempC: -15, cop: 1.8, capacityFactor: 0.72 },
    { tempC: -10, cop: 2.2, capacityFactor: 0.82 },
    { tempC: -5,  cop: 2.6, capacityFactor: 0.90 },
    { tempC: 0,   cop: 2.9, capacityFactor: 0.96 },
    { tempC: 5,   cop: 3.2, capacityFactor: 1.00 },
    { tempC: 10,  cop: 3.4, capacityFactor: 1.00 },
    { tempC: 15,  cop: 3.6, capacityFactor: 1.00 },
  ],
} as const;

// ─── Bin Analysis Result ─────────────────────────────────────────────────────

export interface BinAnalysisResult {
  seasonalCOP: number;
  annualElectricity_kWh: number;
  supplementalGas_m3: number;
  supplementalHours: number;
  peakElecDemand_kW: number;
  monthlyProfile: {
    month: number;
    label: string;
    electricity_kWh: number;
    gas_m3: number;
    avgCOP: number;
  }[];
}

// ─── Monthly distribution of heating degree hours ────────────────────────────
// Approximate mapping of temp bins to months based on mean monthly temperatures

function getMonthlyHeatingFractions(tempBins: TempBin[]): number[] {
  // Use a simplified approach: distribute heating based on HDD-like weighting
  // from Waterloo monthly climate data
  const monthlyHDD = [750, 650, 530, 290, 100, 15, 0, 0, 50, 250, 460, 700];
  const totalHDD = monthlyHDD.reduce((s, h) => s + h, 0);
  return monthlyHDD.map(h => h / totalHDD);
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─── Main Bin Analysis ───────────────────────────────────────────────────────

export function ashpBinAnalysis(
  annualHeatingLoad_kWh: number,
  ashpCapacity_kW: number,
  copCurve: readonly COPCurvePoint[],
  tempBins: TempBin[],
  supplementalFuel: 'gas' | 'electric',
  supplementalEfficiency: number,
): BinAnalysisResult {
  // Distribute annual heating load across temperature bins
  // Heating load proportional to (18°C - outdoor temp) × hours at that temp
  const heatingBins = tempBins
    .filter(b => b.tempC < 18)
    .map(b => ({
      ...b,
      heatingDegrees: 18 - b.tempC,
    }));

  const totalHeatingDegreeHours = heatingBins.reduce(
    (s, b) => s + b.heatingDegrees * b.hours, 0
  );

  let totalElec = 0;
  let totalSupplementalGas = 0;
  let supplementalHours = 0;
  let peakElecDemand = 0;

  for (const bin of heatingBins) {
    const binFraction = (bin.heatingDegrees * bin.hours) / totalHeatingDegreeHours;
    const binLoad_kWh = annualHeatingLoad_kWh * binFraction;

    const cop = interpolateCOP(bin.tempC, copCurve);
    const capFactor = interpolateCapacity(bin.tempC, copCurve);

    const availableCapacity_kW = ashpCapacity_kW * capFactor;
    const requiredCapacity_kW = bin.hours > 0 ? binLoad_kWh / bin.hours : 0;

    if (requiredCapacity_kW <= availableCapacity_kW) {
      // ASHP handles full load at this temp
      totalElec += binLoad_kWh / cop;
    } else {
      // ASHP at capacity + supplemental
      const ashpDelivered_kWh = availableCapacity_kW * bin.hours;
      const supplemental_kWh = binLoad_kWh - ashpDelivered_kWh;

      totalElec += ashpDelivered_kWh / cop;
      supplementalHours += bin.hours;

      if (supplementalFuel === 'gas') {
        totalSupplementalGas += supplemental_kWh / (10.33 * supplementalEfficiency);
      } else {
        totalElec += supplemental_kWh / supplementalEfficiency;
      }
    }

    // Track peak electrical demand
    const binElecDemand = availableCapacity_kW / cop;
    if (binElecDemand > peakElecDemand) {
      peakElecDemand = binElecDemand;
    }
  }

  const seasonalCOP = totalElec > 0 ? annualHeatingLoad_kWh / totalElec : 0;

  // Distribute across months based on HDD fractions
  const monthlyFractions = getMonthlyHeatingFractions(tempBins);
  const monthlyProfile = monthlyFractions.map((frac, i) => {
    const monthElec = totalElec * frac;
    const monthGas = totalSupplementalGas * frac;
    const monthLoad = annualHeatingLoad_kWh * frac;
    return {
      month: i + 1,
      label: MONTH_LABELS[i],
      electricity_kWh: Math.round(monthElec),
      gas_m3: Math.round(monthGas),
      avgCOP: monthElec > 0 ? Math.round(monthLoad / monthElec * 100) / 100 : 0,
    };
  });

  return {
    seasonalCOP: Math.round(seasonalCOP * 100) / 100,
    annualElectricity_kWh: Math.round(totalElec),
    supplementalGas_m3: Math.round(totalSupplementalGas),
    supplementalHours,
    peakElecDemand_kW: Math.round(peakElecDemand),
    monthlyProfile,
  };
}

// ─── Interpolation Helpers ───────────────────────────────────────────────────

function interpolateCOP(
  tempC: number,
  curve: readonly { tempC: number; cop: number }[]
): number {
  if (tempC <= curve[0].tempC) return curve[0].cop;
  if (tempC >= curve[curve.length - 1].tempC) return curve[curve.length - 1].cop;

  for (let i = 0; i < curve.length - 1; i++) {
    if (tempC >= curve[i].tempC && tempC <= curve[i + 1].tempC) {
      const frac = (tempC - curve[i].tempC) / (curve[i + 1].tempC - curve[i].tempC);
      return curve[i].cop + frac * (curve[i + 1].cop - curve[i].cop);
    }
  }
  return 2.5;
}

function interpolateCapacity(
  tempC: number,
  curve: readonly { tempC: number; capacityFactor: number }[]
): number {
  if (tempC <= curve[0].tempC) return curve[0].capacityFactor;
  if (tempC >= curve[curve.length - 1].tempC) return curve[curve.length - 1].capacityFactor;

  for (let i = 0; i < curve.length - 1; i++) {
    if (tempC >= curve[i].tempC && tempC <= curve[i + 1].tempC) {
      const frac = (tempC - curve[i].tempC) / (curve[i + 1].tempC - curve[i].tempC);
      return curve[i].capacityFactor + frac * (curve[i + 1].capacityFactor - curve[i].capacityFactor);
    }
  }
  return 0.8;
}
