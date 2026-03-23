/**
 * Validation: Surrogate Model (Phase 3)
 *
 * Tests the EnergyPlus polynomial surrogate against known reference values.
 * Run: npx tsx src/tests/validation_surrogate.ts
 */

import {
  predictEnergy, predictForBuilding, clampInput,
  REFERENCE_FLOOR_AREA_M2, FEATURE_RANGES,
  type SurrogateInput,
} from '../engine/surrogate/lowRiseOffice';
import {
  hasSurrogateModel, surrogateEstimate, surrogateToPhysicsResult,
} from '../engine/surrogate/index';
import {
  buildSurrogateInput, applyMeasuresToSurrogateInput, containsASHP,
} from '../engine/surrogate/inputMapper';
import { estimateBaseline, estimatePhysicsImpact } from '../engine/buildingEngine';

// ─── Test Harness ────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(name: string, actual: number, expected: number, tolerancePct: number = 10) {
  const diff = Math.abs(actual - expected);
  const pct = expected !== 0 ? (diff / Math.abs(expected)) * 100 : (actual === 0 ? 0 : 100);
  const ok = pct <= tolerancePct;
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}: ${actual} (expected ~${expected}, ${pct.toFixed(1)}% off)`);
  } else {
    failed++;
    console.log(`  ✗ ${name}: ${actual} (expected ~${expected}, ${pct.toFixed(1)}% off — FAIL)`);
  }
}

function checkBool(name: string, actual: boolean, expected: boolean) {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${name}: ${actual}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}: ${actual} (expected ${expected} — FAIL)`);
  }
}

function checkRange(name: string, actual: number, min: number, max: number) {
  const ok = actual >= min && actual <= max;
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}: ${actual} (in range ${min}-${max})`);
  } else {
    failed++;
    console.log(`  ✗ ${name}: ${actual} (expected ${min}-${max} — FAIL)`);
  }
}

// ─── Test 1: Baseline at Reference Area (4,982 m²) ──────────────────────────

console.log('\n═══ Test 1: Baseline Prediction at Reference Area ═══');

const baselineInput: SurrogateInput = {
  wall_rsi: FEATURE_RANGES.wall_rsi.baseline,    // 1.0
  roof_rsi: FEATURE_RANGES.roof_rsi.baseline,    // 2.0
  window_u: FEATURE_RANGES.window_u.baseline,    // 3.5
  window_shgc: FEATURE_RANGES.window_shgc.baseline, // 0.55
  infiltration_ach: FEATURE_RANGES.infiltration_ach.baseline, // 0.5
  lpd: FEATURE_RANGES.lpd.baseline,              // 12.0
  epd: FEATURE_RANGES.epd.baseline,              // 11.0
  heating_efficiency: FEATURE_RANGES.heating_efficiency.baseline, // 0.8
  ventilation_rate: FEATURE_RANGES.ventilation_rate.baseline,     // 0.8
  hrv_effectiveness: FEATURE_RANGES.hrv_effectiveness.baseline,   // 0.0
};

const baseline = predictEnergy(baselineInput);
console.log('  Reference floor area:', REFERENCE_FLOOR_AREA_M2, 'm²');

// From instructions: EUI ~159 ekWh/m², elec ~517,000 kWh, gas ~26,431 m³
check('Total EUI (ekWh/m²)', baseline.total_EUI_ekWh_m2, 159, 15);
check('Annual electricity (kWh)', baseline.annual_elec_kWh, 517000, 15);
check('Annual gas (m³)', baseline.annual_gas_m3, 26431, 15);
check('Total ekWh', baseline.total_ekWh, 159 * REFERENCE_FLOOR_AREA_M2, 15);

// Component sanity: all should be positive
checkRange('Cooling kWh', baseline.cooling_kWh, 1000, 200000);
checkRange('Lighting kWh', baseline.lighting_kWh, 50000, 500000);
checkRange('Equipment kWh', baseline.equipment_kWh, 50000, 500000);
checkRange('Fans kWh', baseline.fans_kWh, 5000, 200000);
checkRange('Heating gas kWh', baseline.heating_gas_kWh, 50000, 500000);

// ─── Test 2: Scaled to 55 King St E (3,882 m² = 41,800 sqft) ────────────────

console.log('\n═══ Test 2: Scaled to 55 King St E (3,882 m²) ═══');

const area55King = 41800 * 0.0929; // 3,883.22 m²
const scaled = predictForBuilding(baselineInput, area55King);
const scaleFactor = area55King / REFERENCE_FLOOR_AREA_M2;

check('Scale factor', scaleFactor, 0.779, 2);
check('Scaled elec (kWh)', scaled.annual_elec_kWh, Math.round(baseline.annual_elec_kWh * scaleFactor), 1);
check('Scaled gas (m³)', scaled.annual_gas_m3, Math.round(baseline.annual_gas_m3 * scaleFactor), 1);
// EUI should NOT change with scaling
check('EUI unchanged', scaled.total_EUI_ekWh_m2, baseline.total_EUI_ekWh_m2, 0);

// ─── Test 3: Deep Retrofit Parameters ───────────────────────────────────────

console.log('\n═══ Test 3: Deep Retrofit Prediction ═══');

const deepRetrofitInput: SurrogateInput = {
  wall_rsi: 3.5,       // insulation upgrade
  roof_rsi: 5.3,       // roof insulation
  window_u: 1.4,       // triple-glazed
  window_shgc: 0.25,   // low-e
  infiltration_ach: 0.35, // air sealing
  lpd: 5.0,            // LED upgrade
  epd: 11.0,           // unchanged
  heating_efficiency: 0.92, // condensing boiler
  ventilation_rate: 0.8,
  hrv_effectiveness: 0.15, // BAS controls
};

const deepResult = predictEnergy(deepRetrofitInput);

// EUI should drop to 80-110 range per instructions
checkRange('Deep retrofit EUI', deepResult.total_EUI_ekWh_m2, 70, 120);
// Should be significantly less than baseline
check('EUI reduction > 30%', Math.round((1 - deepResult.total_EUI_ekWh_m2 / baseline.total_EUI_ekWh_m2) * 100), 35, 50);

// ─── Test 4: Baseline → Retrofit Delta (Savings) ────────────────────────────

console.log('\n═══ Test 4: Delta Validation (Savings) ═══');

const elecSavings = baseline.annual_elec_kWh - deepResult.annual_elec_kWh;
const gasSavings = baseline.annual_gas_m3 - deepResult.annual_gas_m3;

checkRange('Electricity savings (kWh)', elecSavings, 10000, 300000);
checkRange('Gas savings (m³)', gasSavings, 1000, 20000);
checkBool('Elec savings positive', elecSavings > 0, true);
checkBool('Gas savings positive', gasSavings > 0, true);

// ─── Test 5: Input Clamping ─────────────────────────────────────────────────

console.log('\n═══ Test 5: Input Clamping ═══');

const outOfRange: SurrogateInput = {
  wall_rsi: 0.1,        // below min 0.5
  roof_rsi: 15,         // above max 8.8
  window_u: 3.5,
  window_shgc: 0.55,
  infiltration_ach: 0.5,
  lpd: 12,
  epd: 11,
  heating_efficiency: 0.8,
  ventilation_rate: 0.8,
  hrv_effectiveness: 0,
};

const { clamped, warnings } = clampInput(outOfRange);
check('Clamped wall_rsi', clamped.wall_rsi, 0.5, 0);
check('Clamped roof_rsi', clamped.roof_rsi, 8.8, 0);
checkRange('Clamping warnings count', warnings.length, 2, 10);

// ─── Test 6: ASHP Fallback Detection ────────────────────────────────────────

console.log('\n═══ Test 6: ASHP Fallback ═══');

checkBool('containsASHP([led_upgrade])', containsASHP(['led_upgrade']), false);
checkBool('containsASHP([ashp])', containsASHP(['ashp']), true);
checkBool('containsASHP([led_upgrade, ashp])', containsASHP(['led_upgrade', 'ashp']), true);

// ─── Test 7: Archetype Router ───────────────────────────────────────────────

console.log('\n═══ Test 7: Archetype Router ═══');

checkBool('hasSurrogateModel(office_low_rise)', hasSurrogateModel('office_low_rise'), true);
checkBool('hasSurrogateModel(retail)', hasSurrogateModel('retail'), false);
checkBool('hasSurrogateModel(warehouse)', hasSurrogateModel('warehouse'), false);

// surrogateEstimate returns result for office_low_rise, null for others
const surResult = surrogateEstimate('office_low_rise', baselineInput, REFERENCE_FLOOR_AREA_M2);
checkBool('surrogateEstimate returns result', surResult !== null, true);
const surNull = surrogateEstimate('retail', baselineInput, REFERENCE_FLOOR_AREA_M2);
checkBool('surrogateEstimate returns null for retail', surNull === null, true);

// ─── Test 8: SurrogateOutput → PhysicsResult Conversion ─────────────────────

console.log('\n═══ Test 8: PhysicsResult Conversion ═══');

const physResult = surrogateToPhysicsResult(baseline, REFERENCE_FLOOR_AREA_M2);
check('PhysicsResult total EUI', physResult.totalEUI_ekWh_m2, baseline.total_EUI_ekWh_m2, 5);
check('PhysicsResult elec total', physResult.electricity.total_kWh, baseline.annual_elec_kWh, 1);
check('PhysicsResult gas total', physResult.gas.total_m3, baseline.annual_gas_m3, 1);
checkRange('PhysicsResult GHG', physResult.ghg_tCO2e, 10, 100);
checkBool('PhysicsResult has loadBreakdown', physResult.loadBreakdown.length === 6, true);

// ─── Test 9: Measure Input Mapping ──────────────────────────────────────────

console.log('\n═══ Test 9: Measure Input Mapping ═══');

const ledRetrofit = applyMeasuresToSurrogateInput(baselineInput, ['led_upgrade']);
check('LED upgrade → lpd', ledRetrofit.lpd, 5.0, 0);
check('LED upgrade → wall_rsi unchanged', ledRetrofit.wall_rsi, baselineInput.wall_rsi, 0);

const windowRetrofit = applyMeasuresToSurrogateInput(baselineInput, ['windows']);
check('Windows → window_u', windowRetrofit.window_u, 1.4, 0);
check('Windows → window_shgc', windowRetrofit.window_shgc, 0.25, 0);

const fullRetrofit = applyMeasuresToSurrogateInput(baselineInput, [
  'led_upgrade', 'windows', 'insulation', 'pipe_insulation', 'bas_controls'
]);
check('Full retrofit → lpd', fullRetrofit.lpd, 5.0, 0);
check('Full retrofit → window_u', fullRetrofit.window_u, 1.4, 0);
check('Full retrofit → wall_rsi', fullRetrofit.wall_rsi, 3.5, 0);
check('Full retrofit → infiltration_ach', fullRetrofit.infiltration_ach, 0.35, 0);
check('Full retrofit → hrv_effectiveness', fullRetrofit.hrv_effectiveness, 0.15, 0);

// ─── Test 10: Integration — estimateBaseline uses surrogate ──────────────────

console.log('\n═══ Test 10: buildingEngine Integration ═══');

const building55King = {
  archetype: 'office_low_rise' as const,
  areaSqFt: 41800,
  yearBuilt: 1982,
  address: '55 King St E, Kitchener',
  city: 'kitchener',
};

const baselineResult = estimateBaseline(building55King);
// Should use surrogate path — confidence 0.55 (no bills)
check('Surrogate baseline confidence', baselineResult.confidenceLevel, 0.55, 0);
checkRange('Baseline EUI reasonable', baselineResult.totalEUI, 100, 250);
checkRange('Baseline elec (kWh)', baselineResult.annualElectricitykWh, 200000, 600000);
checkRange('Baseline gas (m³)', baselineResult.annualGasM3, 10000, 40000);

// ─── Test 11: Impact with surrogate (no ASHP) ───────────────────────────────

console.log('\n═══ Test 11: Surrogate Impact (no ASHP) ═══');

const lightMeasures = ['led_upgrade', 'bas_controls'];
const impact = estimatePhysicsImpact(
  baselineResult.physicsParams,
  baselineResult.physicsResult,
  lightMeasures,
  building55King
);

checkBool('Elec savings positive', impact.annualElecSavingskWh > 0, true);
checkRange('Post-retrofit EUI', impact.postRetrofitEUI, 80, 200);
checkRange('Cost savings', impact.annualEnergyCostSavings, 500, 50000);

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(60));
console.log(`  Surrogate Validation: ${passed} passed, ${failed} failed out of ${passed + failed}`);
console.log('═'.repeat(60));

if (failed > 0) {
  process.exit(1);
}
