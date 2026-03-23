import React, { useState, useMemo } from 'react';
import { useApp } from '@/app/store';
import { REGIONAL_PARTNERS } from '@/constants/partners';
import {
  CheckCircle2, Circle, AlertTriangle, Clock, ChevronDown, ChevronRight,
  ArrowRight, TrendingUp, Shield, Zap, Wrench, Building2, Sun, Gauge,
  Info,
} from 'lucide-react';
import type { PathwayType, Partner } from '@/types';

// ─── Phase Data ───────────────────────────────────────────────────────────────

interface PhaseTask {
  label: string;
  critical?: boolean;
}

interface RoadmapPhase {
  id: string;
  name: string;
  timeline: string;
  icon: React.ReactNode;
  color: string;
  dotColor: string;
  tasks: PhaseTask[];
  warnings: string[];
  partnerCategories: string[];
}

function buildPhases(pathwayType: PathwayType | null): RoadmapPhase[] {
  const isDeep = pathwayType === 'deep' || pathwayType === 'grid_smart';

  return [
    {
      id: 'pre-approval',
      name: 'Phase 1: Pre-Approval',
      timeline: 'Week 1-4',
      icon: <Shield size={20} />,
      color: 'text-blue-700',
      dotColor: 'bg-blue-500',
      tasks: [
        { label: 'Apply for IESO Save on Energy pre-approval', critical: true },
        { label: 'Apply for Enbridge Commercial Custom pre-approval', critical: true },
        { label: 'Get energy audit quotes (ASHRAE Level 2)', critical: false },
        { label: 'Engage engineering firm for preliminary scope', critical: false },
        ...(isDeep ? [{ label: 'Contact CIB lending partner (Scotiabank/BMO) for preliminary eligibility', critical: false }] : []),
      ],
      warnings: [
        'IESO pre-approval MUST be obtained before any equipment purchase or installation begins. Starting work early = PERMANENT disqualification.',
        'Enbridge pre-approval is also required before work begins for the Commercial Custom program.',
      ],
      partnerCategories: ['LDC', 'Gas Utility', 'Engineering / Consulting'],
    },
    {
      id: 'design',
      name: 'Phase 2: Design',
      timeline: 'Month 2-4',
      icon: <Wrench size={20} />,
      color: 'text-emerald-700',
      dotColor: 'bg-emerald-500',
      tasks: [
        { label: 'Complete ASHRAE Level 2 energy audit', critical: false },
        { label: 'Finalize measure selection based on audit findings', critical: false },
        { label: 'Develop detailed engineering specifications', critical: false },
        { label: 'Submit incentive applications (IESO Custom, Enbridge)', critical: true },
        ...(isDeep ? [
          { label: 'Submit CIB financing application (must demonstrate >=30% GHG reduction)', critical: true },
          { label: 'Prepare CT ITC documentation for eligible equipment', critical: false },
        ] : []),
        { label: 'Confirm utility interconnection requirements (if solar)', critical: false },
      ],
      warnings: [
        'Do not finalize contractor contracts until incentive pre-approvals are confirmed in writing.',
        ...(isDeep ? ['CIB requires a minimum 30% GHG reduction. Ensure your measure package meets this threshold.'] : []),
      ],
      partnerCategories: ['Engineering / Consulting', 'Financing'],
    },
    {
      id: 'procurement',
      name: 'Phase 3: Procurement',
      timeline: 'Month 4-6',
      icon: <Building2 size={20} />,
      color: 'text-purple-700',
      dotColor: 'bg-purple-500',
      tasks: [
        { label: 'Tender contractors with approved specs', critical: false },
        { label: 'Finalize financing arrangements', critical: true },
        { label: 'Get electrical panel assessment (capacity for ASHP/EV)', critical: false },
        { label: 'Order long-lead equipment (heat pumps, VFDs)', critical: false },
        { label: 'Coordinate tenant communication plan', critical: false },
        { label: 'Establish M&V baseline metering', critical: false },
      ],
      warnings: [
        'Confirm all pre-approvals are in place before issuing purchase orders.',
        'Long-lead items (commercial ASHPs, custom AHUs) can take 12-16 weeks. Order early.',
      ],
      partnerCategories: ['Turnkey Provider', 'Financing'],
    },
    {
      id: 'construction',
      name: 'Phase 4: Construction',
      timeline: 'Month 6-12',
      icon: <Gauge size={20} />,
      color: 'text-amber-700',
      dotColor: 'bg-amber-500',
      tasks: [
        { label: '1. Install controls and BAS upgrades first', critical: false },
        { label: '2. Complete envelope upgrades (windows, insulation, roof)', critical: false },
        { label: '3. Install mechanical systems (ASHP, VFDs, ERVs)', critical: false },
        { label: '4. Install renewables (solar PV, battery storage)', critical: false },
        { label: 'Commission each system as installed', critical: false },
        { label: 'Document all installations for incentive claims', critical: true },
      ],
      warnings: [
        'Sequence matters: controls first enables optimization of all subsequent systems.',
        'Envelope before mechanical: reducing loads first means smaller (cheaper) mechanical equipment.',
        'Maintain photo documentation and equipment specs for all incentive claims.',
      ],
      partnerCategories: ['Turnkey Provider', 'Engineering / Consulting'],
    },
    {
      id: 'commissioning',
      name: 'Phase 5: Commissioning & M&V',
      timeline: 'Month 12-14',
      icon: <Sun size={20} />,
      color: 'text-teal-700',
      dotColor: 'bg-teal-500',
      tasks: [
        { label: 'Commission all systems and verify performance', critical: true },
        { label: 'Start M&V measurement period (typically 12 months)', critical: false },
        { label: 'Submit IESO post-completion incentive application', critical: true },
        { label: 'Submit Enbridge post-completion verification', critical: true },
        { label: 'Apply for performance-based incentives (demand response, P4P)', critical: false },
        ...(isDeep ? [
          { label: 'File CT ITC with T2 tax return', critical: true },
          { label: 'Submit CIB project completion report', critical: false },
        ] : []),
        { label: 'Train building operators on new systems', critical: false },
      ],
      warnings: [
        'IESO incentive payment requires verified energy savings data. Ensure M&V plan is in place.',
        'CT ITC must be filed with T2 return. Ensure basis is reduced by any grants received first.',
      ],
      partnerCategories: ['Engineering / Consulting', 'LDC', 'Gas Utility'],
    },
  ];
}

// ─── Component ──────────────────────────────────────────────────────────────

export const ActionPlanView: React.FC = () => {
  const { state } = useApp();
  const { selectedPathway, pathways, buildingData, userProfile } = state;
  const [expandedPhase, setExpandedPhase] = useState<string | null>('pre-approval');
  const [checkedTasks, setCheckedTasks] = useState<Set<string>>(new Set());

  const pathway = pathways.find(p => p.type === selectedPathway) || pathways[0];
  const phases = useMemo(() => buildPhases(selectedPathway), [selectedPathway]);

  // Get relevant partners for a phase
  const getPhasePartners = (categories: string[]): Partner[] => {
    return REGIONAL_PARTNERS.filter(p => categories.includes(p.category)).slice(0, 4);
  };

  const toggleTask = (phaseId: string, taskIdx: number) => {
    const key = `${phaseId}-${taskIdx}`;
    setCheckedTasks(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const togglePhase = (phaseId: string) => {
    setExpandedPhase(prev => prev === phaseId ? null : phaseId);
  };

  // Estimate heating system end-of-life
  const heatingAge = buildingData.heatingAge || 15;
  const estimatedEOL = Math.max(0, 25 - heatingAge);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-100 rounded-full p-2">
            <TrendingUp size={20} className="text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Retrofit Action Plan
              {pathway && <span className="text-sm font-normal text-slate-500 ml-2">({pathway.name})</span>}
            </h2>
            <p className="text-sm text-slate-500">
              Step-by-step roadmap to execute your retrofit project
            </p>
          </div>
        </div>
      </div>

      {/* Deep Retrofit Nudge for Light pathway */}
      {selectedPathway === 'light' && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <div className="bg-emerald-100 rounded-full p-2 flex-shrink-0 mt-0.5">
              <Info size={18} className="text-emerald-700" />
            </div>
            <div>
              <h3 className="font-bold text-emerald-800 text-sm">Plan Ahead: Deep Retrofit Opportunity</h3>
              <p className="text-sm text-emerald-700 mt-1.5 leading-relaxed">
                Your current pathway captures quick wins with strong ROI. When your heating system reaches end-of-life
                {estimatedEOL > 0 ? ` (estimated in ~${estimatedEOL} years)` : ' (approaching now)'}, stepping up to a{' '}
                <strong>Deep Retrofit</strong> unlocks CIB financing at 2-3% and could reduce your GHG emissions by 50-80%.
                Scout can help you plan the transition.
              </p>
              {pathway?.sequentialBridge && (
                <div className="mt-3 p-3 bg-white/60 rounded-lg border border-emerald-200">
                  <div className="flex items-center gap-2 text-sm text-emerald-800">
                    <ArrowRight size={14} />
                    <span className="font-medium">Sequential Bridge:</span>
                  </div>
                  <p className="text-sm text-emerald-700 mt-1">{pathway.sequentialBridge}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        {phases.map((phase, phaseIdx) => {
          const isExpanded = expandedPhase === phase.id;
          const phasePartners = getPhasePartners(phase.partnerCategories);
          const completedCount = phase.tasks.filter((_, i) => checkedTasks.has(`${phase.id}-${i}`)).length;
          const isComplete = completedCount === phase.tasks.length;

          return (
            <div key={phase.id} className="relative flex gap-4 pb-2">
              {/* Vertical Line */}
              <div className="flex flex-col items-center flex-shrink-0" style={{ width: '40px' }}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isComplete ? 'bg-emerald-500 text-white' : `${phase.dotColor} text-white`
                }`}>
                  {isComplete ? <CheckCircle2 size={20} /> : phase.icon}
                </div>
                {phaseIdx < phases.length - 1 && (
                  <div className={`w-0.5 flex-1 min-h-[20px] ${
                    isComplete ? 'bg-emerald-300' : 'bg-slate-200'
                  }`} />
                )}
              </div>

              {/* Phase Content */}
              <div className="flex-1 pb-6">
                <button
                  onClick={() => togglePhase(phase.id)}
                  className="w-full text-left bg-white rounded-xl border border-slate-200 hover:border-slate-300 p-4 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h3 className={`font-bold text-sm ${phase.color}`}>{phase.name}</h3>
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                        <Clock size={10} />
                        {phase.timeline}
                      </span>
                      {completedCount > 0 && (
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                          {completedCount}/{phase.tasks.length} done
                        </span>
                      )}
                    </div>
                    {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="mt-2 bg-white rounded-xl border border-slate-200 p-5 space-y-4 animate-fadeIn">
                    {/* Tasks */}
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Key Tasks</h4>
                      <div className="space-y-2">
                        {phase.tasks.map((task, taskIdx) => {
                          const taskKey = `${phase.id}-${taskIdx}`;
                          const isChecked = checkedTasks.has(taskKey);

                          return (
                            <label
                              key={taskIdx}
                              className={`flex items-start gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                                isChecked ? 'bg-emerald-50' : 'hover:bg-slate-50'
                              }`}
                            >
                              <button
                                onClick={(e) => { e.preventDefault(); toggleTask(phase.id, taskIdx); }}
                                className="flex-shrink-0 mt-0.5"
                              >
                                {isChecked ? (
                                  <CheckCircle2 size={18} className="text-emerald-500" />
                                ) : (
                                  <Circle size={18} className="text-slate-300" />
                                )}
                              </button>
                              <span className={`text-sm ${isChecked ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                {task.label}
                                {task.critical && (
                                  <span className="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold">
                                    Critical
                                  </span>
                                )}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Warnings */}
                    {phase.warnings.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2">Critical Warnings</h4>
                        <div className="space-y-2">
                          {phase.warnings.map((warning, wIdx) => (
                            <div key={wIdx} className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                              <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                              <span className="text-xs text-amber-800">{warning}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Relevant Partners */}
                    {phasePartners.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Relevant Partners</h4>
                        <div className="flex flex-wrap gap-2">
                          {phasePartners.map((partner, pIdx) => (
                            <div key={pIdx} className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs">
                              <Zap size={10} className="text-slate-400" />
                              <span className="font-medium text-slate-700">{partner.name}</span>
                              {partner.phone && (
                                <a href={`tel:${partner.phone}`} className="text-blue-500 hover:text-blue-700 ml-1">
                                  {partner.phone}
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sequential Bridge Timeline (for light pathway with bridge) */}
      {selectedPathway === 'light' && pathway?.sequentialBridge && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-bold text-sm text-slate-900 mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-600" />
            Sequential Retrofit Bridge Timeline
          </h3>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-blue-100 rounded-lg p-3 text-center">
              <div className="text-xs font-semibold text-blue-700">Now</div>
              <div className="text-sm font-bold text-blue-900 mt-1">Light Retrofit</div>
              <div className="text-xs text-blue-600 mt-0.5">Quick wins, strong ROI</div>
            </div>
            <ArrowRight size={20} className="text-slate-400 flex-shrink-0" />
            <div className="flex-1 bg-amber-50 rounded-lg p-3 text-center border border-dashed border-amber-300">
              <div className="text-xs font-semibold text-amber-700">
                ~{estimatedEOL > 0 ? `${estimatedEOL} years` : 'Soon'}
              </div>
              <div className="text-sm font-bold text-amber-900 mt-1">Equipment EOL</div>
              <div className="text-xs text-amber-600 mt-0.5">Heating system replacement</div>
            </div>
            <ArrowRight size={20} className="text-slate-400 flex-shrink-0" />
            <div className="flex-1 bg-emerald-100 rounded-lg p-3 text-center">
              <div className="text-xs font-semibold text-emerald-700">Future</div>
              <div className="text-sm font-bold text-emerald-900 mt-1">Deep Retrofit</div>
              <div className="text-xs text-emerald-600 mt-0.5">CIB eligible, 50-80% GHG cut</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActionPlanView;
