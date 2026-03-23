import React from 'react';
import { Check } from 'lucide-react';
import type { AppStep } from '@/types';

const STEPS: { key: AppStep; label: string; short: string }[] = [
  { key: 'building', label: 'Your Building', short: 'Building' },
  { key: 'who_are_you', label: 'About You', short: 'You' },
  { key: 'why_here', label: 'Your Goals', short: 'Goals' },
  { key: 'constraints', label: 'Constraints', short: 'Limits' },
  { key: 'chat_intake', label: 'Chat with Scout', short: 'Chat' },
  { key: 'assessment', label: 'Assessment', short: 'Results' },
];

interface Props {
  currentStep: AppStep;
}

export const StepIndicator: React.FC<Props> = ({ currentStep }) => {
  const currentIdx = STEPS.findIndex(s => s.key === currentStep);

  return (
    <div className="flex items-center justify-center gap-1 py-4">
      {STEPS.map((step, idx) => {
        const isComplete = idx < currentIdx;
        const isCurrent = idx === currentIdx;

        return (
          <React.Fragment key={step.key}>
            <div className="flex flex-col items-center">
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all
                  ${isComplete ? 'bg-emerald-600 text-white' : ''}
                  ${isCurrent ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-500' : ''}
                  ${!isComplete && !isCurrent ? 'bg-slate-100 text-slate-400' : ''}
                `}
              >
                {isComplete ? <Check size={14} /> : idx + 1}
              </div>
              <span className={`text-[10px] mt-1 font-medium ${isCurrent ? 'text-emerald-700' : 'text-slate-400'}`}>
                {step.short}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`w-8 h-0.5 mb-4 ${idx < currentIdx ? 'bg-emerald-500' : 'bg-slate-200'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
