// ─── Ontario Commercial Electricity Rate Engine ──────────────────────────────
// Models the 5+ components of an Ontario Class B commercial electricity bill.
// Enables demand charge analysis for ASHP fuel switching.

export interface OntarioElecBill {
  energyCharge: number;
  globalAdjustment: number;
  demandCharge: number;
  transmissionCharge: number;
  distributionCharge: number;
  regulatoryCharges: number;
  monthlyFixedCharge: number;
  totalMonthly: number;
  effectiveRate: number; // $/kWh all-in
}

// Ontario TOU rates (2025-2026, Class B customer)
export const ONTARIO_TOU_RATES = {
  // Winter (Nov 1 - Apr 30)
  winter: {
    onPeak: 0.176,    // 7am-11am, 5pm-7pm weekdays
    midPeak: 0.122,   // 11am-5pm weekdays
    offPeak: 0.087,   // evenings, weekends, holidays
  },
  // Summer (May 1 - Oct 31)
  summer: {
    onPeak: 0.176,    // 11am-5pm weekdays
    midPeak: 0.122,   // 7am-11am, 5pm-7pm weekdays
    offPeak: 0.087,   // evenings, weekends, holidays
  },
};

// Global Adjustment for Class B customers NOT on RPP
// When using TOU rates (RPP), GA is already embedded — set to 0
// When using HOEP (market), GA applies on top of HOEP
// For Class B < 500 kW (typical commercial): RPP with embedded GA
export const GA_RATE_PER_KWH = 0; // embedded in TOU rates for RPP customers

// Demand charges by LDC ($/kW/month)
export const DEMAND_CHARGES: Record<string, number> = {
  enova_power: 12.50,
  kitchener_wilmot_hydro: 12.50,
  toronto_hydro: 14.20,
  hydro_one: 11.80,
  london_hydro: 10.90,
  hydro_ottawa: 13.10,
  essex_powerlines: 11.20,
  alectra: 13.40,
  default: 12.00,
};

// Monthly distribution for TOU periods (commercial building)
export const TOU_DISTRIBUTION = {
  onPeak: 0.35,   // 35% during on-peak
  midPeak: 0.40,  // 40% during mid-peak
  offPeak: 0.25,  // 25% during off-peak
};

// ─── Monthly Electricity Bill Calculator ─────────────────────────────────────

export function calculateMonthlyElecBill(
  monthlyKwh: number,
  peakDemandKw: number,
  ldc: string,
  month: number,
): OntarioElecBill {
  const isWinter = month >= 11 || month <= 4;
  const rates = isWinter ? ONTARIO_TOU_RATES.winter : ONTARIO_TOU_RATES.summer;

  const energyCharge =
    monthlyKwh * TOU_DISTRIBUTION.onPeak * rates.onPeak +
    monthlyKwh * TOU_DISTRIBUTION.midPeak * rates.midPeak +
    monthlyKwh * TOU_DISTRIBUTION.offPeak * rates.offPeak;

  const globalAdjustment = monthlyKwh * GA_RATE_PER_KWH;
  const demandCharge = peakDemandKw * (DEMAND_CHARGES[ldc] || DEMAND_CHARGES.default);
  const transmissionCharge = monthlyKwh * 0.012;
  const distributionCharge = monthlyKwh * 0.018;
  const regulatoryCharges = monthlyKwh * 0.005;
  const monthlyFixedCharge = 85; // typical Class B service charge

  const totalMonthly = energyCharge + globalAdjustment + demandCharge +
    transmissionCharge + distributionCharge + regulatoryCharges + monthlyFixedCharge;

  return {
    energyCharge: Math.round(energyCharge),
    globalAdjustment: Math.round(globalAdjustment),
    demandCharge: Math.round(demandCharge),
    transmissionCharge: Math.round(transmissionCharge),
    distributionCharge: Math.round(distributionCharge),
    regulatoryCharges: Math.round(regulatoryCharges),
    monthlyFixedCharge,
    totalMonthly: Math.round(totalMonthly),
    effectiveRate: monthlyKwh > 0 ? Math.round(totalMonthly / monthlyKwh * 1000) / 1000 : 0,
  };
}

// ─── Annual Bill Summary ─────────────────────────────────────────────────────

export function calculateAnnualElecBill(
  monthlyKwh: number[],      // 12-element array
  monthlyPeakKw: number[],   // 12-element array
  ldc: string,
): { monthlyBills: OntarioElecBill[]; annualTotal: number; effectiveRate: number } {
  const monthlyBills = monthlyKwh.map((kwh, i) =>
    calculateMonthlyElecBill(kwh, monthlyPeakKw[i] || 0, ldc, i + 1)
  );

  const annualTotal = monthlyBills.reduce((s, b) => s + b.totalMonthly, 0);
  const totalKwh = monthlyKwh.reduce((s, k) => s + k, 0);

  return {
    monthlyBills,
    annualTotal,
    effectiveRate: totalKwh > 0 ? Math.round(annualTotal / totalKwh * 1000) / 1000 : 0,
  };
}
