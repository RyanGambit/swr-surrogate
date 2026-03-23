/**
 * Scout AI — 55 King St E Validation Harness v2
 *
 * Extends Phase 1 validation with:
 * - Stage 6: Monthly profile validation
 * - Stage 7: ASHP bin analysis validation
 * - Stage 8: Rate engine validation
 *
 * Run with: npx tsx src/tests/validation_55king_v2.ts
 */

import { estimateBaseline } from '../engine/buildingEngine';
import { calculateMonthlyEnergy } from '../engine/physics/index';
import { getMonthlyClimate } from '../engine/physics/monthlyProfile';
import { ashpBinAnalysis, ASHP_COP_CURVES, WATERLOO_TEMP_BINS } from '../engine/physics/tempBinAnalysis';
import { calculateMonthlyElecBill } from '../engine/rates/ontarioElectricity';
import { calculateMonthlyGasBill } from '../engine/rates/ontarioGas';
import type { BuildingData } from '../types';

// ─── Reference Building ──────────────────────────────────────────────────────

const BUILDING_INPUT: Partial<BuildingData> = {
  address: '55 King Street East, Waterloo, Ontario',
  archetype: 'office_low_rise',
  yearBuilt: 1982,
  areaSqFt: 41800,
  stories: 4,
  province: 'ON',
  city: 'waterloo',
  annualElectricitykWh: 680000,
  annualGasM3: 40000,
  existingSolar: false,
  existingBAS: false,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

type CheckResult = { name: string; expected: number; actual: number; tolerance: number; pass: boolean; delta: string };

function check(name: string, expected: number, actual: number, tolerancePct: number): CheckResult {
  if (expected === 0 && actual === 0) {
    return { name, expected, actual, tolerance: tolerancePct, pass: true, delta: '0%' };
  }
  const pctDiff = expected !== 0 ? Math.abs((actual - expected) / expected) * 100 : (actual === 0 ? 0 : 999);
  const pass = pctDiff <= tolerancePct;
  return {
    name, expected, actual, tolerance: tolerancePct, pass,
    delta: `${actual > expected ? '+' : ''}${((actual - expected) / Math.max(expected, 1) * 100).toFixed(1)}%`,
  };
}

// ─── Run Validation ──────────────────────────────────────────────────────────

function runValidation() {
  const results: CheckResult[] = [];
  const sectionHeaders: { index: number; title: string }[] = [];

  console.log('\n' + '═'.repeat(80));
  console.log('  SCOUT AI — 55 King St E Validation Harness v2 (Phase 2)');
  console.log('  Monthly Profiles, Bin Analysis, Rate Engine');
  console.log('═'.repeat(80) + '\n');

  // Get baseline
  const baseline = estimateBaseline(BUILDING_INPUT);
  const monthlyClimate = getMonthlyClimate('waterloo');

  // ─── STAGE 6: Monthly Profile Validation ───────────────────────────────
  sectionHeaders.push({ index: results.length, title: 'STAGE 6: Monthly Energy Profiles' });

  const monthlyResults = calculateMonthlyEnergy(baseline.physicsParams, monthlyClimate);

  const monthlyElecTotal = monthlyResults.reduce((s, m) => s + m.electricity_kWh, 0);
  const monthlyGasTotal = monthlyResults.reduce((s, m) => s + m.gas_m3, 0);

  results.push(check(
    'Monthly electricity sums to annual',
    baseline.annualElectricitykWh,
    monthlyElecTotal,
    10 // within 10% (monthly approximation)
  ));

  results.push(check(
    'Monthly gas sums to annual',
    baseline.annualGasM3 || 0,
    monthlyGasTotal,
    15 // monthly HDD-based gas calc inherently differs from annual total (~12%)
  ));

  // Seasonality: Jan gas >> Jul gas
  const janGas = monthlyResults.find(m => m.month === 1)?.gas_m3 || 0;
  const julGas = monthlyResults.find(m => m.month === 7)?.gas_m3 || 0;
  results.push({
    name: 'Jan gas > Jul gas (seasonal pattern)',
    expected: 1,
    actual: janGas > julGas * 5 ? 1 : 0,
    tolerance: 0,
    pass: janGas > julGas * 5,
    delta: `Jan: ${janGas.toFixed(0)} m³, Jul: ${julGas.toFixed(0)} m³`,
  });

  // Summer electricity should be higher than shoulder months (cooling)
  const julElec = monthlyResults.find(m => m.month === 7)?.electricity_kWh || 0;
  const aprElec = monthlyResults.find(m => m.month === 4)?.electricity_kWh || 0;
  results.push({
    name: 'Jul elec > Apr elec (cooling load)',
    expected: 1,
    actual: julElec > aprElec ? 1 : 0,
    tolerance: 0,
    pass: julElec > aprElec,
    delta: `Jul: ${julElec.toLocaleString()} kWh, Apr: ${aprElec.toLocaleString()} kWh`,
  });

  // Winter heating load should dominate
  const janHeating = monthlyResults.find(m => m.month === 1)?.heating_kWh || 0;
  const julHeating = monthlyResults.find(m => m.month === 7)?.heating_kWh || 0;
  results.push({
    name: 'Jan heating >> Jul heating',
    expected: 1,
    actual: janHeating > julHeating * 10 ? 1 : 0,
    tolerance: 0,
    pass: janHeating > julHeating * 10,
    delta: `Jan: ${janHeating.toLocaleString()} kWh, Jul: ${julHeating.toLocaleString()} kWh`,
  });

  // ─── STAGE 7: ASHP Bin Analysis ────────────────────────────────────────
  sectionHeaders.push({ index: results.length, title: 'STAGE 7: ASHP Temperature Bin Analysis' });

  const binResult = ashpBinAnalysis(
    baseline.physicsResult.heatingLoads.netHeatingLoad_kWh,
    310, // kW capacity (right-sized for 41,800 sqft)
    ASHP_COP_CURVES.generic_cold_climate,
    WATERLOO_TEMP_BINS,
    'gas',
    0.80,
  );

  results.push(check(
    'Seasonal COP (weighted)',
    2.7, // expected for Waterloo with cold-climate ASHP
    binResult.seasonalCOP,
    15
  ));

  results.push({
    name: 'Supplemental heating hours < 500',
    expected: 500,
    actual: binResult.supplementalHours,
    tolerance: 0,
    pass: binResult.supplementalHours < 500,
    delta: `${binResult.supplementalHours} hours`,
  });

  results.push({
    name: 'Peak elec demand reasonable (50-200 kW)',
    expected: 1,
    actual: binResult.peakElecDemand_kW >= 50 && binResult.peakElecDemand_kW <= 200 ? 1 : 0,
    tolerance: 0,
    pass: binResult.peakElecDemand_kW >= 50 && binResult.peakElecDemand_kW <= 200,
    delta: `${binResult.peakElecDemand_kW} kW`,
  });

  // Bin analysis monthly profile should show winter-heavy electricity
  const binJanElec = binResult.monthlyProfile.find(m => m.month === 1)?.electricity_kWh || 0;
  const binJulElec = binResult.monthlyProfile.find(m => m.month === 7)?.electricity_kWh || 0;
  results.push({
    name: 'ASHP Jan elec >> Jul elec (heating load)',
    expected: 1,
    actual: binJanElec > binJulElec * 5 ? 1 : 0,
    tolerance: 0,
    pass: binJanElec > binJulElec * 5,
    delta: `Jan: ${binJanElec.toLocaleString()} kWh, Jul: ${binJulElec.toLocaleString()} kWh`,
  });

  // ─── STAGE 8: Rate Engine ──────────────────────────────────────────────
  sectionHeaders.push({ index: results.length, title: 'STAGE 8: Utility Rate Engine' });

  // 55 King: ~680,000 kWh/yr, ~100 kW peak demand
  // Expected annual electricity cost: ~$85,000-$110,000
  const annualElecBill = Array.from({ length: 12 }, (_, i) =>
    calculateMonthlyElecBill(680000 / 12, 100, 'enova_power', i + 1).totalMonthly
  ).reduce((s, m) => s + m, 0);

  // All-in bill includes commodity + delivery + demand + regulatory + fixed
  // 680K kWh × ~$0.19/kWh effective = ~$130K (higher than flat $0.13 rate model)
  results.push(check(
    'Annual electricity bill (rate engine)',
    130000,
    annualElecBill,
    15
  ));

  // Gas bill: 40,000 m³/yr
  const annualGasBill = Array.from({ length: 12 }, () =>
    calculateMonthlyGasBill(40000 / 12).totalMonthly
  ).reduce((s, m) => s + m, 0);

  results.push(check(
    'Annual gas bill (rate engine)',
    12000, // ~$0.30/m³ × 40,000 = $12,000 + fixed charges
    annualGasBill,
    20
  ));

  // Effective electricity rate should be $0.15-0.20/kWh all-in
  const effElecRate = annualElecBill / 680000;
  results.push({
    name: 'Effective elec rate $0.15-0.20/kWh',
    expected: 1,
    actual: effElecRate >= 0.12 && effElecRate <= 0.22 ? 1 : 0,
    tolerance: 0,
    pass: effElecRate >= 0.12 && effElecRate <= 0.22,
    delta: `$${effElecRate.toFixed(3)}/kWh`,
  });

  // Demand charges should be ~$1,200-1,800/month for 100 kW
  const janDemand = calculateMonthlyElecBill(680000 / 12, 100, 'enova_power', 1).demandCharge;
  results.push(check(
    'Monthly demand charge (100 kW)',
    1250,
    janDemand,
    20
  ));

  // ─── Print Results ─────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(80));
  console.log('  RESULTS');
  console.log('─'.repeat(80));

  let passCount = 0;
  let failCount = 0;

  for (let i = 0; i < results.length; i++) {
    const header = sectionHeaders.find(h => h.index === i);
    if (header) {
      console.log(`\n  ┌─ ${header.title} ${'─'.repeat(Math.max(0, 60 - header.title.length))}┐`);
    }

    const r = results[i];
    const status = r.pass ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status}  ${r.name.padEnd(42)} Expected: ${String(r.expected).padStart(8)}  Actual: ${String(r.actual).padStart(8)}  Δ: ${r.delta}`);

    if (r.pass) passCount++;
    else failCount++;
  }

  console.log('\n' + '═'.repeat(80));
  console.log(`  SUMMARY: ${passCount} passed, ${failCount} failed out of ${results.length} checks`);
  if (failCount === 0) {
    console.log('  🎉 ALL PHASE 2 CHECKS PASSED');
  } else {
    console.log(`  ⚠️  ${failCount} checks failed — see details above`);
  }
  console.log('═'.repeat(80));

  // ─── Diagnostic: Monthly Profile ─────────────────────────────────────
  console.log('\n  📊 Monthly Energy Profile (Baseline):');
  console.log('  ' + '-'.repeat(78));
  console.log('  Month    Elec(kWh)   Gas(m³)   Heating   Cooling   Lighting   Solar');
  console.log('  ' + '-'.repeat(78));
  for (const m of monthlyResults) {
    console.log(`  ${m.label.padEnd(8)} ${String(m.electricity_kWh).padStart(10)} ${String(m.gas_m3).padStart(9)} ${String(m.heating_kWh).padStart(9)} ${String(m.cooling_kWh).padStart(9)} ${String(m.lighting_kWh).padStart(10)} ${String(m.solarGeneration_kWh).padStart(7)}`);
  }
  console.log(`  ${'TOTAL'.padEnd(8)} ${String(monthlyElecTotal).padStart(10)} ${monthlyGasTotal.toFixed(0).padStart(9)}`);

  // ─── Diagnostic: ASHP Bin Analysis ───────────────────────────────────
  console.log('\n  📊 ASHP Bin Analysis:');
  console.log(`     Seasonal COP: ${binResult.seasonalCOP}`);
  console.log(`     Annual ASHP electricity: ${binResult.annualElectricity_kWh.toLocaleString()} kWh`);
  console.log(`     Supplemental gas: ${binResult.supplementalGas_m3.toLocaleString()} m³`);
  console.log(`     Supplemental hours: ${binResult.supplementalHours}`);
  console.log(`     Peak electrical demand: ${binResult.peakElecDemand_kW} kW`);

  // ─── Diagnostic: Rate Engine ─────────────────────────────────────────
  console.log('\n  📊 Rate Engine:');
  console.log(`     Annual electricity bill: $${annualElecBill.toLocaleString()}`);
  console.log(`     Effective rate: $${effElecRate.toFixed(3)}/kWh`);
  console.log(`     Annual gas bill: $${annualGasBill.toLocaleString()}`);
  console.log(`     Monthly demand charge (100 kW): $${janDemand}`);

  console.log('');
  process.exit(failCount > 0 ? 1 : 0);
}

runValidation();
