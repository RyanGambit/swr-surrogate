import React from 'react';
import { confidenceLabel, confidenceColor } from '@/utils/formatting';

interface Props {
  level: number;
  showBar?: boolean;
}

export const ConfidenceBadge: React.FC<Props> = ({ level, showBar = true }) => {
  const pct = Math.round(level * 100);
  const label = confidenceLabel(level);
  const color = confidenceColor(level);

  const barColor = level >= 0.8 ? 'bg-emerald-500' : level >= 0.5 ? 'bg-amber-500' : 'bg-red-400';

  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs font-semibold ${color}`}>
        {label} ({pct}%)
      </span>
      {showBar && (
        <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
};
