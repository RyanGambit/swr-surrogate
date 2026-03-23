import React from 'react';
import { useApp } from '@/app/store';
import { Button } from '@/components/shared/Button';
import type { InvestmentAppetite, TimelineFlexibility, TenantSensitivity } from '@/types';

const INVESTMENT: { value: InvestmentAppetite; label: string; desc: string }[] = [
  { value: 'minimal', label: 'Minimal', desc: 'Under $5/sqft — quick wins only' },
  { value: 'moderate', label: 'Moderate', desc: '$5-30/sqft — targeted upgrades' },
  { value: 'significant', label: 'Significant', desc: '$30+/sqft — deep retrofit' },
  { value: 'unknown', label: "I don't know", desc: 'Show me what\'s possible' },
];

const TIMELINE: { value: TimelineFlexibility; label: string; desc: string }[] = [
  { value: 'urgent', label: 'Urgent', desc: 'Equipment failing or deadline approaching' },
  { value: 'flexible', label: 'Flexible', desc: '1-2 year window' },
  { value: 'long_term', label: 'Long Term', desc: '3+ years, planning phase' },
  { value: 'unknown', label: "Not sure", desc: 'Help me figure this out' },
];

const TENANT: { value: TenantSensitivity; label: string }[] = [
  { value: 'high', label: 'High — tenants are very sensitive to disruption' },
  { value: 'moderate', label: 'Moderate — some flexibility' },
  { value: 'low', label: 'Low — vacant or owner-occupied' },
  { value: 'na', label: 'N/A — no tenants' },
];

export const Constraints: React.FC = () => {
  const { state, dispatch } = useApp();
  const { investmentAppetite, timelineFlexibility, existingDebtConcerns, tenantDisruptionSensitivity } = state.userProfile;

  const canProceed = investmentAppetite && timelineFlexibility && tenantDisruptionSensitivity !== undefined;

  return (
    <div className="animate-fadeIn">
      <h2 className="text-2xl font-bold text-slate-900 mb-2">What are your constraints?</h2>
      <p className="text-slate-500 mb-8">Scout uses your constraints to find pathways that actually fit. "I don't know" is always valid.</p>

      <div className="mb-8">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">Investment Appetite</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {INVESTMENT.map(i => (
            <button
              key={i.value}
              onClick={() => dispatch({ type: 'UPDATE_USER_PROFILE', data: { investmentAppetite: i.value } })}
              className={`p-3 rounded-lg border-2 text-left transition-all ${
                investmentAppetite === i.value ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="font-semibold text-sm text-slate-900">{i.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{i.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">Timeline</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {TIMELINE.map(t => (
            <button
              key={t.value}
              onClick={() => dispatch({ type: 'UPDATE_USER_PROFILE', data: { timelineFlexibility: t.value } })}
              className={`p-3 rounded-lg border-2 text-left transition-all ${
                timelineFlexibility === t.value ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="font-semibold text-sm text-slate-900">{t.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">Existing Debt Concerns?</h3>
        <div className="flex gap-3">
          {[true, false].map(v => (
            <button
              key={String(v)}
              onClick={() => dispatch({ type: 'UPDATE_USER_PROFILE', data: { existingDebtConcerns: v } })}
              className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium text-sm transition-all ${
                existingDebtConcerns === v ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'
              }`}
            >
              {v ? 'Yes, existing debt is a concern' : 'No, open to financing'}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">Tenant Disruption Sensitivity</h3>
        <div className="grid grid-cols-2 gap-2">
          {TENANT.map(t => (
            <button
              key={t.value}
              onClick={() => dispatch({ type: 'UPDATE_USER_PROFILE', data: { tenantDisruptionSensitivity: t.value } })}
              className={`py-3 px-4 rounded-lg border-2 text-sm font-medium text-left transition-all ${
                tenantDisruptionSensitivity === t.value ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={() => dispatch({ type: 'SET_STEP', step: 'why_here' })}>
          Back
        </Button>
        <Button size="lg" disabled={!canProceed} onClick={() => dispatch({ type: 'SET_STEP', step: 'chat_intake' })}>
          Continue to Chat with Scout
        </Button>
      </div>
    </div>
  );
};
