import type { ProFormaYear, ProFormaResult, BusinessCaseLever } from '@/types';
import {
  calculateAmortizingSchedule, calculateCibSavings, calculateCtItc,
  calculateBridgeCost, calculateNPV, calculateIRR, escalate, solarDegradation,
} from '@/utils/financial';
import {
  DEFAULT_DISCOUNT_RATE, DEFAULT_ESCALATION_RATE, DEFAULT_CIB_RATE,
  DEFAULT_COMMERCIAL_RATE, DEFAULT_LOAN_TERM, DEFAULT_SOLAR_DEGRADATION,
  CT_ITC_BRIDGE_MONTHS, getCarbonChargePerM3,
} from '@/constants/rates';
import type { Province } from '@/types';

// ─── Pro Forma Generation (20-year) ─────────────────────────────────────────

export interface ProFormaParams {
  grossCapEx: number;
  netCapEx: number; // after all grants
  equityPct: number; // % equity vs debt
  annualEnergySavings: number; // Y1 energy cost savings
  annualSolarRevenue: number; // Y1 solar revenue
  annualSubmeteringNOI: number; // Y1 submetering NOI protection
  ctItcAmount: number;
  bridgeFinancingNeeded: number;
  upfrontGrants: number;
  loanRate: number;
  loanTerm: number;
  discountRate: number;
  escalationRate: number;
  cibRate?: number;
  cibEligible: boolean;
  capRate: number;
  rentPerSqft: number;
  areaSqFt: number;
  occupancyRate: number;
  // Carbon pricing
  baselineGasM3: number;
  retrofitGasM3: number;
  province: Province;
  startYear?: number; // defaults to current year
}

export function generateProForma(params: ProFormaParams): ProFormaResult {
  const {
    grossCapEx, netCapEx, equityPct,
    annualEnergySavings, annualSolarRevenue, annualSubmeteringNOI,
    ctItcAmount, bridgeFinancingNeeded,
    loanRate, loanTerm, discountRate, escalationRate,
    cibRate = DEFAULT_CIB_RATE, cibEligible,
    capRate, rentPerSqft, areaSqFt, occupancyRate,
    baselineGasM3, retrofitGasM3, province,
    startYear = new Date().getFullYear(),
  } = params;

  const effectiveRate = cibEligible ? cibRate : loanRate;
  const equityAmount = netCapEx * equityPct;
  const loanPrincipal = netCapEx - equityAmount;

  // Amortizing schedule
  const loanSchedule = calculateAmortizingSchedule(loanPrincipal, effectiveRate, loanTerm);

  // CIB interest savings (vs commercial)
  const cibSavings = cibEligible
    ? calculateCibSavings(loanPrincipal, cibRate, loanRate, loanTerm)
    : [];

  // Bridge cost for CT ITC (deducted from Y1)
  const bridgeCost = calculateBridgeCost(bridgeFinancingNeeded, loanRate, CT_ITC_BRIDGE_MONTHS);

  const schedule: ProFormaYear[] = [];
  // Track cumulative against full project cost (not just equity) for payback calculation
  let cumulativeCash = -netCapEx;

  for (let year = 1; year <= 20; year++) {
    // Energy savings escalate at 2%/yr
    const energySavings = escalate(annualEnergySavings, escalationRate, year);

    // Solar revenue with 0.5%/yr degradation + 2% price escalation
    const solarBase = solarDegradation(annualSolarRevenue, DEFAULT_SOLAR_DEGRADATION, year);
    const solarRevenue = escalate(solarBase, escalationRate, year);

    // Submetering NOI at 2%/yr rent escalation
    const submeteringNOI = escalate(annualSubmeteringNOI, escalationRate, year);

    // Carbon cost avoidance: (baseline - retrofit) gas × carbon charge per m³
    const calendarYear = startYear + year - 1;
    const carbonChargePerM3 = getCarbonChargePerM3(calendarYear, province);
    const carbonSavings = (baselineGasM3 - retrofitGasM3) * carbonChargePerM3;

    // CIB interest savings (declining annually on amortizing schedule)
    const cibSaving = cibSavings.find(s => s.year === year)?.saving || 0;

    // CT ITC arrives in Year 1 (not Day 0)
    const ctItcRefund = year === 1 ? ctItcAmount : 0;

    // Bridge cost deducted from Year 1
    const yearBridgeCost = year === 1 ? bridgeCost : 0;

    // Debt service (loan term only, 0 after)
    const debtService = year <= loanTerm ? (loanSchedule[year - 1]?.annualPayment || 0) : 0;

    const netCashFlow =
      energySavings + carbonSavings + solarRevenue + submeteringNOI + cibSaving +
      ctItcRefund - yearBridgeCost - debtService;

    cumulativeCash += netCashFlow;

    const df = 1 / Math.pow(1 + discountRate, year);

    schedule.push({
      year,
      energySavings: Math.round(energySavings),
      carbonSavings: Math.round(carbonSavings),
      solarRevenue: Math.round(solarRevenue),
      submeteringNOI: Math.round(submeteringNOI),
      cibInterestSaving: Math.round(cibSaving),
      ctITCRefund: Math.round(ctItcRefund),
      bridgeCost: Math.round(yearBridgeCost),
      debtService: Math.round(debtService),
      netCashFlow: Math.round(netCashFlow),
      cumulativeCash: Math.round(cumulativeCash),
      discountFactor: Math.round(df * 10000) / 10000,
      presentValue: Math.round(netCashFlow * df),
    });
  }

  // NPV — project-level: PV of operational benefits minus net investment
  // Excludes CIB interest savings (financing benefit, not project benefit)
  // Excludes debt service (to avoid double-counting)
  const projectFlows = schedule.map(s =>
    s.energySavings + s.carbonSavings + s.solarRevenue + s.submeteringNOI +
    s.ctITCRefund - s.bridgeCost
  );
  const cashFlows = [-netCapEx, ...projectFlows];
  const npv = calculateNPV(projectFlows, discountRate) - netCapEx;

  // IRR — guard against NaN/Infinity from non-converging Newton's method
  const rawIrr = calculateIRR(cashFlows);
  const irr = (Number.isFinite(rawIrr)) ? rawIrr : null;

  // Payback year
  const paybackYear = schedule.find(s => s.cumulativeCash >= 0)?.year || 20;

  // Asset value increase (NOI uplift / cap rate)
  const noiUplift = annualEnergySavings + annualSolarRevenue + annualSubmeteringNOI;
  const greenPremium = rentPerSqft * areaSqFt * occupancyRate * 0.04; // 4% green premium
  const assetValueIncrease = (noiUplift + greenPremium) / capRate;

  // Total value created over 20 years (conservative)
  const totalValueCreated = schedule.reduce((sum, s) =>
    sum + s.energySavings + s.carbonSavings + s.solarRevenue + s.submeteringNOI + s.cibInterestSaving, 0
  ) + ctItcAmount + assetValueIncrease * 0.5; // 50% of asset value as conservative

  const roiMultiple = equityAmount > 0 ? totalValueCreated / equityAmount : 0;

  return {
    schedule,
    npv: Math.round(npv),
    irr: irr !== null ? Math.round(irr * 1000) / 1000 : null,
    paybackYear,
    assetValueIncrease: Math.round(assetValueIncrease),
    roiMultiple: Math.round(roiMultiple * 10) / 10,
    totalValueCreated: Math.round(totalValueCreated),
  };
}

// ─── 9-Lever Business Case ──────────────────────────────────────────────────

export function buildBusinessCase(params: {
  annualEnergySavings: number;
  annualSolarRevenue: number;
  annualSubmeteringNOI: number;
  ctItcAmount: number;
  cibSavings20yr: number;
  grossCapEx: number;
  netCapEx: number;
  capRate: number;
  rentPerSqft: number;
  areaSqFt: number;
  occupancyRate: number;
  isInToronto: boolean;
  ashpCost: number;
  boilerReplacementCost: number;
  annualCarbonSavings?: number;
}): BusinessCaseLever[] {
  const {
    annualEnergySavings, annualSolarRevenue, annualSubmeteringNOI,
    ctItcAmount, cibSavings20yr, grossCapEx, netCapEx,
    capRate, rentPerSqft, areaSqFt, occupancyRate,
    isInToronto, ashpCost, boilerReplacementCost,
    annualCarbonSavings = 0,
  } = params;

  // 20-year escalated values (2% annual)
  const escalate20 = (base: number) => {
    let total = 0;
    for (let y = 1; y <= 20; y++) total += base * Math.pow(1.02, y - 1);
    return total;
  };

  return [
    {
      id: 'L1',
      name: 'Incentive Cash Stack',
      category: 'Capital Cost Reduction',
      conservativeValue: grossCapEx - netCapEx,
      baseValue: grossCapEx - netCapEx,
      description: 'IESO + Enbridge + CT ITC grants and tax credits',
      bankability: 'high',
      quantified: true,
    },
    {
      id: 'L2',
      name: 'CIB Low-Interest Financing',
      category: 'Financing Cost Reduction',
      conservativeValue: cibSavings20yr * 0.85,
      baseValue: cibSavings20yr,
      description: 'Interest savings vs commercial rate over 20-year amortizing schedule',
      bankability: 'high',
      quantified: true,
    },
    {
      id: 'L3',
      name: 'Energy Bill Savings',
      category: 'Operational Savings',
      conservativeValue: escalate20(annualEnergySavings) * 0.85,
      baseValue: escalate20(annualEnergySavings),
      description: 'Annual HVAC + LED + operational savings escalated at 2%/yr',
      bankability: 'medium',
      quantified: true,
    },
    {
      id: 'L4',
      name: 'Solar PV Net Metering',
      category: 'Revenue Generation',
      conservativeValue: escalate20(annualSolarRevenue) * 0.85,
      baseValue: escalate20(annualSolarRevenue),
      description: 'Net metering credits from rooftop solar PV',
      bankability: 'medium',
      quantified: annualSolarRevenue > 0,
    },
    {
      id: 'L5',
      name: 'Smart Submetering (NOI Protection)',
      category: 'NOI Protection',
      conservativeValue: escalate20(annualSubmeteringNOI) * 0.75,
      baseValue: escalate20(annualSubmeteringNOI),
      description: 'Utility cost recovery from tenants — NOI protection, NOT additive savings',
      bankability: 'medium',
      quantified: annualSubmeteringNOI > 0,
    },
    {
      id: 'L6',
      name: 'Green Certification Premium',
      category: 'Asset Value',
      conservativeValue: rentPerSqft * areaSqFt * occupancyRate * 0.03 / capRate,
      baseValue: rentPerSqft * areaSqFt * occupancyRate * 0.04 / capRate,
      description: '3-4% rent premium on occupied sqft capitalized at cap rate',
      bankability: 'low',
      quantified: true,
    },
    {
      id: 'L7',
      name: 'Vacancy Improvement',
      category: 'Asset Value',
      conservativeValue: rentPerSqft * areaSqFt * 0.03 / capRate,
      baseValue: rentPerSqft * areaSqFt * 0.049 / capRate,
      description: 'Flight-to-quality effect: certified buildings ~4.9pts lower vacancy. Sequential with L6.',
      bankability: 'low',
      quantified: true,
    },
    {
      id: 'L8',
      name: 'Regulatory Risk Avoidance',
      category: 'Risk Mitigation',
      conservativeValue: isInToronto ? 50000 : 0,
      baseValue: isInToronto ? 100000 : 0,
      description: isInToronto
        ? 'Toronto BEPS penalties (2027+). Quantified for Toronto buildings only.'
        : 'Non-Toronto: qualitative narrative only. $0 quantified.',
      bankability: 'qualitative',
      quantified: isInToronto,
    },
    {
      id: 'L9',
      name: 'Lifecycle Alignment (Incremental Cost)',
      category: 'Cost Reframing',
      conservativeValue: Math.max(0, ashpCost - boilerReplacementCost),
      baseValue: Math.max(0, ashpCost - boilerReplacementCost),
      description: 'Reframe: ASHP as mandatory boiler replacement + efficiency premium. Net incremental cost.',
      bankability: 'high',
      quantified: true,
    },
    {
      id: 'L10',
      name: 'Carbon Tax Avoidance',
      category: 'Operational Savings',
      conservativeValue: escalate20(annualCarbonSavings) * 0.85,
      baseValue: escalate20(annualCarbonSavings),
      description: 'Federal carbon charge avoidance from reduced gas consumption ($65→$170/tonne by 2030)',
      bankability: 'medium',
      quantified: annualCarbonSavings > 0,
    },
  ];
}

// ─── NPV Sensitivity Table ──────────────────────────────────────────────────

export function npvSensitivity(
  cashFlows: number[],
  rates: number[] = [0.05, 0.06, 0.075, 0.08, 0.10]
): { rate: number; npv: number }[] {
  return rates.map(rate => ({
    rate,
    npv: calculateNPV(cashFlows, rate),
  }));
}
