import type { BuildingPhysicsParams, BuildingEnvelope, InternalGains, MechanicalSystems, ClimateInputs } from '@/types/physics';
import type { BuildingData, BuildingArchetype, AssumptionFlag } from '@/types';
import { CLIMATE_DATA } from '@/constants/benchmarks';

const SQ_FT_TO_M2 = 0.0929;

const CITY_LATITUDES: Record<string, number> = {
  toronto: 43.65, mississauga: 43.59, brampton: 43.73, markham: 43.86,
  hamilton: 43.26, 'st. catharines': 43.16, oshawa: 43.90,
  kitchener: 43.45, waterloo: 43.47, cambridge: 43.36, guelph: 43.55,
  london: 43.00, windsor: 42.32,
  ottawa: 45.42, kingston: 44.23,
  barrie: 44.39, sudbury: 46.49, 'thunder bay': 48.38,
  peterborough: 44.30, belleville: 44.16, 'north bay': 46.31,
  timmins: 48.48, 'sault ste. marie': 46.52, sarnia: 42.97,
  brantford: 43.14, 'niagara falls': 43.09,
};

const CITY_SOLAR_IRRADIANCE: Record<string, number> = {
  toronto: 1200, mississauga: 1200, brampton: 1180,
  hamilton: 1190, kitchener: 1150, waterloo: 1150,
  ottawa: 1190, london: 1170, windsor: 1250,
  barrie: 1130, sudbury: 1100, 'thunder bay': 1080,
  kingston: 1200, peterborough: 1170,
};

const ARCHETYPE_CEILING_HEIGHTS: Record<string, number> = {
  warehouse: 6.0,
  light_industrial: 6.0,
  retail_big_box: 5.0,
  arena: 8.0,
  hospital: 3.5,
};

// ─── Build Physics Params from User Inputs + Defaults ───────────────────────

export interface ParamBuildResult {
  params: BuildingPhysicsParams;
  assumptions: AssumptionFlag[];
}

export function buildPhysicsParams(building: Partial<BuildingData>): ParamBuildResult {
  const assumptions: AssumptionFlag[] = [];
  const archetype = building.archetype || 'office_low_rise';
  const yearBuilt = building.yearBuilt || 1985;
  const ageRange = getAgeRange(yearBuilt);

  const areaSqFt = building.areaSqFt || 10000;
  const areaM2 = areaSqFt * SQ_FT_TO_M2;
  const stories = building.stories || 2;
  const ceilingHeight = building.ceilingHeight ?? ARCHETYPE_CEILING_HEIGHTS[archetype] ?? 3.0;
  const volume = areaM2 * ceilingHeight;
  const floorplateArea = areaM2 / stories;
  const perimeter = Math.sqrt(floorplateArea) * 4; // approximate square
  const wwr = (building.windowWallRatio || 30) / 100;

  // Wall area = perimeter × height × stories - window area
  const grossWallArea = perimeter * ceilingHeight * stories;
  const windowArea = grossWallArea * wwr;
  const opaqueWallArea = grossWallArea - windowArea;

  // ─── Envelope Defaults by Archetype + Age ───────────────────────────
  const envDefaults = ENVELOPE_DEFAULTS[archetype]?.[ageRange] || ENVELOPE_DEFAULTS.office_low_rise[ageRange];

  // Apply user overrides if present on BuildingData
  const effectiveWallR = building.wallRValue ?? envDefaults.wallRValue;
  const effectiveRoofR = building.roofRValue ?? envDefaults.roofRValue;
  const effectiveWindowU = building.windowUValue ?? envDefaults.windowUValue;
  const effectiveWindowSHGC = building.windowSHGC ?? envDefaults.windowSHGC;
  const effectiveAch50 = building.ach50 ?? envDefaults.ach50;

  const envelope: BuildingEnvelope = {
    wallArea_m2: opaqueWallArea,
    wallRValue: effectiveWallR,
    roofArea_m2: floorplateArea,
    roofRValue: effectiveRoofR,
    windowArea_m2: windowArea,
    windowUValue: effectiveWindowU,
    windowSHGC: effectiveWindowSHGC,
    slabArea_m2: floorplateArea,
    slabRValue: envDefaults.slabRValue,
    slabPerimeter_m: perimeter,
    ach50: effectiveAch50,
    achNatural: effectiveAch50 / 20,
  };

  if (!building.wallType) {
    assumptions.push({ parameter: 'Wall R-Value', assumedValue: envDefaults.wallRValue, source: 'building_age', confidence: 0.4, improvementPrompt: 'What is your wall construction? (e.g., uninsulated masonry, 2" rigid foam, etc.)' });
  }
  if (!building.windowType) {
    assumptions.push({ parameter: 'Window U-Value', assumedValue: envDefaults.windowUValue, source: 'building_age', confidence: 0.4, improvementPrompt: 'What type of windows do you have? (single pane, double pane, triple glazed?)' });
  }

  // ─── Internal Gains Defaults ────────────────────────────────────────
  const gainsDefaults = INTERNAL_GAINS_DEFAULTS[archetype] || INTERNAL_GAINS_DEFAULTS.office_low_rise;
  const internalGains: InternalGains = {
    ...gainsDefaults,
    lightingPowerDensity_W_m2: building.lightingPowerDensity ?? gainsDefaults.lightingPowerDensity_W_m2,
    equipmentPowerDensity_W_m2: building.equipmentPowerDensity ?? gainsDefaults.equipmentPowerDensity_W_m2,
    occupantDensity_per_m2: building.occupantDensity ?? gainsDefaults.occupantDensity_per_m2,
    operatingHoursPerDay: building.operatingHoursPerDay ?? gainsDefaults.operatingHoursPerDay,
    operatingDaysPerWeek: building.operatingDaysPerWeek ?? gainsDefaults.operatingDaysPerWeek,
  };

  // ─── Mechanical Defaults ────────────────────────────────────────────
  const mechDefaults = MECHANICAL_DEFAULTS[archetype]?.[ageRange] || MECHANICAL_DEFAULTS.office_low_rise[ageRange];
  const heatingFuelType = building.heatingSystem?.toLowerCase().includes('electric') ? 'electric' as const : 'gas' as const;

  const mechanical: MechanicalSystems = {
    ...mechDefaults,
    heatingFuelType,
    heatingEfficiency: building.heatingEfficiency ?? mechDefaults.heatingEfficiency,
    coolingCOP: building.coolingCOP ?? mechDefaults.coolingCOP,
    ventilationRate_L_s_m2: building.ventilationRate ?? mechDefaults.ventilationRate_L_s_m2,
    heatRecoveryEffectiveness: building.heatRecoveryEffectiveness ?? mechDefaults.heatRecoveryEffectiveness,
    dhwEfficiency: building.dhwEfficiency ?? mechDefaults.dhwEfficiency,
    heatingCapacity_kW: areaM2 * 0.08, // ~80 W/m² design heating
    coolingCapacity_kW: areaM2 * 0.05, // ~50 W/m² design cooling
  };

  if (!building.heatingSystem) {
    assumptions.push({ parameter: 'Heating Efficiency', assumedValue: mechDefaults.heatingEfficiency, source: 'building_age', confidence: 0.3, improvementPrompt: 'What heating system do you have? (gas boiler, furnace, heat pump?)' });
  }

  // ─── Climate ────────────────────────────────────────────────────────
  const cityKey = (building.city || '').toLowerCase();
  const cityClimate = CLIMATE_DATA[cityKey];
  const cityLat = CITY_LATITUDES[cityKey] || 43.5;
  const citySolar = CITY_SOLAR_IRRADIANCE[cityKey] || 1150;

  const climate: ClimateInputs = {
    hdd18: building.hdd || (cityClimate ? cityClimate.hdd : 4100),
    cdd10: building.cdd || (cityClimate ? cityClimate.cdd : 300),
    latitude: cityLat,
    annualSolarIrradiance_kWh_m2: citySolar,
    designHeatingTemp_C: -22,
    designCoolingTemp_C: 33,
    meanWinterTemp_C: -5,
    groundTemp_C: 8,
  };

  return {
    params: {
      grossFloorArea_m2: areaM2,
      stories,
      ceilingHeight_m: ceilingHeight,
      envelope,
      internalGains,
      mechanical,
      climate,
      province: building.province || 'ON',
    },
    assumptions,
  };
}

// ─── Age Range Helper ───────────────────────────────────────────────────────

type AgeRange = 'pre_1980' | '1980_2000' | 'post_2000';

function getAgeRange(yearBuilt: number): AgeRange {
  if (yearBuilt < 1980) return 'pre_1980';
  if (yearBuilt <= 2000) return '1980_2000';
  return 'post_2000';
}

// ─── Physical Parameter Defaults by Archetype + Age ─────────────────────────

interface EnvelopeDefaults {
  wallRValue: number;    // m²·K/W
  roofRValue: number;
  windowUValue: number;  // W/m²·K
  windowSHGC: number;
  slabRValue: number;
  ach50: number;
}

const ENVELOPE_DEFAULTS: Record<string, Record<AgeRange, EnvelopeDefaults>> = {
  office_low_rise: {
    pre_1980:  { wallRValue: 0.7, roofRValue: 1.4, windowUValue: 5.6, windowSHGC: 0.70, slabRValue: 0.5, ach50: 15 },
    '1980_2000': { wallRValue: 1.4, roofRValue: 2.6, windowUValue: 3.4, windowSHGC: 0.55, slabRValue: 1.0, ach50: 8 },
    post_2000: { wallRValue: 2.8, roofRValue: 4.4, windowUValue: 2.2, windowSHGC: 0.35, slabRValue: 1.8, ach50: 4 },
  },
  office_high_rise: {
    pre_1980:  { wallRValue: 0.8, roofRValue: 1.4, windowUValue: 5.6, windowSHGC: 0.65, slabRValue: 0.5, ach50: 12 },
    '1980_2000': { wallRValue: 1.6, roofRValue: 2.8, windowUValue: 3.0, windowSHGC: 0.45, slabRValue: 1.0, ach50: 6 },
    post_2000: { wallRValue: 3.2, roofRValue: 5.0, windowUValue: 1.8, windowSHGC: 0.30, slabRValue: 2.0, ach50: 3 },
  },
  retail_strip: {
    pre_1980:  { wallRValue: 0.6, roofRValue: 1.2, windowUValue: 5.6, windowSHGC: 0.75, slabRValue: 0.3, ach50: 18 },
    '1980_2000': { wallRValue: 1.2, roofRValue: 2.2, windowUValue: 3.4, windowSHGC: 0.55, slabRValue: 0.8, ach50: 10 },
    post_2000: { wallRValue: 2.5, roofRValue: 4.0, windowUValue: 2.4, windowSHGC: 0.35, slabRValue: 1.5, ach50: 5 },
  },
  warehouse: {
    pre_1980:  { wallRValue: 0.5, roofRValue: 1.0, windowUValue: 5.6, windowSHGC: 0.75, slabRValue: 0.3, ach50: 25 },
    '1980_2000': { wallRValue: 1.0, roofRValue: 2.0, windowUValue: 3.8, windowSHGC: 0.60, slabRValue: 0.5, ach50: 15 },
    post_2000: { wallRValue: 2.0, roofRValue: 3.5, windowUValue: 2.8, windowSHGC: 0.40, slabRValue: 1.2, ach50: 8 },
  },
  multi_res_low_rise: {
    pre_1980:  { wallRValue: 0.8, roofRValue: 1.4, windowUValue: 5.0, windowSHGC: 0.65, slabRValue: 0.5, ach50: 12 },
    '1980_2000': { wallRValue: 1.6, roofRValue: 2.8, windowUValue: 3.2, windowSHGC: 0.50, slabRValue: 1.0, ach50: 7 },
    post_2000: { wallRValue: 3.0, roofRValue: 5.0, windowUValue: 2.0, windowSHGC: 0.32, slabRValue: 1.8, ach50: 3 },
  },
  multi_res_high_rise: {
    pre_1980:  { wallRValue: 0.7, roofRValue: 1.4, windowUValue: 5.2, windowSHGC: 0.60, slabRValue: 0.5, ach50: 10 },
    '1980_2000': { wallRValue: 1.5, roofRValue: 2.6, windowUValue: 3.0, windowSHGC: 0.45, slabRValue: 1.0, ach50: 6 },
    post_2000: { wallRValue: 3.0, roofRValue: 5.0, windowUValue: 1.8, windowSHGC: 0.28, slabRValue: 2.0, ach50: 3 },
  },
  hospital: {
    pre_1980:  { wallRValue: 1.0, roofRValue: 1.6, windowUValue: 5.0, windowSHGC: 0.55, slabRValue: 0.5, ach50: 10 },
    '1980_2000': { wallRValue: 1.8, roofRValue: 3.0, windowUValue: 3.0, windowSHGC: 0.40, slabRValue: 1.2, ach50: 5 },
    post_2000: { wallRValue: 3.5, roofRValue: 5.5, windowUValue: 1.8, windowSHGC: 0.28, slabRValue: 2.0, ach50: 2 },
  },
  school: {
    pre_1980:  { wallRValue: 0.7, roofRValue: 1.2, windowUValue: 5.6, windowSHGC: 0.70, slabRValue: 0.4, ach50: 14 },
    '1980_2000': { wallRValue: 1.4, roofRValue: 2.4, windowUValue: 3.4, windowSHGC: 0.50, slabRValue: 0.8, ach50: 8 },
    post_2000: { wallRValue: 2.8, roofRValue: 4.5, windowUValue: 2.2, windowSHGC: 0.35, slabRValue: 1.5, ach50: 4 },
  },
};

// Fallback: any archetype not listed uses office_low_rise defaults
const defaultEnvelope = ENVELOPE_DEFAULTS.office_low_rise;
for (const key of ['retail_big_box', 'light_industrial', 'mixed_use', 'hotel', 'community_centre', 'arena', 'place_of_worship', 'restaurant', 'grocery', 'other']) {
  ENVELOPE_DEFAULTS[key] = defaultEnvelope;
}

// ─── Internal Gains Defaults ────────────────────────────────────────────────

const INTERNAL_GAINS_DEFAULTS: Record<string, InternalGains> = {
  office_low_rise:    { lightingPowerDensity_W_m2: 12, equipmentPowerDensity_W_m2: 10, occupantDensity_per_m2: 0.05, metabolicRate_W: 120, operatingHoursPerDay: 10, operatingDaysPerWeek: 5 },
  office_high_rise:   { lightingPowerDensity_W_m2: 12, equipmentPowerDensity_W_m2: 12, occupantDensity_per_m2: 0.06, metabolicRate_W: 120, operatingHoursPerDay: 11, operatingDaysPerWeek: 5 },
  retail_strip:       { lightingPowerDensity_W_m2: 15, equipmentPowerDensity_W_m2: 8,  occupantDensity_per_m2: 0.10, metabolicRate_W: 130, operatingHoursPerDay: 12, operatingDaysPerWeek: 6 },
  retail_big_box:     { lightingPowerDensity_W_m2: 14, equipmentPowerDensity_W_m2: 6,  occupantDensity_per_m2: 0.08, metabolicRate_W: 130, operatingHoursPerDay: 12, operatingDaysPerWeek: 7 },
  warehouse:          { lightingPowerDensity_W_m2: 8,  equipmentPowerDensity_W_m2: 3,  occupantDensity_per_m2: 0.02, metabolicRate_W: 150, operatingHoursPerDay: 10, operatingDaysPerWeek: 5 },
  light_industrial:   { lightingPowerDensity_W_m2: 10, equipmentPowerDensity_W_m2: 15, occupantDensity_per_m2: 0.03, metabolicRate_W: 150, operatingHoursPerDay: 10, operatingDaysPerWeek: 5 },
  multi_res_low_rise: { lightingPowerDensity_W_m2: 6,  equipmentPowerDensity_W_m2: 5,  occupantDensity_per_m2: 0.03, metabolicRate_W: 100, operatingHoursPerDay: 16, operatingDaysPerWeek: 7 },
  multi_res_high_rise:{ lightingPowerDensity_W_m2: 6,  equipmentPowerDensity_W_m2: 5,  occupantDensity_per_m2: 0.03, metabolicRate_W: 100, operatingHoursPerDay: 16, operatingDaysPerWeek: 7 },
  mixed_use:          { lightingPowerDensity_W_m2: 10, equipmentPowerDensity_W_m2: 8,  occupantDensity_per_m2: 0.05, metabolicRate_W: 120, operatingHoursPerDay: 12, operatingDaysPerWeek: 6 },
  hotel:              { lightingPowerDensity_W_m2: 10, equipmentPowerDensity_W_m2: 8,  occupantDensity_per_m2: 0.04, metabolicRate_W: 100, operatingHoursPerDay: 24, operatingDaysPerWeek: 7 },
  school:             { lightingPowerDensity_W_m2: 12, equipmentPowerDensity_W_m2: 6,  occupantDensity_per_m2: 0.15, metabolicRate_W: 110, operatingHoursPerDay: 10, operatingDaysPerWeek: 5 },
  hospital:           { lightingPowerDensity_W_m2: 14, equipmentPowerDensity_W_m2: 20, occupantDensity_per_m2: 0.06, metabolicRate_W: 120, operatingHoursPerDay: 24, operatingDaysPerWeek: 7 },
  community_centre:   { lightingPowerDensity_W_m2: 12, equipmentPowerDensity_W_m2: 5,  occupantDensity_per_m2: 0.10, metabolicRate_W: 140, operatingHoursPerDay: 12, operatingDaysPerWeek: 6 },
  arena:              { lightingPowerDensity_W_m2: 14, equipmentPowerDensity_W_m2: 8,  occupantDensity_per_m2: 0.08, metabolicRate_W: 140, operatingHoursPerDay: 14, operatingDaysPerWeek: 7 },
  place_of_worship:   { lightingPowerDensity_W_m2: 10, equipmentPowerDensity_W_m2: 3,  occupantDensity_per_m2: 0.15, metabolicRate_W: 100, operatingHoursPerDay: 6,  operatingDaysPerWeek: 4 },
  restaurant:         { lightingPowerDensity_W_m2: 15, equipmentPowerDensity_W_m2: 30, occupantDensity_per_m2: 0.15, metabolicRate_W: 130, operatingHoursPerDay: 14, operatingDaysPerWeek: 7 },
  grocery:            { lightingPowerDensity_W_m2: 16, equipmentPowerDensity_W_m2: 25, occupantDensity_per_m2: 0.12, metabolicRate_W: 130, operatingHoursPerDay: 16, operatingDaysPerWeek: 7 },
  other:              { lightingPowerDensity_W_m2: 12, equipmentPowerDensity_W_m2: 10, occupantDensity_per_m2: 0.05, metabolicRate_W: 120, operatingHoursPerDay: 10, operatingDaysPerWeek: 5 },
};

// ─── Mechanical Defaults ────────────────────────────────────────────────────

interface MechDefaults {
  heatingFuelType: 'gas' | 'electric';
  heatingEfficiency: number;
  coolingCOP: number;
  partLoadFactor: number;
  ventilationRate_L_s_m2: number;
  fanPower_W_per_Ls: number;
  heatRecoveryEffectiveness: number;
  dhwDailyUse_L_per_m2: number;
  dhwFuelType: 'gas' | 'electric';
  dhwEfficiency: number;
  dhwInletTemp_C: number;
  dhwSetpoint_C: number;
}

const MECHANICAL_DEFAULTS: Record<string, Record<AgeRange, MechDefaults>> = {
  office_low_rise: {
    pre_1980:  { heatingFuelType: 'gas', heatingEfficiency: 0.75, coolingCOP: 2.5, partLoadFactor: 0.70, ventilationRate_L_s_m2: 0.5, fanPower_W_per_Ls: 2.5, heatRecoveryEffectiveness: 0, dhwDailyUse_L_per_m2: 0.2, dhwFuelType: 'gas', dhwEfficiency: 0.60, dhwInletTemp_C: 8, dhwSetpoint_C: 55 },
    '1980_2000': { heatingFuelType: 'gas', heatingEfficiency: 0.82, coolingCOP: 3.0, partLoadFactor: 0.75, ventilationRate_L_s_m2: 0.6, fanPower_W_per_Ls: 2.0, heatRecoveryEffectiveness: 0, dhwDailyUse_L_per_m2: 0.2, dhwFuelType: 'gas', dhwEfficiency: 0.70, dhwInletTemp_C: 8, dhwSetpoint_C: 55 },
    post_2000: { heatingFuelType: 'gas', heatingEfficiency: 0.92, coolingCOP: 3.5, partLoadFactor: 0.80, ventilationRate_L_s_m2: 0.7, fanPower_W_per_Ls: 1.5, heatRecoveryEffectiveness: 0.50, dhwDailyUse_L_per_m2: 0.2, dhwFuelType: 'gas', dhwEfficiency: 0.85, dhwInletTemp_C: 8, dhwSetpoint_C: 55 },
  },
  warehouse: {
    pre_1980:  { heatingFuelType: 'gas', heatingEfficiency: 0.70, coolingCOP: 2.2, partLoadFactor: 0.65, ventilationRate_L_s_m2: 0.8, fanPower_W_per_Ls: 2.5, heatRecoveryEffectiveness: 0, dhwDailyUse_L_per_m2: 0.05, dhwFuelType: 'gas', dhwEfficiency: 0.55, dhwInletTemp_C: 8, dhwSetpoint_C: 55 },
    '1980_2000': { heatingFuelType: 'gas', heatingEfficiency: 0.78, coolingCOP: 2.8, partLoadFactor: 0.70, ventilationRate_L_s_m2: 0.8, fanPower_W_per_Ls: 2.0, heatRecoveryEffectiveness: 0, dhwDailyUse_L_per_m2: 0.05, dhwFuelType: 'gas', dhwEfficiency: 0.65, dhwInletTemp_C: 8, dhwSetpoint_C: 55 },
    post_2000: { heatingFuelType: 'gas', heatingEfficiency: 0.88, coolingCOP: 3.2, partLoadFactor: 0.75, ventilationRate_L_s_m2: 0.8, fanPower_W_per_Ls: 1.5, heatRecoveryEffectiveness: 0.40, dhwDailyUse_L_per_m2: 0.05, dhwFuelType: 'gas', dhwEfficiency: 0.80, dhwInletTemp_C: 8, dhwSetpoint_C: 55 },
  },
  light_industrial: {
    pre_1980:  { heatingFuelType: 'gas', heatingEfficiency: 0.70, coolingCOP: 2.2, partLoadFactor: 0.65, ventilationRate_L_s_m2: 1.0, fanPower_W_per_Ls: 2.5, heatRecoveryEffectiveness: 0, dhwDailyUse_L_per_m2: 0.1, dhwFuelType: 'gas', dhwEfficiency: 0.55, dhwInletTemp_C: 8, dhwSetpoint_C: 55 },
    '1980_2000': { heatingFuelType: 'gas', heatingEfficiency: 0.78, coolingCOP: 2.8, partLoadFactor: 0.70, ventilationRate_L_s_m2: 1.0, fanPower_W_per_Ls: 2.0, heatRecoveryEffectiveness: 0, dhwDailyUse_L_per_m2: 0.1, dhwFuelType: 'gas', dhwEfficiency: 0.65, dhwInletTemp_C: 8, dhwSetpoint_C: 55 },
    post_2000: { heatingFuelType: 'gas', heatingEfficiency: 0.88, coolingCOP: 3.2, partLoadFactor: 0.75, ventilationRate_L_s_m2: 1.0, fanPower_W_per_Ls: 1.5, heatRecoveryEffectiveness: 0.40, dhwDailyUse_L_per_m2: 0.1, dhwFuelType: 'gas', dhwEfficiency: 0.80, dhwInletTemp_C: 8, dhwSetpoint_C: 55 },
  },
  multi_res_low_rise: {
    pre_1980:  { heatingFuelType: 'gas', heatingEfficiency: 0.75, coolingCOP: 2.5, partLoadFactor: 0.70, ventilationRate_L_s_m2: 0.3, fanPower_W_per_Ls: 2.0, heatRecoveryEffectiveness: 0, dhwDailyUse_L_per_m2: 1.0, dhwFuelType: 'gas', dhwEfficiency: 0.55, dhwInletTemp_C: 8, dhwSetpoint_C: 55 },
    '1980_2000': { heatingFuelType: 'gas', heatingEfficiency: 0.82, coolingCOP: 3.0, partLoadFactor: 0.75, ventilationRate_L_s_m2: 0.35, fanPower_W_per_Ls: 1.8, heatRecoveryEffectiveness: 0, dhwDailyUse_L_per_m2: 1.0, dhwFuelType: 'gas', dhwEfficiency: 0.65, dhwInletTemp_C: 8, dhwSetpoint_C: 55 },
    post_2000: { heatingFuelType: 'gas', heatingEfficiency: 0.92, coolingCOP: 3.5, partLoadFactor: 0.80, ventilationRate_L_s_m2: 0.4, fanPower_W_per_Ls: 1.5, heatRecoveryEffectiveness: 0.50, dhwDailyUse_L_per_m2: 1.0, dhwFuelType: 'gas', dhwEfficiency: 0.85, dhwInletTemp_C: 8, dhwSetpoint_C: 55 },
  },
  multi_res_high_rise: {
    pre_1980:  { heatingFuelType: 'gas', heatingEfficiency: 0.75, coolingCOP: 2.5, partLoadFactor: 0.70, ventilationRate_L_s_m2: 0.3, fanPower_W_per_Ls: 2.0, heatRecoveryEffectiveness: 0, dhwDailyUse_L_per_m2: 1.0, dhwFuelType: 'gas', dhwEfficiency: 0.55, dhwInletTemp_C: 8, dhwSetpoint_C: 55 },
    '1980_2000': { heatingFuelType: 'gas', heatingEfficiency: 0.82, coolingCOP: 3.0, partLoadFactor: 0.75, ventilationRate_L_s_m2: 0.35, fanPower_W_per_Ls: 1.8, heatRecoveryEffectiveness: 0, dhwDailyUse_L_per_m2: 1.0, dhwFuelType: 'gas', dhwEfficiency: 0.65, dhwInletTemp_C: 8, dhwSetpoint_C: 55 },
    post_2000: { heatingFuelType: 'gas', heatingEfficiency: 0.92, coolingCOP: 3.5, partLoadFactor: 0.80, ventilationRate_L_s_m2: 0.4, fanPower_W_per_Ls: 1.5, heatRecoveryEffectiveness: 0.50, dhwDailyUse_L_per_m2: 1.0, dhwFuelType: 'gas', dhwEfficiency: 0.85, dhwInletTemp_C: 8, dhwSetpoint_C: 55 },
  },
  retail_big_box: {
    pre_1980:  { heatingFuelType: 'gas', heatingEfficiency: 0.75, coolingCOP: 2.5, partLoadFactor: 0.70, ventilationRate_L_s_m2: 0.5, fanPower_W_per_Ls: 2.5, heatRecoveryEffectiveness: 0, dhwDailyUse_L_per_m2: 0.1, dhwFuelType: 'gas', dhwEfficiency: 0.55, dhwInletTemp_C: 8, dhwSetpoint_C: 55 },
    '1980_2000': { heatingFuelType: 'gas', heatingEfficiency: 0.82, coolingCOP: 3.2, partLoadFactor: 0.75, ventilationRate_L_s_m2: 0.6, fanPower_W_per_Ls: 2.0, heatRecoveryEffectiveness: 0, dhwDailyUse_L_per_m2: 0.1, dhwFuelType: 'gas', dhwEfficiency: 0.65, dhwInletTemp_C: 8, dhwSetpoint_C: 55 },
    post_2000: { heatingFuelType: 'gas', heatingEfficiency: 0.92, coolingCOP: 3.8, partLoadFactor: 0.80, ventilationRate_L_s_m2: 0.7, fanPower_W_per_Ls: 1.5, heatRecoveryEffectiveness: 0.45, dhwDailyUse_L_per_m2: 0.1, dhwFuelType: 'gas', dhwEfficiency: 0.80, dhwInletTemp_C: 8, dhwSetpoint_C: 55 },
  },
  hospital: {
    pre_1980:  { heatingFuelType: 'gas', heatingEfficiency: 0.75, coolingCOP: 2.5, partLoadFactor: 0.75, ventilationRate_L_s_m2: 2.5, fanPower_W_per_Ls: 2.5, heatRecoveryEffectiveness: 0, dhwDailyUse_L_per_m2: 1.5, dhwFuelType: 'gas', dhwEfficiency: 0.55, dhwInletTemp_C: 8, dhwSetpoint_C: 60 },
    '1980_2000': { heatingFuelType: 'gas', heatingEfficiency: 0.82, coolingCOP: 3.0, partLoadFactor: 0.80, ventilationRate_L_s_m2: 2.5, fanPower_W_per_Ls: 2.0, heatRecoveryEffectiveness: 0.30, dhwDailyUse_L_per_m2: 1.5, dhwFuelType: 'gas', dhwEfficiency: 0.70, dhwInletTemp_C: 8, dhwSetpoint_C: 60 },
    post_2000: { heatingFuelType: 'gas', heatingEfficiency: 0.92, coolingCOP: 3.8, partLoadFactor: 0.85, ventilationRate_L_s_m2: 2.5, fanPower_W_per_Ls: 1.5, heatRecoveryEffectiveness: 0.65, dhwDailyUse_L_per_m2: 1.5, dhwFuelType: 'gas', dhwEfficiency: 0.90, dhwInletTemp_C: 8, dhwSetpoint_C: 60 },
  },
  school: {
    pre_1980:  { heatingFuelType: 'gas', heatingEfficiency: 0.75, coolingCOP: 2.5, partLoadFactor: 0.70, ventilationRate_L_s_m2: 0.7, fanPower_W_per_Ls: 2.5, heatRecoveryEffectiveness: 0, dhwDailyUse_L_per_m2: 0.3, dhwFuelType: 'gas', dhwEfficiency: 0.55, dhwInletTemp_C: 8, dhwSetpoint_C: 55 },
    '1980_2000': { heatingFuelType: 'gas', heatingEfficiency: 0.82, coolingCOP: 3.0, partLoadFactor: 0.75, ventilationRate_L_s_m2: 0.8, fanPower_W_per_Ls: 2.0, heatRecoveryEffectiveness: 0, dhwDailyUse_L_per_m2: 0.3, dhwFuelType: 'gas', dhwEfficiency: 0.65, dhwInletTemp_C: 8, dhwSetpoint_C: 55 },
    post_2000: { heatingFuelType: 'gas', heatingEfficiency: 0.92, coolingCOP: 3.5, partLoadFactor: 0.80, ventilationRate_L_s_m2: 0.9, fanPower_W_per_Ls: 1.5, heatRecoveryEffectiveness: 0.50, dhwDailyUse_L_per_m2: 0.3, dhwFuelType: 'gas', dhwEfficiency: 0.85, dhwInletTemp_C: 8, dhwSetpoint_C: 55 },
  },
  restaurant: {
    pre_1980:  { heatingFuelType: 'gas', heatingEfficiency: 0.75, coolingCOP: 2.5, partLoadFactor: 0.70, ventilationRate_L_s_m2: 3.0, fanPower_W_per_Ls: 2.5, heatRecoveryEffectiveness: 0, dhwDailyUse_L_per_m2: 2.0, dhwFuelType: 'gas', dhwEfficiency: 0.55, dhwInletTemp_C: 8, dhwSetpoint_C: 60 },
    '1980_2000': { heatingFuelType: 'gas', heatingEfficiency: 0.82, coolingCOP: 3.0, partLoadFactor: 0.75, ventilationRate_L_s_m2: 3.0, fanPower_W_per_Ls: 2.0, heatRecoveryEffectiveness: 0, dhwDailyUse_L_per_m2: 2.0, dhwFuelType: 'gas', dhwEfficiency: 0.65, dhwInletTemp_C: 8, dhwSetpoint_C: 60 },
    post_2000: { heatingFuelType: 'gas', heatingEfficiency: 0.92, coolingCOP: 3.5, partLoadFactor: 0.80, ventilationRate_L_s_m2: 3.0, fanPower_W_per_Ls: 1.5, heatRecoveryEffectiveness: 0.50, dhwDailyUse_L_per_m2: 2.0, dhwFuelType: 'gas', dhwEfficiency: 0.85, dhwInletTemp_C: 8, dhwSetpoint_C: 60 },
  },
  grocery: {
    pre_1980:  { heatingFuelType: 'gas', heatingEfficiency: 0.75, coolingCOP: 2.5, partLoadFactor: 0.70, ventilationRate_L_s_m2: 2.5, fanPower_W_per_Ls: 2.5, heatRecoveryEffectiveness: 0, dhwDailyUse_L_per_m2: 0.8, dhwFuelType: 'gas', dhwEfficiency: 0.55, dhwInletTemp_C: 8, dhwSetpoint_C: 55 },
    '1980_2000': { heatingFuelType: 'gas', heatingEfficiency: 0.82, coolingCOP: 3.0, partLoadFactor: 0.75, ventilationRate_L_s_m2: 2.5, fanPower_W_per_Ls: 2.0, heatRecoveryEffectiveness: 0, dhwDailyUse_L_per_m2: 0.8, dhwFuelType: 'gas', dhwEfficiency: 0.65, dhwInletTemp_C: 8, dhwSetpoint_C: 55 },
    post_2000: { heatingFuelType: 'gas', heatingEfficiency: 0.92, coolingCOP: 3.5, partLoadFactor: 0.80, ventilationRate_L_s_m2: 2.5, fanPower_W_per_Ls: 1.5, heatRecoveryEffectiveness: 0.50, dhwDailyUse_L_per_m2: 0.8, dhwFuelType: 'gas', dhwEfficiency: 0.85, dhwInletTemp_C: 8, dhwSetpoint_C: 55 },
  },
};

// Fallback: use office defaults for all others
for (const key of Object.keys(INTERNAL_GAINS_DEFAULTS)) {
  if (!MECHANICAL_DEFAULTS[key]) {
    MECHANICAL_DEFAULTS[key] = MECHANICAL_DEFAULTS.office_low_rise;
  }
}
