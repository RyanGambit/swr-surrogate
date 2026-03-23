import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { BuildingData, RetrofitMeasure } from '@/types';
import type { PhysicsResult, BuildingPhysicsParams } from '@/types/physics';
import { estimateBaseline, estimatePhysicsImpact } from '@/engine/buildingEngine';
import { getApplicableMeasures, calculateMeasureCosts, MEASURE_CATALOG } from '@/engine/measureEngine';
import { calculateIncentiveStack } from '@/engine/incentiveEngine';
// Rate-engine costs come from fullImpact (estimatePhysicsImpact)
import { useApp } from '@/app/store';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts';
// 3D model removed per user request

interface RetrofitVisualizerProps {
  building: Partial<BuildingData>;
}

interface MeasureImpactRanking {
  measure: RetrofitMeasure;
  ghgReductionPct: number;
  euiReduction: number;
  cost: number;
  costSavings: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Space Heating': '#ef4444',
  'Space Cooling': '#3b82f6',
  'Lighting': '#fbbf24',
  'Equipment': '#8b5cf6',
  'Ventilation': '#6b7280',
  'DHW': '#f97316',
};

// Monthly heating/cooling distribution profiles for Ontario climate
const MONTHLY_HEATING_PROFILE = [0.18, 0.16, 0.13, 0.07, 0.02, 0.0, 0.0, 0.0, 0.01, 0.06, 0.13, 0.17];
const MONTHLY_COOLING_PROFILE = [0.0, 0.0, 0.01, 0.04, 0.10, 0.22, 0.28, 0.25, 0.12, 0.03, 0.0, 0.0];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function RetrofitVisualizer({ building }: RetrofitVisualizerProps) {
  const { state } = useApp();
  const selectedPw = state.pathways.find(p => p.type === state.selectedPathway);

  const [activeMeasures, setActiveMeasures] = useState<string[]>(() => {
    if (selectedPw) return selectedPw.measures.map(m => m.id);
    return [];
  });
  // Sync activeMeasures when the selected pathway changes after initial mount
  const prevPathwayRef = useRef(state.selectedPathway);
  useEffect(() => {
    if (state.selectedPathway !== prevPathwayRef.current) {
      prevPathwayRef.current = state.selectedPathway;
      if (selectedPw) {
        setActiveMeasures(selectedPw.measures.map(m => m.id));
      }
    } else if (activeMeasures.length === 0 && selectedPw) {
      // Initial load: pathways arrived after component mounted
      setActiveMeasures(selectedPw.measures.map(m => m.id));
    }
  }, [selectedPw, state.selectedPathway]);

  // Compute baseline once
  const baseline = useMemo(() => {
    try {
      return estimateBaseline(building);
    } catch {
      return null;
    }
  }, [building.areaSqFt, building.stories, building.yearBuilt, building.archetype, building.province]);

  // Available measures for this building
  const applicableMeasures = useMemo(() => {
    return getApplicableMeasures(building);
  }, [building.archetype]);

  const availableMeasureIds = useMemo(() => applicableMeasures.map(m => m.id), [applicableMeasures]);

  // Compute retrofit result when measures are toggled
  const retrofitResult = useMemo(() => {
    if (!baseline || activeMeasures.length === 0) return undefined;
    try {
      const impact = estimatePhysicsImpact(
        baseline.physicsParams, baseline.physicsResult, activeMeasures, building
      );
      return impact.retrofitResult;
    } catch {
      return undefined;
    }
  }, [baseline, activeMeasures, building]);

  // Full impact data for incentive calculations
  const fullImpact = useMemo(() => {
    if (!baseline || activeMeasures.length === 0) return undefined;
    try {
      return estimatePhysicsImpact(
        baseline.physicsParams, baseline.physicsResult, activeMeasures, building
      );
    } catch {
      return undefined;
    }
  }, [baseline, activeMeasures, building]);

  // Measure impact ranking: run each measure individually to rank by GHG impact
  const measureRankings = useMemo((): MeasureImpactRanking[] => {
    if (!baseline) return [];

    const rankings: MeasureImpactRanking[] = [];
    const areaSqFt = building.areaSqFt || 10000;

    for (const measure of applicableMeasures) {
      try {
        const impact = estimatePhysicsImpact(
          baseline.physicsParams, baseline.physicsResult, [measure.id], building
        );
        const costResult = calculateMeasureCosts([measure], areaSqFt);
        const costSavings = impact.annualEnergyCostSavings;
        rankings.push({
          measure,
          ghgReductionPct: impact.ghgReductionPct,
          euiReduction: baseline.physicsResult.totalEUI_ekWh_m2 - impact.retrofitResult.totalEUI_ekWh_m2,
          cost: costResult.grossCapEx,
          costSavings,
        });
      } catch {
        // Skip measures that fail calculation
      }
    }

    return rankings.sort((a, b) => b.euiReduction - a.euiReduction);
  }, [baseline, applicableMeasures, building]);

  // Incentive stack for active measures
  const incentiveStack = useMemo(() => {
    if (!baseline || activeMeasures.length === 0 || !fullImpact) return undefined;
    try {
      const selectedMeasures = applicableMeasures.filter(m => activeMeasures.includes(m.id));
      const areaSqFt = building.areaSqFt || 10000;
      const costResult = calculateMeasureCosts(selectedMeasures, areaSqFt);
      return calculateIncentiveStack({
        measures: selectedMeasures,
        grossCapEx: costResult.grossCapEx,
        building,
        ghgReductionPct: fullImpact.ghgReductionDecimal,
        orgType: 'private_corporation',
      });
    } catch {
      return undefined;
    }
  }, [baseline, activeMeasures, fullImpact, applicableMeasures, building]);

  // Cost breakdown for active measures
  const activeCostBreakdown = useMemo(() => {
    if (activeMeasures.length === 0) return undefined;
    const selectedMeasures = applicableMeasures.filter(m => activeMeasures.includes(m.id));
    const areaSqFt = building.areaSqFt || 10000;
    return calculateMeasureCosts(selectedMeasures, areaSqFt);
  }, [activeMeasures, applicableMeasures, building.areaSqFt]);

  // Deep retrofit nudge: check if user has only Light pathway measures
  const deepRetrofitNudge = useMemo(() => {
    if (!baseline || !fullImpact || activeMeasures.length === 0) return null;

    const lightMeasureIds = ['led_upgrade', 'bas_controls', 'pipe_insulation'];
    const allAreLight = activeMeasures.every(id => lightMeasureIds.includes(id));
    const hasASHP = activeMeasures.includes('ashp');
    const hasInsulation = activeMeasures.includes('insulation');

    if (!allAreLight || hasASHP || hasInsulation) return null;

    // Calculate what adding ASHP + insulation would do
    try {
      const deepIds = [...activeMeasures, 'ashp', 'insulation'];
      const deepImpact = estimatePhysicsImpact(
        baseline.physicsParams, baseline.physicsResult, deepIds, building
      );
      const additionalGHGPct = deepImpact.ghgReductionPct - fullImpact.ghgReductionPct;
      const wouldUnlockCIB = deepImpact.ghgReductionPct >= 30;

      return {
        additionalGHGPct,
        totalGHGPct: deepImpact.ghgReductionPct,
        wouldUnlockCIB,
      };
    } catch {
      return null;
    }
  }, [baseline, fullImpact, activeMeasures, building]);

  const handleMeasureToggle = useCallback((measureId: string) => {
    setActiveMeasures(prev =>
      prev.includes(measureId)
        ? prev.filter(id => id !== measureId)
        : [...prev, measureId]
    );
  }, []);

  if (!baseline) {
    return (
      <div className="w-full h-[500px] bg-slate-100 rounded-xl flex items-center justify-center">
        <p className="text-sm text-slate-500">Enter building details to see energy analysis</p>
      </div>
    );
  }

  // Summary stats
  const baseResult = baseline.physicsResult;
  const currentResult = retrofitResult || baseResult;
  const hasRetrofit = !!retrofitResult;
  const ghgPct = hasRetrofit && baseResult.ghg_tCO2e > 0
    ? Math.round(((baseResult.ghg_tCO2e - retrofitResult!.ghg_tCO2e) / baseResult.ghg_tCO2e) * 100)
    : 0;

  // Annual savings from rate engine (accurate with demand charges)
  const annualSavings = hasRetrofit && fullImpact ? fullImpact.annualEnergyCostSavings : 0;
  const grossCost = activeCostBreakdown?.grossCapEx || 0;
  const totalIncentives = incentiveStack?.totalGrants || 0;
  const netCost = grossCost - totalIncentives;
  const simplePayback = annualSavings > 0 ? netCost / annualSavings : 0;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      {hasRetrofit && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-[10px] uppercase text-green-600 font-semibold">EUI Reduction</p>
                <p className="text-lg font-bold text-green-800">
                  {baseResult.totalEUI_ekWh_m2 - currentResult.totalEUI_ekWh_m2} ekWh/m²
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-green-600 font-semibold">GHG Reduction</p>
                <p className="text-lg font-bold text-green-800">{ghgPct}%</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-green-600 font-semibold">Gas Savings</p>
                <p className="text-lg font-bold text-green-800">
                  {Math.round(baseResult.gas.total_m3 - currentResult.gas.total_m3)} m³/yr
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-green-600 font-semibold">Solar Gen</p>
                <p className="text-lg font-bold text-green-800">
                  {Math.round(currentResult.solarGeneration_kWh / 1000)} MWh/yr
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">{activeMeasures.length} measures selected</p>
              {activeCostBreakdown && (
                <p className="text-xs text-slate-600 font-medium">
                  ${activeCostBreakdown.grossCapEx.toLocaleString()} total cost
                </p>
              )}
              <button
                onClick={() => setActiveMeasures([])}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Measure Impact Ranking */}
      {measureRankings.length > 0 && (
        <MeasureImpactChart
          rankings={measureRankings}
          activeMeasures={activeMeasures}
          onToggle={handleMeasureToggle}
        />
      )}

      {/* Deep Retrofit Nudge */}
      {deepRetrofitNudge && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <span className="text-amber-600 text-lg leading-none mt-0.5">*</span>
            <div>
              <p className="text-sm font-semibold text-amber-800">Unlock deeper savings</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Adding <strong>ASHP + insulation</strong> would reduce GHG by an additional{' '}
                <strong>{deepRetrofitNudge.additionalGHGPct}%</strong> (total {deepRetrofitNudge.totalGHGPct}%)
                {deepRetrofitNudge.wouldUnlockCIB && (
                  <> and <strong>unlock CIB financing at 2-3%</strong> interest (vs 6-7% commercial)</>
                )}.
              </p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => {
                    if (!activeMeasures.includes('ashp')) handleMeasureToggle('ashp');
                    if (!activeMeasures.includes('insulation')) handleMeasureToggle('insulation');
                  }}
                  className="text-xs bg-amber-600 text-white px-3 py-1 rounded hover:bg-amber-700 transition-colors"
                >
                  Add ASHP + Insulation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Energy End-Use Comparison (Stacked Bar) */}
        <EnergyEndUseChart baseResult={baseResult} retrofitResult={currentResult} hasRetrofit={hasRetrofit} />

        {/* Monthly Energy Profile */}
        <MonthlyEnergyProfile baseResult={baseResult} retrofitResult={currentResult} hasRetrofit={hasRetrofit} />

        {/* GHG Waterfall Chart */}
        {hasRetrofit && measureRankings.length > 0 && (
          <GHGWaterfallChart
            baselineGHG={baseResult.ghg_tCO2e}
            measureRankings={measureRankings}
            activeMeasures={activeMeasures}
          />
        )}

        {/* Cost vs Savings Summary */}
        {hasRetrofit && (
          <CostSavingsSummary
            grossCost={grossCost}
            totalIncentives={totalIncentives}
            netCost={netCost}
            annualSavings={annualSavings}
            simplePayback={simplePayback}
          />
        )}
      </div>

    </div>
  );
}

// ─── Energy End-Use Comparison Chart ──────────────────────────────────────────

function EnergyEndUseChart({ baseResult, retrofitResult, hasRetrofit }: {
  baseResult: PhysicsResult;
  retrofitResult: PhysicsResult;
  hasRetrofit: boolean;
}) {
  const data = useMemo(() => {
    const categories = baseResult.loadBreakdown.map(item => item.category);
    return categories.map(cat => {
      const baseItem = baseResult.loadBreakdown.find(i => i.category === cat);
      const retroItem = retrofitResult.loadBreakdown.find(i => i.category === cat);
      return {
        category: cat,
        baseline: Math.round(baseItem?.total_kWh || 0),
        retrofit: hasRetrofit ? Math.round(retroItem?.total_kWh || 0) : undefined,
      };
    });
  }, [baseResult, retrofitResult, hasRetrofit]);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <p className="text-xs font-semibold text-slate-700 mb-3 uppercase tracking-wide">
        Energy End-Use Breakdown {hasRetrofit ? '- Baseline vs Retrofit' : '- Baseline'}
      </p>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="category" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} label={{ value: 'kWh/yr', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
            <Tooltip
              formatter={(value: number, name: string) => [`${value.toLocaleString()} kWh`, name === 'baseline' ? 'Baseline' : 'Post-Retrofit']}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend formatter={(value: string) => value === 'baseline' ? 'Baseline' : 'Post-Retrofit'} />
            <Bar dataKey="baseline" fill="#94a3b8" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={index} fill={CATEGORY_COLORS[entry.category] || '#94a3b8'} fillOpacity={0.4} />
              ))}
            </Bar>
            {hasRetrofit && (
              <Bar dataKey="retrofit" fill="#22c55e" radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell key={index} fill={CATEGORY_COLORS[entry.category] || '#94a3b8'} fillOpacity={1} />
                ))}
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-slate-400 mt-1">
        {hasRetrofit ? 'Faded bars = baseline, solid bars = post-retrofit' : 'Showing baseline energy consumption by end use'}
      </p>
    </div>
  );
}

// ─── Monthly Energy Profile ──────────────────────────────────────────────────

function MonthlyEnergyProfile({ baseResult, retrofitResult, hasRetrofit }: {
  baseResult: PhysicsResult;
  retrofitResult: PhysicsResult;
  hasRetrofit: boolean;
}) {
  const data = useMemo(() => {
    const baseHeating = baseResult.loadBreakdown.find(i => i.category === 'Space Heating')?.total_kWh || 0;
    const baseCooling = baseResult.loadBreakdown.find(i => i.category === 'Space Cooling')?.total_kWh || 0;
    const baseOther = baseResult.loadBreakdown
      .filter(i => i.category !== 'Space Heating' && i.category !== 'Space Cooling')
      .reduce((s, i) => s + i.total_kWh, 0);
    const monthlyBaseOther = baseOther / 12;

    const retroHeating = retrofitResult.loadBreakdown.find(i => i.category === 'Space Heating')?.total_kWh || 0;
    const retroCooling = retrofitResult.loadBreakdown.find(i => i.category === 'Space Cooling')?.total_kWh || 0;
    const retroOther = retrofitResult.loadBreakdown
      .filter(i => i.category !== 'Space Heating' && i.category !== 'Space Cooling')
      .reduce((s, i) => s + i.total_kWh, 0);
    const monthlyRetroOther = retroOther / 12;

    return MONTH_LABELS.map((month, i) => ({
      month,
      baseline: Math.round(
        baseHeating * MONTHLY_HEATING_PROFILE[i] +
        baseCooling * MONTHLY_COOLING_PROFILE[i] +
        monthlyBaseOther
      ),
      ...(hasRetrofit ? {
        retrofit: Math.round(
          retroHeating * MONTHLY_HEATING_PROFILE[i] +
          retroCooling * MONTHLY_COOLING_PROFILE[i] +
          monthlyRetroOther
        ),
      } : {}),
    }));
  }, [baseResult, retrofitResult, hasRetrofit]);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <p className="text-xs font-semibold text-slate-700 mb-3 uppercase tracking-wide">
        Monthly Energy Profile
      </p>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={-1} barCategoryGap="15%">
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} label={{ value: 'kWh', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
            <Tooltip
              formatter={(value: number, name: string) => [`${value.toLocaleString()} kWh`, name === 'baseline' ? 'Baseline' : 'Post-Retrofit']}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend formatter={(value: string) => value === 'baseline' ? 'Baseline' : 'Post-Retrofit'} />
            <Bar dataKey="baseline" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
            {hasRetrofit && <Bar dataKey="retrofit" fill="#22c55e" radius={[4, 4, 0, 0]} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-slate-400 mt-1">
        Simulated monthly distribution based on Ontario climate (heating-dominant winters, cooling in summer)
      </p>
    </div>
  );
}

// ─── GHG Waterfall Chart ─────────────────────────────────────────────────────

function GHGWaterfallChart({ baselineGHG, measureRankings, activeMeasures }: {
  baselineGHG: number;
  measureRankings: MeasureImpactRanking[];
  activeMeasures: string[];
}) {
  const data = useMemo(() => {
    const activeRankings = measureRankings.filter(r => activeMeasures.includes(r.measure.id));
    if (activeRankings.length === 0) return [];

    const items: { name: string; value: number; cumulative: number; isTotal?: boolean; fill: string }[] = [];

    // Start with baseline
    items.push({
      name: 'Baseline',
      value: Math.round(baselineGHG * 10) / 10,
      cumulative: 0,
      fill: '#64748b',
    });

    let remaining = baselineGHG;
    for (const ranking of activeRankings) {
      const reduction = baselineGHG * (ranking.ghgReductionPct / 100);
      remaining -= reduction;
      items.push({
        name: ranking.measure.name.length > 15 ? ranking.measure.name.slice(0, 14) + '...' : ranking.measure.name,
        value: -Math.round(reduction * 10) / 10,
        cumulative: Math.round(Math.max(0, remaining) * 10) / 10,
        fill: '#22c55e',
      });
    }

    // Final total
    items.push({
      name: 'Post-Retrofit',
      value: Math.round(Math.max(0, remaining) * 10) / 10,
      cumulative: 0,
      isTotal: true,
      fill: '#0ea5e9',
    });

    return items;
  }, [baselineGHG, measureRankings, activeMeasures]);

  if (data.length === 0) return null;

  // For waterfall, we use stacked bars with invisible base + visible segment
  const waterfallData = data.map((item, i) => {
    if (i === 0 || item.isTotal) {
      return { name: item.name, base: 0, segment: item.value, fill: item.fill };
    }
    return {
      name: item.name,
      base: item.cumulative,
      segment: Math.abs(item.value),
      fill: item.fill,
    };
  });

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <p className="text-xs font-semibold text-slate-700 mb-3 uppercase tracking-wide">
        GHG Reduction Waterfall (tCO2e/yr)
      </p>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={waterfallData} barCategoryGap="15%">
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={0} textAnchor="middle" height={40} />
            <YAxis tick={{ fontSize: 11 }} label={{ value: 'tCO2e/yr', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
            <Tooltip
              formatter={(value: number, name: string) => {
                if (name === 'base') return [null, null];
                return [`${value.toFixed(1)} tCO2e`, 'Change'];
              }}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="base" stackId="waterfall" fill="transparent" />
            <Bar dataKey="segment" stackId="waterfall" radius={[4, 4, 0, 0]}>
              {waterfallData.map((entry, index) => (
                <Cell key={index} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-slate-400 mt-1">
        Shows how each selected measure contributes to total GHG reduction. Note: individual reductions may not sum linearly due to interaction effects.
      </p>
    </div>
  );
}

// ─── Cost vs Savings Summary ─────────────────────────────────────────────────

function CostSavingsSummary({ grossCost, totalIncentives, netCost, annualSavings, simplePayback }: {
  grossCost: number;
  totalIncentives: number;
  netCost: number;
  annualSavings: number;
  simplePayback: number;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <p className="text-xs font-semibold text-slate-700 mb-3 uppercase tracking-wide">
        Cost vs Savings Summary
      </p>
      <div className="grid grid-cols-5 gap-3">
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <p className="text-[10px] text-slate-500 uppercase font-medium">Gross Cost</p>
          <p className="text-lg font-bold text-slate-800">${grossCost.toLocaleString()}</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <p className="text-[10px] text-blue-600 uppercase font-medium">Incentives</p>
          <p className="text-lg font-bold text-blue-700">{totalIncentives > 0 ? `-$${totalIncentives.toLocaleString()}` : '$0'}</p>
        </div>
        <div className="bg-emerald-50 rounded-lg p-3 text-center">
          <p className="text-[10px] text-emerald-600 uppercase font-medium">Net Cost</p>
          <p className="text-lg font-bold text-emerald-800">${(netCost || 0).toLocaleString()}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <p className="text-[10px] text-green-600 uppercase font-medium">Annual Savings</p>
          <p className="text-lg font-bold text-green-700">${Math.round(annualSavings || 0).toLocaleString()}/yr</p>
        </div>
        <div className={`rounded-lg p-3 text-center ${simplePayback > 0 && simplePayback <= 10 ? 'bg-green-50' : simplePayback > 0 && simplePayback <= 20 ? 'bg-amber-50' : 'bg-slate-50'}`}>
          <p className="text-[10px] text-slate-500 uppercase font-medium">Payback</p>
          <p className={`text-lg font-bold ${simplePayback > 0 && simplePayback <= 10 ? 'text-green-700' : simplePayback > 0 && simplePayback <= 20 ? 'text-amber-700' : 'text-slate-500'}`}>
            {simplePayback > 0 && isFinite(simplePayback) ? `${simplePayback.toFixed(1)} yrs` : 'N/A'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Measure Impact Ranking Chart ─────────────────────────────────────────────

function MeasureImpactChart({ rankings, activeMeasures, onToggle }: {
  rankings: MeasureImpactRanking[];
  activeMeasures: string[];
  onToggle: (id: string) => void;
}) {
  const maxEUI = Math.max(...rankings.map(r => r.euiReduction), 1);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <p className="text-xs font-semibold text-slate-700 mb-3 uppercase tracking-wide">
        Measure Impact Ranking (Energy Reduction)
      </p>
      <div className="space-y-2">
        {rankings.map((item, idx) => {
          const isActive = activeMeasures.includes(item.measure.id);
          const barWidth = maxEUI > 0 ? (item.euiReduction / maxEUI) * 100 : 0;
          const isTopMeasure = idx === 0;

          return (
            <div key={item.measure.id} className="flex items-center gap-2 group">
              <button
                onClick={() => onToggle(item.measure.id)}
                className={`w-4 h-4 rounded border-2 flex-shrink-0 transition-all ${
                  isActive
                    ? 'bg-green-500 border-green-500'
                    : 'border-slate-300 hover:border-slate-400'
                }`}
              >
                {isActive && (
                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 12">
                    <path d="M3 6l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
              </button>
              <span className="text-[11px] text-slate-700 w-40 truncate flex-shrink-0" title={item.measure.name}>
                {item.measure.name}
              </span>
              <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden relative">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isTopMeasure ? 'bg-green-500' : 'bg-green-400'
                  } ${isActive ? 'opacity-100' : 'opacity-60'}`}
                  style={{ width: `${Math.min(100, barWidth)}%` }}
                />
                <span className="absolute inset-y-0 left-2 flex items-center text-[10px] font-medium text-slate-800">
                  {item.euiReduction} EUI {item.ghgReductionPct > 0 ? `| ${item.ghgReductionPct}% GHG` : ''}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 w-24 text-right flex-shrink-0">
                ${item.costSavings.toLocaleString()}/yr savings
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-slate-400 mt-2">
        Click checkboxes to toggle measures. Ranked by EUI reduction (ekWh/m²).
      </p>
    </div>
  );
}

