import type { RetrofitMeasure, BuildingData } from '@/types';
import type { BuildingPhysicsParams } from '@/types/physics';

// ─── Capacity-Based Costing Engine ───────────────────────────────────────────
// FIX 4: Costs are driven by capacity (kW, fixtures, kW-DC), not $/sqft.
// Calibrated against 55 King St E reference costs (Ontario 2025-2026 contractor benchmarks).
// All costs are Budget Estimates — users should obtain 3 contractor quotes.

export interface MeasureCost {
  measureId: string;
  totalCost: number;
  breakdown: {
    equipment: number;
    installation: number;
    engineering: number;
    contingency: number;
  };
  basisOfEstimate: string;
  confidenceLevel: 'budget' | 'estimate' | 'quote';
  source: string;
}

export interface CostingResult {
  grossCapEx: number;
  costBreakdown: { id: string; name: string; cost: number; basisOfEstimate: string }[];
  measureCosts: MeasureCost[];
}

// ─── Reference Cost Parameters (Ontario 2025-2026) ──────────────────────────

const ASHP_COST_PER_KW_THERMAL = 1000;   // $/kW-thermal capacity (mid-range)
const ASHP_INSTALL_FACTOR = 0.30;         // 30% of equipment for installation + controls
const ASHP_ELECTRICAL_UPGRADE = 25000;    // Separate line item for panel upgrade

const LED_COST_PER_FIXTURE = 100;         // $60 equipment + $40 installation
const LED_SQFT_PER_FIXTURE_OFFICE = 60;   // Open office
const LED_SQFT_PER_FIXTURE_MIXED = 80;    // Mixed use

const SOLAR_COST_PER_KW_DC = 925;        // $/kW-DC installed ($2.85/W)
const SOLAR_KW_PER_SQFT_ROOF = 0.025;    // kW per usable sqft of roof

const BAS_BASE_COST = 15000;              // Base system cost
const BAS_PER_SQFT = 0.96;               // Per sqft above base

const SUBMETER_COST_PER_UNIT = 3125;      // Per meter (equipment + install + software)
const SUBMETER_DEFAULT_COUNT = 8;         // Default for multi-tenant

const PIPE_INSULATION_PER_SQFT = 0.19;   // Relatively stable

const PANEL_UPGRADE_BASE = 25000;         // Fixed for this building class

// Regional adjustment factors
const REGIONAL_FACTORS: Record<string, number> = {
  toronto: 1.10,
  mississauga: 1.08,
  brampton: 1.05,
  markham: 1.08,
  hamilton: 1.02,
  kitchener: 1.00,
  waterloo: 1.00,
  cambridge: 1.00,
  guelph: 1.00,
  london: 0.98,
  ottawa: 1.05,
  windsor: 0.95,
  barrie: 1.02,
  sudbury: 1.05,
  'thunder bay': 1.08,
  default: 1.00,
};

export function calculateCapacityBasedCosts(
  measures: RetrofitMeasure[],
  building: Partial<BuildingData>,
  physicsParams?: BuildingPhysicsParams
): CostingResult {
  const areaSqFt = building.areaSqFt || 10000;
  const stories = building.stories || 2;
  const city = (building.city || '').toLowerCase();
  const regionalFactor = REGIONAL_FACTORS[city] || REGIONAL_FACTORS.default;

  const measureCosts: MeasureCost[] = [];

  for (const m of measures) {
    let cost: MeasureCost;

    switch (m.id) {
      case 'ashp': {
        // Capacity-driven: heating load from physics / COP = electrical capacity
        const areaM2 = areaSqFt * 0.0929;
        // Use physics heating capacity if available, otherwise estimate
        // For existing buildings with aging systems, actual capacity is often
        // 60-80 W/m². ASHP right-sizing typically targets 70-75 W/m².
        const heatingCapacity_kW = physicsParams
          ? physicsParams.mechanical.heatingCapacity_kW * 0.85 // right-size for ASHP (not peak)
          : areaM2 * 0.07; // ~70 W/m² design for ASHP
        const equipment = Math.round(heatingCapacity_kW * ASHP_COST_PER_KW_THERMAL);
        const installation = Math.round(equipment * ASHP_INSTALL_FACTOR);
        const engineering = Math.round((equipment + installation) * 0.05);
        const contingency = Math.round((equipment + installation) * 0.08);
        const total = equipment + installation + engineering + contingency;
        cost = {
          measureId: 'ashp',
          totalCost: Math.round(total * regionalFactor),
          breakdown: { equipment, installation, engineering, contingency },
          basisOfEstimate: `${Math.round(heatingCapacity_kW)} kW heating capacity × $${ASHP_COST_PER_KW_THERMAL}/kW + 30% install + engineering`,
          confidenceLevel: 'budget',
          source: 'Ontario 2025-2026 contractor benchmarks',
        };
        break;
      }

      case 'led_upgrade': {
        const sqftPerFixture = ['office_low_rise', 'office_high_rise'].includes(building.archetype || '')
          ? LED_SQFT_PER_FIXTURE_OFFICE
          : LED_SQFT_PER_FIXTURE_MIXED;
        const fixtureCount = m.fixtureCount || Math.round(areaSqFt / sqftPerFixture);
        const equipment = Math.round(fixtureCount * 60);
        const installation = Math.round(fixtureCount * 40);
        const total = equipment + installation;
        cost = {
          measureId: 'led_upgrade',
          totalCost: Math.round(total * regionalFactor),
          breakdown: { equipment, installation, engineering: 0, contingency: 0 },
          basisOfEstimate: `${fixtureCount} fixtures × $${LED_COST_PER_FIXTURE}/fixture ($60 equip + $40 install)`,
          confidenceLevel: 'budget',
          source: 'Ontario 2025-2026 contractor benchmarks',
        };
        break;
      }

      case 'bas_controls': {
        const baseCost = BAS_BASE_COST;
        const areaCost = Math.round(areaSqFt * BAS_PER_SQFT);
        const total = baseCost + areaCost;
        cost = {
          measureId: 'bas_controls',
          totalCost: Math.round(total * regionalFactor),
          breakdown: {
            equipment: Math.round(total * 0.60),
            installation: Math.round(total * 0.30),
            engineering: Math.round(total * 0.10),
            contingency: 0,
          },
          basisOfEstimate: `$${BAS_BASE_COST.toLocaleString()} base + ${areaSqFt.toLocaleString()} sqft × $${BAS_PER_SQFT}/sqft`,
          confidenceLevel: 'budget',
          source: 'Ontario 2025-2026 contractor benchmarks',
        };
        break;
      }

      case 'solar_pv': {
        // Capacity from usable roof area
        // Flat roofs (commercial/industrial) allow ~75% utilization vs 60% for pitched
        const roofSqFt = areaSqFt / stories;
        const usableRoofSqFt = roofSqFt * 0.75; // 75% for flat commercial roofs
        const capacityKW = m.solarCapacitykW || Math.round(usableRoofSqFt * SOLAR_KW_PER_SQFT_ROOF);
        const total = Math.round(capacityKW * SOLAR_COST_PER_KW_DC);
        cost = {
          measureId: 'solar_pv',
          totalCost: Math.round(total * regionalFactor),
          breakdown: {
            equipment: Math.round(total * 0.55),
            installation: Math.round(total * 0.35),
            engineering: Math.round(total * 0.05),
            contingency: Math.round(total * 0.05),
          },
          basisOfEstimate: `${capacityKW} kW-DC × $${SOLAR_COST_PER_KW_DC}/kW-DC ($2.85/W installed)`,
          confidenceLevel: 'budget',
          source: 'Ontario 2025-2026 contractor benchmarks',
        };
        break;
      }

      case 'submetering': {
        const meterCount = SUBMETER_DEFAULT_COUNT;
        const total = meterCount * SUBMETER_COST_PER_UNIT;
        cost = {
          measureId: 'submetering',
          totalCost: Math.round(total * regionalFactor),
          breakdown: {
            equipment: Math.round(total * 0.50),
            installation: Math.round(total * 0.35),
            engineering: 0,
            contingency: Math.round(total * 0.15),
          },
          basisOfEstimate: `${meterCount} meters × $${SUBMETER_COST_PER_UNIT}/meter`,
          confidenceLevel: 'budget',
          source: 'Ontario 2025-2026 contractor benchmarks',
        };
        break;
      }

      case 'pipe_insulation': {
        const total = Math.round(areaSqFt * PIPE_INSULATION_PER_SQFT);
        cost = {
          measureId: 'pipe_insulation',
          totalCost: Math.round(total * regionalFactor),
          breakdown: {
            equipment: Math.round(total * 0.40),
            installation: Math.round(total * 0.60),
            engineering: 0,
            contingency: 0,
          },
          basisOfEstimate: `${areaSqFt.toLocaleString()} sqft × $${PIPE_INSULATION_PER_SQFT}/sqft`,
          confidenceLevel: 'budget',
          source: 'Ontario 2025-2026 contractor benchmarks',
        };
        break;
      }

      case 'windows': {
        // Cost based on actual window area, not total floor area
        // Window area = perimeter × height × window-to-wall ratio
        const floorPlateSqFt = areaSqFt / stories;
        const sideLength = Math.sqrt(floorPlateSqFt); // approximate square floor plate
        const perimeterFt = sideLength * 4;
        const totalHeightFt = stories * 12; // ~12 ft floor-to-floor
        const totalWallArea = perimeterFt * totalHeightFt;
        const wwr = 0.35; // typical commercial window-to-wall ratio
        const windowAreaSqFt = totalWallArea * wwr;
        const windowCostPerSqFt = 28; // $/sqft for triple-glazed replacement (ON 2025-2026)
        const windowTotal = Math.round(windowAreaSqFt * windowCostPerSqFt);
        const windowEngineering = Math.round(windowTotal * 0.05);
        const windowContingency = Math.round(windowTotal * 0.08);
        const windowGross = windowTotal + windowEngineering + windowContingency;
        cost = {
          measureId: 'windows',
          totalCost: Math.round(windowGross * regionalFactor),
          breakdown: {
            equipment: Math.round(windowTotal * 0.55),
            installation: Math.round(windowTotal * 0.45),
            engineering: windowEngineering,
            contingency: windowContingency,
          },
          basisOfEstimate: `${Math.round(windowAreaSqFt).toLocaleString()} sqft window area × $${windowCostPerSqFt}/sqft (triple-glazed)`,
          confidenceLevel: 'budget',
          source: 'Ontario 2025-2026 contractor benchmarks',
        };
        break;
      }

      case 'insulation': {
        // Cost based on opaque wall area, not total floor area
        const floorPlate = areaSqFt / stories;
        const side = Math.sqrt(floorPlate);
        const perimeter = side * 4;
        const wallHeight = stories * 12;
        const wallArea = perimeter * wallHeight;
        const opaqueWallArea = wallArea * 0.65; // 65% opaque (35% windows)
        const insulCostPerSqFt = 10; // $/sqft exterior overcladding (ON 2025-2026)
        const insulTotal = Math.round(opaqueWallArea * insulCostPerSqFt);
        const insulEngineering = Math.round(insulTotal * 0.05);
        const insulContingency = Math.round(insulTotal * 0.10);
        const insulGross = insulTotal + insulEngineering + insulContingency;
        cost = {
          measureId: 'insulation',
          totalCost: Math.round(insulGross * regionalFactor),
          breakdown: {
            equipment: Math.round(insulTotal * 0.40),
            installation: Math.round(insulTotal * 0.50),
            engineering: insulEngineering,
            contingency: insulContingency,
          },
          basisOfEstimate: `${Math.round(opaqueWallArea).toLocaleString()} sqft opaque wall × $${insulCostPerSqFt}/sqft (exterior overcladding)`,
          confidenceLevel: 'budget',
          source: 'Ontario 2025-2026 contractor benchmarks',
        };
        break;
      }

      case 'dhw_heatpump': {
        // Cost based on building type and approximate DHW load
        const dhwBase = 15000; // base cost for heat pump water heater
        const dhwScaler = Math.max(1, areaSqFt / 20000); // scale up for larger buildings
        const dhwTotal = Math.round(dhwBase * dhwScaler);
        cost = {
          measureId: 'dhw_heatpump',
          totalCost: Math.round(dhwTotal * regionalFactor),
          breakdown: {
            equipment: Math.round(dhwTotal * 0.60),
            installation: Math.round(dhwTotal * 0.30),
            engineering: Math.round(dhwTotal * 0.05),
            contingency: Math.round(dhwTotal * 0.05),
          },
          basisOfEstimate: `Heat pump DHW for ${areaSqFt.toLocaleString()} sqft building`,
          confidenceLevel: 'budget',
          source: 'Ontario 2025-2026 contractor benchmarks',
        };
        break;
      }

      case 'electrical_panel': {
        cost = {
          measureId: 'electrical_panel',
          totalCost: Math.round(PANEL_UPGRADE_BASE * regionalFactor),
          breakdown: {
            equipment: Math.round(PANEL_UPGRADE_BASE * 0.50),
            installation: Math.round(PANEL_UPGRADE_BASE * 0.40),
            engineering: Math.round(PANEL_UPGRADE_BASE * 0.10),
            contingency: 0,
          },
          basisOfEstimate: `Fixed $${PANEL_UPGRADE_BASE.toLocaleString()} for building class`,
          confidenceLevel: 'budget',
          source: 'Ontario 2025-2026 contractor benchmarks',
        };
        break;
      }

      default: {
        // Fallback to costPerSqFt for measures without capacity-based costing
        const total = Math.round(m.costPerSqFt * areaSqFt * regionalFactor);
        cost = {
          measureId: m.id,
          totalCost: total,
          breakdown: {
            equipment: Math.round(total * 0.60),
            installation: Math.round(total * 0.30),
            engineering: Math.round(total * 0.05),
            contingency: Math.round(total * 0.05),
          },
          basisOfEstimate: `${areaSqFt.toLocaleString()} sqft × $${m.costPerSqFt}/sqft (benchmark)`,
          confidenceLevel: 'budget',
          source: 'Benchmark estimate',
        };
      }
    }

    measureCosts.push(cost);
  }

  const costBreakdown = measureCosts.map(mc => ({
    id: mc.measureId,
    name: measures.find(m => m.id === mc.measureId)?.name || mc.measureId,
    cost: mc.totalCost,
    basisOfEstimate: mc.basisOfEstimate,
  }));

  return {
    grossCapEx: measureCosts.reduce((sum, mc) => sum + mc.totalCost, 0),
    costBreakdown,
    measureCosts,
  };
}
