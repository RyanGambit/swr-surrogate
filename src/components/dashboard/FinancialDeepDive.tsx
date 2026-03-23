import React, { useMemo } from 'react';
import { useApp } from '@/app/store';
import { Button } from '@/components/shared/Button';
import { generateProForma, npvSensitivity } from '@/engine/financialEngine';
import type { ProFormaParams } from '@/engine/financialEngine';
import { calculateNPV } from '@/utils/financial';
import { formatCurrency, formatCurrencyFull, formatPercent, formatYears } from '@/utils/formatting';
import {
  DEFAULT_DISCOUNT_RATE, DEFAULT_ESCALATION_RATE, DEFAULT_CIB_RATE,
  DEFAULT_COMMERCIAL_RATE, DEFAULT_LOAN_TERM, DEFAULT_CAP_RATE,
} from '@/constants/rates';
import type { Pathway, ProFormaResult } from '@/types';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, Legend,
} from 'recharts';
import {
  TrendingUp, DollarSign, Percent, BarChart3, ArrowDown, ArrowRight,
  Calculator, Landmark, Building2,
} from 'lucide-react';
import { SensitivityPanel } from './SensitivityPanel';

export const FinancialDeepDive: React.FC = () => {
  const { state } = useApp();
  const { pathways, selectedPathway, buildingData, proForma: existingProForma } = state;

  // Default to the pathway with the best NPV if none selected
  const bestPathway = useMemo(() => {
    if (pathways.length === 0) return undefined;
    return [...pathways].sort((a, b) => b.npv20Year - a.npv20Year)[0];
  }, [pathways]);
  const pathway: Pathway | undefined = pathways.find(p => p.type === selectedPathway) || bestPathway;

  const proForma: ProFormaResult | null = useMemo(() => {
    if (!pathway) return null;
    if (existingProForma) return existingProForma;

    // Use pathway's pre-computed savings components (avoids re-estimation mismatch)
    const annualEnergySavings = pathway.annualEnergySavings;
    const annualSolarRevenue = pathway.annualSolarRevenue;
    const annualSubmeteringNOI = pathway.annualSubmeteringNOI;

    // Extract CT ITC from the pathway's incentive breakdown
    const ctItcResult = pathway.incentiveBreakdown.find(r => r.program.id === 'ct_itc');
    const ctItcAmount = ctItcResult?.estimatedAmount || 0;

    // Compute upfront grants (total minus CT ITC which is delayed)
    const upfrontGrants = pathway.totalIncentives - ctItcAmount;

    const params: ProFormaParams = {
      grossCapEx: pathway.grossCapitalCost,
      netCapEx: pathway.netCost,
      equityPct: 0.20,
      annualEnergySavings: Math.max(0, annualEnergySavings),
      annualSolarRevenue,
      annualSubmeteringNOI,
      ctItcAmount,
      bridgeFinancingNeeded: ctItcAmount, // CT ITC arrives 12-18 months later
      upfrontGrants: Math.max(0, upfrontGrants),
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

    return generateProForma(params);
  }, [pathway, existingProForma, buildingData]);

  const sensitivityData = useMemo(() => {
    if (!proForma) return [];
    const cashFlows = proForma.schedule.map(s => s.netCashFlow);
    return npvSensitivity(cashFlows, [0.05, 0.06, 0.075, 0.08, 0.10]);
  }, [proForma]);

  const cibComparison = useMemo(() => {
    if (!pathway) return null;
    const loanAmount = pathway.netCost * 0.80;
    const cibMonthly = loanAmount > 0 ? (loanAmount * (DEFAULT_CIB_RATE / 12) * Math.pow(1 + DEFAULT_CIB_RATE / 12, DEFAULT_LOAN_TERM * 12)) / (Math.pow(1 + DEFAULT_CIB_RATE / 12, DEFAULT_LOAN_TERM * 12) - 1) : 0;
    const commMonthly = loanAmount > 0 ? (loanAmount * (DEFAULT_COMMERCIAL_RATE / 12) * Math.pow(1 + DEFAULT_COMMERCIAL_RATE / 12, DEFAULT_LOAN_TERM * 12)) / (Math.pow(1 + DEFAULT_COMMERCIAL_RATE / 12, DEFAULT_LOAN_TERM * 12) - 1) : 0;
    const cibTotal = cibMonthly * DEFAULT_LOAN_TERM * 12;
    const commTotal = commMonthly * DEFAULT_LOAN_TERM * 12;
    return {
      loanAmount,
      cibRate: DEFAULT_CIB_RATE,
      commRate: DEFAULT_COMMERCIAL_RATE,
      cibMonthly: Math.round(cibMonthly),
      commMonthly: Math.round(commMonthly),
      cibTotal: Math.round(cibTotal),
      commTotal: Math.round(commTotal),
      savings: Math.round(commTotal - cibTotal),
    };
  }, [pathway]);

  if (!pathway) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-500">Select a pathway to view financial details.</p>
      </div>
    );
  }

  const waterfallData = [
    { name: 'Gross Cost', value: pathway.grossCapitalCost, fill: '#334155' },
    { name: 'Grants/Incentives', value: -pathway.totalIncentives, fill: '#10b981' },
    { name: 'Net Cost', value: pathway.netCost, fill: '#475569' },
    { name: 'Equity (20%)', value: pathway.netCost * 0.20, fill: '#6366f1' },
    { name: 'Loan (80%)', value: pathway.netCost * 0.80, fill: '#f59e0b' },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Pathway Comparison */}
      {pathways.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-base font-bold text-slate-900 mb-3">Pathway Financial Comparison</h3>
          <div className="grid grid-cols-3 gap-3">
            {[...pathways].sort((a, b) => b.npv20Year - a.npv20Year).map(p => {
              const isSelected = p.type === pathway?.type;
              const isBest = p.npv20Year === Math.max(...pathways.map(x => x.npv20Year));
              return (
                <div
                  key={p.type}
                  className={`rounded-lg p-3 border-2 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                  onClick={() => {/* pathway selection handled by parent */}}
                >
                  <div className="flex items-center gap-1 mb-2">
                    <span className="text-xs font-bold text-slate-700">{p.name.split('—')[0].trim()}</span>
                    {isBest && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">Best ROI</span>
                    )}
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Net Cost</span>
                      <span className="font-semibold">{formatCurrency(p.netCost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Annual Savings</span>
                      <span className="font-semibold text-emerald-600">{formatCurrency(p.annualSavings)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Payback</span>
                      <span className="font-semibold">{p.simplePayback < 50 ? `${p.simplePayback} yr` : '50+ yr'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">20yr NPV</span>
                      <span className={`font-bold ${p.npv20Year >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {formatCurrency(p.npv20Year)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">GHG Reduction</span>
                      <span className="font-semibold">{p.ghgReductionPct}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {pathway && pathway.npv20Year < 0 && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <strong>Note:</strong> This pathway shows a negative NPV under pure financial analysis. However, many organizations pursue deep
              retrofits for regulatory compliance, emissions mandates, asset value protection, or to future-proof against rising energy costs.
              Consider the Light pathway for the best short-term ROI, or Grid-Smart for maximum long-term value with solar revenue.
            </div>
          )}
        </div>
      )}

      {/* Header Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          icon={<DollarSign size={18} />}
          label="20-Year NPV"
          value={proForma ? formatCurrencyFull(proForma.npv) : '--'}
          color="text-emerald-700"
          bg="bg-emerald-50"
        />
        <SummaryCard
          icon={<Percent size={18} />}
          label="IRR"
          value={proForma ? (proForma.irr !== null ? formatPercent(proForma.irr) : 'N/A') : '--'}
          color="text-blue-700"
          bg="bg-blue-50"
        />
        <SummaryCard
          icon={<TrendingUp size={18} />}
          label="Payback"
          value={proForma ? (proForma.paybackYear <= 20 ? formatYears(proForma.paybackYear) : '20+ years') : '--'}
          color="text-purple-700"
          bg="bg-purple-50"
        />
        <SummaryCard
          icon={<Building2 size={18} />}
          label="Asset Value Uplift"
          value={proForma ? formatCurrency(proForma.assetValueIncrease) : '--'}
          color="text-amber-700"
          bg="bg-amber-50"
        />
      </div>

      {/* Cash Flow Chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
          <BarChart3 size={20} className="text-emerald-600" />
          20-Year Cumulative Cash Flow
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          {pathway.name} pathway — {pathway.cibEligible ? 'CIB financing' : 'commercial financing'} at {formatPercent(pathway.cibEligible ? DEFAULT_CIB_RATE : DEFAULT_COMMERCIAL_RATE)}
        </p>
        {proForma && (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={proForma.schedule}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} label={{ value: 'Year', position: 'insideBottom', offset: -2 }} />
              <YAxis tickFormatter={(v: number) => formatCurrency(v)} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value: number, name: string) => [formatCurrencyFull(value), name]}
                labelFormatter={(l: number) => `Year ${l}`}
              />
              <Area
                type="monotone"
                dataKey="cumulativeCash"
                name="Cumulative Cash Flow"
                stroke="#10b981"
                fill="#d1fae5"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="netCashFlow"
                name="Annual Net Cash Flow"
                stroke="#6366f1"
                fill="#e0e7ff"
                strokeWidth={1.5}
                fillOpacity={0.3}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* NPV Sensitivity Table */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Calculator size={18} className="text-blue-600" />
            NPV Sensitivity Analysis
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 text-slate-500 font-medium">Discount Rate</th>
                <th className="text-right py-2 text-slate-500 font-medium">NPV (20yr)</th>
                <th className="text-right py-2 text-slate-500 font-medium">Signal</th>
              </tr>
            </thead>
            <tbody>
              {sensitivityData.map(row => {
                const isBase = row.rate === DEFAULT_DISCOUNT_RATE;
                return (
                  <tr
                    key={row.rate}
                    className={`border-b border-slate-100 ${isBase ? 'bg-emerald-50 font-semibold' : ''}`}
                  >
                    <td className="py-2.5 text-slate-700">
                      {formatPercent(row.rate, 1)}
                      {isBase && <span className="ml-2 text-xs text-emerald-600">(base)</span>}
                    </td>
                    <td className={`py-2.5 text-right ${row.npv >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {formatCurrencyFull(row.npv)}
                    </td>
                    <td className="py-2.5 text-right">
                      {row.npv > 0 ? (
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Positive</span>
                      ) : (
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Negative</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Capital Stack Waterfall */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
            <ArrowDown size={18} className="text-purple-600" />
            Capital Stack Waterfall
          </h3>
          <div className="space-y-3">
            {waterfallData.map((item, idx) => {
              const maxVal = Math.max(...waterfallData.map(d => Math.abs(d.value)));
              const widthPct = (Math.abs(item.value) / maxVal) * 100;
              const isNegative = item.value < 0;
              return (
                <div key={item.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-slate-600">{item.name}</span>
                    <span className={`text-sm font-semibold ${isNegative ? 'text-emerald-600' : 'text-slate-800'}`}>
                      {isNegative ? '-' : ''}{formatCurrencyFull(Math.abs(item.value))}
                    </span>
                  </div>
                  <div className="w-full h-6 bg-slate-100 rounded overflow-hidden">
                    <div
                      className="h-full rounded transition-all"
                      style={{ width: `${widthPct}%`, backgroundColor: item.fill }}
                    />
                  </div>
                  {idx < waterfallData.length - 1 && idx !== 2 && (
                    <div className="flex justify-center my-0.5">
                      <ArrowDown size={12} className="text-slate-300" />
                    </div>
                  )}
                  {idx === 2 && (
                    <div className="flex justify-center my-1 text-xs text-slate-400 font-medium">
                      Split into:
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Monte Carlo Risk Analysis */}
      <SensitivityPanel />

      {/* CIB vs Commercial Comparison */}
      {cibComparison && pathway.cibEligible && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Landmark size={18} className="text-indigo-600" />
            CIB vs Commercial Financing
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ComparisonCard
              title="CIB Financing"
              rate={formatPercent(cibComparison.cibRate)}
              monthly={formatCurrencyFull(cibComparison.cibMonthly)}
              total={formatCurrencyFull(cibComparison.cibTotal)}
              highlight={true}
            />
            <div className="flex items-center justify-center">
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-600">{formatCurrency(cibComparison.savings)}</div>
                <div className="text-xs text-slate-500 mt-1">20-year interest savings</div>
                <ArrowRight size={24} className="mx-auto mt-2 text-emerald-400" />
              </div>
            </div>
            <ComparisonCard
              title="Commercial Loan"
              rate={formatPercent(cibComparison.commRate)}
              monthly={formatCurrencyFull(cibComparison.commMonthly)}
              total={formatCurrencyFull(cibComparison.commTotal)}
              highlight={false}
            />
          </div>
          <p className="text-xs text-slate-500 mt-4">
            Loan amount: {formatCurrencyFull(cibComparison.loanAmount)} (80% of net cost), {DEFAULT_LOAN_TERM}-year term.
            CIB financing requires minimum 30% GHG reduction. Delivered via Scotiabank / BMO.
          </p>
        </div>
      )}

      {/* Pro Forma Table */}
      {proForma && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 overflow-x-auto">
          <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
            <BarChart3 size={18} className="text-slate-600" />
            20-Year Pro Forma Schedule
          </h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="py-2 text-left text-slate-500 font-medium">Year</th>
                <th className="py-2 text-right text-slate-500 font-medium">Energy Savings</th>
                <th className="py-2 text-right text-slate-500 font-medium">Carbon Savings</th>
                <th className="py-2 text-right text-slate-500 font-medium">Solar</th>
                <th className="py-2 text-right text-slate-500 font-medium">Submetering</th>
                <th className="py-2 text-right text-slate-500 font-medium">CIB Savings</th>
                <th className="py-2 text-right text-slate-500 font-medium">CT ITC</th>
                <th className="py-2 text-right text-slate-500 font-medium">Bridge Cost</th>
                <th className="py-2 text-right text-slate-500 font-medium">Debt Service</th>
                <th className="py-2 text-right text-slate-500 font-medium">Net Cash</th>
                <th className="py-2 text-right text-slate-500 font-medium">Cumulative</th>
              </tr>
            </thead>
            <tbody>
              {proForma.schedule.map(yr => (
                <tr key={yr.year} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-1.5 text-slate-700 font-medium">{yr.year}</td>
                  <td className="py-1.5 text-right text-emerald-700">{formatCurrencyFull(yr.energySavings)}</td>
                  <td className="py-1.5 text-right text-amber-600">{formatCurrencyFull(yr.carbonSavings)}</td>
                  <td className="py-1.5 text-right text-emerald-600">{formatCurrencyFull(yr.solarRevenue)}</td>
                  <td className="py-1.5 text-right text-blue-600">{formatCurrencyFull(yr.submeteringNOI)}</td>
                  <td className="py-1.5 text-right text-indigo-600">{formatCurrencyFull(yr.cibInterestSaving)}</td>
                  <td className="py-1.5 text-right text-purple-600">{formatCurrencyFull(yr.ctITCRefund)}</td>
                  <td className="py-1.5 text-right text-red-500">{yr.bridgeCost > 0 ? `-${formatCurrencyFull(yr.bridgeCost)}` : '$0'}</td>
                  <td className="py-1.5 text-right text-slate-600">-{formatCurrencyFull(yr.debtService)}</td>
                  <td className={`py-1.5 text-right font-semibold ${yr.netCashFlow >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {formatCurrencyFull(yr.netCashFlow)}
                  </td>
                  <td className={`py-1.5 text-right font-semibold ${yr.cumulativeCash >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {formatCurrencyFull(yr.cumulativeCash)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ─── Sub-components ──────────────────────────────────────────────────────────

const SummaryCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  bg: string;
}> = ({ icon, label, value, color, bg }) => (
  <div className={`${bg} rounded-xl p-4 border border-slate-100`}>
    <div className={`${color} mb-1`}>{icon}</div>
    <div className="text-xs text-slate-500 font-medium">{label}</div>
    <div className={`text-lg font-bold ${color}`}>{value}</div>
  </div>
);

const ComparisonCard: React.FC<{
  title: string;
  rate: string;
  monthly: string;
  total: string;
  highlight: boolean;
}> = ({ title, rate, monthly, total, highlight }) => (
  <div className={`rounded-xl p-4 border ${highlight ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
    <div className={`text-sm font-bold mb-3 ${highlight ? 'text-emerald-700' : 'text-slate-700'}`}>{title}</div>
    <div className="space-y-2 text-sm">
      <div className="flex justify-between">
        <span className="text-slate-500">Rate</span>
        <span className="font-semibold">{rate}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-slate-500">Monthly Payment</span>
        <span className="font-semibold">{monthly}</span>
      </div>
      <div className="flex justify-between border-t border-slate-200 pt-2">
        <span className="text-slate-500">Total Interest</span>
        <span className="font-bold">{total}</span>
      </div>
    </div>
  </div>
);
