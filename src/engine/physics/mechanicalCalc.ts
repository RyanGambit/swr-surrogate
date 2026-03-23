import type { MechanicalSystems, COPCurvePoint } from '@/types/physics';
import { ashpBinAnalysis, WATERLOO_TEMP_BINS } from './tempBinAnalysis';

const GAS_KWH_PER_M3 = 10.33;
const WATER_SPECIFIC_HEAT = 4.186; // kJ/kg·K
const WATER_DENSITY = 1.0; // kg/L

// ─── Heating Energy Consumption ─────────────────────────────────────────────

/** Convert thermal heating load to fuel consumption */
export function heatingFuelConsumption(
  netHeatingLoad_kWh: number,
  fuelType: 'gas' | 'electric' | 'oil',
  efficiency: number
): { electricity_kWh: number; gas_m3: number } {
  const delivered = netHeatingLoad_kWh / Math.max(efficiency, 0.5);

  if (fuelType === 'gas') {
    return { electricity_kWh: 0, gas_m3: delivered / GAS_KWH_PER_M3 };
  }
  return { electricity_kWh: delivered, gas_m3: 0 };
}

/** Heat pump energy — uses weighted COP across temperature bins */
export function heatPumpConsumption(
  netHeatingLoad_kWh: number,
  coveragePct: number,
  copCurve: COPCurvePoint[],
  meanWinterTemp_C: number,
  supplementalFuel: 'gas' | 'electric',
  supplementalEfficiency: number = 0.80
): { electricity_kWh: number; gas_m3: number } {
  const hpLoad = netHeatingLoad_kWh * coveragePct;
  const supplementalLoad = netHeatingLoad_kWh * (1 - coveragePct);

  // Weighted average COP using temperature bins
  const weightedCOP = calculateWeightedCOP(copCurve, meanWinterTemp_C);
  const hpElec = hpLoad / Math.max(weightedCOP, 1.0);

  // Supplemental system
  const suppl = heatingFuelConsumption(supplementalLoad, supplementalFuel, supplementalEfficiency);

  return {
    electricity_kWh: hpElec + suppl.electricity_kWh,
    gas_m3: suppl.gas_m3,
  };
}

/** Weighted COP using temperature bin analysis */
function calculateWeightedCOP(
  copCurve: COPCurvePoint[],
  _meanWinterTemp_C: number
): number {
  if (copCurve.length === 0) return 3.0;

  // Convert COPCurvePoint to bin analysis format
  const maxCop = copCurve[copCurve.length - 1].cop || 3.5;
  const binCopCurve = copCurve.map(p => ({
    tempC: p.tempC,
    cop: p.cop,
    capacityFactor: p.capacityFactor ?? (p.cop / maxCop),
  }));

  // Run bin analysis with dummy load to get seasonal COP
  const binResult = ashpBinAnalysis(
    100000,
    50,
    binCopCurve,
    WATERLOO_TEMP_BINS,
    'gas',
    0.80,
  );

  return binResult.seasonalCOP || 3.0;
}

// ─── Cooling Energy ─────────────────────────────────────────────────────────

export function coolingElectricity(
  netCoolingLoad_kWh: number,
  cop: number,
  partLoadFactor: number
): number {
  return netCoolingLoad_kWh / (Math.max(cop, 2.0) * Math.max(partLoadFactor, 0.5));
}

// ─── Fan Energy ─────────────────────────────────────────────────────────────

export function fanElectricity(
  ventRate_L_s_m2: number,
  floorArea_m2: number,
  fanPower_W_per_Ls: number,
  annualOperatingHours: number
): number {
  const totalFlow_L_s = ventRate_L_s_m2 * floorArea_m2;
  const fanPower_W = totalFlow_L_s * fanPower_W_per_Ls;
  return fanPower_W * annualOperatingHours / 1000;
}

// ─── DHW Energy ─────────────────────────────────────────────────────────────

export function dhwEnergy(
  dailyUse_L_per_m2: number,
  floorArea_m2: number,
  inletTemp_C: number,
  setpointTemp_C: number,
  efficiency: number,
  fuelType: 'gas' | 'electric',
  operatingDaysPerYear: number = 260
): { electricity_kWh: number; gas_m3: number } {
  const dailyVolume_L = dailyUse_L_per_m2 * floorArea_m2;
  const deltaT = setpointTemp_C - inletTemp_C;

  // Q = m × cp × ΔT (kJ) → kWh
  const dailyThermal_kWh = (dailyVolume_L * WATER_DENSITY * WATER_SPECIFIC_HEAT * deltaT) / 3600;
  const annualThermal_kWh = dailyThermal_kWh * operatingDaysPerYear;
  const annualDelivered_kWh = annualThermal_kWh / Math.max(efficiency, 0.5);

  if (fuelType === 'gas') {
    return { electricity_kWh: 0, gas_m3: annualDelivered_kWh / GAS_KWH_PER_M3 };
  }
  return { electricity_kWh: annualDelivered_kWh, gas_m3: 0 };
}

// ─── Default ASHP COP Curve ─────────────────────────────────────────────────

export const DEFAULT_ASHP_COP_CURVE: COPCurvePoint[] = [
  { tempC: -25, cop: 1.5 },
  { tempC: -20, cop: 1.8 },
  { tempC: -15, cop: 2.2 },
  { tempC: -10, cop: 2.6 },
  { tempC: -5, cop: 3.0 },
  { tempC: 0, cop: 3.3 },
  { tempC: 5, cop: 3.6 },
  { tempC: 10, cop: 4.0 },
  { tempC: 15, cop: 4.3 },
];
