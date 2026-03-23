import type { Pathway, PathwayType, BuildingData, UserProfile } from '@/types';
import { getPathwayMeasures } from './measureEngine';
import { calculateCapacityBasedCosts } from './costingEngine';
import { estimateBaseline, estimatePhysicsImpact } from './buildingEngine';
import { calculateIncentiveStack } from './incentiveEngine';
import { generateProForma } from './financialEngine';
import {
  DEFAULT_DISCOUNT_RATE, DEFAULT_ESCALATION_RATE, DEFAULT_CIB_RATE,
  DEFAULT_COMMERCIAL_RATE, DEFAULT_LOAN_TERM, DEFAULT_CAP_RATE,
} from '@/constants/rates';

// ─── CIB Loan Helpers ───────────────────────────────────────────────────────

function calculateMonthlyPayment(principal: number, annualRate: number, years: number): number {
  const r = annualRate / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function calculateTotalInterest(principal: number, annualRate: number, years: number): number {
  const monthly = calculateMonthlyPayment(principal, annualRate, years);
  return monthly * years * 12 - principal;
}

// ─── Generate All Three Pathways ────────────────────────────────────────────
// Users DON'T choose measures — Scout maps constraints to pathways.

export function generatePathways(
  building: Partial<BuildingData>,
  userProfile: Partial<UserProfile>
): Pathway[] {
  const pathwayTypes: PathwayType[] = ['light', 'deep', 'grid_smart'];

  return pathwayTypes.map(type => generateSinglePathway(type, building, userProfile));
}

function generateSinglePathway(
  type: PathwayType,
  building: Partial<BuildingData>,
  userProfile: Partial<UserProfile>
): Pathway {
  const measures = getPathwayMeasures(type, building);
  const areaSqFt = building.areaSqFt || 10000;
  const province = building.province || 'ON';

  // Costs (capacity-based)
  const { grossCapEx, costBreakdown } = calculateCapacityBasedCosts(measures, building);

  // Physics-based baseline and impact
  const baseline = estimateBaseline(building);
  const measureIds = measures.map(m => m.id);
  const impact = estimatePhysicsImpact(
    baseline.physicsParams, baseline.physicsResult, measureIds, building
  );

  // GHG reduction from physics — use raw decimal for eligibility checks
  // (avoids precision loss from integer round-trip: Math.round(x*100)/100)
  const totalGHGReductionDecimal = impact.ghgReductionDecimal;

  // Incentives (connected to physics engine)
  const incentiveStack = calculateIncentiveStack({
    measures,
    grossCapEx,
    building,
    ghgReductionPct: totalGHGReductionDecimal,
    orgType: userProfile.organizationType || 'private_corporation',
    physicsImpact: {
      annualElecSavingskWh: impact.annualElecSavingskWh,
      annualGasSavingsM3: impact.annualGasSavingsM3,
    },
    measureCosts: costBreakdown.map(b => ({ id: b.id, cost: b.cost })),
  });

  // Annual savings from physics engine (rate-engine-based from estimatePhysicsImpact)
  const annualEnergySavings = impact.annualEnergyCostSavings;

  // Solar revenue: use rate-engine effective rate instead of flat rate
  const hasSolar = measures.some(m => m.id === 'solar_pv');
  const solarGen = hasSolar ? impact.retrofitResult.solarGeneration_kWh : 0;
  const effectiveElecRate = impact.baselineAnnualElecCost > 0 && baseline.annualElectricitykWh > 0
    ? impact.baselineAnnualElecCost / baseline.annualElectricitykWh
    : 0.13;
  const annualSolarRevenue = solarGen * effectiveElecRate;

  const hasSubmetering = measures.some(m => m.id === 'submetering');
  const annualSubmeteringNOI = hasSubmetering
    ? (building.rentPerSqft || 18) * areaSqFt * (building.occupancyRate || 0.85) * 0.02
    : 0;

  // Gas consumption for carbon pricing
  const baselineGasM3 = baseline.annualGasM3 || (building.annualGasM3 || 0);
  const retrofitGasM3 = baselineGasM3 - impact.annualGasSavingsM3;

  // Pro Forma
  const proForma = generateProForma({
    grossCapEx,
    netCapEx: incentiveStack.netCapEx,
    equityPct: 0.20,
    annualEnergySavings: Math.max(0, annualEnergySavings),
    annualSolarRevenue,
    annualSubmeteringNOI,
    ctItcAmount: incentiveStack.ctItcAmount,
    bridgeFinancingNeeded: incentiveStack.bridgeFinancingNeeded,
    upfrontGrants: incentiveStack.totalUpfront,
    loanRate: DEFAULT_COMMERCIAL_RATE,
    loanTerm: DEFAULT_LOAN_TERM,
    discountRate: DEFAULT_DISCOUNT_RATE,
    escalationRate: DEFAULT_ESCALATION_RATE,
    cibRate: DEFAULT_CIB_RATE,
    cibEligible: incentiveStack.cibEligible,
    capRate: building.capRate || DEFAULT_CAP_RATE,
    rentPerSqft: building.rentPerSqft || 18,
    areaSqFt,
    occupancyRate: building.occupancyRate || 0.85,
    baselineGasM3,
    retrofitGasM3: Math.max(0, retrofitGasM3),
    province,
  });

  const totalAnnualSavings = annualEnergySavings + annualSolarRevenue + annualSubmeteringNOI;
  const simplePayback = totalAnnualSavings > 0 ? incentiveStack.netCapEx / totalAnnualSavings : 99;

  // Pathway metadata
  const meta = PATHWAY_META[type];

  // Sequential bridge for Light pathway
  const sequentialBridge = type === 'light'
    ? generateSequentialBridge(building)
    : undefined;

  return {
    type,
    name: meta.name,
    tagline: meta.tagline,
    description: meta.description,
    ghgReductionRange: meta.ghgReductionRange,
    measures,
    grossCapitalCost: grossCapEx,
    totalIncentives: incentiveStack.totalGrants,
    netCost: incentiveStack.netCapEx,
    annualSavings: Math.round(totalAnnualSavings),
    annualEnergySavings: Math.round(annualEnergySavings),
    annualSolarRevenue: Math.round(annualSolarRevenue),
    annualSubmeteringNOI: Math.round(annualSubmeteringNOI),
    simplePayback: Math.round(simplePayback * 10) / 10,
    npv20Year: proForma.npv,
    ghgReductionPct: impact.ghgReductionPct,
    cibEligible: incentiveStack.cibEligible,
    bestFor: meta.bestFor,
    incentiveBreakdown: incentiveStack.eligible,
    sequentialBridge,
    cibLoanDetails: incentiveStack.cibEligible ? {
      loanAmount: Math.round(incentiveStack.netCapEx * 0.80),
      rate: 0.025,
      termYears: 20,
      monthlyPayment: Math.round(calculateMonthlyPayment(incentiveStack.netCapEx * 0.80, 0.025, 20)),
      interestSavingsVsCommercial: Math.round(
        calculateTotalInterest(incentiveStack.netCapEx * 0.80, 0.055, 20) -
        calculateTotalInterest(incentiveStack.netCapEx * 0.80, 0.025, 20)
      ),
    } : null,
  };
}

// ─── Sequential Retrofit Bridge ─────────────────────────────────────────────

function generateSequentialBridge(building: Partial<BuildingData>): string | undefined {
  const age = new Date().getFullYear() - (building.yearBuilt || 1985);
  const heatingAge = building.heatingAge || age;

  if (heatingAge > 20) {
    return `Your heating system is likely ${heatingAge}+ years old. When it needs replacement (possibly soon), stepping up to a Deep pathway unlocks CIB financing at 2-3% and can cover the entire cost including the heat pump. Starting with Light now positions you well.`;
  }

  const remainingLife = 25 - heatingAge;
  if (remainingLife > 0 && remainingLife <= 10) {
    return `In ~${remainingLife} years when your heating system is due for replacement, you could step up to Deep and unlock CIB financing. Starting with Light now captures quick wins immediately.`;
  }

  return undefined;
}

// ─── Pathway Metadata ───────────────────────────────────────────────────────

const PATHWAY_META: Record<PathwayType, {
  name: string;
  tagline: string;
  description: string;
  ghgReductionRange: string;
  bestFor: string[];
}> = {
  light: {
    name: 'Quick Wins',
    tagline: 'Start here. Lowest risk, fastest payback, zero disruption.',
    description: 'LED lighting, BAS controls, and pipe insulation/air sealing. Minimal capital with immediate payback and no tenant disruption. In Ontario\'s clean grid, GHG comes from gas — these measures cut costs without fuel switching.',
    ghgReductionRange: '5-15%',
    bestFor: [
      'Exploring options, no firm mandate yet',
      'Limited budget or high tenant sensitivity',
      'First step before deeper retrofit',
      'Fastest payback and positive cash flow',
    ],
  },
  deep: {
    name: 'Core Retrofit',
    tagline: 'Electrification + solar. CIB-eligible financing at 2-3%. Best balanced option.',
    description: 'Heat pump, solar PV, LED, BAS, submetering, and panel upgrade. Solar revenue offsets ASHP demand charges — makes electrification financially viable. Exceeds 30% GHG threshold for CIB financing.',
    ghgReductionRange: '50-60%',
    bestFor: [
      'Heating system at or near end of life',
      'Want CIB financing at 2-3%',
      'Best balance of GHG reduction and ROI',
      'Electrification without envelope work',
    ],
  },
  grid_smart: {
    name: 'Premium Retrofit',
    tagline: 'Full envelope + electrification + renewables. Maximum GHG and incentive capture.',
    description: 'Everything in Core Retrofit PLUS high-performance windows, exterior insulation, and DHW heat pump. Maximum GHG reduction and highest 20-year lifecycle value.',
    ghgReductionRange: '65-80%+',
    bestFor: [
      'Strong climate or net-zero mandate',
      'Major renovation or gut retrofit planned',
      'Envelope at end of life (windows, walls)',
      'Maximum incentive capture',
    ],
  },
};
