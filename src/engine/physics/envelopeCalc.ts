import type { BuildingEnvelope } from '@/types/physics';

// ─── Envelope Heat Transfer Calculations ────────────────────────────────────
// All outputs in kWh/year (thermal)
// Q = U × A × ΔT × time
// Using degree-day method: Q = (A / R) × HDD × 24 / 1000

const AIR_DENSITY = 1.2;       // kg/m³
const AIR_SPECIFIC_HEAT = 1.006; // kJ/kg·K
const KJ_TO_KWH = 1 / 3600;

/** Wall conduction loss (kWh/yr) */
export function wallHeatLoss(wallArea_m2: number, rValue: number, hdd: number): number {
  if (rValue <= 0) return 0;
  return (wallArea_m2 / rValue) * hdd * 24 / 1000;
}

/** Roof conduction loss (kWh/yr) */
export function roofHeatLoss(roofArea_m2: number, rValue: number, hdd: number): number {
  if (rValue <= 0) return 0;
  return (roofArea_m2 / rValue) * hdd * 24 / 1000;
}

/** Window conduction loss (kWh/yr) — uses U-value directly */
export function windowHeatLoss(windowArea_m2: number, uValue: number, hdd: number): number {
  return windowArea_m2 * uValue * hdd * 24 / 1000;
}

/** Slab/ground heat loss using perimeter method (kWh/yr) */
export function slabHeatLoss(
  slabArea_m2: number,
  rValue: number,
  perimeter_m: number,
  hdd: number,
  groundTemp_C: number,
  meanIndoorTemp_C: number = 21
): number {
  if (rValue <= 0) return 0;
  // Simplified: ground loss is reduced by stable ground temperature
  const effectiveHDD = Math.max(0, hdd * (1 - groundTemp_C / meanIndoorTemp_C));
  const perimeterFactor = perimeter_m > 0 ? perimeter_m * 1.2 : slabArea_m2 / rValue;
  return perimeterFactor * effectiveHDD * 24 / 1000 * 0.5; // ground coupling reduces by ~50%
}

/** Infiltration heat loss (kWh/yr) */
export function infiltrationHeatLoss(
  volume_m3: number,
  achNatural: number,
  hdd: number
): number {
  // Q = V̇ × ρ × cp × HDD × 24
  // V̇ = volume × ACH / 3600 (m³/s)
  // ρ × cp = 1.2 × 1.006 kJ/(m³·K) → flow × ρ × cp = kW/K
  // × HDD (K·days) × 24 (h/day) = kWh
  const flowRate_m3_s = volume_m3 * achNatural / 3600;
  return flowRate_m3_s * AIR_DENSITY * AIR_SPECIFIC_HEAT * hdd * 24;
}

/** Ventilation heat loss before heat recovery (kWh/yr) */
export function ventilationHeatLoss(
  ventRate_L_s_m2: number,
  floorArea_m2: number,
  hdd: number,
  heatRecoveryEffectiveness: number = 0,
  operatingHours: number = 3000 // annual operating hours
): number {
  const flowRate_m3_s = ventRate_L_s_m2 * floorArea_m2 / 1000;
  const annualFraction = operatingHours / 8760;
  const rawLoss = flowRate_m3_s * AIR_DENSITY * AIR_SPECIFIC_HEAT * hdd * 24;
  return rawLoss * annualFraction * (1 - heatRecoveryEffectiveness);
}

/** Solar heat gain through windows (kWh/yr) — offsets heating load */
export function solarHeatGain(
  windowArea_m2: number,
  shgc: number,
  annualSolarIrradiance_kWh_m2: number,
  orientationFactor: number = 0.55 // weighted avg for mixed orientations
): number {
  // Only heating-season solar gain counts as offset
  const heatingSeasonFraction = 0.55; // ~55% of solar arrives during heating season in Ontario
  return windowArea_m2 * shgc * annualSolarIrradiance_kWh_m2 * orientationFactor * heatingSeasonFraction;
}

/** Total envelope UA value (W/K) — for balance point calculation */
export function totalUA(envelope: BuildingEnvelope, volume_m3: number): number {
  const wallUA = envelope.wallArea_m2 / envelope.wallRValue;
  const roofUA = envelope.roofArea_m2 / envelope.roofRValue;
  const windowUA = envelope.windowArea_m2 * envelope.windowUValue;
  const slabUA = envelope.slabArea_m2 / Math.max(envelope.slabRValue, 0.5);
  const infiltUA = volume_m3 * envelope.achNatural / 3600 * AIR_DENSITY * AIR_SPECIFIC_HEAT * 1000;

  return wallUA + roofUA + windowUA + slabUA + infiltUA;
}
