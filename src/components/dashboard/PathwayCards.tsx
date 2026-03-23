import React from 'react';
import { useApp } from '@/app/store';
import { Button } from '@/components/shared/Button';
import { formatCurrency, formatYears } from '@/utils/formatting';
import { Zap, Flame, Sun, ArrowRight, Check, TrendingUp } from 'lucide-react';
import type { PathwayType } from '@/types';

const PATHWAY_COLORS: Record<PathwayType, { bg: string; border: string; accent: string; badge: string }> = {
  light: { bg: 'bg-blue-50', border: 'border-blue-200 hover:border-blue-400', accent: 'text-blue-700', badge: 'bg-blue-100 text-blue-700' },
  deep: { bg: 'bg-emerald-50', border: 'border-emerald-200 hover:border-emerald-400', accent: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
  grid_smart: { bg: 'bg-purple-50', border: 'border-purple-200 hover:border-purple-400', accent: 'text-purple-700', badge: 'bg-purple-100 text-purple-700' },
};

const PATHWAY_ICONS: Record<PathwayType, React.ReactNode> = {
  light: <Zap size={24} />,
  deep: <Flame size={24} />,
  grid_smart: <Sun size={24} />,
};

interface PathwayCardsProps {
  onNavigateToTab?: (tab: string) => void;
}

export const PathwayCards: React.FC<PathwayCardsProps> = ({ onNavigateToTab }) => {
  const { state, dispatch } = useApp();
  const { pathways, selectedPathway, userProfile } = state;

  if (pathways.length === 0) return null;

  // Determine recommended pathway: best balance of payback and value
  // For minimal appetite, prefer lowest payback; otherwise prefer best NPV
  const recommended: PathwayType = (() => {
    if (pathways.length === 0) return 'deep';
    if (userProfile.investmentAppetite === 'minimal') {
      // Recommend shortest payback (Quick Wins likely)
      return [...pathways].sort((a, b) => a.simplePayback - b.simplePayback)[0].type;
    }
    // For moderate/significant: recommend best NPV among CIB-eligible, or best NPV overall
    const cibPathways = pathways.filter(p => p.cibEligible);
    const pool = cibPathways.length > 0 ? cibPathways : pathways;
    return [...pool].sort((a, b) => b.npv20Year - a.npv20Year)[0].type;
  })();

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-900">Retrofit Pathways</h3>
        <p className="text-sm text-slate-500">Matched to your constraints and goals</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {pathways.map(pw => {
          const colors = PATHWAY_COLORS[pw.type];
          const isRecommended = pw.type === recommended;
          const isSelected = selectedPathway === pw.type;

          return (
            <div
              key={pw.type}
              className={`relative rounded-xl border-2 p-6 transition-all cursor-pointer ${colors.border} ${
                isSelected ? `${colors.bg} shadow-lg ring-2 ring-offset-2 ring-emerald-500` : 'bg-white'
              }`}
              onClick={() => dispatch({ type: 'SELECT_PATHWAY', pathway: pw.type })}
            >
              {isRecommended && (
                <div className="absolute -top-3 left-4">
                  <span className="bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                    Recommended
                  </span>
                </div>
              )}

              <div className={`mb-3 ${colors.accent}`}>{PATHWAY_ICONS[pw.type]}</div>
              <h4 className="font-bold text-lg text-slate-900">{pw.name}</h4>
              <p className="text-sm text-slate-500 mb-4">{pw.tagline}</p>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">GHG Reduction</span>
                  <span className={`font-bold ${colors.accent}`}>
                    {pw.ghgReductionPct > 0 ? `${pw.ghgReductionPct}%` : 'Minimal'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Gross Cost</span>
                  <span className="font-semibold text-slate-700">{formatCurrency(pw.grossCapitalCost)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Incentives</span>
                  <span className="font-semibold text-emerald-600">-{formatCurrency(pw.totalIncentives)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-slate-200 pt-2">
                  <span className="text-slate-700 font-semibold">Net Cost</span>
                  <span className="font-bold text-slate-900">{formatCurrency(pw.netCost)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Annual Savings</span>
                  <span className="font-semibold text-emerald-600">{formatCurrency(pw.annualSavings)}/yr</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Simple Payback</span>
                  <span className="font-semibold text-slate-700">
                    {pw.simplePayback <= 30 ? formatYears(pw.simplePayback) : '30+ years'}
                  </span>
                </div>
              </div>

              {pw.cibEligible && (
                <div className={`text-xs font-semibold ${colors.badge} px-2 py-1 rounded inline-block mb-3`}>
                  CIB Financing Eligible (2-3%)
                </div>
              )}

              {/* Best For */}
              <div className="border-t border-slate-200 pt-3">
                <div className="text-xs font-semibold text-slate-500 mb-1">Best for:</div>
                <ul className="text-xs text-slate-600 space-y-0.5">
                  {pw.bestFor.slice(0, 2).map((b, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <Check size={10} className="mt-0.5 text-emerald-500 flex-shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Demand charge warning for ASHP pathways */}
              {pw.measures.some(m => m.id === 'ashp') && (
                <div className="mt-3 p-2 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-xs text-blue-700">
                    <Zap size={10} className="inline mr-1" />
                    <span className="font-semibold">ASHP Demand Note:</span> Fuel switching increases winter peak electrical demand. Demand charges (~$12-15K/yr) are already included in the savings above. Demand response enrollment can offset $3-5K/yr.
                  </div>
                </div>
              )}

              {/* Sequential bridge */}
              {pw.sequentialBridge && (
                <div className="mt-3 p-2 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="text-xs text-amber-700">
                    <TrendingUp size={12} className="inline mr-1" />
                    {pw.sequentialBridge}
                  </div>
                </div>
              )}

              {isSelected && (
                <div className="mt-4">
                  <Button
                    variant="primary"
                    className="w-full"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigateToTab?.('model');
                    }}
                  >
                    <ArrowRight size={14} className="mr-1" /> View Energy Analysis
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
