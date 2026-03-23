// ─── User & Session Types ───────────────────────────────────────────────────

export type UserRole =
  | 'owner'
  | 'asset_manager'
  | 'property_manager'
  | 'board_member'
  | 'energy_manager'
  | 'other';

export type OrganizationType =
  | 'private_corporation'
  | 'reit'
  | 'condo_corporation'
  | 'municipality'
  | 'university_college'
  | 'hospital'
  | 'school_board'
  | 'non_profit'
  | 'indigenous'
  | 'pension_fund'
  | 'other';

export type OwnershipModel =
  | 'single_building'
  | 'small_portfolio'
  | 'large_portfolio'
  | 'condo_corp'
  | 'municipality'
  | 'reit'
  | 'institutional';

export type Priority =
  | 'reduce_bills'
  | 'equipment_failing'
  | 'regulatory_pressure'
  | 'leadership_mandate'
  | 'heard_about_incentives'
  | 'general_interest';

export type InvestmentAppetite = 'minimal' | 'moderate' | 'significant' | 'unknown';
export type TimelineFlexibility = 'urgent' | 'flexible' | 'long_term' | 'unknown';
export type TenantSensitivity = 'high' | 'moderate' | 'low' | 'na';

export interface UserProfile {
  role: UserRole;
  organizationType: OrganizationType;
  ownershipModel: OwnershipModel;
  priority: Priority;
  investmentAppetite: InvestmentAppetite;
  timelineFlexibility: TimelineFlexibility;
  existingDebtConcerns: boolean;
  tenantDisruptionSensitivity: TenantSensitivity;
  isDecisionMaker: boolean;
  upcomingCapitalReplacements: string[];
}

// ─── Building Types ─────────────────────────────────────────────────────────

export type BuildingArchetype =
  | 'office_low_rise'
  | 'office_high_rise'
  | 'retail_strip'
  | 'retail_big_box'
  | 'warehouse'
  | 'light_industrial'
  | 'multi_res_low_rise'
  | 'multi_res_high_rise'
  | 'mixed_use'
  | 'hotel'
  | 'school'
  | 'hospital'
  | 'community_centre'
  | 'arena'
  | 'place_of_worship'
  | 'restaurant'
  | 'grocery'
  | 'other';

export type Province = 'ON' | 'QC' | 'BC' | 'AB' | 'SK' | 'MB' | 'NS' | 'NB' | 'PE' | 'NL';

export interface BuildingData {
  id: string;
  address: string;
  city: string;
  province: Province;
  postalCode: string;
  climateZone: string;
  hdd: number;
  cdd: number;
  ldc: string; // Local Distribution Company

  // Physical
  yearBuilt: number;
  archetype: BuildingArchetype;
  areaSqFt: number;
  stories: number;
  occupancyType: string;
  businessType: string;

  // Envelope
  wallType: string;
  roofType: string;
  windowType: string;
  windowWallRatio: number;

  // Mechanical
  heatingSystem: string;
  heatingAge: number;
  coolingSystem: string;
  coolingAge: number;
  ventilationSystem: string;
  dhwSystem: string;

  // Existing systems
  existingSolar: boolean;
  existingBAS: boolean;
  existingCertifications: string[];

  // Energy performance
  annualElectricitykWh: number;
  annualGasM3: number;
  totalEUI: number; // ekWh/m2/yr
  estimatedGHG: number; // tCO2e/yr
  energyStarScore: number;

  // Financial
  capRate: number;
  rentPerSqft: number;
  occupancyRate: number;

  // Data quality
  confidenceLevel: number; // 0-1
  assumptions: AssumptionFlag[];

  // Documents uploaded
  utilityBillUploaded: boolean;
  utilityBillSimulated: boolean;
  capitalPlanUploaded: boolean;
  capitalPlanSimulated: boolean;
  reserveFundStudyUploaded: boolean;
  reserveFundStudySimulated: boolean;

  // Physics parameter overrides (user-edited)
  wallRValue?: number;
  roofRValue?: number;
  windowUValue?: number;
  windowSHGC?: number;
  ach50?: number;
  heatingEfficiency?: number;
  coolingCOP?: number;
  ventilationRate?: number;
  heatRecoveryEffectiveness?: number;
  dhwEfficiency?: number;
  lightingPowerDensity?: number;
  equipmentPowerDensity?: number;
  occupantDensity?: number;
  operatingHoursPerDay?: number;
  operatingDaysPerWeek?: number;
  ceilingHeight?: number;

  // Financial overrides
  electricityRate?: number;
  gasRate?: number;
  discountRate?: number;
  energyEscalation?: number;
}

export interface AssumptionFlag {
  parameter: string;
  assumedValue: string | number;
  source: 'benchmark' | 'building_age' | 'user_input' | 'chat_extracted' | 'api_lookup' | 'surrogate';
  confidence: number;
  improvementPrompt: string;
}

// ─── Chat Types ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  extractedData?: Partial<ChatExtractedData>;
}

export interface ChatExtractedData {
  boilerAge: number;
  boilerType: string;
  hvacCondition: 'good' | 'fair' | 'poor' | 'critical';
  windowAge: number;
  roofCondition: string;
  existingSolar: boolean;
  existingBAS: boolean;
  existingCertifications: string[];
  tenantCount: number;
  occupancyRate: number;
  processLoads: string[];
  knownIssues: string[];
  recentRenovations: string[];
}

// ─── Measure Types ──────────────────────────────────────────────────────────

export type MeasureCategory = 'envelope' | 'mechanical' | 'electrical' | 'controls' | 'renewables';

export interface RetrofitMeasure {
  id: string;
  name: string;
  category: MeasureCategory;
  description: string;
  costPerSqFt: number;
  applicableArchetypes: BuildingArchetype[];
  includedInPathways: PathwayType[];
  rationale: string;

  // Technical details
  baselineSpec: string;
  upgradedSpec: string;
  usefulLifeYears: number;

  // Qualitative flags for UI display only — NOT for calculations
  affectsElectricity: boolean;
  affectsGas: boolean;
  addsElectricity: boolean; // e.g., ASHP adds elec load

  // Optional sizing hints (used by costing and incentive engines)
  fixtureCount?: number;
  solarCapacitykW?: number;
  annualSolarkWh?: number;
}

// ─── Pathway Types ──────────────────────────────────────────────────────────

export type PathwayType = 'light' | 'deep' | 'grid_smart';

export interface Pathway {
  type: PathwayType;
  name: string;
  tagline: string;
  description: string;
  ghgReductionRange: string;
  measures: RetrofitMeasure[];
  grossCapitalCost: number;
  totalIncentives: number;
  netCost: number;
  annualSavings: number;
  annualEnergySavings: number;
  annualSolarRevenue: number;
  annualSubmeteringNOI: number;
  simplePayback: number;
  npv20Year: number;
  ghgReductionPct: number;
  cibEligible: boolean;
  bestFor: string[];
  incentiveBreakdown: IncentiveResult[];
  sequentialBridge?: string; // "In 3 years when your boiler is due..."
  cibLoanDetails?: {
    loanAmount: number;
    rate: number;
    termYears: number;
    monthlyPayment: number;
    interestSavingsVsCommercial: number;
  } | null;
}

// ─── Financial Types ────────────────────────────────────────────────────────

export interface AmortizationYear {
  year: number;
  beginningBalance: number;
  annualPayment: number;
  interestPaid: number;
  principalPaid: number;
  endingBalance: number;
}

export interface ProFormaYear {
  year: number;
  energySavings: number;
  carbonSavings: number;
  solarRevenue: number;
  submeteringNOI: number;
  cibInterestSaving: number;
  ctITCRefund: number;
  bridgeCost: number;
  debtService: number;
  netCashFlow: number;
  cumulativeCash: number;
  discountFactor: number;
  presentValue: number;
}

export interface ProFormaResult {
  schedule: ProFormaYear[];
  npv: number;
  irr: number | null;
  paybackYear: number;
  assetValueIncrease: number;
  roiMultiple: number;
  totalValueCreated: number;
}

export interface BusinessCaseLever {
  id: string;
  name: string;
  category: string;
  conservativeValue: number;
  baseValue: number;
  description: string;
  bankability: 'high' | 'medium' | 'low' | 'qualitative';
  quantified: boolean;
}

// ─── Incentive Types ────────────────────────────────────────────────────────

export type IncentiveType = 'grant' | 'tax_credit' | 'financing' | 'rebate' | 'performance';
export type PaymentTiming = 'upfront' | 'point_of_sale' | 'post_completion' | 'tax_filing' | 'ongoing';

export interface IncentiveProgram {
  id: string;
  name: string;
  provider: string;
  type: IncentiveType;
  description: string;
  region: string[];
  sector: string[];

  // Eligibility (hard filters)
  ownershipTypes: OrganizationType[];
  minGHGReduction?: number;
  requiredCertifications?: string[];
  jurisdictions?: string[];
  fuelTypes?: string[];
  minElectricitykWh?: number;
  minSystemSizekW?: number;

  // Amount
  maxAmount?: number;
  coveragePct?: number;

  // Stacking
  stacksWith: string[];
  excludes: string[];
  reducesCtItcBase: boolean;

  // Process
  preApprovalRequired: boolean;
  preApprovalTiming?: string;
  paymentTiming: PaymentTiming;
  applicationSequence: number;

  // Status
  isActive: boolean;
  lastVerified: string;
  expiryDate?: string;
  intakeStatus?: string;
}

export interface IncentiveResult {
  program: IncentiveProgram;
  eligible: boolean;
  eligibilityReason?: string;
  estimatedAmount: number;
  paymentTiming: PaymentTiming;
}

export interface IncentiveStackResult {
  eligible: IncentiveResult[];
  totalUpfront: number;
  totalDelayed: number;
  totalGrants: number;
  ctItcAmount: number;
  ctItcBasis: number;
  bridgeFinancingNeeded: number;
  dayOneFinanced: number;
  netCapEx: number;
  coveragePct: number;
  cibEligible: boolean;
}

// ─── Energy Baseline Types ──────────────────────────────────────────────────

export interface EnergyBaseline {
  annualElectricitykWh: number;
  annualGasM3: number;
  electricityEUI: number;
  gasEUI: number;
  totalEUI: number;
  estimatedGHG: number;
  energyStarScore: number;
  confidenceLevel: number;
  assumptions: AssumptionFlag[];
}

// ─── Action Plan Types ──────────────────────────────────────────────────────

export interface ActionPhase {
  name: string;
  timeline: string;
  description: string;
  steps: string[];
  criticalWarnings?: string[];
}

export interface Partner {
  category: string;
  name: string;
  description: string;
  contactInfo?: string;
  website?: string;
  phone?: string;
  region: string;
}

export interface ActionPlan {
  title: string;
  executiveSummary: string;
  phases: ActionPhase[];
  incentiveStrategy: string[];
  partners: Partner[];
  risks: {
    category: string;
    risk: string;
    mitigation: string;
    severity: 'low' | 'medium' | 'high';
  }[];
}

// ─── Application State ─────────────────────────────────────────────────────

export type AppStep =
  | 'who_are_you'
  | 'why_here'
  | 'constraints'
  | 'building'
  | 'chat_intake'
  | 'assessment'
  | 'partners'
  | 'outputs';

export interface AppState {
  currentStep: AppStep;
  userProfile: Partial<UserProfile>;
  buildingData: Partial<BuildingData>;
  chatHistory: ChatMessage[];
  pathways: Pathway[];
  selectedPathway: PathwayType | null;
  proForma: ProFormaResult | null;
  incentiveStack: IncentiveStackResult | null;
  actionPlan: ActionPlan | null;
  sessionId: string;
  lastSaved: Date | null;
}
