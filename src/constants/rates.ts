import type { Province } from '@/types';

// ─── Ontario Energy Rates ───────────────────────────────────────────────────

export const ELECTRICITY_RATES: Record<Province, number> = {
  ON: 0.13,   // $/kWh blended TOU
  QC: 0.073,
  BC: 0.095,
  AB: 0.17,
  SK: 0.155,
  MB: 0.099,
  NS: 0.165,
  NB: 0.13,
  PE: 0.16,
  NL: 0.13,
};

export const GAS_RATES: Record<Province, number> = {
  ON: 0.35,   // $/m³ including delivery
  QC: 0.45,
  BC: 0.40,
  AB: 0.25,
  SK: 0.30,
  MB: 0.28,
  NS: 0.55,
  NB: 0.50,
  PE: 0.55,
  NL: 0.50,
};

// ─── Carbon Pricing ─────────────────────────────────────────────────────────
// Federal carbon charge schedule: $15/tonne annual increases to $170/t by 2030
// Included in financial modelling as carbon cost avoidance from gas reduction

export const NG_EMISSION_FACTOR_T_PER_M3 = 0.001888; // tonnes CO2 per m³ natural gas

export const FEDERAL_CARBON_SCHEDULE: Record<number, number> = {
  2023: 65, 2024: 80, 2025: 95, 2026: 110, 2027: 125,
  2028: 140, 2029: 155, 2030: 170,
};

export const ELEC_EMISSION_FACTORS: Record<Province, number> = {
  ON: 25,    // gCO2e/kWh
  QC: 2,
  BC: 11,
  AB: 540,
  SK: 650,
  MB: 3,
  NS: 670,
  NB: 280,
  PE: 10,
  NL: 20,
};

export function getCarbonPricePerTonne(year: number, province: Province): number {
  if (province === 'QC') {
    // QC cap-and-trade: ~$35/t base (2023) growing ~5%/yr
    const yearsFrom2023 = Math.max(0, year - 2023);
    return Math.round(35 * Math.pow(1.05, yearsFrom2023));
  }
  if (province === 'BC') {
    // BC provincial carbon tax: $80/t (2025) + $15/yr increases, cap at $170
    const bcBase = 80;
    const yearsFrom2025 = Math.max(0, year - 2025);
    return Math.min(bcBase + (yearsFrom2025 * 15), 170);
  }

  // Federal backstop provinces (ON, AB, SK, etc.)
  if (year <= 2022) return 50;
  if (FEDERAL_CARBON_SCHEDULE[year] !== undefined) {
    return FEDERAL_CARBON_SCHEDULE[year];
  }
  // Cap at $170/t post-2030
  if (year > 2030) return 170;
  return 0;
}

export function getCarbonChargePerM3(year: number, province: Province): number {
  return getCarbonPricePerTonne(year, province) * NG_EMISSION_FACTOR_T_PER_M3;
}

// ─── Financial Defaults ─────────────────────────────────────────────────────

export const DEFAULT_DISCOUNT_RATE = 0.075;    // 7.5% institutional WACC
export const DEFAULT_ESCALATION_RATE = 0.02;   // 2% annual on energy streams
export const DEFAULT_CIB_RATE = 0.0275;        // 2.75% midpoint
export const DEFAULT_COMMERCIAL_RATE = 0.065;  // 6.5% commercial
export const DEFAULT_LOAN_TERM = 20;           // years
export const DEFAULT_SOLAR_DEGRADATION = 0.005; // 0.5%/year
export const DEFAULT_CAP_RATE = 0.07;          // 7.0%
export const CT_ITC_BRIDGE_MONTHS = 15;        // typical CRA processing
export const CT_ITC_RATE = 0.30;               // 30% refundable
