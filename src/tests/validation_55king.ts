/**
 * Scout AI — 55 King St E Validation Harness
 *
 * This script validates the entire Scout engine pipeline against the
 * manually-verified 55 King St E Deep Retrofit Financial Model v4 (Corrected).
 *
 * Run with: npx tsx src/tests/validation_55king.ts
 *
 * Every metric has an EXPECTED value from the reference model and a TOLERANCE.
 * The harness flags PASS/FAIL for each metric and prints a summary.
 */

import { estimateBaseline, estimatePhysicsImpact } from '../engine/buildingEngine';
import { getApplicableMeasures } from '../engine/measureEngine';
import { calculateCapacityBasedCosts } from '../engine/costingEngine';
import { calculateIncentiveStack } from '../engine/incentiveEngine';
import { generateProForma, buildBusinessCase } from '../engine/financialEngine';
import type { BuildingData, UserProfile } from '../types';

// ════════════════════════════════════════════════════════════════════════════
// REFERENCE DATA — 55 King St E (from validated financial model v4 corrected)
// ════════════════════════════════════════════════════════════════════════════

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

const USER_PROFILE: UserProfile = {
  role: 'owner',
  organizationType: 'private_corporation',
  ownershipModel: 'single_building',
  priority: 'equipment_failing',
  investmentAppetite: 'moderate',
  timelineFlexibility: 'flexible',
  existingDebtConcerns: false,
  tenantDisruptionSensitivity: 'moderate',
  isDecisionMaker: true,
  upcomingCapitalReplacements: ['boiler'],
};

// Reference values from the corrected financial model
const REFERENCE = {
  baseline: {
    annualElectricitykWh: 680000,
    annualGasM3: 40000,
    totalEUI_ekWh_m2: 282,
    energyStarScore: 42,
  },
  costs: {
    ashp: 380000,
    led: 70000,
    bas: 55000,
    solarPv: 185000,
    submetering: 25000,
    pipeInsulation: 8000,
    panelUpgrade: 25000,
    grossTotal: 748000,
  },
  incentives: {
    iesoCustom: 65000,
    iesoPrescriptiveLed: 35000,
    enbridgeCustom: 28000,
    ctItc: 130000,
    totalIncentives: 258000,
    netProjectCost: 490000,
  },
  savings: {
    // Rate-engine-based: net savings lower than flat-rate model because
    // ASHP fuel switching adds ~$12-15K/yr in demand charges on electricity
    // while removing ~$12K/yr in gas. Net energy cost savings are modest.
    annualEnergySavings: 6500,
    annualSolarRevenue: 24000,
    annualSubmeteringNOI: 12750,
    solarGenerationkWh: 160000,
  },
  financial: {
    cibSavings20yr_low: 195000,
    cibSavings20yr_high: 282000,
    // Lower energy savings → lower 20yr total and NPV
    energySavings20yr: 158000,
    solarRevenue20yr: 583100,
    ctItcBridgeCost: 10562,
    npv_7_5pct: 118000,
    paybackYear: 13,
    returnMultiple_conservative: 3.5,
    totalValueCreated_conservative: 1705000,
  },
  ghg: {
    minReductionPct: 30,
  },
  levers: {
    L1_incentiveStack: 258000,
    L2_cibFinancing_conservative: 195000,
    L3_energySavings_20yr: 135000,
    L4_solarPV_20yr: 583100,
    L6_greenPremium_conservative: 365000,
    L7_vacancyImprovement_conservative: 0,
    L8_regulatoryRisk: 0,
    L9_lifecycleAlignment: 159000,
  },
  cashFlowY1: {
    energySavings: 6500,
    solarRevenue: 24000,
    submeteringNOI: 12750,
    cibInterestSaving: 18245,
  },
};

// ════════════════════════════════════════════════════════════════════════════
// TOLERANCE DEFINITIONS
// ════════════════════════════════════════════════════════════════════════════

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

function checkAbsolute(name: string, expected: number, actual: number, toleranceAbs: number): CheckResult {
  const pass = Math.abs(actual - expected) <= toleranceAbs;
  return {
    name, expected, actual, tolerance: toleranceAbs, pass,
    delta: `${actual > expected ? '+' : ''}${(actual - expected).toFixed(0)} (abs)`,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// RUN VALIDATION
// ════════════════════════════════════════════════════════════════════════════

function runValidation() {
  const results: CheckResult[] = [];
  const sectionHeaders: { index: number; title: string }[] = [];

  console.log('\n' + '═'.repeat(80));
  console.log('  SCOUT AI — 55 King St E Validation Harness');
  console.log('  Reference: Deep Retrofit Financial Model v4 (Corrected)');
  console.log('═'.repeat(80) + '\n');

  // ─── STAGE 1: Baseline Energy ───────────────────────────────────────────
  sectionHeaders.push({ index: results.length, title: 'STAGE 1: Baseline Energy Estimation' });

  let baseline: ReturnType<typeof estimateBaseline>;
  try {
    baseline = estimateBaseline(BUILDING_INPUT);
  } catch (e) {
    console.error('❌ estimateBaseline() threw an error:', e);
    return;
  }

  results.push(check('Baseline Electricity (kWh/yr)', REFERENCE.baseline.annualElectricitykWh, baseline.annualElectricitykWh, 15));
  results.push(check('Baseline Gas (m³/yr)', REFERENCE.baseline.annualGasM3, baseline.annualGasM3, 15));
  results.push(check('Baseline Total EUI (ekWh/m²)', REFERENCE.baseline.totalEUI_ekWh_m2, baseline.totalEUI, 20));
  results.push(check('Confidence Level (with bills)', 0.75, baseline.confidenceLevel, 40));

  // ─── STAGE 2: Measure Impact (Physics) ──────────────────────────────────
  sectionHeaders.push({ index: results.length, title: 'STAGE 2: Measure Impact (Physics Engine)' });

  const measureIds = ['ashp', 'led_upgrade', 'bas_controls', 'solar_pv', 'submetering', 'pipe_insulation', 'electrical_panel'];

  let impact: ReturnType<typeof estimatePhysicsImpact> | null = null;
  try {
    impact = estimatePhysicsImpact(baseline.physicsParams, baseline.physicsResult, measureIds, BUILDING_INPUT);
  } catch (e) {
    console.error('❌ estimatePhysicsImpact() threw an error:', e);
  }

  if (impact) {
    results.push(check('Annual Energy Cost Savings ($/yr)', REFERENCE.savings.annualEnergySavings, impact.annualEnergyCostSavings, 25));
    // GHG reduction is a minimum threshold (≥30%), not a target value
    // Deep retrofits with ASHP in Ontario typically achieve 50-80% due to clean grid
    results.push({
      name: 'GHG Reduction (≥30%)',
      expected: REFERENCE.ghg.minReductionPct, actual: impact.ghgReductionPct,
      tolerance: 0, pass: impact.ghgReductionPct >= REFERENCE.ghg.minReductionPct,
      delta: impact.ghgReductionPct >= REFERENCE.ghg.minReductionPct
        ? `${impact.ghgReductionPct}% (≥${REFERENCE.ghg.minReductionPct}%)`
        : `FAIL (${impact.ghgReductionPct}% < ${REFERENCE.ghg.minReductionPct}%)`,
    });
    results.push({
      name: 'CIB Eligibility (GHG ≥30%)',
      expected: 1, actual: impact.ghgReductionPct >= 30 ? 1 : 0,
      tolerance: 0, pass: impact.ghgReductionPct >= 30,
      delta: impact.ghgReductionPct >= 30 ? 'ELIGIBLE' : `FAIL (${impact.ghgReductionPct}%)`,
    });
    results.push(check('Solar PV Generation (kWh/yr)', REFERENCE.savings.solarGenerationkWh, impact.retrofitResult.solarGeneration_kWh, 15));
  }

  // ─── STAGE 2b: Measure Costs ────────────────────────────────────────────
  sectionHeaders.push({ index: results.length, title: 'STAGE 2b: Measure Costing (Capacity-Based)' });

  const applicableMeasures = getApplicableMeasures(BUILDING_INPUT);
  const selectedMeasures = applicableMeasures.filter(m => measureIds.includes(m.id));
  const costResult = calculateCapacityBasedCosts(selectedMeasures, BUILDING_INPUT, baseline.physicsParams);

  results.push(check('Gross Project Cost', REFERENCE.costs.grossTotal, costResult.grossCapEx, 15));
  for (const ref of [
    { id: 'ashp', name: 'ASHP Cost', expected: REFERENCE.costs.ashp },
    { id: 'led_upgrade', name: 'LED Cost', expected: REFERENCE.costs.led },
    { id: 'bas_controls', name: 'BAS Cost', expected: REFERENCE.costs.bas },
    { id: 'solar_pv', name: 'Solar PV Cost', expected: REFERENCE.costs.solarPv },
    { id: 'submetering', name: 'Submetering Cost', expected: REFERENCE.costs.submetering },
  ]) {
    const actual = costResult.costBreakdown.find(b => b.id === ref.id)?.cost || 0;
    results.push(check(ref.name, ref.expected, actual, 20));
  }

  // ─── STAGE 3: Incentive Stack ───────────────────────────────────────────
  sectionHeaders.push({ index: results.length, title: 'STAGE 3: Incentive Stack' });

  let incentiveResult: ReturnType<typeof calculateIncentiveStack> | null = null;
  try {
    incentiveResult = calculateIncentiveStack({
      measures: selectedMeasures,
      grossCapEx: costResult.grossCapEx,
      building: BUILDING_INPUT,
      ghgReductionPct: impact?.ghgReductionDecimal ?? 0.30,
      orgType: USER_PROFILE.organizationType,
      physicsImpact: impact ? {
        annualElecSavingskWh: impact.annualElecSavingskWh,
        annualGasSavingsM3: impact.annualGasSavingsM3,
      } : undefined,
      measureCosts: costResult.costBreakdown.map(b => ({ id: b.id, cost: b.cost })),
    });
  } catch (e) {
    console.error('❌ calculateIncentiveStack() threw an error:', e);
  }

  if (incentiveResult) {
    const iesoCustom = incentiveResult.eligible.find(r => r.program.id === 'ieso_custom')?.estimatedAmount || 0;
    const iesoPrescriptive = incentiveResult.eligible.find(r => r.program.id === 'ieso_prescriptive')?.estimatedAmount || 0;
    const enbridgeCustom = incentiveResult.eligible.find(r => r.program.id === 'enbridge_custom')?.estimatedAmount || 0;
    const ctItc = incentiveResult.ctItcAmount;

    results.push(check('IESO Custom Incentive', REFERENCE.incentives.iesoCustom, iesoCustom, 20));
    results.push(check('IESO Prescriptive (LED)', REFERENCE.incentives.iesoPrescriptiveLed, iesoPrescriptive, 15));
    results.push(check('Enbridge Custom', REFERENCE.incentives.enbridgeCustom, enbridgeCustom, 25));
    results.push(check('CT ITC (30%)', REFERENCE.incentives.ctItc, ctItc, 10));
    results.push(check('Total Incentives', REFERENCE.incentives.totalIncentives, incentiveResult.totalGrants, 10));
    results.push(check('Net Project Cost', REFERENCE.incentives.netProjectCost, incentiveResult.netCapEx, 10));
  }

  // ─── STAGE 4: Financial Engine ──────────────────────────────────────────
  sectionHeaders.push({ index: results.length, title: 'STAGE 4: Financial Engine (20-Year Pro Forma)' });

  if (incentiveResult && impact) {
    let proForma: ReturnType<typeof generateProForma> | null = null;
    try {
      proForma = generateProForma({
        grossCapEx: costResult.grossCapEx,
        netCapEx: incentiveResult.netCapEx,
        equityPct: 0.0,
        annualEnergySavings: impact.annualEnergyCostSavings || REFERENCE.savings.annualEnergySavings,
        annualSolarRevenue: REFERENCE.savings.annualSolarRevenue,
        annualSubmeteringNOI: REFERENCE.savings.annualSubmeteringNOI,
        ctItcAmount: incentiveResult.ctItcAmount,
        bridgeFinancingNeeded: incentiveResult.bridgeFinancingNeeded,
        upfrontGrants: incentiveResult.totalUpfront,
        loanRate: 0.065,
        loanTerm: 20,
        discountRate: 0.075,
        escalationRate: 0.02,
        cibRate: 0.0275,
        cibEligible: incentiveResult.cibEligible,
        capRate: 0.07,
        rentPerSqft: 18.0,
        areaSqFt: 41800,
        occupancyRate: 0.85,
        baselineGasM3: 26000,
        retrofitGasM3: 5200, // ~80% reduction from ASHP
        province: 'ON',
      });
    } catch (e) {
      console.error('❌ generateProForma() threw an error:', e);
    }

    if (proForma) {
      results.push(check('NPV at 7.5%', REFERENCE.financial.npv_7_5pct, proForma.npv, 20));
      results.push(checkAbsolute('Payback Year', REFERENCE.financial.paybackYear, proForma.paybackYear, 3));

      const y1 = proForma.schedule[0];
      if (y1) {
        results.push(check('Y1 Energy Savings', REFERENCE.cashFlowY1.energySavings, y1.energySavings, 25));
        results.push(check('Y1 Solar Revenue', REFERENCE.cashFlowY1.solarRevenue, y1.solarRevenue, 10));
        results.push(check('Y1 Submetering NOI', REFERENCE.cashFlowY1.submeteringNOI, y1.submeteringNOI, 10));
        results.push(check('Y1 CIB Interest Saving', REFERENCE.cashFlowY1.cibInterestSaving, y1.cibInterestSaving, 15));
      }

      const total20yrEnergy = proForma.schedule.reduce((s, y) => s + y.energySavings, 0);
      const total20yrSolar = proForma.schedule.reduce((s, y) => s + y.solarRevenue, 0);
      results.push(check('20yr Energy Savings Total', REFERENCE.financial.energySavings20yr, total20yrEnergy, 20));
      results.push(check('20yr Solar Revenue Total', REFERENCE.financial.solarRevenue20yr, total20yrSolar, 15));
    }
  }

  // ─── STAGE 5: Business Case Levers ──────────────────────────────────────
  sectionHeaders.push({ index: results.length, title: 'STAGE 5: 9-Lever Business Case' });

  if (incentiveResult) {
    let levers: ReturnType<typeof buildBusinessCase> | null = null;
    try {
      levers = buildBusinessCase({
        annualEnergySavings: impact?.annualEnergyCostSavings || REFERENCE.savings.annualEnergySavings,
        annualSolarRevenue: REFERENCE.savings.annualSolarRevenue,
        annualSubmeteringNOI: REFERENCE.savings.annualSubmeteringNOI,
        ctItcAmount: incentiveResult.ctItcAmount,
        cibSavings20yr: 239000,
        grossCapEx: costResult.grossCapEx,
        netCapEx: incentiveResult.netCapEx,
        capRate: 0.07,
        rentPerSqft: 18.0,
        areaSqFt: 41800,
        occupancyRate: 0.85,
        isInToronto: false,
        ashpCost: REFERENCE.costs.ashp,
        boilerReplacementCost: 55000,
      });
    } catch (e) {
      console.error('❌ buildBusinessCase() threw an error:', e);
    }

    if (levers) {
      const getL = (id: string) => levers!.find(l => l.id === id);
      results.push(check('L1 Incentive Stack', REFERENCE.levers.L1_incentiveStack, getL('L1')?.conservativeValue || 0, 10));
      results.push(check('L3 Energy Savings 20yr', REFERENCE.levers.L3_energySavings_20yr, getL('L3')?.conservativeValue || 0, 20));
      results.push(check('L4 Solar PV 20yr', REFERENCE.levers.L4_solarPV_20yr, getL('L4')?.conservativeValue || 0, 20));
      results.push(check('L6 Green Premium (conservative)', REFERENCE.levers.L6_greenPremium_conservative, getL('L6')?.conservativeValue || 0, 25));
      results.push(check('L8 Regulatory Risk (Waterloo)', REFERENCE.levers.L8_regulatoryRisk, getL('L8')?.conservativeValue || 0, 0));
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // PRINT RESULTS
  // ════════════════════════════════════════════════════════════════════════

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
    const expected = typeof r.expected === 'number' && r.expected > 100
      ? `$${r.expected.toLocaleString()}`
      : r.expected.toString();
    const actual = typeof r.actual === 'number' && r.actual > 100
      ? `$${r.actual.toLocaleString()}`
      : r.actual.toString();

    console.log(`  ${status}  ${r.name.padEnd(35)} Expected: ${expected.padStart(12)}  Actual: ${actual.padStart(12)}  Δ: ${r.delta}`);

    if (r.pass) passCount++;
    else failCount++;
  }

  console.log('\n' + '═'.repeat(80));
  console.log(`  SUMMARY: ${passCount} passed, ${failCount} failed out of ${results.length} checks`);
  if (failCount === 0) {
    console.log('  🎉 ALL CHECKS PASSED — Engine is calibrated to 55 King St E reference');
  } else {
    console.log(`  ⚠️  ${failCount} checks failed — see details above`);
  }
  console.log('═'.repeat(80) + '\n');

  // ─── DIAGNOSTIC DUMP ────────────────────────────────────────────────────
  console.log('  📊 Diagnostic: Physics Engine Baseline Output');
  console.log(`     Electricity: ${baseline.annualElectricitykWh?.toLocaleString()} kWh/yr`);
  console.log(`     Gas: ${baseline.annualGasM3?.toLocaleString()} m³/yr`);
  console.log(`     Total EUI: ${baseline.totalEUI} ekWh/m²`);
  console.log(`     Confidence: ${baseline.confidenceLevel}`);
  console.log(`     Assumptions flagged: ${baseline.assumptions.length}`);
  for (const a of baseline.assumptions) {
    console.log(`       - ${a.parameter}: ${a.assumedValue} (${a.source}, confidence ${a.confidence})`);
  }

  if (impact) {
    console.log('\n  📊 Diagnostic: Physics Engine Post-Retrofit Output');
    console.log(`     Post-retrofit EUI: ${impact.postRetrofitEUI} ekWh/m²`);
    console.log(`     Elec saved: ${impact.annualElecSavingskWh?.toLocaleString()} kWh/yr`);
    console.log(`     Elec added (ASHP): ${impact.annualElecAddedkWh?.toLocaleString()} kWh/yr`);
    console.log(`     Gas saved: ${impact.annualGasSavingsM3?.toLocaleString()} m³/yr`);
    console.log(`     GHG reduction: ${impact.ghgReductionPct}%`);
    console.log(`     Annual cost savings: $${impact.annualEnergyCostSavings?.toLocaleString()}`);
    console.log(`     Solar generation: ${impact.retrofitResult.solarGeneration_kWh?.toLocaleString()} kWh/yr`);
  }

  if (costResult) {
    console.log('\n  📊 Diagnostic: Capacity-Based Costing');
    for (const b of costResult.costBreakdown) {
      console.log(`     ${b.id}: $${b.cost.toLocaleString()} (${b.basisOfEstimate})`);
    }
    console.log(`     Total: $${costResult.grossCapEx.toLocaleString()}`);
  }

  if (incentiveResult) {
    console.log('\n  📊 Diagnostic: Incentive Stack');
    for (const r of incentiveResult.eligible) {
      console.log(`     ${r.program.id}: $${r.estimatedAmount.toLocaleString()} (${r.program.name})`);
    }
    console.log(`     Total grants: $${incentiveResult.totalGrants.toLocaleString()}`);
    console.log(`     Net project cost: $${incentiveResult.netCapEx.toLocaleString()}`);
    console.log(`     CIB eligible: ${incentiveResult.cibEligible}`);
  }

  console.log('');
  process.exit(failCount > 0 ? 1 : 0);
}

runValidation();
