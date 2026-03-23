import type { BuildingData, EnergyBaseline, AssumptionFlag, BuildingArchetype } from '@/types';
import type { PhysicsResult, PhysicsMeasureDelta, BuildingPhysicsParams } from '@/types/physics';
import { ARCHETYPE_BENCHMARKS, CLIMATE_DATA, LDC_MAP } from '@/constants/benchmarks';
import { ELECTRICITY_RATES, GAS_RATES, ELEC_EMISSION_FACTORS, NG_EMISSION_FACTOR_T_PER_M3 } from '@/constants/rates';
import { calculateBuildingEnergy, calculateMonthlyEnergy, type MonthlyEnergyResult } from './physics/index';
import { buildPhysicsParams } from './physics/paramBuilder';
import { applyMeasureDeltas, getMeasureDelta } from './physics/measureApplicator';
import { calculateAnnualElecBill } from './rates/ontarioElectricity';
import { calculateAnnualGasBill } from './rates/ontarioGas';
import { getMonthlyClimate } from './physics/monthlyProfile';
import { DAYS_PER_MONTH } from './physics/monthlyProfile';
// Surrogate model imports
import {
  hasSurrogateModel, buildSurrogateInput, applyMeasuresToSurrogateInput,
  containsASHP, predictForBuilding, surrogateToPhysicsResult, clampInput,
} from './surrogate/index';

const SQ_FT_TO_M2 = 0.0929;
const GAS_KWH_PER_M3 = 10.33;

// ─── Physics-Based Baseline Estimation ──────────────────────────────────────

export function estimateBaseline(building: Partial<BuildingData>): EnergyBaseline & { physicsResult: PhysicsResult; physicsParams: BuildingPhysicsParams } {
  const archetype = building.archetype || 'office_low_rise';

  // ─── Surrogate Model Path (EnergyPlus-grounded) ──────────────────────────
  if (hasSurrogateModel(archetype)) {
    return estimateBaselineSurrogate(building);
  }

  // ─── Physics Engine Path (fallback for other archetypes) ─────────────────
  return estimateBaselinePhysics(building);
}

function estimateBaselineSurrogate(building: Partial<BuildingData>): EnergyBaseline & { physicsResult: PhysicsResult; physicsParams: BuildingPhysicsParams } {
  // Still build physics params — needed for ASHP fallback and downstream compatibility
  const { params, assumptions } = buildPhysicsParams(building);
  const allAssumptions = [...assumptions];
  const areaM2 = (building.areaSqFt || 10000) * SQ_FT_TO_M2;

  // Build surrogate input from physics params
  const surrogateInput = buildSurrogateInput(building, params);
  const { clamped, warnings: clampWarnings } = clampInput(surrogateInput);

  // Add clamping warnings as assumptions
  for (const warn of clampWarnings) {
    allAssumptions.push({
      parameter: 'Surrogate Input Clamped',
      assumedValue: warn,
      source: 'surrogate',
      confidence: 0.4,
      improvementPrompt: 'Parameter was outside the EnergyPlus training range.',
    });
  }

  // Run surrogate
  let prediction = predictForBuilding(clamped, areaM2);
  // Base confidence from assumption quality (not hardcoded)
  // Aggregate individual assumption confidences — weighted average
  let confidence = allAssumptions.length > 0
    ? allAssumptions.reduce((sum, a) => sum + a.confidence, 0) / allAssumptions.length
    : 0.30;

  // Also calibrate physics params so ASHP fallback path gets consistent results
  let calibratedParams = params;

  // Calibrate against utility bills if provided
  if (building.annualElectricitykWh && building.annualGasM3) {
    const actualElec = building.annualElectricitykWh;
    const actualGas = building.annualGasM3;

    const elecRatio = prediction.annual_elec_kWh > 0 ? actualElec / prediction.annual_elec_kWh : 1;
    const gasRatio = prediction.annual_gas_m3 > 0 ? actualGas / prediction.annual_gas_m3 : 1;

    // Apply ratio-based correction to surrogate prediction
    prediction = {
      ...prediction,
      annual_elec_kWh: Math.round(actualElec),
      annual_gas_m3: Math.round(actualGas),
      cooling_kWh: Math.round(prediction.cooling_kWh * elecRatio),
      lighting_kWh: Math.round(prediction.lighting_kWh * elecRatio),
      equipment_kWh: Math.round(prediction.equipment_kWh * elecRatio),
      fans_kWh: Math.round(prediction.fans_kWh * elecRatio),
      heating_gas_kWh: Math.round(prediction.heating_gas_kWh * gasRatio),
      total_ekWh: Math.round(actualElec + actualGas * GAS_KWH_PER_M3),
      total_EUI_ekWh_m2: Math.round((actualElec + actualGas * GAS_KWH_PER_M3) / areaM2),
    };

    // Calibrate physics params against bills (same logic as estimateBaselinePhysics)
    // This ensures ASHP fallback produces consistent deltas
    calibratedParams = JSON.parse(JSON.stringify(params)) as BuildingPhysicsParams;
    for (let pass = 0; pass < 5; pass++) {
      const predicted = calculateBuildingEnergy(calibratedParams);
      const elecFactor = predicted.electricity.total_kWh > 0 ? actualElec / predicted.electricity.total_kWh : 1;
      const gasFactor = predicted.gas.total_m3 > 0 ? actualGas / predicted.gas.total_m3 : 1;

      if (Math.abs(elecFactor - 1) < 0.05 && Math.abs(gasFactor - 1) < 0.05) break;

      if (Math.abs(gasFactor - 1) > 0.05) {
        if (gasFactor > 1.0) {
          const achAdj = Math.min(Math.pow(gasFactor, 0.6), 1.8);
          const effAdj = Math.max(Math.pow(1 / gasFactor, 0.4), 0.7);
          calibratedParams.envelope.achNatural *= achAdj;
          calibratedParams.envelope.ach50 = calibratedParams.envelope.achNatural * 20;
          calibratedParams.mechanical.heatingEfficiency = Math.max(
            calibratedParams.mechanical.heatingEfficiency * effAdj, 0.60
          );
        } else {
          const achAdj = Math.max(Math.pow(gasFactor, 0.6), 0.6);
          const effAdj = Math.min(Math.pow(1 / gasFactor, 0.4), 1.3);
          calibratedParams.envelope.achNatural *= achAdj;
          calibratedParams.envelope.ach50 = calibratedParams.envelope.achNatural * 20;
          calibratedParams.mechanical.heatingEfficiency = Math.min(
            calibratedParams.mechanical.heatingEfficiency * effAdj, 0.98
          );
        }
      }
      if (Math.abs(elecFactor - 1) > 0.05) {
        if (elecFactor > 1.0) {
          const gap_kWh = actualElec - predicted.electricity.total_kWh;
          calibratedParams.baseloadElectricity_kWh = (calibratedParams.baseloadElectricity_kWh || 0) + gap_kWh;
        } else {
          const adj = Math.max(0.85, elecFactor);
          calibratedParams.internalGains.operatingHoursPerDay *= Math.pow(adj, 0.3);
        }
      }
    }

    const withinRange = Math.abs(elecRatio - 1) < 0.15 && Math.abs(gasRatio - 1) < 0.15;
    allAssumptions.push({
      parameter: 'Surrogate Bill Calibration',
      assumedValue: `Elec ${elecRatio.toFixed(2)}x, Gas ${gasRatio.toFixed(2)}x${withinRange ? '' : ' — recommend site visit'}`,
      source: 'user_input',
      confidence: withinRange ? 0.8 : 0.6,
      improvementPrompt: withinRange
        ? 'EnergyPlus surrogate calibrated against utility bills.'
        : 'Surrogate prediction deviates from bills. A site visit would improve accuracy.',
    });

    confidence = 0.75; // calibrated surrogate — still has assumption uncertainty
  }

  allAssumptions.push({
    parameter: 'Energy Model',
    assumedValue: 'EnergyPlus Surrogate (391 simulations, R² > 0.95)',
    source: 'surrogate',
    confidence: 0.8,
    improvementPrompt: 'Predictions grounded in full hourly EnergyPlus simulation.',
  });

  const result = surrogateToPhysicsResult(prediction, areaM2);

  // Energy Star Score estimate
  const archetype = building.archetype || 'office_low_rise';
  const benchmark = ARCHETYPE_BENCHMARKS[archetype];
  const euiPctile = result.totalEUI_ekWh_m2 <= benchmark.euiLow ? 85
    : result.totalEUI_ekWh_m2 <= benchmark.euiMedian ? 60
    : result.totalEUI_ekWh_m2 <= benchmark.euiHigh ? 35
    : 15;

  return {
    annualElectricitykWh: prediction.annual_elec_kWh,
    annualGasM3: prediction.annual_gas_m3,
    electricityEUI: result.electricityEUI_kWh_m2,
    gasEUI: Math.round((prediction.annual_gas_m3 / areaM2) * 10) / 10,
    totalEUI: result.totalEUI_ekWh_m2,
    estimatedGHG: result.ghg_tCO2e,
    energyStarScore: euiPctile,
    confidenceLevel: confidence,
    assumptions: allAssumptions,
    physicsResult: result,
    physicsParams: calibratedParams, // calibrated for ASHP fallback compatibility
  };
}

function estimateBaselinePhysics(building: Partial<BuildingData>): EnergyBaseline & { physicsResult: PhysicsResult; physicsParams: BuildingPhysicsParams } {
  const { params, assumptions } = buildPhysicsParams(building);
  const allAssumptions = [...assumptions];

  // Run physics engine with default parameters first
  const uncalibratedResult = calculateBuildingEnergy(params);

  let calibratedParams = params;
  let result = uncalibratedResult;
  // Base confidence from assumption quality (not hardcoded)
  let confidence = allAssumptions.length > 0
    ? Math.min(allAssumptions.reduce((sum, a) => sum + a.confidence, 0) / allAssumptions.length, 0.40)
    : 0.25;

  // ─── FIX 1: Utility Bill Calibration ──────────────────────────────────
  // When actual bills are provided, iteratively calibrate the physics model.
  if (building.annualElectricitykWh && building.annualGasM3) {
    const actualElec = building.annualElectricitykWh;
    const actualGas = building.annualGasM3;

    calibratedParams = JSON.parse(JSON.stringify(params)) as BuildingPhysicsParams;

    // Iterative calibration — up to 5 passes
    for (let pass = 0; pass < 5; pass++) {
      const predicted = calculateBuildingEnergy(calibratedParams);
      const elecFactor = predicted.electricity.total_kWh > 0 ? actualElec / predicted.electricity.total_kWh : 1;
      const gasFactor = predicted.gas.total_m3 > 0 ? actualGas / predicted.gas.total_m3 : 1;

      // Check convergence (within 5%)
      if (Math.abs(elecFactor - 1) < 0.05 && Math.abs(gasFactor - 1) < 0.05) break;

      // Adjust gas parameters — primarily infiltration and heating efficiency
      if (Math.abs(gasFactor - 1) > 0.05) {
        if (gasFactor > 1.0) {
          // Model underestimates gas → increase infiltration, decrease efficiency
          const achAdj = Math.min(Math.pow(gasFactor, 0.6), 1.8);
          const effAdj = Math.max(Math.pow(1 / gasFactor, 0.4), 0.7);
          calibratedParams.envelope.achNatural *= achAdj;
          calibratedParams.envelope.ach50 = calibratedParams.envelope.achNatural * 20;
          calibratedParams.mechanical.heatingEfficiency = Math.max(
            calibratedParams.mechanical.heatingEfficiency * effAdj, 0.60
          );
        } else {
          // Model overestimates gas → decrease infiltration, increase efficiency
          const achAdj = Math.max(Math.pow(gasFactor, 0.6), 0.6);
          const effAdj = Math.min(Math.pow(1 / gasFactor, 0.4), 1.3);
          calibratedParams.envelope.achNatural *= achAdj;
          calibratedParams.envelope.ach50 = calibratedParams.envelope.achNatural * 20;
          calibratedParams.mechanical.heatingEfficiency = Math.min(
            calibratedParams.mechanical.heatingEfficiency * effAdj, 0.98
          );
        }
      }

      // Adjust electricity parameters.
      // IMPORTANT: Don't inflate measure-sensitive params (LPD, EPD, hours).
      // Instead, attribute excess electricity to baseload (elevators, servers, etc.)
      // which is NOT reduced by retrofit measures.
      if (Math.abs(elecFactor - 1) > 0.05) {
        if (elecFactor > 1.0) {
          // Model underestimates electricity → attribute gap to baseload
          const gap_kWh = actualElec - predicted.electricity.total_kWh;
          calibratedParams.baseloadElectricity_kWh = (calibratedParams.baseloadElectricity_kWh || 0) + gap_kWh;
        } else {
          // Model overestimates electricity → reduce operating hours slightly
          const adj = Math.max(0.85, elecFactor);
          calibratedParams.internalGains.operatingHoursPerDay *= Math.pow(adj, 0.3);
        }
      }
    }

    // Final run with calibrated params
    result = calculateBuildingEnergy(calibratedParams);

    // Calculate final factors for logging
    const finalElecFactor = result.electricity.total_kWh > 0 ? actualElec / result.electricity.total_kWh : 1;
    const finalGasFactor = result.gas.total_m3 > 0 ? actualGas / result.gas.total_m3 : 1;
    const withinRange = Math.abs(finalElecFactor - 1) < 0.15 && Math.abs(finalGasFactor - 1) < 0.15;

    allAssumptions.push({
      parameter: 'Utility Bill Calibration',
      assumedValue: `Elec ${finalElecFactor.toFixed(2)}x, Gas ${finalGasFactor.toFixed(2)}x${withinRange ? '' : ' — recommend site visit'}`,
      source: 'user_input',
      confidence: withinRange ? 0.7 : 0.5,
      improvementPrompt: withinRange
        ? 'Model calibrated against utility bills.'
        : 'Model deviation persists after calibration. A site visit would improve accuracy.',
    });

    confidence = 0.65; // calibrated physics — still uncertain on many params
  } else if (building.totalEUI && building.totalEUI > 0) {
    confidence = 0.50;
  }

  if (!building.yearBuilt) {
    allAssumptions.push({
      parameter: 'Year Built',
      assumedValue: 1985,
      source: 'benchmark',
      confidence: 0.2,
      improvementPrompt: 'When was your building constructed?',
    });
  }

  // Energy Star Score estimate
  const archetype = building.archetype || 'office_low_rise';
  const benchmark = ARCHETYPE_BENCHMARKS[archetype];
  const euiPctile = result.totalEUI_ekWh_m2 <= benchmark.euiLow ? 85
    : result.totalEUI_ekWh_m2 <= benchmark.euiMedian ? 60
    : result.totalEUI_ekWh_m2 <= benchmark.euiHigh ? 35
    : 15;

  return {
    annualElectricitykWh: result.electricity.total_kWh,
    annualGasM3: result.gas.total_m3,
    electricityEUI: result.electricityEUI_kWh_m2,
    gasEUI: Math.round((result.gas.total_m3 / calibratedParams.grossFloorArea_m2) * 10) / 10,
    totalEUI: result.totalEUI_ekWh_m2,
    estimatedGHG: result.ghg_tCO2e,
    energyStarScore: euiPctile,
    confidenceLevel: confidence,
    assumptions: allAssumptions,
    physicsResult: result,
    physicsParams: calibratedParams,
  };
}

// ─── Physics-Based Measure Impact ───────────────────────────────────────────
// Runs the SAME physics engine with modified parameters.
// Delta = baseline - post-retrofit. No percentage heuristics.

export interface MeasureImpact {
  postRetrofitEUI: number;
  annualElecSavingskWh: number;
  annualGasSavingsM3: number;
  annualElecAddedkWh: number;
  netElecChangekWh: number;
  netGasChangeM3: number;
  ghgReductionTonnes: number;
  ghgReductionPct: number;       // integer 0-100 for display
  ghgReductionDecimal: number;   // raw 0.0-1.0 for eligibility checks
  annualEnergyCostSavings: number;
  // Rate-engine detailed costs
  baselineAnnualElecCost: number;
  retrofitAnnualElecCost: number;
  baselineAnnualGasCost: number;
  retrofitAnnualGasCost: number;
  demandChargeIncrease: number;
  baselineMonthly: MonthlyEnergyResult[];
  retrofitMonthly: MonthlyEnergyResult[];
  baselineResult: PhysicsResult;
  retrofitResult: PhysicsResult;
}

export function estimatePhysicsImpact(
  baselineParams: BuildingPhysicsParams,
  baselineResult: PhysicsResult,
  measureIds: string[],
  building: Partial<BuildingData>
): MeasureImpact {
  const archetype = building.archetype || 'office_low_rise';

  // ─── Surrogate path: use when archetype supported AND no ASHP ────────────
  if (hasSurrogateModel(archetype) && !containsASHP(measureIds)) {
    return estimateSurrogateImpact(baselineParams, baselineResult, measureIds, building);
  }

  // ─── Physics engine path (fallback) ──────────────────────────────────────
  return estimatePhysicsImpactCore(baselineParams, baselineResult, measureIds, building);
}

function estimateSurrogateImpact(
  baselineParams: BuildingPhysicsParams,
  baselineResult: PhysicsResult,
  measureIds: string[],
  building: Partial<BuildingData>
): MeasureImpact {
  const areaM2 = (building.areaSqFt || 10000) * SQ_FT_TO_M2;

  // Build surrogate inputs for baseline and retrofit
  const baselineSurInput = buildSurrogateInput(building, baselineParams);
  const { clamped: baselineClamped } = clampInput(baselineSurInput);
  const retrofitSurInput = applyMeasuresToSurrogateInput(baselineClamped, measureIds);
  const { clamped: retrofitClamped } = clampInput(retrofitSurInput);

  // Run surrogate for both scenarios
  const basePrediction = predictForBuilding(baselineClamped, areaM2);
  const retroPrediction = predictForBuilding(retrofitClamped, areaM2);

  // Convert to PhysicsResult shape
  const surrogateBaselineResult = surrogateToPhysicsResult(basePrediction, areaM2);
  const surrogateRetrofitResult = surrogateToPhysicsResult(retroPrediction, areaM2);

  // Use physics engine for monthly profiles (surrogate is annual-only)
  // Apply the surrogate deltas as ratios to the physics monthly profiles
  const city = building.city || 'waterloo';
  const ldc = detectCityData(building.address || city).ldc
    .toLowerCase().replace(/\s+/g, '_');

  const monthlyClimate = getMonthlyClimate(city);

  // Physics monthly profiles for rate-engine costing
  const deltas = measureIds.map(id => getMeasureDelta(id, baselineParams));
  const retrofitParams = applyMeasureDeltas(baselineParams, deltas);
  const baselineMonthly = calculateMonthlyEnergy(baselineParams, monthlyClimate);
  const retrofitMonthly = calculateMonthlyEnergy(retrofitParams, monthlyClimate);

  // Scale monthly profiles to match surrogate annual totals
  const physBaseElec = baselineMonthly.reduce((s, m) => s + m.electricity_kWh, 0);
  const physRetroElec = retrofitMonthly.reduce((s, m) => s + m.electricity_kWh, 0);
  const physBaseGas = baselineMonthly.reduce((s, m) => s + m.gas_m3, 0);
  const physRetroGas = retrofitMonthly.reduce((s, m) => s + m.gas_m3, 0);

  const baseElecScale = physBaseElec > 0 ? basePrediction.annual_elec_kWh / physBaseElec : 1;
  const retroElecScale = physRetroElec > 0 ? retroPrediction.annual_elec_kWh / physRetroElec : 1;
  const baseGasScale = physBaseGas > 0 ? basePrediction.annual_gas_m3 / physBaseGas : 1;
  const retroGasScale = physRetroGas > 0 ? retroPrediction.annual_gas_m3 / physRetroGas : 1;

  const scaledBaseMonthly = baselineMonthly.map(m => ({
    ...m,
    electricity_kWh: Math.round(m.electricity_kWh * baseElecScale),
    gas_m3: Math.round(m.gas_m3 * baseGasScale),
  }));
  const scaledRetroMonthly = retrofitMonthly.map(m => ({
    ...m,
    electricity_kWh: Math.round(m.electricity_kWh * retroElecScale),
    gas_m3: Math.round(m.gas_m3 * retroGasScale),
  }));

  // Rate-engine annual bills using scaled monthly
  const baselineElecBill = calculateAnnualElecBill(
    scaledBaseMonthly.map(m => m.electricity_kWh),
    scaledBaseMonthly.map(m => estimateMonthlyPeakDemand(m)),
    ldc
  );
  const retrofitElecBill = calculateAnnualElecBill(
    scaledRetroMonthly.map(m => m.electricity_kWh),
    scaledRetroMonthly.map(m => estimateMonthlyPeakDemand(m)),
    ldc
  );
  const baselineGasBill = calculateAnnualGasBill(scaledBaseMonthly.map(m => m.gas_m3));
  const retrofitGasBill = calculateAnnualGasBill(scaledRetroMonthly.map(m => m.gas_m3));

  const costSavings = (baselineElecBill.annualTotal - retrofitElecBill.annualTotal) +
                      (baselineGasBill.annualTotal - retrofitGasBill.annualTotal);

  const demandChargeIncrease =
    retrofitElecBill.monthlyBills.reduce((s, b) => s + b.demandCharge, 0) -
    baselineElecBill.monthlyBills.reduce((s, b) => s + b.demandCharge, 0);

  // Physical deltas from surrogate results
  const elecSaved = surrogateBaselineResult.electricity.total_kWh - surrogateRetrofitResult.electricity.total_kWh;
  const gasSaved = surrogateBaselineResult.gas.total_m3 - surrogateRetrofitResult.gas.total_m3;
  const elecAdded = Math.max(0, surrogateRetrofitResult.electricity.heating_kWh - surrogateBaselineResult.electricity.heating_kWh);

  const ghgBaseline = surrogateBaselineResult.ghg_tCO2e;
  const ghgRetrofit = surrogateRetrofitResult.ghg_tCO2e;
  const ghgReduction = ghgBaseline - ghgRetrofit;
  const ghgPct = ghgBaseline > 0 ? ghgReduction / ghgBaseline : 0;

  return {
    postRetrofitEUI: surrogateRetrofitResult.totalEUI_ekWh_m2,
    annualElecSavingskWh: Math.round(Math.max(0, elecSaved)),
    annualGasSavingsM3: Math.round(Math.max(0, gasSaved)),
    annualElecAddedkWh: Math.round(elecAdded),
    netElecChangekWh: Math.round(elecSaved),
    netGasChangeM3: Math.round(gasSaved),
    ghgReductionTonnes: Math.round(Math.max(0, ghgReduction) * 10) / 10,
    ghgReductionPct: Math.round(Math.max(0, ghgPct) * 100),
    ghgReductionDecimal: Math.max(0, ghgPct),
    annualEnergyCostSavings: Math.round(costSavings),
    baselineAnnualElecCost: baselineElecBill.annualTotal,
    retrofitAnnualElecCost: retrofitElecBill.annualTotal,
    baselineAnnualGasCost: baselineGasBill.annualTotal,
    retrofitAnnualGasCost: retrofitGasBill.annualTotal,
    demandChargeIncrease: Math.round(demandChargeIncrease),
    baselineMonthly: scaledBaseMonthly,
    retrofitMonthly: scaledRetroMonthly,
    baselineResult: surrogateBaselineResult,
    retrofitResult: surrogateRetrofitResult,
  };
}

function estimatePhysicsImpactCore(
  baselineParams: BuildingPhysicsParams,
  baselineResult: PhysicsResult,
  measureIds: string[],
  building: Partial<BuildingData>
): MeasureImpact {
  const city = building.city || 'waterloo';
  const ldc = detectCityData(building.address || city).ldc
    .toLowerCase().replace(/\s+/g, '_');

  // Get physics deltas and re-run
  const deltas = measureIds.map(id => getMeasureDelta(id, baselineParams));
  const retrofitParams = applyMeasureDeltas(baselineParams, deltas);
  const retrofitResult = calculateBuildingEnergy(retrofitParams);

  // ── Monthly profiles for rate-engine costing ──
  const monthlyClimate = getMonthlyClimate(city);
  const baselineMonthly = calculateMonthlyEnergy(baselineParams, monthlyClimate);
  const retrofitMonthly = calculateMonthlyEnergy(retrofitParams, monthlyClimate);

  // ── Rate-engine annual bills ──
  const baselineElecBill = calculateAnnualElecBill(
    baselineMonthly.map(m => m.electricity_kWh),
    baselineMonthly.map(m => estimateMonthlyPeakDemand(m)),
    ldc
  );
  const retrofitElecBill = calculateAnnualElecBill(
    retrofitMonthly.map(m => m.electricity_kWh),
    retrofitMonthly.map(m => estimateMonthlyPeakDemand(m)),
    ldc
  );
  const baselineGasBill = calculateAnnualGasBill(
    baselineMonthly.map(m => m.gas_m3)
  );
  const retrofitGasBill = calculateAnnualGasBill(
    retrofitMonthly.map(m => m.gas_m3)
  );

  // ── Cost savings using ACTUAL rate structure ──
  const elecCostChange = baselineElecBill.annualTotal - retrofitElecBill.annualTotal;
  const gasCostChange = baselineGasBill.annualTotal - retrofitGasBill.annualTotal;
  const costSavings = elecCostChange + gasCostChange;

  const demandChargeIncrease =
    retrofitElecBill.monthlyBills.reduce((s, b) => s + b.demandCharge, 0) -
    baselineElecBill.monthlyBills.reduce((s, b) => s + b.demandCharge, 0);

  // Compute physical deltas (still needed for incentives which use kWh/m³)
  const elecSaved = baselineResult.electricity.total_kWh - retrofitResult.electricity.total_kWh;
  const gasSaved = baselineResult.gas.total_m3 - retrofitResult.gas.total_m3;
  const elecAdded = Math.max(0, retrofitResult.electricity.heating_kWh - baselineResult.electricity.heating_kWh);

  const ghgBaseline = baselineResult.ghg_tCO2e;
  const ghgRetrofit = retrofitResult.ghg_tCO2e;
  const ghgReduction = ghgBaseline - ghgRetrofit;
  const ghgPct = ghgBaseline > 0 ? ghgReduction / ghgBaseline : 0;

  return {
    postRetrofitEUI: retrofitResult.totalEUI_ekWh_m2,
    annualElecSavingskWh: Math.round(Math.max(0, elecSaved)),
    annualGasSavingsM3: Math.round(Math.max(0, gasSaved)),
    annualElecAddedkWh: Math.round(elecAdded),
    netElecChangekWh: Math.round(elecSaved),
    netGasChangeM3: Math.round(gasSaved),
    ghgReductionTonnes: Math.round(Math.max(0, ghgReduction) * 10) / 10,
    ghgReductionPct: Math.round(Math.max(0, ghgPct) * 100),
    ghgReductionDecimal: Math.max(0, ghgPct),
    annualEnergyCostSavings: Math.round(costSavings),
    baselineAnnualElecCost: baselineElecBill.annualTotal,
    retrofitAnnualElecCost: retrofitElecBill.annualTotal,
    baselineAnnualGasCost: baselineGasBill.annualTotal,
    retrofitAnnualGasCost: retrofitGasBill.annualTotal,
    demandChargeIncrease: Math.round(demandChargeIncrease),
    baselineMonthly,
    retrofitMonthly,
    baselineResult,
    retrofitResult,
  };
}

/** Estimate peak electrical demand for a month (for demand charges) */
function estimateMonthlyPeakDemand(monthlyEnergy: MonthlyEnergyResult): number {
  const daysInMonth = DAYS_PER_MONTH[monthlyEnergy.month - 1];
  const workDays = daysInMonth * 5 / 7;

  const heatingPeakHours = workDays * 4;
  const coolingPeakHours = workDays * 6;
  const baseloadHours = daysInMonth * 24;

  const heatingPeak_kW = heatingPeakHours > 0
    ? monthlyEnergy.heatingElec_kWh / heatingPeakHours * 2.5
    : 0;
  const coolingPeak_kW = coolingPeakHours > 0
    ? monthlyEnergy.coolingElec_kWh / coolingPeakHours * 2.0
    : 0;
  const lightingPeak_kW = workDays > 0 ? monthlyEnergy.lighting_kWh / (workDays * 10) * 1.1 : 0;
  const equipmentPeak_kW = workDays > 0 ? monthlyEnergy.equipment_kWh / (workDays * 10) * 1.1 : 0;
  const basePeak_kW = baseloadHours > 0 ? monthlyEnergy.baseload_kWh / baseloadHours : 0;

  // Peak = coincident demand (heating and cooling don't coincide)
  const hvacPeak = Math.max(heatingPeak_kW, coolingPeak_kW);
  return Math.round(hvacPeak + lightingPeak_kW + equipmentPeak_kW + basePeak_kW);
}

// ─── Auto-detect city data from address ─────────────────────────────────────

export function detectCityData(address: string): {
  city: string;
  climateZone: string;
  hdd: number;
  cdd: number;
  ldc: string;
} {
  const lower = address.toLowerCase();
  for (const [city, data] of Object.entries(CLIMATE_DATA)) {
    if (lower.includes(city)) {
      return {
        city: city.charAt(0).toUpperCase() + city.slice(1),
        climateZone: data.zone,
        hdd: data.hdd,
        cdd: data.cdd,
        ldc: LDC_MAP[city] || 'Unknown LDC',
      };
    }
  }
  return {
    city: 'Unknown',
    climateZone: '6A',
    hdd: 4000,
    cdd: 300,
    ldc: 'Hydro One (default)',
  };
}

export function getArchetypeLabel(archetype: BuildingArchetype): string {
  return ARCHETYPE_BENCHMARKS[archetype]?.label || 'Commercial Building';
}
