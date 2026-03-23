import React, { useState } from 'react';
import { useApp } from '@/app/store';
import { saveCostDatapoint, type CostDatapoint } from '@/engine/costFeedback';
import { formatCurrencyFull } from '@/utils/formatting';
import { MessageSquare, Check, ChevronDown, ChevronUp } from 'lucide-react';

interface MeasureEntry {
  measureId: string;
  label: string;
  capacity: number;
  capacityUnit: string;
  estimatedCost: number;
}

export const CostFeedbackPanel: React.FC = () => {
  const { state } = useApp();
  const { pathways, selectedPathway, buildingData } = state;
  const pathway = pathways.find(p => p.type === selectedPathway) || pathways[0];

  const [isExpanded, setIsExpanded] = useState(false);
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());
  const [quotes, setQuotes] = useState<Record<string, string>>({});

  if (!pathway) return null;

  // Build measure entries from the pathway
  const measures: MeasureEntry[] = pathway.measures
    .filter(m => ['ashp', 'solar_pv', 'led_upgrade', 'bas_controls', 'submetering'].includes(m.id))
    .map(m => {
      const capacityMap: Record<string, { capacity: number; unit: string }> = {
        ashp: { capacity: Math.round((buildingData.areaSqFt || 10000) * 0.0929 * 0.06), unit: 'kW' },
        solar_pv: { capacity: Math.round((buildingData.areaSqFt || 10000) / 200 * 0.75 * 1.1), unit: 'kW-DC' },
        led_upgrade: { capacity: Math.round((buildingData.areaSqFt || 10000) / 60), unit: 'fixtures' },
        bas_controls: { capacity: buildingData.areaSqFt || 10000, unit: 'sqft' },
        submetering: { capacity: Math.max(4, Math.round((buildingData.areaSqFt || 10000) / 5000)), unit: 'meters' },
      };
      const cap = capacityMap[m.id] || { capacity: 0, unit: '' };
      return {
        measureId: m.id,
        label: m.name,
        capacity: cap.capacity,
        capacityUnit: cap.unit,
        estimatedCost: 0, // Could be populated from costingEngine
      };
    });

  const handleSubmit = (measureId: string) => {
    const quotedCost = parseFloat(quotes[measureId] || '0');
    if (quotedCost <= 0) return;

    const measure = measures.find(m => m.measureId === measureId);
    if (!measure) return;

    const datapoint: CostDatapoint = {
      id: `${Date.now()}_${measureId}`,
      timestamp: Date.now(),
      buildingType: buildingData.archetype || 'commercial',
      buildingArea_sqft: buildingData.areaSqFt || 10000,
      city: buildingData.city || 'unknown',
      province: buildingData.province || 'ON',
      measureId,
      capacity: measure.capacity,
      capacityUnit: measure.capacityUnit,
      quotedCost,
      contractorAnonymized: true,
      year: new Date().getFullYear(),
      confidenceLevel: 'quote',
    };

    saveCostDatapoint(datapoint);
    setSubmitted(prev => new Set(prev).add(measureId));
  };

  if (!isExpanded) {
    return (
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <MessageSquare size={16} className="text-indigo-600" />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-800">Help improve Scout's cost estimates</div>
              <div className="text-xs text-slate-500">Share contractor quotes anonymously to help future building owners</div>
            </div>
          </div>
          <button
            onClick={() => setIsExpanded(true)}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
          >
            Share a Quote
            <ChevronDown size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 animate-fadeIn">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <MessageSquare size={18} className="text-indigo-600" />
          Share Contractor Quotes
        </h3>
        <button
          onClick={() => setIsExpanded(false)}
          className="text-slate-400 hover:text-slate-600"
        >
          <ChevronUp size={18} />
        </button>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        If you've received quotes for any of these measures, sharing them anonymously helps Scout provide better estimates for future building owners.
      </p>

      <div className="space-y-3">
        {measures.map(m => (
          <div
            key={m.measureId}
            className={`flex items-center gap-3 p-3 rounded-lg border ${
              submitted.has(m.measureId) ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200'
            }`}
          >
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-800">{m.label}</div>
              <div className="text-xs text-slate-500">
                {m.capacity} {m.capacityUnit}
              </div>
            </div>
            {submitted.has(m.measureId) ? (
              <div className="flex items-center gap-1 text-emerald-600 text-sm">
                <Check size={14} />
                Saved
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">$</span>
                <input
                  type="number"
                  placeholder="Quoted cost"
                  value={quotes[m.measureId] || ''}
                  onChange={e => setQuotes(prev => ({ ...prev, [m.measureId]: e.target.value }))}
                  className="w-32 text-sm border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
                <button
                  onClick={() => handleSubmit(m.measureId)}
                  disabled={!quotes[m.measureId] || parseFloat(quotes[m.measureId]) <= 0}
                  className="text-sm px-3 py-1 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Save
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-400 mt-4">
        All data is stored locally and anonymized. No personal or company information is collected.
      </p>
    </div>
  );
};

export default CostFeedbackPanel;
