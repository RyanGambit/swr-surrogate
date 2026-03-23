import { generateProForma, type ProFormaParams } from './financialEngine';

export interface SensitivityResult {
  iterations: number;
  npvDistribution: number[];
  paybackDistribution: number[];
  irrDistribution: number[];
  percentiles: {
    p10: { npv: number; payback: number; irr: number };
    p25: { npv: number; payback: number; irr: number };
    p50: { npv: number; payback: number; irr: number };
    p75: { npv: number; payback: number; irr: number };
    p90: { npv: number; payback: number; irr: number };
  };
  npvPositivePct: number;
  paybackUnder10Pct: number;
}

export interface SensitivityRanges {
  energySavings: [number, number];
  projectCost: [number, number];
  solarGeneration: [number, number];
  escalationRate: [number, number];
  capRate: [number, number];
  discountRate: [number, number];
  occupancyRate: [number, number];
}

const DEFAULT_RANGES: SensitivityRanges = {
  energySavings: [-0.25, 0.15],
  projectCost: [-0.10, 0.25],
  solarGeneration: [-0.15, 0.10],
  escalationRate: [0.01, 0.04],
  capRate: [0.055, 0.085],
  discountRate: [0.05, 0.10],
  occupancyRate: [0.70, 0.95],
};

function sampleUniform(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function sampleTriangular(min: number, mode: number, max: number): number {
  const u = Math.random();
  const f = (mode - min) / (max - min);
  if (u < f) {
    return min + Math.sqrt(u * (max - min) * (mode - min));
  } else {
    return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
  }
}

export function runMonteCarlo(
  baseParams: ProFormaParams,
  iterations: number = 500,
  ranges: SensitivityRanges = DEFAULT_RANGES,
): SensitivityResult {
  const npvs: number[] = [];
  const paybacks: number[] = [];
  const irrs: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const energyFactor = 1 + sampleTriangular(ranges.energySavings[0], 0, ranges.energySavings[1]);
    const costFactor = 1 + sampleTriangular(ranges.projectCost[0], 0.05, ranges.projectCost[1]);
    const solarFactor = 1 + sampleUniform(ranges.solarGeneration[0], ranges.solarGeneration[1]);
    const escalation = sampleTriangular(ranges.escalationRate[0], 0.02, ranges.escalationRate[1]);
    const discount = sampleUniform(ranges.discountRate[0], ranges.discountRate[1]);
    const occupancy = sampleTriangular(ranges.occupancyRate[0], baseParams.occupancyRate, ranges.occupancyRate[1]);

    const scenarioParams: ProFormaParams = {
      ...baseParams,
      grossCapEx: Math.round(baseParams.grossCapEx * costFactor),
      netCapEx: Math.round(baseParams.netCapEx * costFactor),
      annualEnergySavings: Math.round(baseParams.annualEnergySavings * energyFactor),
      annualSolarRevenue: Math.round(baseParams.annualSolarRevenue * solarFactor),
      escalationRate: escalation,
      discountRate: discount,
      occupancyRate: occupancy,
    };

    try {
      const result = generateProForma(scenarioParams);
      npvs.push(result.npv);
      paybacks.push(result.paybackYear);
      if (result.irr !== null) irrs.push(result.irr);
    } catch {
      // Skip failed scenarios
    }
  }

  npvs.sort((a, b) => a - b);
  paybacks.sort((a, b) => a - b);
  irrs.sort((a, b) => a - b);

  const pctile = (arr: number[], p: number) =>
    arr[Math.floor(arr.length * p / 100)] ?? 0;

  return {
    iterations: npvs.length,
    npvDistribution: npvs,
    paybackDistribution: paybacks,
    irrDistribution: irrs,
    percentiles: {
      p10: { npv: pctile(npvs, 10), payback: pctile(paybacks, 10), irr: pctile(irrs, 10) },
      p25: { npv: pctile(npvs, 25), payback: pctile(paybacks, 25), irr: pctile(irrs, 25) },
      p50: { npv: pctile(npvs, 50), payback: pctile(paybacks, 50), irr: pctile(irrs, 50) },
      p75: { npv: pctile(npvs, 75), payback: pctile(paybacks, 75), irr: pctile(irrs, 75) },
      p90: { npv: pctile(npvs, 90), payback: pctile(paybacks, 90), irr: pctile(irrs, 90) },
    },
    npvPositivePct: Math.round(npvs.filter(n => n > 0).length / npvs.length * 100),
    paybackUnder10Pct: Math.round(paybacks.filter(p => p <= 10).length / paybacks.length * 100),
  };
}
