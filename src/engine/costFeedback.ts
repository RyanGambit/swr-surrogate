// ─── Cost Feedback Loop ──────────────────────────────────────────────────────
// Mechanism for collecting real-world cost data to improve estimates over time.
// V1: localStorage collection. V2+: backend aggregation.

export interface CostDatapoint {
  id: string;
  timestamp: number;
  buildingType: string;
  buildingArea_sqft: number;
  city: string;
  province: string;
  measureId: string;
  capacity: number;        // kW for ASHP, kW-DC for solar, fixtures for LED
  capacityUnit: string;
  quotedCost: number;
  actualCost?: number;     // filled in after project completion
  contractorAnonymized: boolean;
  year: number;
  confidenceLevel: 'quote' | 'actual' | 'estimate';
}

export interface CostBenchmark {
  measureId: string;
  region: string;
  sampleSize: number;
  medianCostPerUnit: number;
  p25CostPerUnit: number;
  p75CostPerUnit: number;
  unit: string;
  lastUpdated: number;
}

const STORAGE_KEY = 'scout_cost_datapoints';

export function saveCostDatapoint(datapoint: CostDatapoint): void {
  const existing = loadCostDatapoints();
  existing.push(datapoint);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
}

export function loadCostDatapoints(): CostDatapoint[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function generateBenchmarks(datapoints: CostDatapoint[]): CostBenchmark[] {
  // Group by measureId and region
  const groups = new Map<string, CostDatapoint[]>();
  for (const dp of datapoints) {
    const key = `${dp.measureId}:${dp.province}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(dp);
  }

  const benchmarks: CostBenchmark[] = [];
  for (const [key, dps] of groups) {
    if (dps.length < 3) continue; // need minimum sample size

    const [measureId, region] = key.split(':');
    const costs = dps
      .map(d => {
        const cost = d.actualCost || d.quotedCost;
        return d.capacity > 0 ? cost / d.capacity : 0;
      })
      .filter(c => c > 0)
      .sort((a, b) => a - b);

    if (costs.length < 3) continue;

    benchmarks.push({
      measureId,
      region,
      sampleSize: costs.length,
      medianCostPerUnit: costs[Math.floor(costs.length / 2)],
      p25CostPerUnit: costs[Math.floor(costs.length * 0.25)],
      p75CostPerUnit: costs[Math.floor(costs.length * 0.75)],
      unit: getUnitForMeasure(measureId),
      lastUpdated: Date.now(),
    });
  }

  return benchmarks;
}

function getUnitForMeasure(measureId: string): string {
  switch (measureId) {
    case 'ashp': return 'kW';
    case 'solar_pv': return 'kW-DC';
    case 'led_upgrade': return 'fixture';
    case 'bas_controls': return 'sqft';
    default: return 'sqft';
  }
}
