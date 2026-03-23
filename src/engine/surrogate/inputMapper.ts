import type { BuildingData } from '@/types';
import type { BuildingPhysicsParams } from '@/types/physics';
import type { SurrogateInput } from './lowRiseOffice';
import { FEATURE_RANGES } from './lowRiseOffice';

// ─── Map BuildingData / PhysicsParams → SurrogateInput ──────────────────────

export function buildSurrogateInput(
  building: Partial<BuildingData>,
  params?: BuildingPhysicsParams
): SurrogateInput {
  // Use calibrated physics params if available, otherwise defaults from surrogate training
  return {
    wall_rsi: params?.envelope.wallRValue ?? FEATURE_RANGES.wall_rsi.baseline,
    roof_rsi: params?.envelope.roofRValue ?? FEATURE_RANGES.roof_rsi.baseline,
    window_u: params?.envelope.windowUValue ?? FEATURE_RANGES.window_u.baseline,
    window_shgc: params?.envelope.windowSHGC ?? FEATURE_RANGES.window_shgc.baseline,
    infiltration_ach: params?.envelope.achNatural ?? FEATURE_RANGES.infiltration_ach.baseline,
    lpd: params?.internalGains.lightingPowerDensity_W_m2 ?? FEATURE_RANGES.lpd.baseline,
    epd: params?.internalGains.equipmentPowerDensity_W_m2 ?? FEATURE_RANGES.epd.baseline,
    heating_efficiency: params?.mechanical.heatingEfficiency ?? FEATURE_RANGES.heating_efficiency.baseline,
    ventilation_rate: params?.mechanical.ventilationRate_L_s_m2 ?? FEATURE_RANGES.ventilation_rate.baseline,
    hrv_effectiveness: params?.mechanical.heatRecoveryEffectiveness ?? FEATURE_RANGES.hrv_effectiveness.baseline,
  };
}

// ─── Measure Delta Mapping ──────────────────────────────────────────────────
// Maps retrofit measure IDs to surrogate input modifications.
// Values match MEASURE_PHYSICS_DELTAS in physics/measureApplicator.ts.

interface SurrogateMeasureDelta {
  /** Absolute values: set the parameter to this value */
  set?: Partial<SurrogateInput>;
  /** Multiplier on operating hours (e.g., 0.88 = 12% reduction) */
  operatingHoursMultiplier?: number;
}

const SURROGATE_MEASURE_DELTAS: Record<string, SurrogateMeasureDelta> = {
  led_upgrade: {
    set: { lpd: 5.0 },  // from ~12 W/m² to 5 W/m² (LED)
  },
  bas_controls: {
    set: {
      hrv_effectiveness: 0.15,  // enables some heat recovery benefit
    },
    // BAS also reduces operating hours by 12%, but surrogate doesn't have
    // operating hours as a direct input. Approximate by reducing LPD/EPD slightly
    // or accept that BAS impact will be slightly underestimated in surrogate mode.
  },
  windows: {
    set: {
      window_u: 1.4,      // triple-glazed, thermally broken
      window_shgc: 0.25,  // low-e coating
    },
  },
  insulation: {
    set: {
      wall_rsi: 3.5,  // exterior overcladding (R-20 SI)
    },
  },
  pipe_insulation: {
    // Reduces infiltration (air sealing done alongside pipe insulation)
    set: {
      infiltration_ach: 0.35,  // from ~0.5 to 0.35
    },
  },
  submetering: {
    // NOI protection + ~3% behavioral reduction — minor physics effect
  },
  solar_pv: {
    // Solar PV is handled as an overlay, not a surrogate input change
  },
  electrical_panel: {
    // Enabling infrastructure — no energy impact
  },
  dhw_heatpump: {
    // DHW heat pump — not modeled in surrogate (gas DHW only)
  },
};

/**
 * Apply measure modifications to a baseline SurrogateInput.
 * Returns the modified input for the retrofit scenario.
 */
export function applyMeasuresToSurrogateInput(
  baseline: SurrogateInput,
  measureIds: string[]
): SurrogateInput {
  const retrofit = { ...baseline };

  for (const id of measureIds) {
    const delta = SURROGATE_MEASURE_DELTAS[id];
    if (!delta) continue;

    if (delta.set) {
      for (const [key, value] of Object.entries(delta.set)) {
        (retrofit as Record<string, number>)[key] = value as number;
      }
    }
  }

  return retrofit;
}

/**
 * Check if the measure list includes ASHP (which requires physics engine fallback).
 * The surrogate was trained on gas boiler configurations only.
 */
export function containsASHP(measureIds: string[]): boolean {
  return measureIds.includes('ashp');
}
