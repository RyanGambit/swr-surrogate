import React, { useMemo } from 'react';
import { useApp } from '@/app/store';
import { estimateBaseline, estimatePhysicsImpact } from '@/engine/buildingEngine';
import type { MonthlyEnergyResult } from '@/engine/physics/index';
import { formatCurrencyFull } from '@/utils/formatting';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, LineChart, Line, ComposedChart, Area,
} from 'recharts';
import { Zap, Flame, DollarSign } from 'lucide-react';

type ViewMode = 'electricity' | 'gas' | 'cost';

export const MonthlyProfileChart: React.FC = () => {
  const { state } = useApp();
  const { buildingData, pathways, selectedPathway } = state;

  const pathway = pathways.find(p => p.type === selectedPathway) || pathways[0];

  const impactData = useMemo(() => {
    if (!pathway || !buildingData.areaSqFt) return null;
    try {
      const baseline = estimateBaseline(buildingData);
      const measureIds = pathway.measures.map(m => m.id);
      const impact = estimatePhysicsImpact(
        baseline.physicsParams, baseline.physicsResult, measureIds, buildingData
      );
      return { baseline, impact };
    } catch {
      return null;
    }
  }, [pathway, buildingData]);

  const [viewMode, setViewMode] = React.useState<ViewMode>('electricity');

  if (!impactData || !pathway) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-500">Select a pathway to view monthly energy profiles.</p>
      </div>
    );
  }

  const { impact } = impactData;
  const baselineMonthly = impact.baselineMonthly;
  const retrofitMonthly = impact.retrofitMonthly;

  // Build chart data
  const chartData = baselineMonthly.map((bm, i) => {
    const rm = retrofitMonthly[i];
    return {
      month: bm.label.slice(0, 3),
      baseElec: Math.round(bm.electricity_kWh),
      retroElec: Math.round(rm.electricity_kWh),
      baseGas: Math.round(bm.gas_m3),
      retroGas: Math.round(rm.gas_m3),
      solarGen: Math.round(rm.solarGeneration_kWh),
    };
  });

  // Summaries
  const totalBaseElec = baselineMonthly.reduce((s, m) => s + m.electricity_kWh, 0);
  const totalRetroElec = retrofitMonthly.reduce((s, m) => s + m.electricity_kWh, 0);
  const totalBaseGas = baselineMonthly.reduce((s, m) => s + m.gas_m3, 0);
  const totalRetroGas = retrofitMonthly.reduce((s, m) => s + m.gas_m3, 0);

  const elecChangePct = totalBaseElec > 0 ? Math.round((totalRetroElec - totalBaseElec) / totalBaseElec * 100) : 0;
  const gasChangePct = totalBaseGas > 0 ? Math.round((totalRetroGas - totalBaseGas) / totalBaseGas * 100) : 0;

  const hasASHP = pathway.measures.some(m => m.id === 'ashp');

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* View mode tabs */}
      <div className="flex items-center gap-2">
        <TabButton
          active={viewMode === 'electricity'}
          onClick={() => setViewMode('electricity')}
          icon={<Zap size={14} />}
          label="Electricity"
        />
        <TabButton
          active={viewMode === 'gas'}
          onClick={() => setViewMode('gas')}
          icon={<Flame size={14} />}
          label="Gas"
        />
        <TabButton
          active={viewMode === 'cost'}
          onClick={() => setViewMode('cost')}
          icon={<DollarSign size={14} />}
          label="Cost Summary"
        />
      </div>

      {/* Electricity Chart */}
      {viewMode === 'electricity' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-base font-bold text-slate-900 mb-1 flex items-center gap-2">
            <Zap size={18} className="text-blue-600" />
            Monthly Electricity Profile
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            Baseline vs. post-retrofit electricity consumption (kWh)
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value: number, name: string) => [
                  `${value.toLocaleString()} kWh`,
                  name === 'baseElec' ? 'Baseline' : name === 'retroElec' ? 'Post-Retrofit' : 'Solar Generation',
                ]}
              />
              <Legend
                formatter={(value: string) =>
                  value === 'baseElec' ? 'Baseline' : value === 'retroElec' ? 'Post-Retrofit' : 'Solar PV'
                }
              />
              <Bar dataKey="baseElec" fill="#94a3b8" radius={[2, 2, 0, 0]} barSize={20} />
              <Bar dataKey="retroElec" fill="#3b82f6" radius={[2, 2, 0, 0]} barSize={20} />
              {chartData.some(d => d.solarGen > 0) && (
                <Line
                  type="monotone"
                  dataKey="solarGen"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#f59e0b' }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          {hasASHP && (
            <p className="text-xs text-amber-600 mt-3 bg-amber-50 p-2 rounded">
              Winter electricity increases with ASHP (blue bars taller than grey in Jan-Mar) because heating load shifts from gas to electric. This is expected and accounted for in the savings calculation.
            </p>
          )}
        </div>
      )}

      {/* Gas Chart */}
      {viewMode === 'gas' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-base font-bold text-slate-900 mb-1 flex items-center gap-2">
            <Flame size={18} className="text-orange-600" />
            Monthly Gas Profile
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            Baseline vs. post-retrofit gas consumption (m³)
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value: number, name: string) => [
                  `${value.toLocaleString()} m³`,
                  name === 'baseGas' ? 'Baseline' : 'Post-Retrofit',
                ]}
              />
              <Legend
                formatter={(value: string) =>
                  value === 'baseGas' ? 'Baseline' : 'Post-Retrofit'
                }
              />
              <Bar dataKey="baseGas" fill="#94a3b8" radius={[2, 2, 0, 0]} barSize={20} />
              <Bar dataKey="retroGas" fill="#3b82f6" radius={[2, 2, 0, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Cost Summary */}
      {viewMode === 'cost' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
            <DollarSign size={18} className="text-emerald-600" />
            Annual Energy Cost Summary
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <CostCard
              label="Baseline Electricity"
              value={impact.baselineAnnualElecCost}
              sublabel={`${Math.round(totalBaseElec).toLocaleString()} kWh`}
            />
            <CostCard
              label="Post-Retrofit Electricity"
              value={impact.retrofitAnnualElecCost}
              sublabel={`${Math.round(totalRetroElec).toLocaleString()} kWh`}
              change={impact.retrofitAnnualElecCost - impact.baselineAnnualElecCost}
            />
            <CostCard
              label="Baseline Gas"
              value={impact.baselineAnnualGasCost}
              sublabel={`${Math.round(totalBaseGas).toLocaleString()} m³`}
            />
            <CostCard
              label="Post-Retrofit Gas"
              value={impact.retrofitAnnualGasCost}
              sublabel={`${Math.round(totalRetroGas).toLocaleString()} m³`}
              change={impact.retrofitAnnualGasCost - impact.baselineAnnualGasCost}
            />
          </div>

          <div className="mt-4 p-4 bg-slate-50 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-slate-500">Net Annual Savings</span>
                <div className="text-lg font-bold text-emerald-700">
                  {formatCurrencyFull(impact.annualEnergyCostSavings)}
                </div>
              </div>
              {impact.demandChargeIncrease > 0 && (
                <div>
                  <span className="text-slate-500">Demand Charge Impact</span>
                  <div className="text-lg font-bold text-amber-600">
                    +{formatCurrencyFull(impact.demandChargeIncrease)}/yr
                  </div>
                </div>
              )}
              <div>
                <span className="text-slate-500">Electricity Change</span>
                <div className={`text-lg font-bold ${elecChangePct <= 0 ? 'text-emerald-700' : 'text-amber-600'}`}>
                  {elecChangePct > 0 ? '+' : ''}{elecChangePct}%
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryBadge
          label="Annual Electricity"
          before={`${Math.round(totalBaseElec / 1000).toLocaleString()}k kWh`}
          after={`${Math.round(totalRetroElec / 1000).toLocaleString()}k kWh`}
          changePct={elecChangePct}
        />
        <SummaryBadge
          label="Annual Gas"
          before={`${Math.round(totalBaseGas).toLocaleString()} m³`}
          after={`${Math.round(totalRetroGas).toLocaleString()} m³`}
          changePct={gasChangePct}
        />
        <SummaryBadge
          label="Annual Cost"
          before={formatCurrencyFull(impact.baselineAnnualElecCost + impact.baselineAnnualGasCost)}
          after={formatCurrencyFull(impact.retrofitAnnualElecCost + impact.retrofitAnnualGasCost)}
          changePct={
            (impact.baselineAnnualElecCost + impact.baselineAnnualGasCost) > 0
              ? Math.round(
                  ((impact.retrofitAnnualElecCost + impact.retrofitAnnualGasCost) -
                   (impact.baselineAnnualElecCost + impact.baselineAnnualGasCost)) /
                  (impact.baselineAnnualElecCost + impact.baselineAnnualGasCost) * 100
                )
              : 0
          }
        />
        <SummaryBadge
          label="GHG Reduction"
          before=""
          after={`${impact.ghgReductionPct}%`}
          changePct={-impact.ghgReductionPct}
          isGHG
        />
      </div>
    </div>
  );
};

// ─── Sub-components ──────────────────────────────────────────────────────────

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}> = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
      active
        ? 'bg-slate-800 text-white'
        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }`}
  >
    {icon}
    {label}
  </button>
);

const CostCard: React.FC<{
  label: string;
  value: number;
  sublabel: string;
  change?: number;
}> = ({ label, value, sublabel, change }) => (
  <div className="p-3 bg-slate-50 rounded-lg">
    <div className="text-xs text-slate-500 font-medium">{label}</div>
    <div className="text-lg font-bold text-slate-800">{formatCurrencyFull(value)}</div>
    <div className="text-xs text-slate-400">{sublabel}</div>
    {change !== undefined && change !== 0 && (
      <div className={`text-xs font-medium mt-1 ${change < 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
        {change > 0 ? '+' : ''}{formatCurrencyFull(change)}/yr
      </div>
    )}
  </div>
);

const SummaryBadge: React.FC<{
  label: string;
  before: string;
  after: string;
  changePct: number;
  isGHG?: boolean;
}> = ({ label, before, after, changePct, isGHG }) => (
  <div className="bg-white rounded-lg border border-slate-200 p-3">
    <div className="text-xs text-slate-500 font-medium mb-1">{label}</div>
    {!isGHG && before && (
      <div className="text-xs text-slate-400 line-through">{before}</div>
    )}
    <div className="text-sm font-bold text-slate-800">{after}</div>
    <div className={`text-xs font-semibold ${changePct <= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
      {changePct > 0 ? '+' : ''}{changePct}%
    </div>
  </div>
);

export default MonthlyProfileChart;
