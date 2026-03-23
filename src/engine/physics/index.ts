import type { BuildingPhysicsParams, PhysicsResult, HeatingLoads, CoolingLoads } from '@/types/physics';
import { wallHeatLoss, roofHeatLoss, windowHeatLoss, slabHeatLoss, infiltrationHeatLoss, ventilationHeatLoss, solarHeatGain, totalUA } from './envelopeCalc';
import { calculateBalancePoint, adjustedHDD, adjustedCDD, annualOperatingHours } from './degreeDayCalc';
import { heatingFuelConsumption, heatPumpConsumption, coolingElectricity, fanElectricity, dhwEnergy } from './mechanicalCalc';
import { totalInternalGainRate_W, lightingAnnualEnergy, equipmentAnnualEnergy, internalGainHeatingOffset_kWh, internalGainCoolingLoad_kWh } from './internalGainsCalc';
import { solarPVGeneration, solarGainThroughGlazing } from './solarCalc';
import { ELEC_EMISSION_FACTORS, NG_EMISSION_FACTOR_T_PER_M3 } from '@/constants/rates';

const GAS_KWH_PER_M3 = 10.33;

// ─── Main Physics Engine ────────────────────────────────────────────────────
// Stateless pure function: params in → complete energy breakdown out.
// Run once for baseline, once for post-retrofit. Delta = savings.

export function calculateBuildingEnergy(params: BuildingPhysicsParams): PhysicsResult {
  const { grossFloorArea_m2, stories, ceilingHeight_m, envelope, internalGains, mechanical, climate, solarPV } = params;

  const volume = grossFloorArea_m2 * ceilingHeight_m;
  const floorplateArea = grossFloorArea_m2 / stories;
  const opHours = annualOperatingHours(internalGains.operatingHoursPerDay, internalGains.operatingDaysPerWeek);

  // ─── Step 1: Total UA for balance point ───────────────────────────────
  const ua = totalUA(envelope, volume);

  // ─── Step 2: Internal gains (also gives us lighting/equipment kWh) ────
  const internalGainRate_W = totalInternalGainRate_W(internalGains, grossFloorArea_m2);
  const lightingkWh = lightingAnnualEnergy(internalGains.lightingPowerDensity_W_m2, grossFloorArea_m2, opHours);
  const equipmentkWh = equipmentAnnualEnergy(internalGains.equipmentPowerDensity_W_m2, grossFloorArea_m2, opHours);

  // ─── Step 3: Balance point temperature ────────────────────────────────
  const balancePoint = calculateBalancePoint(21, internalGainRate_W, ua);

  // ─── Step 4: Adjusted degree days ─────────────────────────────────────
  const adjHDD = adjustedHDD(climate.hdd18, balancePoint, climate.meanWinterTemp_C);
  const coolBalancePoint = 24 + internalGainRate_W / Math.max(ua, 1); // cooling starts above this
  const adjCDD = adjustedCDD(climate.cdd10, Math.min(coolBalancePoint, 24));

  // ─── Step 5: Envelope heating losses ──────────────────────────────────
  const wallLoss = wallHeatLoss(envelope.wallArea_m2, envelope.wallRValue, adjHDD);
  const roofLoss = roofHeatLoss(envelope.roofArea_m2, envelope.roofRValue, adjHDD);
  const windowLoss = windowHeatLoss(envelope.windowArea_m2, envelope.windowUValue, adjHDD);
  const slabLoss = slabHeatLoss(envelope.slabArea_m2, envelope.slabRValue, envelope.slabPerimeter_m, adjHDD, climate.groundTemp_C);
  const infiltLoss = infiltrationHeatLoss(volume, envelope.achNatural, adjHDD);

  // ─── Step 6: Ventilation load (with HRV credit) ──────────────────────
  const ventLoss = ventilationHeatLoss(
    mechanical.ventilationRate_L_s_m2, grossFloorArea_m2, adjHDD,
    mechanical.heatRecoveryEffectiveness, opHours
  );

  // ─── Step 7: Net heating load ─────────────────────────────────────────
  const grossHeating = wallLoss + roofLoss + windowLoss + slabLoss + infiltLoss + ventLoss;
  const internalOffset = internalGainHeatingOffset_kWh(internalGains, grossFloorArea_m2);
  const solarOffset = solarHeatGain(
    envelope.windowArea_m2, envelope.windowSHGC,
    climate.annualSolarIrradiance_kWh_m2
  );
  const netHeating = Math.max(0, grossHeating - internalOffset - solarOffset);

  const heatingLoads: HeatingLoads = {
    walls_kWh: Math.round(wallLoss),
    roof_kWh: Math.round(roofLoss),
    windows_kWh: Math.round(windowLoss),
    slab_kWh: Math.round(slabLoss),
    infiltration_kWh: Math.round(infiltLoss),
    ventilation_kWh: Math.round(ventLoss),
    grossTotal_kWh: Math.round(grossHeating),
    internalGainOffset_kWh: Math.round(internalOffset),
    solarGainOffset_kWh: Math.round(solarOffset),
    netHeatingLoad_kWh: Math.round(netHeating),
  };

  // ─── Step 8: Heating fuel consumption ─────────────────────────────────
  let heatingElec = 0;
  let heatingGas_m3 = 0;

  if (mechanical.heatPump) {
    const hp = heatPumpConsumption(
      netHeating, mechanical.heatPump.heatingCoveragePercent,
      mechanical.heatPump.copCurve, climate.meanWinterTemp_C,
      mechanical.heatPump.supplementalFuel,
      mechanical.heatingEfficiency
    );
    heatingElec = hp.electricity_kWh;
    heatingGas_m3 = hp.gas_m3;
  } else {
    const fuel = heatingFuelConsumption(netHeating, mechanical.heatingFuelType, mechanical.heatingEfficiency);
    heatingElec = fuel.electricity_kWh;
    heatingGas_m3 = fuel.gas_m3;
  }

  // ─── Step 9: Cooling loads ────────────────────────────────────────────
  // Cooling = envelope gains + internal gains + solar gains - ventilation cooling
  const envelopeCoolingGain = (envelope.windowArea_m2 * envelope.windowUValue + envelope.wallArea_m2 / envelope.wallRValue) * adjCDD * 24 / 1000 * 0.3;
  const internalCoolingLoad = internalGainCoolingLoad_kWh(internalGains, grossFloorArea_m2);
  const solarCoolingGain = solarGainThroughGlazing(
    envelope.windowArea_m2, envelope.windowSHGC, climate.annualSolarIrradiance_kWh_m2
  );
  const ventCooling = mechanical.ventilationRate_L_s_m2 * grossFloorArea_m2 * adjCDD * 0.024 * 0.3;

  const netCooling = Math.max(0, envelopeCoolingGain + internalCoolingLoad + solarCoolingGain - ventCooling);

  const coolingLoads: CoolingLoads = {
    envelopeGain_kWh: Math.round(envelopeCoolingGain),
    internalGains_kWh: Math.round(internalCoolingLoad),
    solarGains_kWh: Math.round(solarCoolingGain),
    ventilation_kWh: Math.round(ventCooling),
    netCoolingLoad_kWh: Math.round(netCooling),
  };

  // ─── Step 10: Cooling electricity ─────────────────────────────────────
  const coolingElec = coolingElectricity(netCooling, mechanical.coolingCOP, mechanical.partLoadFactor);

  // ─── Step 11: Fan electricity ─────────────────────────────────────────
  const fanElec = fanElectricity(
    mechanical.ventilationRate_L_s_m2, grossFloorArea_m2,
    mechanical.fanPower_W_per_Ls, opHours
  );

  // ─── Step 12: DHW ─────────────────────────────────────────────────────
  const dhw = dhwEnergy(
    mechanical.dhwDailyUse_L_per_m2, grossFloorArea_m2,
    mechanical.dhwInletTemp_C, mechanical.dhwSetpoint_C,
    mechanical.dhwEfficiency, mechanical.dhwFuelType,
    internalGains.operatingDaysPerWeek * 52
  );

  // ─── Step 13: Solar PV generation ─────────────────────────────────────
  let solarGen = 0;
  if (solarPV) {
    solarGen = solarPVGeneration(solarPV, climate.annualSolarIrradiance_kWh_m2, climate.latitude);
  }

  // ─── Step 14: Totals ──────────────────────────────────────────────────
  const baseload = params.baseloadElectricity_kWh || 0;
  const totalElec = heatingElec + coolingElec + fanElec + lightingkWh + equipmentkWh + dhw.electricity_kWh + baseload;
  const totalGas = heatingGas_m3 + dhw.gas_m3;
  const netElec = totalElec - solarGen;

  const gasEkwh = totalGas * GAS_KWH_PER_M3;
  const totalEUI = (totalElec + gasEkwh) / grossFloorArea_m2;

  // GHG
  const elecEmissionFactor = ELEC_EMISSION_FACTORS[(params.province || 'ON') as keyof typeof ELEC_EMISSION_FACTORS] || 25;
  const elecGHG = (totalElec * elecEmissionFactor) / 1_000_000;
  const gasGHG = totalGas * NG_EMISSION_FACTOR_T_PER_M3;

  // Load breakdown for visualization
  const totalLoad = netHeating + netCooling + lightingkWh + equipmentkWh + fanElec + dhw.electricity_kWh + (dhw.gas_m3 * GAS_KWH_PER_M3);
  const loadBreakdown = [
    { category: 'Space Heating', heating_pct: netHeating / totalLoad * 100, cooling_pct: 0, total_kWh: netHeating },
    { category: 'Space Cooling', heating_pct: 0, cooling_pct: netCooling / totalLoad * 100, total_kWh: netCooling },
    { category: 'Lighting', heating_pct: lightingkWh / totalLoad * 100, cooling_pct: 0, total_kWh: lightingkWh },
    { category: 'Equipment', heating_pct: equipmentkWh / totalLoad * 100, cooling_pct: 0, total_kWh: equipmentkWh },
    { category: 'Ventilation', heating_pct: fanElec / totalLoad * 100, cooling_pct: 0, total_kWh: fanElec },
    { category: 'DHW', heating_pct: (dhw.electricity_kWh + dhw.gas_m3 * GAS_KWH_PER_M3) / totalLoad * 100, cooling_pct: 0, total_kWh: dhw.electricity_kWh + dhw.gas_m3 * GAS_KWH_PER_M3 },
  ];

  return {
    heatingLoads,
    coolingLoads,
    electricity: {
      heating_kWh: Math.round(heatingElec),
      cooling_kWh: Math.round(coolingElec),
      fans_kWh: Math.round(fanElec),
      lighting_kWh: Math.round(lightingkWh),
      equipment_kWh: Math.round(equipmentkWh),
      dhw_kWh: Math.round(dhw.electricity_kWh),
      total_kWh: Math.round(totalElec),
    },
    gas: {
      heating_m3: heatingGas_m3,
      dhw_m3: dhw.gas_m3,
      total_m3: totalGas,
    },
    totalEUI_ekWh_m2: Math.round(totalEUI),
    electricityEUI_kWh_m2: Math.round(totalElec / grossFloorArea_m2),
    gasEUI_ekWh_m2: Math.round(gasEkwh / grossFloorArea_m2),
    ghg_tCO2e: elecGHG + gasGHG,
    solarGeneration_kWh: Math.round(solarGen),
    netElectricity_kWh: Math.round(netElec),
    balancePointTemp_C: Math.round(balancePoint * 10) / 10,
    loadBreakdown,
  };
}

// ─── Monthly Energy Calculation ──────────────────────────────────────────────
// Runs the physics pipeline 12 times with month-specific climate inputs.
// HDD/CDD-dependent loads use monthly values directly.
// Non-climate loads (lighting, equipment, DHW) are scaled by days in month.

import type { MonthlyClimate } from './monthlyProfile';
import { DAYS_PER_MONTH } from './monthlyProfile';

export interface MonthlyEnergyResult {
  month: number;
  label: string;
  electricity_kWh: number;
  gas_m3: number;
  heating_kWh: number;
  cooling_kWh: number;
  lighting_kWh: number;
  equipment_kWh: number;
  fans_kWh: number;
  dhwElec_kWh: number;
  dhwGas_m3: number;
  heatingElec_kWh: number;
  heatingGas_m3: number;
  coolingElec_kWh: number;
  solarGeneration_kWh: number;
  baseload_kWh: number;
}

export function calculateMonthlyEnergy(
  params: BuildingPhysicsParams,
  monthlyClimate: MonthlyClimate[]
): MonthlyEnergyResult[] {
  const { grossFloorArea_m2, stories, ceilingHeight_m, envelope, internalGains, mechanical, climate, solarPV } = params;

  const volume = grossFloorArea_m2 * ceilingHeight_m;
  const annualOpHours = annualOperatingHours(internalGains.operatingHoursPerDay, internalGains.operatingDaysPerWeek);
  const ua = totalUA(envelope, volume);
  const internalGainRate_W = totalInternalGainRate_W(internalGains, grossFloorArea_m2);
  const balancePoint = calculateBalancePoint(21, internalGainRate_W, ua);

  return monthlyClimate.map((month) => {
    const days = DAYS_PER_MONTH[month.month - 1];
    const dayFraction = days / 365; // fraction of year this month represents

    // ── Climate-dependent loads (use monthly HDD/CDD directly) ──
    const adjHDD = adjustedHDD(month.hdd, balancePoint, month.meanTemp_C);
    const coolBP = 24 + internalGainRate_W / Math.max(ua, 1);
    const adjCDD = adjustedCDD(month.cdd, Math.min(coolBP, 24));

    // Envelope heating losses
    const wallLoss = wallHeatLoss(envelope.wallArea_m2, envelope.wallRValue, adjHDD);
    const roofLoss = roofHeatLoss(envelope.roofArea_m2, envelope.roofRValue, adjHDD);
    const windowLoss = windowHeatLoss(envelope.windowArea_m2, envelope.windowUValue, adjHDD);
    const slabLoss = slabHeatLoss(envelope.slabArea_m2, envelope.slabRValue, envelope.slabPerimeter_m, adjHDD, climate.groundTemp_C);
    const infiltLoss = infiltrationHeatLoss(volume, envelope.achNatural, adjHDD);
    const ventLoss = ventilationHeatLoss(
      mechanical.ventilationRate_L_s_m2, grossFloorArea_m2, adjHDD,
      mechanical.heatRecoveryEffectiveness, annualOpHours * dayFraction
    );

    const grossHeating = wallLoss + roofLoss + windowLoss + slabLoss + infiltLoss + ventLoss;

    // Internal gains offset (scaled to month)
    const internalOffset = internalGainHeatingOffset_kWh(internalGains, grossFloorArea_m2) * dayFraction;
    const solarOffset = solarHeatGain(
      envelope.windowArea_m2, envelope.windowSHGC,
      month.solarIrradiance_kWh_m2 // monthly value, not annualized
    );
    const netHeating = Math.max(0, grossHeating - internalOffset - solarOffset);

    // Heating fuel
    let heatingElec = 0;
    let heatingGas_m3 = 0;
    if (mechanical.heatPump) {
      const hp = heatPumpConsumption(
        netHeating, mechanical.heatPump.heatingCoveragePercent,
        mechanical.heatPump.copCurve, month.meanTemp_C,
        mechanical.heatPump.supplementalFuel,
        mechanical.heatingEfficiency
      );
      heatingElec = hp.electricity_kWh;
      heatingGas_m3 = hp.gas_m3;
    } else {
      const fuel = heatingFuelConsumption(netHeating, mechanical.heatingFuelType, mechanical.heatingEfficiency);
      heatingElec = fuel.electricity_kWh;
      heatingGas_m3 = fuel.gas_m3;
    }

    // ── Cooling (monthly) ──
    const envelopeCoolingGain = (envelope.windowArea_m2 * envelope.windowUValue +
      envelope.wallArea_m2 / envelope.wallRValue) * adjCDD * 24 / 1000 * 0.3;
    const internalCoolingLoad = internalGainCoolingLoad_kWh(internalGains, grossFloorArea_m2) * dayFraction;
    const solarCoolingGain = solarGainThroughGlazing(
      envelope.windowArea_m2, envelope.windowSHGC, month.solarIrradiance_kWh_m2
    );
    const ventCooling = mechanical.ventilationRate_L_s_m2 * grossFloorArea_m2 * adjCDD * 0.024 * 0.3;
    const netCooling = Math.max(0, envelopeCoolingGain + internalCoolingLoad + solarCoolingGain - ventCooling);
    const coolingElec = coolingElectricity(netCooling, mechanical.coolingCOP, mechanical.partLoadFactor);

    // ── Non-climate loads (scaled by day fraction) ──
    const monthOpHours = annualOpHours * dayFraction;
    const lightingkWh = lightingAnnualEnergy(internalGains.lightingPowerDensity_W_m2, grossFloorArea_m2, monthOpHours);
    const equipmentkWh = equipmentAnnualEnergy(internalGains.equipmentPowerDensity_W_m2, grossFloorArea_m2, monthOpHours);
    const fanElec = fanElectricity(
      mechanical.ventilationRate_L_s_m2, grossFloorArea_m2,
      mechanical.fanPower_W_per_Ls, monthOpHours
    );
    const dhw = dhwEnergy(
      mechanical.dhwDailyUse_L_per_m2, grossFloorArea_m2,
      mechanical.dhwInletTemp_C, mechanical.dhwSetpoint_C,
      mechanical.dhwEfficiency, mechanical.dhwFuelType,
      internalGains.operatingDaysPerWeek * 52 * dayFraction
    );

    // Solar PV (monthly irradiance)
    let solarGen = 0;
    if (solarPV) {
      solarGen = solarPVGeneration(
        solarPV,
        month.solarIrradiance_kWh_m2 * 12, // annualize for the existing calc
        climate.latitude
      ) / 12 * (month.solarIrradiance_kWh_m2 / (climate.annualSolarIrradiance_kWh_m2 / 12));
      // Scale by ratio of this month's irradiance to average monthly
    }

    // Baseload
    const baseload = (params.baseloadElectricity_kWh || 0) * dayFraction;

    const totalElec = heatingElec + coolingElec + fanElec + lightingkWh + equipmentkWh + dhw.electricity_kWh + baseload;
    const totalGas = heatingGas_m3 + dhw.gas_m3;

    return {
      month: month.month,
      label: month.label,
      electricity_kWh: Math.round(totalElec),
      gas_m3: Math.round(totalGas * 10) / 10,
      heating_kWh: Math.round(netHeating),
      cooling_kWh: Math.round(netCooling),
      lighting_kWh: Math.round(lightingkWh),
      equipment_kWh: Math.round(equipmentkWh),
      fans_kWh: Math.round(fanElec),
      dhwElec_kWh: Math.round(dhw.electricity_kWh),
      dhwGas_m3: Math.round(dhw.gas_m3 * 10) / 10,
      heatingElec_kWh: Math.round(heatingElec),
      heatingGas_m3: Math.round(heatingGas_m3 * 10) / 10,
      coolingElec_kWh: Math.round(coolingElec),
      solarGeneration_kWh: Math.round(solarGen),
      baseload_kWh: Math.round(baseload),
    };
  });
}
