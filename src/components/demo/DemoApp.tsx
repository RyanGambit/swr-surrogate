import React, { useReducer } from 'react';
import {
  AppContext, appReducer, createInitialState,
} from '@/app/store';
import type { AppAction } from '@/app/store';
import type { AppState } from '@/types';
import {
  demoBuilding, demoUserProfile, demoPathways, demoActionPlan,
} from '@/constants/demoData';
import { StepIndicator } from '@/components/shared/StepIndicator';
import { WhoAreYou } from '@/components/intake/WhoAreYou';
import { WhyHere } from '@/components/intake/WhyHere';
import { Constraints } from '@/components/intake/Constraints';
import { BuildingInfo } from '@/components/intake/BuildingInfo';
import { ChatIntake } from '@/components/chat/ChatIntake';
import { AssessmentDashboard } from '@/components/dashboard/AssessmentDashboard';
import { Compass, RotateCcw } from 'lucide-react';

/**
 * Demo experience for 55 King Street West.
 *
 * Mirrors the real App.tsx flow exactly — same intake screens, same chat step,
 * same dashboard — so the user gets the full Scout experience. The only behavioural
 * difference is in the reducer: the engine's pathway output gets swapped for the
 * curated 55 King dataset, and lookup dispatches re-merge demo values to keep
 * the pre-filled fields accurate even after the user clicks "Look Up".
 */

function makeInitialDemoState(): AppState {
  const base = createInitialState();
  return {
    ...base,
    currentStep: 'building',
    buildingData: { ...demoBuilding },
    userProfile: { ...demoUserProfile },
  };
}

function demoReducer(state: AppState, action: AppAction): AppState {
  // 1. Engine substitution: when ChatIntake's "Generate Assessment" button runs the
  //    engine and dispatches its output, replace the result with the demo pathways.
  if (action.type === 'SET_PATHWAYS') {
    return appReducer(state, { type: 'SET_PATHWAYS', pathways: demoPathways });
  }

  // 2. Pre-seed action plan and select Deep when transitioning to the assessment.
  if (action.type === 'SET_STEP' && action.step === 'assessment') {
    const seeded: AppState = {
      ...state,
      actionPlan: demoActionPlan,
      selectedPathway: state.selectedPathway || 'deep',
    };
    return appReducer(seeded, action);
  }

  // 3. Lookup dispatches (Nominatim resolve, Wikidata enrichment, autoPopulateDefaults)
  //    set address/postalCode/assumptions on UPDATE_BUILDING. Re-merge demoBuilding on
  //    top so the form keeps showing accurate 55 King values. Single-field dispatches
  //    from form edits don't carry these keys, so user edits still flow through.
  if (action.type === 'UPDATE_BUILDING') {
    const next = appReducer(state, action);
    const isLookupDispatch =
      'address' in action.data ||
      'assumptions' in action.data ||
      'postalCode' in action.data;
    if (isLookupDispatch) {
      return {
        ...next,
        buildingData: { ...next.buildingData, ...demoBuilding },
      };
    }
    return next;
  }

  // 4. Reset → fresh demo state, back at BuildingInfo.
  if (action.type === 'RESET') {
    return makeInitialDemoState();
  }

  return appReducer(state, action);
}

export const DemoApp: React.FC = () => {
  const [state, dispatch] = useReducer(demoReducer, undefined, makeInitialDemoState);

  const isIntake = ['building', 'who_are_you', 'why_here', 'constraints', 'chat_intake'].includes(state.currentStep);
  const isDashboard = ['assessment', 'partners', 'outputs'].includes(state.currentStep);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {isIntake && (
        <div className="min-h-screen bg-white">
          <header className="border-b border-slate-200 bg-white sticky top-0 z-30">
            <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                  <Compass size={18} className="text-white" />
                </div>
                <div>
                  <span className="font-bold text-slate-900 text-lg">Scout</span>
                  <span className="text-xs text-slate-500 ml-1.5">AI</span>
                </div>
                <span className="ml-3 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                  Demo · 55 King St W
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  Online
                </div>
                {state.currentStep !== 'building' && (
                  <button
                    onClick={() => {
                      if (confirm('Restart the demo? Your edits will be cleared.')) {
                        dispatch({ type: 'RESET' });
                      }
                    }}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                    title="Restart demo"
                  >
                    <RotateCcw size={16} />
                  </button>
                )}
              </div>
            </div>
            <div className="max-w-4xl mx-auto px-6">
              <StepIndicator currentStep={state.currentStep} />
            </div>
          </header>

          <main className="max-w-4xl mx-auto px-6 py-8">
            {state.currentStep === 'who_are_you' && <WhoAreYou />}
            {state.currentStep === 'why_here' && <WhyHere />}
            {state.currentStep === 'constraints' && <Constraints />}
            {state.currentStep === 'building' && <BuildingInfo />}
            {state.currentStep === 'chat_intake' && <ChatIntake />}
          </main>
        </div>
      )}

      {isDashboard && <AssessmentDashboard />}
    </AppContext.Provider>
  );
};
