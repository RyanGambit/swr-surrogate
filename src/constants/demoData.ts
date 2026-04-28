/**
 * Hardcoded demo dataset for 55 King Street West, Kitchener.
 * Sourced from a validated Excel retrofit model (10 sheets) → 55KingDemoData.json.
 * Used only by the /demo/55-king route — the production engine path is unaffected.
 */

import type {
  BuildingData,
  UserProfile,
  Pathway,
  RetrofitMeasure,
  IncentiveResult,
  IncentiveProgram,
  ActionPlan,
  AssumptionFlag,
  PathwayType,
} from '@/types';
import { INCENTIVE_PROGRAMS } from '@/constants/programs';
import raw from '@/constants/55KingDemoData.json';

// ─── Building ───────────────────────────────────────────────────────────────

const b = raw.building;

export const demoBuilding: Partial<BuildingData> = {
  id: '55-king-st-w-kitchener',
  address: b.address,
  city: b.city,
  province: 'ON',
  postalCode: b.postalCode,
  climateZone: b.climateZone,
  hdd: 4100,
  cdd: 300,
  ldc: 'Enova Power Corp',
  yearBuilt: b.yearBuilt,
  archetype: 'office_high_rise',
  areaSqFt: b.grossFloorArea,
  stories: b.floors,
  occupancyType: 'multi_tenant',
  businessType: 'Multi-tenant Class B office (TD Canada Trust Centre)',
  wallType: 'Curtain wall, granite + glass spandrel',
  roofType: 'Flat membrane',
  windowType: 'Double-glazed, non-low-e (1992 vintage)',
  windowWallRatio: b.windowWallRatio,
  heatingSystem: 'Gas-fired hydronic boiler (non-condensing)',
  heatingAge: 34,
  coolingSystem: 'Centrifugal/screw chiller, 4-pipe fan coil',
  coolingAge: 30,
  ventilationSystem: 'Central AHU, no heat recovery',
  dhwSystem: 'Gas DHW',
  existingSolar: false,
  existingBAS: true,
  existingCertifications: [],
  annualElectricitykWh: b.energy.totalElectricity,
  annualGasM3: b.energy.totalGas,
  totalEUI: Math.round(b.energy.siteEUI * 10) / 10,
  estimatedGHG: Math.round(((b.energy.totalElectricity * 0.030) + (b.energy.totalGas * 1.888)) / 1000 * 10) / 10,
  energyStarScore: 62,
  capRate: raw.reValue.capRate,
  rentPerSqft: raw.reValue.netMarketRent,
  occupancyRate: 1 - raw.reValue.vacancyRate,
  confidenceLevel: 0.85,
  utilityBillUploaded: true,
  utilityBillSimulated: false,
  capitalPlanUploaded: false,
  capitalPlanSimulated: true,
  reserveFundStudyUploaded: false,
  reserveFundStudySimulated: false,
  electricityRate: b.energy.electricityPrice,
  gasRate: b.energy.gasPrice,
  energyEscalation: b.energy.elecEscalation,
  assumptions: raw.assumptions.map((a): AssumptionFlag => ({
    parameter: a.parameter,
    assumedValue: String(a.value),
    source: a.confidence === 'VERIFIED' ? 'api_lookup' : 'benchmark',
    confidence:
      a.confidence === 'VERIFIED' ? 0.95 :
      a.confidence === 'MODERATE' ? 0.6 : 0.3,
    improvementPrompt: a.derivation,
  })),
};

// ─── User Profile ───────────────────────────────────────────────────────────

export const demoUserProfile: Partial<UserProfile> = {
  role: 'property_manager',
  organizationType: 'reit',
  ownershipModel: 'reit',
  priority: 'equipment_failing',
  investmentAppetite: 'moderate',
  timelineFlexibility: 'flexible',
  existingDebtConcerns: false,
  tenantDisruptionSensitivity: 'high',
  isDecisionMaker: false,
  upcomingCapitalReplacements: ['Boiler (~34 yrs old, end-of-life approaching)'],
};

// ─── Measure Catalog (minimal stubs for pathway display) ────────────────────

const MEASURE_LIB: Record<string, RetrofitMeasure> = {
  led: {
    id: 'led', name: 'LED Lighting', category: 'electrical',
    description: 'Replace fluorescent fixtures with LED throughout the building.',
    costPerSqFt: 1.73, applicableArchetypes: ['office_high_rise'],
    includedInPathways: ['light', 'deep', 'grid_smart'],
    rationale: 'Lowest-risk efficiency measure with IESO instant discounts.',
    baselineSpec: 'T8 fluorescent fixtures', upgradedSpec: 'LED fixtures, occupancy sensors',
    usefulLifeYears: 15, affectsElectricity: true, affectsGas: false, addsElectricity: false,
  },
  bas: {
    id: 'bas', name: 'BAS Controls', category: 'controls',
    description: 'Modernize building automation system with optimized scheduling.',
    costPerSqFt: 0.85, applicableArchetypes: ['office_high_rise'],
    includedInPathways: ['light', 'deep', 'grid_smart'],
    rationale: 'Existing BAS is dated. Re-tuning unlocks 8–12% HVAC savings.',
    baselineSpec: 'Existing 1990s BAS', upgradedSpec: 'Modern controls, demand reset, optimal start',
    usefulLifeYears: 15, affectsElectricity: true, affectsGas: true, addsElectricity: false,
  },
  pipe_insul: {
    id: 'pipe_insul', name: 'Pipe Insulation & Air Sealing', category: 'envelope',
    description: 'Insulate hydronic distribution piping; air seal mechanical penetrations.',
    costPerSqFt: 0.42, applicableArchetypes: ['office_high_rise'],
    includedInPathways: ['light', 'deep', 'grid_smart'],
    rationale: 'Low-cost gas savings on existing boiler distribution losses.',
    baselineSpec: 'Bare/uninsulated piping in many areas', upgradedSpec: 'R-7 fibreglass insulation, sealed penetrations',
    usefulLifeYears: 25, affectsElectricity: false, affectsGas: true, addsElectricity: false,
  },
  submetering: {
    id: 'submetering', name: 'Smart Submetering', category: 'controls',
    description: 'Install tenant submeters for granular billing and load identification.',
    costPerSqFt: 0.12, applicableArchetypes: ['office_high_rise'],
    includedInPathways: ['light', 'deep', 'grid_smart'],
    rationale: 'Enables tenant cost recovery and ongoing M&V.',
    baselineSpec: 'Single building meter', upgradedSpec: 'Per-floor / per-tenant submeters',
    usefulLifeYears: 20, affectsElectricity: false, affectsGas: false, addsElectricity: false,
  },
  ashp: {
    id: 'ashp', name: 'Heat Pump System (Hybrid ASHP)', category: 'mechanical',
    description: 'Air-source heat pump handles ~85% of heating hours; existing boiler retained for design-day backup.',
    costPerSqFt: 6.23, applicableArchetypes: ['office_high_rise'],
    includedInPathways: ['deep'],
    rationale: 'Best NPV path. Avoids ground-loop cost while delivering ~82% GHG reduction.',
    baselineSpec: 'Gas boiler (non-condensing)', upgradedSpec: 'Cold-climate ASHP + retained gas boiler for <-10°C',
    usefulLifeYears: 18, affectsElectricity: true, affectsGas: true, addsElectricity: true,
  },
  gshp: {
    id: 'gshp', name: 'Heat Pump System (GSHP)', category: 'mechanical',
    description: 'Vertical closed-loop ground-source heat pump replaces both boiler and chiller.',
    costPerSqFt: 19.91, applicableArchetypes: ['office_high_rise'],
    includedInPathways: ['grid_smart'],
    rationale: 'Highest GHG reduction (~96%). Long payback but most resilient option.',
    baselineSpec: 'Gas boiler + electric chiller', upgradedSpec: 'GSHP with vertical bore field',
    usefulLifeYears: 25, affectsElectricity: true, affectsGas: true, addsElectricity: true,
  },
  erv: {
    id: 'erv', name: 'ERV Units', category: 'mechanical',
    description: 'Energy recovery ventilators on AHUs reclaim ~50% of exhaust heat.',
    costPerSqFt: 1.15, applicableArchetypes: ['office_high_rise'],
    includedInPathways: ['deep', 'grid_smart'],
    rationale: 'Required for full ASHP/GSHP system to handle ventilation load.',
    baselineSpec: 'Direct exhaust, no recovery', upgradedSpec: 'ERV with 50% sensible + latent recovery',
    usefulLifeYears: 20, affectsElectricity: true, affectsGas: true, addsElectricity: false,
  },
  panel: {
    id: 'panel', name: 'Electrical Panel Upgrade', category: 'electrical',
    description: 'Upgrade main service to support heat pump load and future solar interconnection.',
    costPerSqFt: 0.85, applicableArchetypes: ['office_high_rise'],
    includedInPathways: ['deep', 'grid_smart'],
    rationale: 'Enabling infrastructure for electrification + Phase 3 solar.',
    baselineSpec: 'Existing service capacity', upgradedSpec: 'Upsized main + sub-distribution',
    usefulLifeYears: 30, affectsElectricity: false, affectsGas: false, addsElectricity: false,
  },
  solar_pv: {
    id: 'solar_pv', name: 'Solar PV', category: 'renewables',
    description: 'Rooftop photovoltaic array sized to available roof area.',
    costPerSqFt: 0.92, applicableArchetypes: ['office_high_rise'],
    includedInPathways: ['grid_smart'],
    rationale: 'Bundled with Phase 3 to leverage Phase 2 panel upgrade.',
    baselineSpec: 'No on-site generation', upgradedSpec: '~110 kW-DC rooftop PV array',
    usefulLifeYears: 25, affectsElectricity: true, affectsGas: false, addsElectricity: false,
    solarCapacitykW: 110, annualSolarkWh: 132000,
  },
};

const MEASURE_NAME_TO_ID: Record<string, string> = {
  'LED Lighting': 'led',
  'BAS Controls': 'bas',
  'Pipe Insulation & Air Sealing': 'pipe_insul',
  'Smart Submetering': 'submetering',
  'Heat Pump System (Hybrid)': 'ashp',
  'Heat Pump System (GSHP)': 'gshp',
  'ERV Units': 'erv',
  'Electrical Panel Upgrade': 'panel',
  'Solar PV': 'solar_pv',
};

function buildMeasures(names: string[]): RetrofitMeasure[] {
  return names
    .map(n => MEASURE_LIB[MEASURE_NAME_TO_ID[n]])
    .filter((m): m is RetrofitMeasure => Boolean(m));
}

// ─── Incentive Mapping ──────────────────────────────────────────────────────

// Map demo incentive program names → existing IncentiveProgram IDs from constants/programs.ts
const PROGRAM_NAME_TO_ID: Record<string, string> = {
  'IESO Instant Discounts': 'ieso_instant_discounts',
  'IESO Custom Retrofit': 'ieso_custom',
  'IESO Prescriptive': 'ieso_prescriptive',
  'Enbridge Custom': 'enbridge_custom',
  'Enbridge Prescriptive': 'enbridge_custom',
  'CT ITC 30%': 'ct_itc',
};

function lookupProgram(name: string, measures: string): IncentiveProgram {
  const id = PROGRAM_NAME_TO_ID[name];
  const found = id ? INCENTIVE_PROGRAMS.find(p => p.id === id) : undefined;
  if (found) return found;
  // Fallback stub for programs not in the catalog
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    name: `${name} (${measures})`,
    provider: name.split(' ')[0],
    type: 'grant',
    description: `${name} — applies to ${measures}.`,
    region: ['ON'],
    sector: ['commercial'],
    ownershipTypes: ['private_corporation', 'reit'],
    stacksWith: [],
    excludes: [],
    reducesCtItcBase: false,
    preApprovalRequired: false,
    paymentTiming: 'post_completion',
    applicationSequence: 5,
    isActive: true,
    lastVerified: '2026-04-01',
  };
}

type PackageKey = 'light' | 'deep' | 'gridSmart';

function buildIncentiveBreakdown(pkg: PackageKey): IncentiveResult[] {
  return raw.financial.incentives
    .map((row): IncentiveResult => {
      const amountKey = `${pkg}Amount` as 'lightAmount' | 'deepAmount' | 'gridSmartAmount';
      const amount = row[amountKey] as number;
      const program = lookupProgram(row.program, row.measures);
      return {
        program,
        eligible: amount > 0,
        eligibilityReason: amount > 0
          ? `Eligible for ${row.measures} measures in this package.`
          : `Not applicable to ${pkg} package (no qualifying measures).`,
        estimatedAmount: amount,
        paymentTiming: program.paymentTiming,
      };
    })
    .filter(r => r.estimatedAmount > 0);
}

// ─── Pathway Construction ───────────────────────────────────────────────────

const PATHWAY_META: Record<PathwayType, { tagline: string; description: string; ghgRange: string; bestFor: string[] }> = {
  light: {
    tagline: 'Quick wins. No regrets.',
    description: 'Lighting, controls, and envelope tune-ups that pay back in under 5 years with minimal tenant disruption.',
    ghgRange: '10–20%',
    bestFor: [
      'Owners with limited capital ($300–500K)',
      'Buildings with active leases (low disruption tolerance)',
      'Quick wins ahead of larger Phase 2 work',
    ],
  },
  deep: {
    tagline: 'Hybrid heat pump + envelope.',
    description: 'Hybrid ASHP retains the existing boiler for design-day backup while shifting ~85% of heating load to electric. Strong GHG outcome at moderate capex.',
    ghgRange: '70–85%',
    bestFor: [
      'CIB-eligible projects (>=30% GHG reduction)',
      'Boilers approaching end-of-life',
      'Buildings positioning for green-lease tenants',
    ],
  },
  grid_smart: {
    tagline: 'Full electrification + on-site solar.',
    description: 'Ground-source heat pump replaces both boiler and chiller. Rooftop PV bundled with Phase 3 panel upgrade for maximum decarbonization.',
    ghgRange: '90–100%',
    bestFor: [
      'Net-zero / Carbon-neutral commitments',
      'Long hold periods (15+ years)',
      'Maximum asset-value uplift',
    ],
  },
};

const PATHWAY_NAMES: Record<PathwayType, string> = {
  light: 'Light — Quick Wins',
  deep: 'Deep — Hybrid Heat Pump',
  grid_smart: 'Grid-Smart — GSHP + Solar',
};

function buildPathway(type: PathwayType, key: PackageKey): Pathway {
  const pkg = raw.packages[key];
  const totalIncentives = raw.financial.totalGrants[key];
  const ctItc = raw.financial.incentives.find(r => r.program === 'CT ITC 30%');
  const ctItcAmount = ctItc ? (ctItc[`${key}Amount` as 'lightAmount' | 'deepAmount' | 'gridSmartAmount'] as number) : 0;
  const totalRebates = totalIncentives + ctItcAmount;
  const netCost = pkg.grossCapex - totalRebates;

  // Annual savings derived from netCost / payback (matches the JSON's payback figure exactly)
  const annualSavings = pkg.simplePayback > 0
    ? Math.round(netCost / pkg.simplePayback)
    : 0;

  const hasSolar = pkg.measures.includes('Solar PV');
  const annualSolarRevenue = hasSolar ? 18500 : 0; // ~110 kW × 0.157 $/kWh × 1075 hrs/yr — see solar_pv measure
  const annualSubmeteringNOI = 8500; // tenant-recovery uplift from submetering

  // Normalize ghgReductionPct: light is "~15%", deep/grid are decimals
  const ghgPct = typeof pkg.ghgReductionPct === 'string'
    ? parseFloat(pkg.ghgReductionPct.replace(/[^0-9.]/g, '')) || 15
    : Math.round((pkg.ghgReductionPct as number) * 100);

  return {
    type,
    name: PATHWAY_NAMES[type],
    tagline: PATHWAY_META[type].tagline,
    description: PATHWAY_META[type].description,
    ghgReductionRange: PATHWAY_META[type].ghgRange,
    measures: buildMeasures(pkg.measures),
    grossCapitalCost: pkg.grossCapex,
    totalIncentives: totalRebates,
    netCost,
    annualSavings,
    annualEnergySavings: Math.max(0, annualSavings - annualSolarRevenue - annualSubmeteringNOI),
    annualSolarRevenue,
    annualSubmeteringNOI,
    simplePayback: Math.round(pkg.simplePayback * 10) / 10,
    npv20Year: Math.round(pkg.npv25yr),
    ghgReductionPct: ghgPct,
    cibEligible: pkg.cibEligible,
    bestFor: PATHWAY_META[type].bestFor,
    incentiveBreakdown: buildIncentiveBreakdown(key),
    sequentialBridge: type === 'light'
      ? 'In ~3 years when your 34-year-old boiler hits end-of-life, this Light package becomes Phase 1 of a Deep retrofit — no rework needed.'
      : undefined,
    cibLoanDetails: pkg.cibEligible
      ? {
        loanAmount: Math.round(netCost * 0.80),
        rate: 0.025,
        termYears: 20,
        monthlyPayment: Math.round((netCost * 0.80 * 0.025 / 12) / (1 - Math.pow(1 + 0.025 / 12, -240))),
        interestSavingsVsCommercial: Math.round(netCost * 0.80 * 0.045 * 0.5),
      }
      : null,
  };
}

export const demoPathways: Pathway[] = [
  buildPathway('light', 'light'),
  buildPathway('deep', 'deep'),
  buildPathway('grid_smart', 'gridSmart'),
];

// ─── Action Plan ────────────────────────────────────────────────────────────

export const demoActionPlan: ActionPlan = {
  title: '55 King Street West — Phased Retrofit Roadmap',
  executiveSummary:
    'Three-phase decarbonization plan for the TD Canada Trust Centre. Phase 1 (Light, $388K net) starts immediately. Phase 2 (Hybrid HP + ERV) is triggered by boiler end-of-life in Year 3-5. Phase 3 (Solar PV) bundles with the Year 7 panel work to enable on-site generation.',
  phases: raw.phasing.phases.map(p => ({
    name: `Phase ${p.phase} — ${p.measures}`,
    timeline: p.timing,
    description: p.trigger,
    steps: [
      `Tenant disruption: ${p.disruption}`,
      `Trigger: ${p.trigger}`,
    ],
    criticalWarnings: p.disruption === 'High'
      ? ['High tenant disruption — coordinate with leasing team and provide 90-day notice to affected floors.']
      : undefined,
  })),
  incentiveStrategy: [
    'Submit IESO Custom Retrofit pre-approval BEFORE any PO — late submission disqualifies the project permanently.',
    'Combo Project: stack IESO Prescriptive (ASHP) with IESO Custom (BAS) under one application.',
    'Enbridge Energy Assessment ($25K, 50% cost-share) doubles as the ASHRAE L2 audit required for CIB.',
    'CT ITC 30% files at year-end on the T2 — flow through CPA, no separate application.',
    'CIB Building Retrofits via BMO/Scotiabank: ~2% rate vs ~6% commercial. Saves ~$320K interest over 20 years on Phase 2.',
  ],
  partners: raw.partners.servicePartners.map(p => ({
    category: p.role,
    name: p.org,
    description: p.why,
    contactInfo: p.contact,
    region: 'waterloo',
  })),
  risks: [
    {
      category: 'Equipment',
      risk: 'Boiler may fail before Phase 2 trigger (Year 3-5), forcing emergency replacement at premium cost.',
      mitigation: 'Pre-engage Efficiency Capital under EaaS to provide bridge financing if boiler fails early. Pre-spec Hybrid HP system now.',
      severity: 'high',
    },
    {
      category: 'Tenant',
      risk: 'Multi-tenant Class B with high competitive sensitivity — Phase 2 disruption could trigger early lease terminations.',
      mitigation: 'Schedule major mechanical work during summer shoulder season. Provide tenant credits or rent abatement during work.',
      severity: 'medium',
    },
    {
      category: 'Incentives',
      risk: 'IESO Custom and Enbridge Custom both require pre-approval BEFORE any PO — early procurement = permanent disqualification.',
      mitigation: 'Hold all PO issuance until written pre-approval received from both IESO and Enbridge.',
      severity: 'high',
    },
    {
      category: 'Tax',
      risk: 'CT ITC requires taxable Canadian corporation status — REIT pass-through structures may not qualify directly.',
      mitigation: 'Verify entity status with CPA before relying on $288K CT ITC in financial model.',
      severity: 'medium',
    },
  ],
};
