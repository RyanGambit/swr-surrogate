import type { BuildingPhysicsParams, PhysicsMeasureDelta } from '@/types/physics';
import { DEFAULT_ASHP_COP_CURVE } from './mechanicalCalc';

// ─── Apply Measure Deltas to Physics Params ─────────────────────────────────
// Each measure mutates specific physical parameters.
// The physics engine then re-runs with the new params.
// No percentage stacking — physics handles interactions naturally.

export function applyMeasureDeltas(
  baseParams: BuildingPhysicsParams,
  deltas: PhysicsMeasureDelta[]
): BuildingPhysicsParams {
  // Deep clone the base params
  let params: BuildingPhysicsParams = JSON.parse(JSON.stringify(baseParams));

  for (const delta of deltas) {
    params = applySingleDelta(params, delta);
  }

  return params;
}

function applySingleDelta(
  params: BuildingPhysicsParams,
  delta: PhysicsMeasureDelta
): BuildingPhysicsParams {
  // Envelope changes
  if (delta.envelope) {
    params.envelope = { ...params.envelope, ...delta.envelope };
    // If ACH50 is changed, recalculate natural ACH
    if (delta.envelope.ach50 !== undefined) {
      params.envelope.achNatural = delta.envelope.ach50 / 20;
    }
  }

  // Internal gains changes
  if (delta.internalGains) {
    params.internalGains = { ...params.internalGains, ...delta.internalGains };
  }

  // Mechanical changes
  if (delta.mechanical) {
    params.mechanical = { ...params.mechanical, ...delta.mechanical };
    // Merge heatPump if it's a partial update
    if (delta.mechanical.heatPump) {
      params.mechanical.heatPump = {
        ...(params.mechanical.heatPump || {
          copRated: 3.2,
          copCurve: DEFAULT_ASHP_COP_CURVE,
          heatingCoveragePercent: 0.85,
          supplementalFuel: 'gas' as const,
        }),
        ...delta.mechanical.heatPump,
      };
    }
  }

  // Solar PV
  if (delta.solarPV) {
    params.solarPV = delta.solarPV;
  }

  // Operating hours reduction (BAS, controls)
  if (delta.operatingHoursReduction) {
    params.internalGains.operatingHoursPerDay *= (1 - delta.operatingHoursReduction);
  }

  return params;
}

// ─── Pre-defined Measure Deltas ─────────────────────────────────────────────
// These define HOW each measure changes the physics model.

export const MEASURE_PHYSICS_DELTAS: Record<string, PhysicsMeasureDelta> = {
  led_upgrade: {
    measureId: 'led_upgrade',
    internalGains: {
      lightingPowerDensity_W_m2: 5, // from ~12 W/m² to 5 W/m²
    },
  },

  bas_controls: {
    measureId: 'bas_controls',
    operatingHoursReduction: 0.12, // 12% fewer operating hours via scheduling
    // BAS also improves ventilation control
    mechanical: {
      heatRecoveryEffectiveness: 0.15, // enables some heat recovery benefit
      partLoadFactor: 0.85, // better part-load performance
    } as Partial<BuildingPhysicsParams['mechanical']>,
  },

  ashp: {
    measureId: 'ashp',
    mechanical: {
      heatPump: {
        copRated: 3.2,
        copCurve: DEFAULT_ASHP_COP_CURVE,
        heatingCoveragePercent: 0.85,
        supplementalFuel: 'gas',
      },
    } as Partial<BuildingPhysicsParams['mechanical']>,
  },

  windows: {
    measureId: 'windows',
    envelope: {
      windowUValue: 1.4,   // from ~3.4-5.6 to 1.4 (triple-glazed)
      windowSHGC: 0.25,    // low-e coating
    },
  },

  insulation: {
    measureId: 'insulation',
    envelope: {
      wallRValue: 3.5,     // R-20 SI (~R-20 imperial) from ~0.7-1.4
    },
  },

  dhw_heatpump: {
    measureId: 'dhw_heatpump',
    mechanical: {
      dhwFuelType: 'electric',
      dhwEfficiency: 3.0,  // COP of 3.0 for HP water heater
    } as Partial<BuildingPhysicsParams['mechanical']>,
  },

  solar_pv: {
    measureId: 'solar_pv',
    // SolarPV params are computed dynamically based on roof area
    // This is a placeholder — actual values set by pathwayEngine
    solarPV: {
      capacity_kW: 0, // computed
      tiltAngle: 15,
      azimuth: 180,
      panelEfficiency: 0.20,
      systemLosses: 0.14,
    },
  },

  submetering: {
    measureId: 'submetering',
    // Submetering is NOI protection, not physics — no physics delta
    // But behavioral effect: ~3% reduction in consumption
    operatingHoursReduction: 0.03,
  },

  pipe_insulation: {
    measureId: 'pipe_insulation',
    envelope: {
      ach50: -2, // relative reduction — handled specially
    },
  },

  electrical_panel: {
    measureId: 'electrical_panel',
    // Enabling infrastructure — no physics impact
  },
};

/** Get physics delta for a measure, with dynamic values based on building */
export function getMeasureDelta(
  measureId: string,
  buildingParams: BuildingPhysicsParams
): PhysicsMeasureDelta {
  const base = MEASURE_PHYSICS_DELTAS[measureId];
  if (!base) return { measureId };

  const delta = JSON.parse(JSON.stringify(base)) as PhysicsMeasureDelta;

  // Dynamic solar PV sizing based on roof area
  // Flat commercial roofs allow ~75% utilization
  if (measureId === 'solar_pv' && delta.solarPV) {
    const roofArea = buildingParams.envelope.roofArea_m2;
    const usableArea = roofArea * 0.75;
    delta.solarPV.capacity_kW = Math.round(usableArea / 5); // ~5 m² per kW
  }

  // Pipe insulation: relative ACH reduction
  if (measureId === 'pipe_insulation' && delta.envelope?.ach50) {
    delta.envelope.ach50 = Math.max(2, buildingParams.envelope.ach50 + delta.envelope.ach50);
    delta.envelope.achNatural = delta.envelope.ach50 / 20;
  }

  return delta;
}
