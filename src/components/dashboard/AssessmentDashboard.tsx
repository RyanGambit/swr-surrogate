import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useApp } from '@/app/store';
import { PathwayCards } from './PathwayCards';
import { FinancialDeepDive } from './FinancialDeepDive';
import { IncentivesView } from './IncentivesView';
import { PartnersView } from './PartnersView';
import { OutputsView } from './OutputsView';
import { DashboardAdvisor } from '../chat/DashboardAdvisor';
import { BuildingScoreCard } from './BuildingScoreCard';
import { BarChart3, Gift, Users, FileText, MessageCircle, LayoutDashboard, Activity, Map, Pencil, RotateCcw, RefreshCw } from 'lucide-react';
import { clearSession } from '@/app/store';
import { generatePathways } from '@/engine/pathwayEngine';
import { estimateBaseline } from '@/engine/buildingEngine';

const RetrofitVisualizer = lazy(() => import('../visualization/RetrofitVisualizer'));
const AssumptionsEditor = lazy(() => import('./AssumptionsEditor'));
const ActionPlanView = lazy(() => import('./ActionPlanView'));
const MonthlyProfileChart = lazy(() => import('./MonthlyProfileChart'));
const CostFeedbackPanel = lazy(() => import('./CostFeedbackPanel'));

type DashTab = 'overview' | 'model' | 'financial' | 'incentives' | 'partners' | 'action_plan' | 'outputs';

export const AssessmentDashboard: React.FC = () => {
  const { state, dispatch } = useApp();
  const [activeTab, setActiveTab] = useState<DashTab>('overview');
  const [showChat, setShowChat] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(false);

  // Manual regeneration function — called by Recalculate button or when needed
  const regeneratePathways = useCallback(() => {
    const baseline = estimateBaseline(state.buildingData);
    const mergedBuilding = {
      ...state.buildingData,
      annualElectricitykWh: state.buildingData.annualElectricitykWh || baseline.annualElectricitykWh,
      annualGasM3: state.buildingData.annualGasM3 || baseline.annualGasM3,
      totalEUI: state.buildingData.totalEUI || baseline.totalEUI,
      estimatedGHG: baseline.estimatedGHG,
      confidenceLevel: baseline.confidenceLevel,
      assumptions: baseline.assumptions,
    };

    dispatch({ type: 'UPDATE_BUILDING', data: mergedBuilding });
    const freshPathways = generatePathways(mergedBuilding, state.userProfile);
    dispatch({ type: 'SET_PATHWAYS', pathways: freshPathways });
  }, [state.buildingData, state.userProfile, dispatch]);

  // Auto-select first pathway if none selected
  useEffect(() => {
    if (!state.selectedPathway && state.pathways.length > 0) {
      dispatch({ type: 'SELECT_PATHWAY', pathway: state.pathways[0].type });
    }
  }, [state.pathways, state.selectedPathway, dispatch]);

  // Sync incentiveStack from selected pathway's incentiveBreakdown
  // (SET_INCENTIVE_STACK was never dispatched — components like IncentiveApplications read from it)
  useEffect(() => {
    if (state.selectedPathway && state.pathways.length > 0) {
      const selected = state.pathways.find(p => p.type === state.selectedPathway);
      if (selected) {
        const eligible = selected.incentiveBreakdown || [];
        const totalGrants = selected.totalIncentives;
        const ctItcResult = eligible.find(r => r.program.id === 'ct_itc');
        const ctItcAmount = ctItcResult?.estimatedAmount || 0;

        dispatch({
          type: 'SET_INCENTIVE_STACK',
          stack: {
            eligible,
            totalUpfront: eligible
              .filter(r => r.eligible && (r.paymentTiming === 'upfront' || r.paymentTiming === 'point_of_sale'))
              .reduce((s, r) => s + r.estimatedAmount, 0),
            totalDelayed: ctItcAmount,
            totalGrants,
            ctItcAmount,
            ctItcBasis: ctItcAmount > 0 ? ctItcAmount / 0.30 : 0,
            bridgeFinancingNeeded: ctItcAmount,
            dayOneFinanced: selected.grossCapitalCost - totalGrants + ctItcAmount,
            netCapEx: selected.netCost,
            coveragePct: selected.grossCapitalCost > 0 ? totalGrants / selected.grossCapitalCost : 0,
            cibEligible: selected.cibEligible,
          },
        });
      }
    }
  }, [state.selectedPathway, state.pathways, dispatch]);

  const tabs: { key: DashTab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <LayoutDashboard size={16} /> },
    { key: 'model', label: 'Energy Analysis', icon: <Activity size={16} /> },
    { key: 'financial', label: 'Financial Deep Dive', icon: <BarChart3 size={16} /> },
    { key: 'incentives', label: 'Incentives & Applications', icon: <Gift size={16} /> },
    { key: 'partners', label: 'Partners', icon: <Users size={16} /> },
    { key: 'action_plan', label: 'Action Plan', icon: <Map size={16} /> },
    { key: 'outputs', label: 'Documents', icon: <FileText size={16} /> },
  ];

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className={`flex-1 flex flex-col min-w-0 overflow-hidden transition-all ${showChat ? 'mr-96' : ''}`}>
        {/* Dashboard Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900">{state.buildingData.address || 'Building Assessment'}</h1>
                <button
                  onClick={() => dispatch({ type: 'SET_STEP', step: 'building' })}
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
                  title="Edit Building Info"
                >
                  <Pencil size={14} />
                </button>
              </div>
              <p className="text-sm text-slate-500">
                {state.buildingData.archetype?.replace(/_/g, ' ')} — {state.buildingData.areaSqFt?.toLocaleString()} sq ft
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowChat(!showChat)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                  showChat ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <MessageCircle size={16} />
                <span className="text-sm font-medium">Ask Scout</span>
              </button>
              <button
                onClick={regeneratePathways}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all"
                title="Recalculate pathways with current data"
              >
                <RefreshCw size={15} />
                <span className="text-sm font-medium">Recalculate</span>
              </button>
              <button
                onClick={() => {
                  if (confirm('Start a new assessment? This will clear all current data.')) {
                    clearSession();
                    dispatch({ type: 'RESET' });
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all"
                title="Start new assessment"
              >
                <RotateCcw size={15} />
                <span className="text-sm font-medium">Reset</span>
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 mt-3 -mb-3">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg transition-all ${
                  activeTab === tab.key
                    ? 'bg-slate-50 text-emerald-700 border-b-2 border-emerald-500'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto p-6 bg-slate-50">
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-fadeIn">
              <BuildingScoreCard onEditAssumptions={() => setShowAssumptions(true)} />
              <PathwayCards onNavigateToTab={(tab) => setActiveTab(tab as DashTab)} />
            </div>
          )}
          {activeTab === 'model' && (
            <Suspense fallback={<div className="flex items-center justify-center h-96"><p className="text-slate-500">Loading energy analysis...</p></div>}>
              <RetrofitVisualizer building={state.buildingData} />
            </Suspense>
          )}
          {activeTab === 'financial' && <FinancialDeepDive />}
          {activeTab === 'incentives' && <IncentivesView />}
          {activeTab === 'partners' && <PartnersView />}
          {activeTab === 'action_plan' && (
            <div className="space-y-6">
              <Suspense fallback={<div className="flex items-center justify-center h-96"><p className="text-slate-500">Loading action plan...</p></div>}>
                <ActionPlanView />
              </Suspense>
              <Suspense fallback={null}>
                <CostFeedbackPanel />
              </Suspense>
            </div>
          )}
          {activeTab === 'outputs' && <OutputsView />}
        </div>
      </div>

      {/* Sidebar Chat */}
      {showChat && (
        <div className="fixed right-0 top-0 bottom-0 w-96 bg-white border-l border-slate-200 shadow-xl z-40">
          <DashboardAdvisor onClose={() => setShowChat(false)} />
        </div>
      )}

      {/* Assumptions Slide-Out Panel */}
      {showAssumptions && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setShowAssumptions(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between z-10 rounded-t-xl">
                <h2 className="text-base font-bold text-slate-900">Model Assumptions</h2>
                <button
                  onClick={() => setShowAssumptions(false)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-6">
                <Suspense fallback={<div className="flex items-center justify-center h-48"><p className="text-slate-500">Loading...</p></div>}>
                  <AssumptionsEditor />
                </Suspense>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
