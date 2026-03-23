import type { SolarPVParams } from '@/types/physics';

// ─── Solar PV Generation ────────────────────────────────────────────────────

/** Annual solar PV generation (kWh/yr) */
export function solarPVGeneration(
  pv: SolarPVParams,
  annualSolarIrradiance_kWh_m2: number,
  latitude: number
): number {
  // Optimal tilt ≈ latitude for annual maximum
  const tiltEfficiency = tiltFactor(pv.tiltAngle, latitude);
  const azimuthEfficiency = azimuthFactor(pv.azimuth);

  // kWh = capacity × peak sun hours × performance ratio
  // Peak sun hours ≈ irradiance / 1000 W/m²
  const peakSunHours = annualSolarIrradiance_kWh_m2 / 1; // already in kWh/m²/yr per 1kW/m²

  // Generation = capacity × specific yield
  // Specific yield ≈ irradiance (kWh/m²/yr) × panel_efficiency / STC_irradiance × (1-losses) × tilt × azimuth
  // For Ontario: 1150 kWh/m² × 0.20 / 1.0 × 0.86 × tilt × azimuth ≈ 800 kWh/kW
  // But real-world specific yields for Ontario are 1050-1250 kWh/kW.
  // Use a calibrated specific yield approach: irradiance × performance_ratio
  // Performance ratio for modern panels: ~0.80-0.86
  const performanceRatio = (1 - pv.systemLosses) * tiltEfficiency * azimuthEfficiency;
  // Specific yield = irradiance × PR (in kWh/kWp)
  // For Ontario at 1150 kWh/m²: SY = 1150 × 0.86 = 989 kWh/kWp (conservative)
  // Real installs show 1050-1200 kWh/kWp
  // Use irradiance-based scaling: SY = irradiance × 0.87 (empirical factor for Ontario)
  const specificYield = annualSolarIrradiance_kWh_m2 * 0.87 * performanceRatio / 0.86;
  const generation = pv.capacity_kW * specificYield;

  return Math.max(0, Math.round(generation));
}

/** Simplified: estimate PV generation for Ontario */
export function estimateSolarGeneration(capacity_kW: number): number {
  // Ontario average: ~1150-1250 kWh per installed kW per year
  return capacity_kW * 1200;
}

/** Tilt angle efficiency factor (1.0 = optimal) */
function tiltFactor(tiltAngle: number, latitude: number): number {
  // Optimal tilt ≈ latitude ± 15°
  const optimal = latitude;
  const deviation = Math.abs(tiltAngle - optimal);
  if (deviation <= 15) return 1.0;
  if (deviation <= 30) return 0.95;
  return 0.85;
}

/** Azimuth efficiency factor (180° = due south = optimal) */
function azimuthFactor(azimuth: number): number {
  const deviation = Math.abs(azimuth - 180);
  if (deviation <= 15) return 1.0;
  if (deviation <= 45) return 0.95;
  if (deviation <= 90) return 0.80;
  return 0.60;
}

// ─── Solar Heat Gain Through Glazing ────────────────────────────────────────

/** Estimate solar gains through windows for cooling load (kWh/yr) */
export function solarGainThroughGlazing(
  windowArea_m2: number,
  shgc: number,
  annualSolarIrradiance_kWh_m2: number,
  coolingSeasonFraction: number = 0.30
): number {
  const orientationFactor = 0.55; // mixed orientations average
  return windowArea_m2 * shgc * annualSolarIrradiance_kWh_m2 * orientationFactor * coolingSeasonFraction;
}

/** Estimate PV capacity from available roof area */
export function estimatePVCapacity(
  roofArea_m2: number,
  stories: number,
  utilizationFactor: number = 0.60 // 60% of roof usable
): number {
  // ~5 m² per kW for modern panels (~200W/m²)
  const usableArea = roofArea_m2 * utilizationFactor;
  return Math.round(usableArea / 5);
}
