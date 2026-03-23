import type { RetrofitMeasure, BuildingArchetype, PathwayType, BuildingData } from '@/types';

// ─── Full Measure Catalog ───────────────────────────────────────────────────

const ALL_ARCHETYPES: BuildingArchetype[] = [
  'office_low_rise', 'office_high_rise', 'retail_strip', 'retail_big_box',
  'warehouse', 'light_industrial', 'multi_res_low_rise', 'multi_res_high_rise',
  'mixed_use', 'hotel', 'school', 'hospital', 'community_centre', 'arena',
  'place_of_worship', 'restaurant', 'grocery', 'other',
];

const COMMERCIAL = ALL_ARCHETYPES.filter(a =>
  ['office_low_rise', 'office_high_rise', 'retail_strip', 'retail_big_box', 'mixed_use', 'hotel', 'restaurant', 'grocery', 'other'].includes(a)
);

const RESIDENTIAL = ALL_ARCHETYPES.filter(a =>
  ['multi_res_low_rise', 'multi_res_high_rise', 'mixed_use', 'hotel'].includes(a)
);

export const MEASURE_CATALOG: RetrofitMeasure[] = [
  {
    id: 'led_upgrade',
    name: 'LED Lighting + Controls',
    category: 'electrical',
    description: 'Full LED retrofit with occupancy/daylight sensors and dimming controls.',
    costPerSqFt: 3.50,
    applicableArchetypes: ALL_ARCHETYPES,
    includedInPathways: ['light', 'deep', 'grid_smart'],
    rationale: 'Lowest risk, fastest payback. Universal applicability.',
    baselineSpec: 'T8/T12 fluorescent, no controls',
    upgradedSpec: 'LED with occupancy sensors + daylight harvesting',
    usefulLifeYears: 20,
    affectsElectricity: true,
    affectsGas: false,
    addsElectricity: false,
  },
  {
    id: 'bas_controls',
    name: 'Building Automation System (BAS)',
    category: 'controls',
    description: 'DDC controls with demand-controlled ventilation, scheduling, and trending.',
    costPerSqFt: 2.00,
    applicableArchetypes: [...COMMERCIAL, 'school', 'hospital', 'community_centre', 'arena'],
    includedInPathways: ['light', 'deep', 'grid_smart'],
    rationale: 'Optimizes existing systems. Strong payback with minimal disruption.',
    baselineSpec: 'Manual/pneumatic controls or basic programmable',
    upgradedSpec: 'DDC with DCV, optimal start/stop, fault detection',
    usefulLifeYears: 15,
    affectsElectricity: true,
    affectsGas: true,
    addsElectricity: false,
  },
  {
    id: 'ashp',
    name: 'Air Source Heat Pump System',
    category: 'mechanical',
    description: 'Central ASHP replacing gas boiler for space heating. COP 3.0-3.5. Eliminates majority of gas consumption.',
    costPerSqFt: 20.00,
    applicableArchetypes: ALL_ARCHETYPES,
    includedInPathways: ['deep', 'grid_smart'],
    rationale: 'Single biggest GHG reduction lever. Fuel switching from gas to electric.',
    baselineSpec: 'Gas boiler (80% efficiency)',
    upgradedSpec: 'ASHP system (COP 3.0-3.5)',
    usefulLifeYears: 20,
    affectsElectricity: true,
    affectsGas: true,
    addsElectricity: true,
  },
  {
    id: 'windows',
    name: 'High-Performance Windows',
    category: 'envelope',
    description: 'Triple-glazed, thermally broken, low-e coated windows replacing original glazing.',
    costPerSqFt: 25.00,
    applicableArchetypes: ALL_ARCHETYPES.filter(a =>
      !['warehouse', 'light_industrial', 'arena'].includes(a)
    ),
    includedInPathways: ['grid_smart'],
    rationale: 'Major envelope upgrade. Reduces heating/cooling loads and improves comfort.',
    baselineSpec: 'Double-pane, aluminum frame (non-thermally broken)',
    upgradedSpec: 'Triple-glazed, thermally broken, low-e argon filled',
    usefulLifeYears: 30,
    affectsElectricity: true,
    affectsGas: true,
    addsElectricity: false,
  },
  {
    id: 'insulation',
    name: 'Exterior Overcladding / Insulation',
    category: 'envelope',
    description: 'Continuous exterior insulation over existing wall assembly.',
    costPerSqFt: 35.00,
    applicableArchetypes: ALL_ARCHETYPES.filter(a =>
      !['warehouse', 'light_industrial'].includes(a)
    ),
    includedInPathways: ['grid_smart'],
    rationale: 'Reduces heating load and enables heat pump right-sizing.',
    baselineSpec: 'Uninsulated masonry or minimal cavity insulation (R-5)',
    upgradedSpec: 'Exterior continuous insulation (R-16+)',
    usefulLifeYears: 40,
    affectsElectricity: false,
    affectsGas: true,
    addsElectricity: false,
  },
  {
    id: 'dhw_heatpump',
    name: 'DHW Heat Pump',
    category: 'mechanical',
    description: 'Heat pump water heater replacing gas-fired DHW system.',
    costPerSqFt: 5.00,
    applicableArchetypes: [...RESIDENTIAL, 'hospital', 'community_centre', 'hotel', 'arena'],
    includedInPathways: ['grid_smart'],
    rationale: 'Eliminates gas DHW consumption. CT ITC eligible.',
    baselineSpec: 'Gas-fired storage water heater (60% efficiency)',
    upgradedSpec: 'Heat pump water heater (COP 3.0+)',
    usefulLifeYears: 15,
    affectsElectricity: true,
    affectsGas: true,
    addsElectricity: true,
  },
  {
    id: 'solar_pv',
    name: 'Rooftop Solar PV',
    category: 'renewables',
    description: 'Grid-connected rooftop solar with net metering. Sized to available roof area.',
    costPerSqFt: 12.00,
    applicableArchetypes: ALL_ARCHETYPES,
    includedInPathways: ['deep', 'grid_smart'],
    rationale: 'Recurring revenue stream. CT ITC eligible. Zero-emission generation.',
    baselineSpec: 'No on-site generation',
    upgradedSpec: 'Rooftop PV array, net metered',
    usefulLifeYears: 25,
    affectsElectricity: true,
    affectsGas: false,
    addsElectricity: false,
  },
  {
    id: 'submetering',
    name: 'Smart Submetering',
    category: 'controls',
    description: 'Tenant-level utility metering for cost recovery and behavioral savings. NOI protection.',
    costPerSqFt: 0.60,
    applicableArchetypes: ALL_ARCHETYPES.filter(a =>
      ['office_low_rise', 'office_high_rise', 'retail_strip', 'retail_big_box', 'mixed_use', 'multi_res_low_rise', 'multi_res_high_rise'].includes(a)
    ),
    includedInPathways: ['deep', 'grid_smart'],
    rationale: 'NOI protection — eliminates split incentive. NOT additive savings.',
    baselineSpec: 'Bulk metered, landlord pays utilities',
    upgradedSpec: 'Smart submeters per tenant with real-time dashboards',
    usefulLifeYears: 15,
    affectsElectricity: true,
    affectsGas: false,
    addsElectricity: false,
  },
  {
    id: 'pipe_insulation',
    name: 'Pipe Insulation & Air Sealing',
    category: 'envelope',
    description: 'Insulate exposed mechanical piping and seal envelope air leaks.',
    costPerSqFt: 0.20,
    applicableArchetypes: ALL_ARCHETYPES,
    includedInPathways: ['light', 'deep', 'grid_smart'],
    rationale: 'Minimal cost, immediate savings. Good maintenance practice.',
    baselineSpec: 'Uninsulated mechanical piping, visible air leaks',
    upgradedSpec: 'Insulated piping, sealed penetrations',
    usefulLifeYears: 20,
    affectsElectricity: false,
    affectsGas: true,
    addsElectricity: false,
  },
  {
    id: 'electrical_panel',
    name: 'Electrical Panel Upgrade',
    category: 'electrical',
    description: 'Panel capacity upgrade required for ASHP + solar installations.',
    costPerSqFt: 0.60,
    applicableArchetypes: ALL_ARCHETYPES,
    includedInPathways: ['deep', 'grid_smart'],
    rationale: 'Enabling infrastructure for electrification.',
    baselineSpec: 'Original panel (may be at capacity)',
    upgradedSpec: 'Upgraded panel with capacity for ASHP + Solar',
    usefulLifeYears: 40,
    affectsElectricity: false,
    affectsGas: false,
    addsElectricity: false,
  },
];

// ─── Get applicable measures for a building ─────────────────────────────────

export function getApplicableMeasures(building: Partial<BuildingData>): RetrofitMeasure[] {
  const archetype = building.archetype || 'office_low_rise';

  return MEASURE_CATALOG.filter(m => {
    // Archetype filter
    if (!m.applicableArchetypes.includes(archetype)) return false;

    // Don't recommend what already exists
    if (m.id === 'solar_pv' && building.existingSolar) return false;
    if (m.id === 'bas_controls' && building.existingBAS) return false;

    return true;
  });
}

// ─── Get measures for a specific pathway ────────────────────────────────────

export function getPathwayMeasures(
  pathway: PathwayType,
  building: Partial<BuildingData>
): RetrofitMeasure[] {
  const applicable = getApplicableMeasures(building);
  return applicable.filter(m => m.includedInPathways.includes(pathway));
}

// ─── Calculate total cost for a set of measures ─────────────────────────────
// NOTE: This is the legacy costPerSqFt approach. Prefer costingEngine.ts
// for capacity-based costing.

export function calculateMeasureCosts(
  measures: RetrofitMeasure[],
  areaSqFt: number
): {
  grossCapEx: number;
  costBreakdown: { id: string; name: string; cost: number }[];
} {
  // Right-sizing synergy: 25% cost reduction for heat pump if envelope measures present
  const hasEnvelope = measures.some(m => m.category === 'envelope' && m.id !== 'pipe_insulation');

  const breakdown = measures.map(m => {
    let cost = m.costPerSqFt * areaSqFt;
    if (m.id === 'ashp' && hasEnvelope) {
      cost *= 0.75; // right-sizing synergy
    }
    return { id: m.id, name: m.name, cost: Math.round(cost) };
  });

  return {
    grossCapEx: breakdown.reduce((sum, b) => sum + b.cost, 0),
    costBreakdown: breakdown,
  };
}
