import React, { useReducer, useState, useCallback, lazy, Suspense } from 'react';
import {
  AppContext, appReducer, createInitialState,
} from '@/app/store';
import type { AppAction } from '@/app/store';
import type { AppState } from '@/types';
import {
  demoBuilding, demoUserProfile, demoPathways, demoActionPlan,
} from '@/constants/demoData';
import { Compass, MapPin, Search, Loader2, Info } from 'lucide-react';

const AssessmentDashboard = lazy(() =>
  import('@/components/dashboard/AssessmentDashboard').then(m => ({ default: m.AssessmentDashboard }))
);

const DEMO_ADDRESS = '55 King St W, Kitchener, ON';

/**
 * Builds an AppState pre-populated with the demo dataset, ready to drop the user
 * straight into the assessment dashboard.
 */
function buildHydratedState(): AppState {
  const base = createInitialState();
  return {
    ...base,
    currentStep: 'assessment',
    buildingData: demoBuilding,
    userProfile: demoUserProfile,
    pathways: demoPathways,
    selectedPathway: 'deep',
    actionPlan: demoActionPlan,
  };
}

/**
 * Reducer wrapper: re-seeds the demo dataset on RESET, blocks engine-driven
 * SET_PATHWAYS calls (e.g. from the dashboard's Recalculate button) so the
 * curated 55 King numbers stay on screen.
 */
function demoReducer(state: AppState, action: AppAction): AppState {
  if (action.type === 'RESET') {
    return { ...createInitialState(), currentStep: 'building' };
  }
  if (action.type === 'SET_PATHWAYS' && state.pathways.length > 0) {
    return state;
  }
  return appReducer(state, action);
}

export const DemoApp: React.FC = () => {
  const [state, dispatch] = useReducer(demoReducer, undefined, (): AppState => ({
    ...createInitialState(),
    currentStep: 'building',
  }));

  const hydrate = useCallback(() => {
    const hydrated = buildHydratedState();
    dispatch({ type: 'LOAD_SESSION', state: hydrated });
  }, []);

  const isSearch = state.currentStep === 'building';

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {isSearch ? (
        <DemoSearch onResolve={hydrate} />
      ) : (
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-screen bg-slate-50">
              <p className="text-slate-500">Loading dashboard...</p>
            </div>
          }
        >
          <div className="h-screen flex flex-col">
            <AssessmentDashboard />
          </div>
        </Suspense>
      )}
    </AppContext.Provider>
  );
};

// ─── Simulated Search Screen ────────────────────────────────────────────────

interface DemoSearchProps {
  onResolve: () => void;
}

const DemoSearch: React.FC<DemoSearchProps> = ({ onResolve }) => {
  const [address, setAddress] = useState(DEMO_ADDRESS);
  const [status, setStatus] = useState<'idle' | 'loading' | 'resolved'>('idle');

  const handleLookup = () => {
    if (status === 'loading') return;
    setStatus('loading');
    // Simulated API delay so the demo motion feels real on a screenshare
    window.setTimeout(() => {
      setStatus('resolved');
      window.setTimeout(onResolve, 600);
    }, 1500);
  };

  return (
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
              Demo
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            Online
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8 p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
          <Info size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-800">
            <span className="font-semibold">Demo mode:</span> hardcoded retrofit model for 55 King Street West, Kitchener.
            Click <span className="font-semibold">Look Up</span> to load the validated dataset and skip live engine calculations.
          </p>
        </div>

        <h2 className="text-2xl font-bold text-slate-900 mb-2">What's your building?</h2>
        <p className="text-slate-500 mb-8">Address + approximate size is all we need. Everything else improves accuracy.</p>

        {/* Map placeholder — keeps the visual proportions of the real BuildingInfo screen */}
        <div className="mb-6 h-[300px] rounded-xl bg-gradient-to-br from-emerald-50 to-blue-50 border border-slate-200 flex flex-col items-center justify-center gap-2">
          <MapPin size={32} className="text-emerald-500" />
          <p className="text-sm font-semibold text-slate-700">TD Canada Trust Centre</p>
          <p className="text-xs text-slate-500">130,109 sqft · 12 storeys · Built 1992</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Satellite preview disabled in demo mode</p>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Building Address</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLookup()}
                disabled={status === 'loading'}
                className="w-full pl-9 pr-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none disabled:bg-slate-50"
              />
            </div>
            <button
              onClick={handleLookup}
              disabled={status === 'loading'}
              className="inline-flex items-center px-5 py-3 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              {status === 'loading' ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Looking up...
                </>
              ) : (
                <>
                  <Search size={16} className="mr-2" />
                  Look Up
                </>
              )}
            </button>
          </div>

          {status === 'loading' && (
            <div className="mt-3 space-y-1.5 text-xs text-slate-500">
              <LoadingLine label="Geocoding address..." delay={0} />
              <LoadingLine label="Resolving LDC and gas utility..." delay={400} />
              <LoadingLine label="Loading building characteristics..." delay={800} />
              <LoadingLine label="Pulling validated retrofit model..." delay={1100} />
            </div>
          )}

          {status === 'resolved' && (
            <p className="text-xs text-emerald-600 mt-2 font-medium">
              ✓ Detected: Kitchener — Climate Zone ASHRAE 6A, HDD 4,100, LDC: Enova Power Corp
            </p>
          )}
        </div>
      </main>
    </div>
  );
};

const LoadingLine: React.FC<{ label: string; delay: number }> = ({ label, delay }) => {
  const [shown, setShown] = useState(false);
  React.useEffect(() => {
    const t = window.setTimeout(() => setShown(true), delay);
    return () => window.clearTimeout(t);
  }, [delay]);
  if (!shown) return null;
  return (
    <div className="flex items-center gap-2 animate-fadeIn">
      <Loader2 size={11} className="animate-spin text-emerald-500" />
      <span>{label}</span>
    </div>
  );
};
