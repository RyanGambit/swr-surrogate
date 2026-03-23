import type { InternalGains } from '@/types/physics';

// ─── Internal Heat Gains ────────────────────────────────────────────────────
// Internal gains offset heating loads and add to cooling loads.

/** Annual lighting energy (kWh/yr) */
export function lightingAnnualEnergy(
  lpd_W_m2: number,
  floorArea_m2: number,
  operatingHoursPerYear: number
): number {
  return lpd_W_m2 * floorArea_m2 * operatingHoursPerYear / 1000;
}

/** Annual equipment/plug load energy (kWh/yr) */
export function equipmentAnnualEnergy(
  epd_W_m2: number,
  floorArea_m2: number,
  operatingHoursPerYear: number
): number {
  return epd_W_m2 * floorArea_m2 * operatingHoursPerYear / 1000;
}

/** Average internal heat gain rate (W) — for balance point calculation */
export function totalInternalGainRate_W(gains: InternalGains, floorArea_m2: number): number {
  // Simultaneous gains during occupied hours
  const lighting = gains.lightingPowerDensity_W_m2 * floorArea_m2;
  const equipment = gains.equipmentPowerDensity_W_m2 * floorArea_m2;
  const occupants = gains.occupantDensity_per_m2 * floorArea_m2 * gains.metabolicRate_W;

  // Weight by occupancy fraction of total hours
  const annualOccupied = gains.operatingHoursPerDay * gains.operatingDaysPerWeek * 52;
  const occupiedFraction = annualOccupied / 8760;

  return (lighting + equipment + occupants) * occupiedFraction;
}

/** Total annual internal heat generation (kWh/yr) — for cooling load */
export function totalInternalGainAnnual_kWh(
  gains: InternalGains,
  floorArea_m2: number
): number {
  const annualHours = gains.operatingHoursPerDay * gains.operatingDaysPerWeek * 52;
  const lighting = gains.lightingPowerDensity_W_m2 * floorArea_m2 * annualHours / 1000;
  const equipment = gains.equipmentPowerDensity_W_m2 * floorArea_m2 * annualHours / 1000;
  const occupants = gains.occupantDensity_per_m2 * floorArea_m2 * gains.metabolicRate_W * annualHours / 1000;

  return lighting + equipment + occupants;
}

/** Internal gains that offset heating (only during heating season ~55%) */
export function internalGainHeatingOffset_kWh(
  gains: InternalGains,
  floorArea_m2: number,
  heatingSeasonFraction: number = 0.55
): number {
  return totalInternalGainAnnual_kWh(gains, floorArea_m2) * heatingSeasonFraction;
}

/** Internal gains that add to cooling load (during cooling season ~30%) */
export function internalGainCoolingLoad_kWh(
  gains: InternalGains,
  floorArea_m2: number,
  coolingSeasonFraction: number = 0.30
): number {
  return totalInternalGainAnnual_kWh(gains, floorArea_m2) * coolingSeasonFraction;
}
