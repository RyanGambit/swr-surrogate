/**
 * Surrogate Model Router
 *
 * Selects the appropriate surrogate model by archetype and converts
 * surrogate output to the PhysicsResult shape expected by the rest of the app.
 */

import type { PhysicsResult } from '@/types/physics';
import {
  predictForBuilding,
  type SurrogateInput,
  type SurrogateOutput,
} from './lowRiseOffice';

export type { SurrogateInput, SurrogateOutput } from './lowRiseOffice';
export { predictEnergy, predictForBuilding, clampInput, REFERENCE_FLOOR_AREA_M2 } from './lowRiseOffice';
export { buildSurrogateInput, applyMeasuresToSurrogateInput, containsASHP } from './inputMapper';

// ─── Archetype Router ───────────────────────────────────────────────────────

export function hasSurrogateModel(archetype: string): boolean {
  return archetype === 'office_low_rise';
}

export function surrogateEstimate(
  archetype: string,
  input: SurrogateInput,
  area_m2: number
): SurrogateOutput | null {
  if (archetype === 'office_low_rise') {
    return predictForBuilding(input, area_m2);
  }
  return null;
}

// ─── Convert SurrogateOutput → PhysicsResult ────────────────────────────────

// Ontario grid emission factor (g CO₂e / kWh)
const ELEC_EMISSION_FACTOR_G = 25;
// Natural gas emission factor (t CO₂e / m³)
const NG_EMISSION_FACTOR = 0.001879;

export function surrogateToPhysicsResult(
  output: SurrogateOutput,
  area_m2: number
): PhysicsResult {
  const gasM3 = output.annual_gas_m3;
  const gasEkwh = gasM3 * 10.33;

  // Approximate gas split: heating_gas_kWh is provided; remainder is DHW
  const heatingGasKwh = output.heating_gas_kWh;
  const heatingGasM3 = heatingGasKwh / 10.33;
  const dhwGasM3 = Math.max(0, gasM3 - heatingGasM3);

  const ghg = (output.annual_elec_kWh * ELEC_EMISSION_FACTOR_G / 1_000_000) +
              (gasM3 * NG_EMISSION_FACTOR);

  return {
    heatingLoads: {
      walls_kWh: 0,
      roof_kWh: 0,
      windows_kWh: 0,
      slab_kWh: 0,
      infiltration_kWh: 0,
      ventilation_kWh: 0,
      grossTotal_kWh: Math.round(heatingGasKwh / 0.8),
      internalGainOffset_kWh: 0,
      solarGainOffset_kWh: 0,
      netHeatingLoad_kWh: Math.round(heatingGasKwh / 0.8),
    },
    coolingLoads: {
      envelopeGain_kWh: 0,
      internalGains_kWh: 0,
      solarGains_kWh: 0,
      ventilation_kWh: 0,
      netCoolingLoad_kWh: Math.round(output.cooling_kWh * 2.5),
    },
    electricity: {
      heating_kWh: 0,
      cooling_kWh: output.cooling_kWh,
      fans_kWh: output.fans_kWh,
      lighting_kWh: output.lighting_kWh,
      equipment_kWh: output.equipment_kWh,
      dhw_kWh: 0,
      total_kWh: output.annual_elec_kWh,
    },
    gas: {
      heating_m3: Math.round(heatingGasM3),
      dhw_m3: Math.round(dhwGasM3),
      total_m3: gasM3,
    },
    totalEUI_ekWh_m2: Math.round((output.annual_elec_kWh + gasEkwh) / area_m2),
    electricityEUI_kWh_m2: Math.round(output.annual_elec_kWh / area_m2),
    gasEUI_ekWh_m2: Math.round(gasEkwh / area_m2),
    ghg_tCO2e: Math.round(ghg * 10) / 10,
    solarGeneration_kWh: 0,
    netElectricity_kWh: output.annual_elec_kWh,
    balancePointTemp_C: 15.0,
    loadBreakdown: [
      { category: 'Space Heating', heating_pct: 0, cooling_pct: 0, total_kWh: heatingGasKwh },
      { category: 'Space Cooling', heating_pct: 0, cooling_pct: 0, total_kWh: output.cooling_kWh },
      { category: 'Lighting', heating_pct: 0, cooling_pct: 0, total_kWh: output.lighting_kWh },
      { category: 'Equipment', heating_pct: 0, cooling_pct: 0, total_kWh: output.equipment_kWh },
      { category: 'Ventilation', heating_pct: 0, cooling_pct: 0, total_kWh: output.fans_kWh },
      { category: 'DHW', heating_pct: 0, cooling_pct: 0, total_kWh: dhwGasM3 * 10.33 },
    ],
  };
}
