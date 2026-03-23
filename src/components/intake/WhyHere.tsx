import React from 'react';
import { useApp } from '@/app/store';
import { Button } from '@/components/shared/Button';
import type { Priority } from '@/types';
import { DollarSign, Wrench, Scale, Megaphone, Gift, Compass } from 'lucide-react';

const PRIORITIES: { value: Priority; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'reduce_bills', label: 'Reduce Energy Bills', icon: <DollarSign size={20} />, desc: 'Operational cost savings are the priority' },
  { value: 'equipment_failing', label: 'Equipment Failing', icon: <Wrench size={20} />, desc: 'Boiler, HVAC, or other systems near end-of-life' },
  { value: 'regulatory_pressure', label: 'Regulatory Pressure', icon: <Scale size={20} />, desc: 'BEPS, emissions reporting, or compliance deadlines' },
  { value: 'leadership_mandate', label: 'Leadership Mandate', icon: <Megaphone size={20} />, desc: 'Board, council, or executive has directed action' },
  { value: 'heard_about_incentives', label: 'Heard About Incentives', icon: <Gift size={20} />, desc: 'Aware of grants/programs and want to explore' },
  { value: 'general_interest', label: 'General Interest', icon: <Compass size={20} />, desc: 'Exploring what\'s possible — no specific trigger' },
];

export const WhyHere: React.FC = () => {
  const { state, dispatch } = useApp();
  const { priority, isDecisionMaker } = state.userProfile;

  return (
    <div className="animate-fadeIn">
      <h2 className="text-2xl font-bold text-slate-900 mb-2">Why are you here?</h2>
      <p className="text-slate-500 mb-8">This determines tone, depth, and urgency of your assessment.</p>

      <div className="mb-8">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">What's Driving This?</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PRIORITIES.map(p => (
            <button
              key={p.value}
              onClick={() => dispatch({ type: 'UPDATE_USER_PROFILE', data: { priority: p.value } })}
              className={`p-4 rounded-xl border-2 text-left transition-all flex items-start gap-3 ${
                priority === p.value
                  ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className={`mt-0.5 ${priority === p.value ? 'text-emerald-600' : 'text-slate-400'}`}>{p.icon}</div>
              <div>
                <div className="font-semibold text-sm text-slate-900">{p.label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{p.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">Are you the decision-maker?</h3>
        <div className="flex gap-3">
          {[
            { value: true, label: 'Yes', desc: 'I can authorize spending' },
            { value: false, label: 'No, building a case', desc: 'I need to convince someone' },
          ].map(opt => (
            <button
              key={String(opt.value)}
              onClick={() => dispatch({ type: 'UPDATE_USER_PROFILE', data: { isDecisionMaker: opt.value } })}
              className={`flex-1 p-4 rounded-xl border-2 text-left transition-all ${
                isDecisionMaker === opt.value
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="font-semibold text-sm text-slate-900">{opt.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>
        {isDecisionMaker === false && (
          <p className="text-xs text-amber-600 mt-2 bg-amber-50 p-2 rounded-lg">
            Scout will tailor outputs to help you build an internal case — board memos, CFO summaries, and comparison documents.
          </p>
        )}
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={() => dispatch({ type: 'SET_STEP', step: 'who_are_you' })}>
          Back
        </Button>
        <Button
          size="lg"
          disabled={!priority || isDecisionMaker === undefined}
          onClick={() => dispatch({ type: 'SET_STEP', step: 'constraints' })}
        >
          Continue
        </Button>
      </div>
    </div>
  );
};
