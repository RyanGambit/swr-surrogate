import React, { useCallback } from 'react';
import { useApp } from '@/app/store';
import { Button } from '@/components/shared/Button';
import { generatePathways } from '@/engine/pathwayEngine';
import { estimateBaseline } from '@/engine/buildingEngine';
import { ConfidenceBadge } from '@/components/shared/ConfidenceBadge';
import { MessageCircle, ArrowRight, Sparkles } from 'lucide-react';

export const ChatIntake: React.FC = () => {
  const { state, dispatch } = useApp();

  const handleGenerateAssessment = useCallback(() => {
    // Run engines and generate pathways
    const baseline = estimateBaseline(state.buildingData);

    // Build the COMPLETE building data object for pathway generation
    // (dispatch is async/batched — we must pass the merged data directly)
    const mergedBuilding = {
      ...state.buildingData,
      annualElectricitykWh: state.buildingData.annualElectricitykWh || baseline.annualElectricitykWh,
      annualGasM3: state.buildingData.annualGasM3 || baseline.annualGasM3,
      totalEUI: state.buildingData.totalEUI || baseline.totalEUI,
      estimatedGHG: baseline.estimatedGHG,
      energyStarScore: baseline.energyStarScore,
      confidenceLevel: baseline.confidenceLevel,
      assumptions: baseline.assumptions,
    };

    dispatch({ type: 'UPDATE_BUILDING', data: mergedBuilding });

    // Generate pathways with MERGED data (not stale state)
    const pathways = generatePathways(mergedBuilding, state.userProfile);
    dispatch({ type: 'SET_PATHWAYS', pathways });
    dispatch({ type: 'SET_STEP', step: 'assessment' });
  }, [state.buildingData, state.userProfile, dispatch]);

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-160px)] animate-fadeIn">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Chat with Scout</h2>
          <p className="text-sm text-slate-500">AI-powered intake coming soon.</p>
        </div>
        <div className="flex items-center gap-3">
          <ConfidenceBadge level={state.buildingData.confidenceLevel || 0.15} />
        </div>
      </div>

      {/* Placeholder */}
      <div className="flex-1 flex items-center justify-center bg-white rounded-xl border border-slate-200">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <MessageCircle size={28} className="text-slate-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-700 mb-2">Conversational Intake — Coming Soon</h3>
          <p className="text-sm text-slate-500 mb-1">
            In a future release, Scout will chat with you here to gather building details,
            extract structured data, and sharpen the assessment in real time.
          </p>
          <p className="text-sm text-slate-400">
            For now, generate your assessment using the data already collected.
          </p>
        </div>
      </div>

      <div className="flex justify-between mt-4">
        <Button variant="ghost" onClick={() => dispatch({ type: 'SET_STEP', step: 'constraints' })}>
          Back
        </Button>
        <Button
          variant="primary"
          onClick={handleGenerateAssessment}
        >
          <Sparkles size={16} className="mr-1" />
          Generate Assessment
          <ArrowRight size={16} className="ml-1" />
        </Button>
      </div>
    </div>
  );
};
