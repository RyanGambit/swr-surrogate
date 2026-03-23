import type {
  IncentiveResult, IncentiveStackResult, RetrofitMeasure,
  BuildingData, OrganizationType,
} from '@/types';
import { INCENTIVE_PROGRAMS } from '@/constants/programs';

// ─── Incentive Eligibility Engine ───────────────────────────────────────────
// Eligibility is a HARD FILTER, not a soft score.
// FIX 3: Uses physics-based impact data for calculations, not percentages.

interface StackInput {
  measures: RetrofitMeasure[];
  grossCapEx: number;
  building: Partial<BuildingData>;
  ghgReductionPct: number; // decimal 0.0-1.0
  orgType: OrganizationType;
  // Physics-based impact data (FIX 3)
  physicsImpact?: {
    annualElecSavingskWh: number;
    annualGasSavingsM3: number;
  };
  // Capacity-based costs per measure (FIX 4)
  measureCosts?: { id: string; cost: number }[];
}

export function calculateIncentiveStack(input: StackInput): IncentiveStackResult {
  const { measures, grossCapEx, building, ghgReductionPct, orgType, physicsImpact, measureCosts } = input;
  const province = building.province || 'ON';
  const city = (building.city || '').toLowerCase();
  const areaSqFt = building.areaSqFt || 10000;

  // Helper to get measure cost — prefer capacity-based, fallback to costPerSqFt
  const getMeasureCost = (measureId: string): number => {
    if (measureCosts) {
      const mc = measureCosts.find(c => c.id === measureId);
      if (mc) return mc.cost;
    }
    const m = measures.find(m => m.id === measureId);
    return m ? m.costPerSqFt * areaSqFt : 0;
  };

  const results: IncentiveResult[] = [];

  for (const program of INCENTIVE_PROGRAMS) {
    // ─── Hard Filters ───────────────────────────────────────────────────
    // Region check
    if (!program.region.includes(province)) {
      results.push({ program, eligible: false, eligibilityReason: `Not available in ${province}`, estimatedAmount: 0, paymentTiming: program.paymentTiming });
      continue;
    }

    // Jurisdiction check (e.g., Toronto ERL)
    if (program.jurisdictions && program.jurisdictions.length > 0) {
      if (!program.jurisdictions.some(j => city.includes(j.toLowerCase()))) {
        results.push({ program, eligible: false, eligibilityReason: `Only available in ${program.jurisdictions.join(', ')}`, estimatedAmount: 0, paymentTiming: program.paymentTiming });
        continue;
      }
    }

    // Ownership type check
    if (program.ownershipTypes.length > 0 && !program.ownershipTypes.includes(orgType)) {
      results.push({ program, eligible: false, eligibilityReason: `Not available for ${orgType}`, estimatedAmount: 0, paymentTiming: program.paymentTiming });
      continue;
    }

    // GHG reduction threshold
    if (program.minGHGReduction && ghgReductionPct < program.minGHGReduction) {
      results.push({ program, eligible: false, eligibilityReason: `Requires ≥${Math.round(program.minGHGReduction * 100)}% GHG reduction (you have ${Math.round(ghgReductionPct * 100)}%)`, estimatedAmount: 0, paymentTiming: program.paymentTiming });
      continue;
    }

    // Active status
    if (!program.isActive) {
      results.push({ program, eligible: false, eligibilityReason: program.intakeStatus || 'Program not currently active', estimatedAmount: 0, paymentTiming: program.paymentTiming });
      continue;
    }

    // Excludes check — if a conflicting program is already eligible, skip this one
    if (program.excludes && program.excludes.length > 0) {
      const conflicting = results.find(r => r.eligible && program.excludes!.includes(r.program.id));
      if (conflicting) {
        results.push({ program, eligible: false, eligibilityReason: `Excluded by ${conflicting.program.name}`, estimatedAmount: 0, paymentTiming: program.paymentTiming });
        continue;
      }
    }

    // ─── Calculate Amount ───────────────────────────────────────────────
    let amount = 0;

    switch (program.id) {
      case 'ieso_custom': {
        // $0.20/kWh saved OR $1,800/kW demand reduced, whichever greater
        // Exclude LED (LED has its own prescriptive)
        // For fuel-switching (ASHP): count gas savings as kWh-thermal displacement
        const nonLedMeasures = measures.filter(m => m.id !== 'led_upgrade');
        const hasASHP = measures.some(m => m.id === 'ashp');
        let elecSavingsKwh: number;

        if (physicsImpact) {
          if (hasASHP) {
            // For ASHP fuel switching: gas displaced (m³) → kWh-thermal
            const gasDisplacedkWh = physicsImpact.annualGasSavingsM3 * 10.33;
            // Non-LED electricity savings: attribute 60% of total elec savings to LED
            // (more conservative than fixed estimate which can exceed total savings)
            const ledFraction = measures.some(m => m.id === 'led_upgrade') ? 0.60 : 0;
            const nonLedElecSavings = Math.max(0, physicsImpact.annualElecSavingskWh * (1 - ledFraction));
            elecSavingsKwh = gasDisplacedkWh + nonLedElecSavings;
          } else {
            // Standard: attribute 60% of electricity savings to LED, rest to non-LED measures
            const ledFraction = measures.some(m => m.id === 'led_upgrade') ? 0.60 : 0;
            elecSavingsKwh = Math.max(0, physicsImpact.annualElecSavingskWh * (1 - ledFraction));
          }
        } else {
          elecSavingsKwh = nonLedMeasures.reduce((sum, m) =>
            m.affectsElectricity ? sum + 0.10 * (building.annualElectricitykWh || 500000) : sum, 0);
        }
        const perKwh = elecSavingsKwh * 0.20;
        const nonLedCost = nonLedMeasures.reduce((sum, m) => sum + getMeasureCost(m.id), 0);
        amount = Math.min(perKwh, nonLedCost * 0.50); // cap at 50% of non-LED project cost

        break;
      }

      case 'ieso_prescriptive': {
        // LED: $50/fixture (prescriptive track)
        // Note: Solar PV is NOT in IESO Prescriptive — it goes through microFIT/net metering
        const ledMeasure = measures.find(m => m.id === 'led_upgrade');
        if (ledMeasure) {
          const sqftPerFixture = ['office_low_rise', 'office_high_rise'].includes(building.archetype || '')
            ? 60 : 80;
          const fixtures = ledMeasure.fixtureCount || Math.round(areaSqFt / sqftPerFixture);
          amount += fixtures * 50;
        }

        break;
      }

      case 'enbridge_custom': {
        // Enbridge Custom Retrofit: performance-based incentive on verified gas savings
        // Rate: $0.70/m³ for fuel-switching projects, $0.25/m³ for standard
        // Cap: $100K for private sector, $500K for MUSH
        const hasASHP = measures.some(m => m.id === 'ashp');
        let gasSavingsM3: number;
        if (physicsImpact) {
          gasSavingsM3 = physicsImpact.annualGasSavingsM3;
        } else {
          gasSavingsM3 = measures
            .filter(m => m.affectsGas)
            .reduce((sum, m) => sum + 0.10 * (building.annualGasM3 || 40000), 0);
        }
        // Higher rate for fuel-switching (ASHP) projects — Enbridge values deep gas reduction
        const rate = hasASHP ? 0.70 : 0.25;
        const first400k = Math.min(gasSavingsM3, 400000);
        const above400k = Math.max(0, gasSavingsM3 - 400000);
        amount = first400k * rate + above400k * (rate * 0.4);
        const maxForOrg = ['municipality', 'university_college', 'hospital', 'school_board'].includes(orgType) ? 500000 : 100000;
        amount = Math.min(amount, maxForOrg);

        break;
      }

      case 'ct_itc': {
        // 30% of (eligible equipment cost - grants on same equipment)
        // Eligible: ASHP, Solar PV, DHW heat pump. LED NOT eligible.
        const eligibleIds = ['ashp', 'solar_pv', 'dhw_heatpump'];
        const eligibleMeasures = measures.filter(m => eligibleIds.includes(m.id));
        const eligibleCost = eligibleMeasures.reduce((sum, m) => sum + getMeasureCost(m.id), 0);

        // Grants on eligible equipment reduce CT ITC basis
        // Use previously calculated grant amounts on eligible equipment
        const grantsOnEligible = results
          .filter(r => r.eligible && r.program.reducesCtItcBase)
          .reduce((sum, r) => sum + r.estimatedAmount, 0);

        amount = Math.max(0, (eligibleCost - grantsOnEligible) * 0.30);

        break;
      }

      case 'class_43_1': {
        // 30% declining balance — simplified Y1 tax saving
        const eligibleIds = ['ashp', 'solar_pv', 'dhw_heatpump'];
        const eligibleMeasures = measures.filter(m => eligibleIds.includes(m.id));
        const eligibleCost = eligibleMeasures.reduce((sum, m) => sum + getMeasureCost(m.id), 0);
        // Simplified: ~3-4% of eligible cost as Y1 tax saving
        amount = eligibleCost * 0.035;

        break;
      }

      case 'cib_private':
      case 'cib_public': {
        // Financing program — amount is interest savings, not a grant
        amount = 0; // placeholder; actual savings computed in pro forma
        break;
      }

      case 'ieso_small_business': {
        amount = Math.min(areaSqFt < 5000 ? 3000 : 5500, program.maxAmount || 26500);

        break;
      }

      case 'nrcan_iso50001': {
        const basMeasure = measures.find(m => m.id === 'bas_controls');
        if (basMeasure) {
          const cost = getMeasureCost('bas_controls');
          amount = Math.min(cost * 0.60, program.maxAmount || 40000);
        }

        break;
      }

      default:
        amount = 0;
    }

    results.push({
      program,
      eligible: true,
      estimatedAmount: Math.round(amount),
      paymentTiming: program.paymentTiming,
    });
  }

  // ─── Summarize ────────────────────────────────────────────────────────────
  const eligible = results.filter(r => r.eligible);
  // Programs to exclude from totals (shown for information but not auto-assumed):
  // - CCA (Class 43.1): depreciation schedule, not direct payment
  // - NRCan ISO 50001: requires explicit commitment to ISO 50001 implementation
  const excludeFromTotal = ['class_43_1', 'nrcan_iso50001'];

  const grants = eligible.filter(r =>
    (r.program.type === 'grant' || r.program.type === 'rebate') && !excludeFromTotal.includes(r.program.id)
  );
  const taxCredits = eligible.filter(r =>
    r.program.type === 'tax_credit' && !excludeFromTotal.includes(r.program.id)
  );

  const totalUpfront = grants
    .filter(r => r.paymentTiming === 'upfront' || r.paymentTiming === 'point_of_sale')
    .reduce((sum, r) => sum + r.estimatedAmount, 0);

  const totalPostCompletion = grants
    .filter(r => r.paymentTiming === 'post_completion')
    .reduce((sum, r) => sum + r.estimatedAmount, 0);

  const ctItcResult = eligible.find(r => r.program.id === 'ct_itc');
  const ctItcAmount = ctItcResult?.estimatedAmount || 0;

  const totalGrants = totalUpfront + totalPostCompletion + ctItcAmount +
    taxCredits.filter(r => r.program.id !== 'ct_itc').reduce((sum, r) => sum + r.estimatedAmount, 0);

  const cibEligible = eligible.some(r =>
    (r.program.id === 'cib_private' || r.program.id === 'cib_public')
  );

  // Day-1 financed = gross - upfront grants (CT ITC not available Day 1)
  const dayOneFinanced = grossCapEx - totalUpfront - totalPostCompletion;
  const netCapEx = grossCapEx - totalGrants;
  const coveragePct = grossCapEx > 0 ? totalGrants / grossCapEx : 0;

  return {
    eligible,
    totalUpfront,
    totalDelayed: ctItcAmount,
    totalGrants,
    ctItcAmount,
    ctItcBasis: ctItcResult?.estimatedAmount ? ctItcResult.estimatedAmount / 0.30 : 0,
    bridgeFinancingNeeded: ctItcAmount, // CT ITC arrives 12-18 months later
    dayOneFinanced,
    netCapEx,
    coveragePct,
    cibEligible,
  };
}
