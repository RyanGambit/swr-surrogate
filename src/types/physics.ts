// ─── Physics-Based Energy Model Types ────────────────────────────────────────

export interface BuildingEnvelope {
  // Walls (R-values in m²·K/W)
  wallArea_m2: number;
  wallRValue: number;

  // Roof
  roofArea_m2: number;
  roofRValue: number;

  // Windows (U-value in W/m²·K)
  windowArea_m2: number;
  windowUValue: number;
  windowSHGC: number; // solar heat gain coefficient 0-1

  // Ground / slab
  slabArea_m2: number;
  slabRValue: number;
  slabPerimeter_m: number;

  // Air tightness
  ach50: number;         // air changes at 50 Pa
  achNatural: number;    // ~ach50/20 for commercial
}

export interface InternalGains {
  lightingPowerDensity_W_m2: number;
  equipmentPowerDensity_W_m2: number;
  occupantDensity_per_m2: number;
  metabolicRate_W: number; // ~120W sensible per person
  operatingHoursPerDay: number;
  operatingDaysPerWeek: number;
}

export interface COPCurvePoint {
  tempC: number;
  cop: number;
  capacityFactor?: number; // optional, used by bin analysis
}

export interface HeatPumpParams {
  copRated: number;
  copCurve: COPCurvePoint[];
  heatingCoveragePercent: number;
  supplementalFuel: 'gas' | 'electric';
}

export interface MechanicalSystems {
  heatingFuelType: 'gas' | 'electric' | 'oil';
  heatingEfficiency: number;
  heatingCapacity_kW: number;

  heatPump?: HeatPumpParams;

  coolingCOP: number;
  coolingCapacity_kW: number;
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

export interface ClimateInputs {
  hdd18: number;
  cdd10: number;
  latitude: number;
  annualSolarIrradiance_kWh_m2: number;
  designHeatingTemp_C: number;
  designCoolingTemp_C: number;
  meanWinterTemp_C: number;
  groundTemp_C: number;
}

export interface SolarPVParams {
  capacity_kW: number;
  tiltAngle: number;
  azimuth: number;        // 180 = south
  panelEfficiency: number; // ~0.20
  systemLosses: number;   // ~0.14
}

export interface BuildingPhysicsParams {
  grossFloorArea_m2: number;
  stories: number;
  ceilingHeight_m: number;
  envelope: BuildingEnvelope;
  internalGains: InternalGains;
  mechanical: MechanicalSystems;
  climate: ClimateInputs;
  solarPV?: SolarPVParams;
  province?: string;
  // Baseload electricity not affected by lighting/controls measures
  // (elevators, servers, common area equipment, unmetered loads)
  baseloadElectricity_kWh?: number;
}

// ─── Physics Result ─────────────────────────────────────────────────────────

export interface HeatingLoads {
  walls_kWh: number;
  roof_kWh: number;
  windows_kWh: number;
  slab_kWh: number;
  infiltration_kWh: number;
  ventilation_kWh: number;
  grossTotal_kWh: number;
  internalGainOffset_kWh: number;
  solarGainOffset_kWh: number;
  netHeatingLoad_kWh: number;
}

export interface CoolingLoads {
  envelopeGain_kWh: number;
  internalGains_kWh: number;
  solarGains_kWh: number;
  ventilation_kWh: number;
  netCoolingLoad_kWh: number;
}

export interface PhysicsResult {
  heatingLoads: HeatingLoads;
  coolingLoads: CoolingLoads;

  electricity: {
    heating_kWh: number;
    cooling_kWh: number;
    fans_kWh: number;
    lighting_kWh: number;
    equipment_kWh: number;
    dhw_kWh: number;
    total_kWh: number;
  };

  gas: {
    heating_m3: number;
    dhw_m3: number;
    total_m3: number;
  };

  totalEUI_ekWh_m2: number;
  electricityEUI_kWh_m2: number;
  gasEUI_ekWh_m2: number;
  ghg_tCO2e: number;

  solarGeneration_kWh: number;
  netElectricity_kWh: number;

  balancePointTemp_C: number;

  // For visualization — load breakdown percentages
  loadBreakdown: {
    category: string;
    heating_pct: number;
    cooling_pct: number;
    total_kWh: number;
  }[];
}

// ─── Measure Physics Delta ──────────────────────────────────────────────────

export interface PhysicsMeasureDelta {
  measureId: string;
  envelope?: Partial<BuildingEnvelope>;
  internalGains?: Partial<InternalGains>;
  mechanical?: Partial<MechanicalSystems>;
  solarPV?: SolarPVParams;
  operatingHoursReduction?: number;
  setpointAdjustment_C?: number;
}
