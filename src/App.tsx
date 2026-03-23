import React, { useReducer, useEffect } from 'react';
import { AppContext, appReducer, createInitialState, loadSession, saveSession } from '@/app/store';
import { StepIndicator } from '@/components/shared/StepIndicator';
import { WhoAreYou } from '@/components/intake/WhoAreYou';
import { WhyHere } from '@/components/intake/WhyHere';
import { Constraints } from '@/components/intake/Constraints';
import { BuildingInfo } from '@/components/intake/BuildingInfo';
import { ChatIntake } from '@/components/chat/ChatIntake';
import { AssessmentDashboard } from '@/components/dashboard/AssessmentDashboard';
import { Compass, RotateCcw } from 'lucide-react';

const App: React.FC = () => {
  const [state, dispatch] = useReducer(appReducer, null, () => {
    const saved = loadSession();
    return saved || createInitialState();
  });

  // Auto-save to localStorage on state changes
  useEffect(() => {
    saveSession(state);
  }, [state]);

  const isIntake = ['building', 'who_are_you', 'why_here', 'constraints', 'chat_intake'].includes(state.currentStep);
  const isDashboard = ['assessment', 'partners', 'outputs'].includes(state.currentStep);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {isIntake && (
        <div className="min-h-screen bg-white">
          {/* Header */}
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
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  Online
                </div>
                {state.currentStep !== 'building' && (
                  <button
                    onClick={() => {
                      if (confirm('Start a new assessment? Current progress will be saved.')) {
                        dispatch({ type: 'RESET' });
                      }
                    }}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
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

          {/* Intake Content */}
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

export default App;
