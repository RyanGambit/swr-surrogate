import React from 'react';
import { useApp } from '@/app/store';
import { ConfidenceBadge } from '@/components/shared/ConfidenceBadge';
import { formatNumber, formatCurrencyFull } from '@/utils/formatting';
import { Zap, Flame, Leaf, BarChart3, Thermometer, SlidersHorizontal } from 'lucide-react';

interface BuildingScoreCardProps {
  onEditAssumptions?: () => void;
}

export const BuildingScoreCard: React.FC<BuildingScoreCardProps> = ({ onEditAssumptions }) => {
  const { state } = useApp();
  const bd = state.buildingData;

  const metrics = [
    {
      label: 'Energy Use Intensity',
      value: `${bd.totalEUI || '—'} ekWh/m²/yr`,
      icon: <Zap size={18} />,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
    },
    {
      label: 'Annual Electricity',
      value: `${formatNumber(bd.annualElectricitykWh || 0)} kWh`,
      icon: <Zap size={18} />,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'Annual Gas',
      value: `${formatNumber(bd.annualGasM3 || 0)} m³`,
      icon: <Flame size={18} />,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
    {
      label: 'Estimated GHG',
      value: `${bd.estimatedGHG ? (Math.round(bd.estimatedGHG * 10) / 10) : '—'} tCO₂e/yr`,
      icon: <Leaf size={18} />,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
    },
    {
      label: 'Energy Star Score',
      value: `${bd.energyStarScore || '—'} / 100`,
      icon: <BarChart3 size={18} />,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      label: 'Climate Zone',
      value: `${bd.climateZone || '—'} (HDD ${bd.hdd || '—'})`,
      icon: <Thermometer size={18} />,
      color: 'text-slate-600',
      bgColor: 'bg-slate-50',
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-900">Building Baseline</h3>
        <div className="flex items-center gap-2">
          <ConfidenceBadge level={bd.confidenceLevel || 0.15} />
          {onEditAssumptions && (
            <button
              onClick={onEditAssumptions}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <SlidersHorizontal size={13} />
              Edit Assumptions
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {metrics.map(m => (
          <div key={m.label} className={`${m.bgColor} rounded-lg p-3`}>
            <div className={`${m.color} mb-1`}>{m.icon}</div>
            <div className="text-xs text-slate-500 font-medium">{m.label}</div>
            <div className="text-sm font-bold text-slate-900 mt-0.5">{m.value}</div>
          </div>
        ))}
      </div>

      {/* Assumptions */}
      {bd.assumptions && bd.assumptions.length > 0 && (
        <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
          <div className="text-xs font-semibold text-amber-700 mb-1">Assumptions Made</div>
          <ul className="text-xs text-amber-600 space-y-0.5">
            {bd.assumptions.slice(0, 3).map((a, i) => (
              <li key={i}>
                {a.parameter}: {String(a.assumedValue)} — <span className="italic">{a.improvementPrompt}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
