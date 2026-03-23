import React, { useMemo } from 'react';
import { useApp } from '@/app/store';
import { runMonteCarlo, type SensitivityResult } from '@/engine/sensitivityEngine';
import { generateProForma, type ProFormaParams } from '@/engine/financialEngine';
import { formatCurrencyFull } from '@/utils/formatting';
import {
  DEFAULT_DISCOUNT_RATE, DEFAULT_ESCALATION_RATE, DEFAULT_CIB_RATE,
  DEFAULT_COMMERCIAL_RATE, DEFAULT_LOAN_TERM, DEFAULT_CAP_RATE,
} from '@/constants/rates';
import { ShieldCheck, BarChart3, TrendingUp } from 'lucide-react';

export const SensitivityPanel: React.FC = () => {
  const { state } = useApp();
  const { pathways, selectedPathway, buildingData } = state;

  const pathway = pathways.find(p => p.type === selectedPathway) || pathways[0];

  const sensitivity = useMemo((): SensitivityResult | null => {
    if (!pathway) return null;
    try {
      const params: ProFormaParams = {
        grossCapEx: pathway.grossCapitalCost,
        netCapEx: pathway.netCost,
        equityPct: 0.20,
        annualEnergySavings: pathway.annualSavings,
        annualSolarRevenue: 0,
        annualSubmeteringNOI: 0,
        ctItcAmount: 0,
        bridgeFinancingNeeded: 0,
        upfrontGrants: pathway.totalIncentives,
        loanRate: DEFAULT_COMMERCIAL_RATE,
        loanTerm: DEFAULT_LOAN_TERM,
        discountRate: DEFAULT_DISCOUNT_RATE,
        escalationRate: DEFAULT_ESCALATION_RATE,
        cibRate: DEFAULT_CIB_RATE,
        cibEligible: pathway.cibEligible,
        capRate: buildingData.capRate || DEFAULT_CAP_RATE,
        rentPerSqft: buildingData.rentPerSqft || 20,
        areaSqFt: buildingData.areaSqFt || 10000,
        occupancyRate: buildingData.occupancyRate || 0.9,
        baselineGasM3: buildingData.annualGasM3 || 0,
        retrofitGasM3: Math.max(0, (buildingData.annualGasM3 || 0) * (1 - (pathway.ghgReductionPct || 0) / 100)),
        province: buildingData.province || 'ON',
      };
      return runMonteCarlo(params, 500);
    } catch {
      return null;
    }
  }, [pathway, buildingData]);

  if (!sensitivity || !pathway) {
    return null;
  }

  const { percentiles, npvPositivePct, paybackUnder10Pct } = sensitivity;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 animate-fadeIn">
      <h3 className="text-base font-bold text-slate-900 mb-1 flex items-center gap-2">
        <ShieldCheck size={18} className="text-indigo-600" />
        Risk Analysis
      </h3>
      <p className="text-sm text-slate-500 mb-5">
        {sensitivity.iterations} Monte Carlo scenarios with varied assumptions
      </p>

      {/* Confidence Gauges */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <ConfidenceGauge
          label="NPV positive"
          pct={npvPositivePct}
          icon={<TrendingUp size={16} />}
          color={npvPositivePct >= 80 ? 'emerald' : npvPositivePct >= 60 ? 'amber' : 'red'}
        />
        <ConfidenceGauge
          label="Payback under 10 years"
          pct={paybackUnder10Pct}
          icon={<BarChart3 size={16} />}
          color={paybackUnder10Pct >= 70 ? 'emerald' : paybackUnder10Pct >= 50 ? 'amber' : 'red'}
        />
      </div>

      {/* NPV Range */}
      <div className="mb-4">
        <div className="text-sm font-medium text-slate-700 mb-2">
          NPV Range (80% confidence interval)
        </div>
        <div className="relative">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 w-20 text-right">
              {formatCurrencyFull(percentiles.p10.npv)}
            </span>
            <div className="flex-1 relative h-8">
              {/* Background bar */}
              <div className="absolute inset-y-0 left-0 right-0 bg-slate-100 rounded-full" />
              {/* P10-P90 range */}
              <RangeBar
                p10={percentiles.p10.npv}
                p50={percentiles.p50.npv}
                p90={percentiles.p90.npv}
              />
            </div>
            <span className="text-xs text-slate-500 w-20">
              {formatCurrencyFull(percentiles.p90.npv)}
            </span>
          </div>
          <div className="flex justify-between mt-1 px-22">
            <span className="text-xs text-slate-400">P10</span>
            <span className="text-xs font-semibold text-indigo-600">
              Median: {formatCurrencyFull(percentiles.p50.npv)}
            </span>
            <span className="text-xs text-slate-400">P90</span>
          </div>
        </div>
      </div>

      {/* Payback Range */}
      <div>
        <div className="text-sm font-medium text-slate-700 mb-2">
          Payback Range (80% confidence interval)
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-600">
            {percentiles.p10.payback}-{percentiles.p90.payback} years
          </span>
          <span className="text-xs text-slate-400">
            (median: {percentiles.p50.payback} years)
          </span>
        </div>
      </div>
    </div>
  );
};

// ─── Sub-components ──────────────────────────────────────────────────────────

const ConfidenceGauge: React.FC<{
  label: string;
  pct: number;
  icon: React.ReactNode;
  color: 'emerald' | 'amber' | 'red';
}> = ({ label, pct, icon, color }) => {
  const colorMap = {
    emerald: { bg: 'bg-emerald-100', fill: 'bg-emerald-500', text: 'text-emerald-700' },
    amber: { bg: 'bg-amber-100', fill: 'bg-amber-500', text: 'text-amber-700' },
    red: { bg: 'bg-red-100', fill: 'bg-red-500', text: 'text-red-700' },
  };
  const c = colorMap[color];

  return (
    <div className={`${c.bg} rounded-lg p-4`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={c.text}>{icon}</span>
          <span className={`text-sm font-medium ${c.text}`}>{label}</span>
        </div>
        <span className={`text-lg font-bold ${c.text}`}>{pct}%</span>
      </div>
      <div className="w-full h-2 bg-white/50 rounded-full overflow-hidden">
        <div
          className={`h-full ${c.fill} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

const RangeBar: React.FC<{
  p10: number;
  p50: number;
  p90: number;
}> = ({ p10, p50, p90 }) => {
  // Normalize positions relative to the bar
  const range = p90 - p10;
  if (range <= 0) {
    return (
      <div className="absolute inset-y-1 left-1/4 right-1/4 bg-indigo-200 rounded-full">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-indigo-600 rounded-full" />
      </div>
    );
  }

  const medianPct = ((p50 - p10) / range) * 100;

  return (
    <div className="absolute inset-y-1 left-0 right-0">
      {/* P10-P90 filled range */}
      <div className="absolute inset-y-0 left-[10%] right-[10%] bg-indigo-200 rounded-full" />
      {/* Median marker */}
      <div
        className="absolute top-0 bottom-0 w-3"
        style={{ left: `${10 + medianPct * 0.8}%`, transform: 'translateX(-50%)' }}
      >
        <div className="w-3 h-full bg-indigo-600 rounded-full" />
      </div>
    </div>
  );
};

export default SensitivityPanel;
