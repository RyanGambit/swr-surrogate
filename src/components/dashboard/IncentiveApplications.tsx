import React, { useState, useMemo } from 'react';
import { useApp } from '@/app/store';
import { INCENTIVE_PROGRAMS } from '@/constants/programs';
import { Button } from '@/components/shared/Button';
import { generateReport } from '@/services/claude';
import { formatCurrency } from '@/utils/formatting';
import type { IncentiveProgram } from '@/types';
import {
  FileCheck, CheckCircle2, Circle, Clock, AlertCircle, Send,
  ChevronDown, ChevronRight, Lightbulb, Loader2, FileText,
  ArrowRight,
} from 'lucide-react';

// ─── Status Types ─────────────────────────────────────────────────────────────

type ApplicationStatus = 'not_started' | 'in_progress' | 'submitted' | 'approved';

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  not_started: { label: 'Not Started', color: 'text-slate-500', bg: 'bg-slate-100', icon: <Circle size={14} /> },
  in_progress: { label: 'In Progress', color: 'text-blue-600', bg: 'bg-blue-100', icon: <Clock size={14} /> },
  submitted: { label: 'Submitted', color: 'text-amber-600', bg: 'bg-amber-100', icon: <Send size={14} /> },
  approved: { label: 'Approved', color: 'text-emerald-600', bg: 'bg-emerald-100', icon: <CheckCircle2 size={14} /> },
};

const STATUS_ORDER: ApplicationStatus[] = ['not_started', 'in_progress', 'submitted', 'approved'];

// ─── Application Tips ─────────────────────────────────────────────────────────

const PROGRAM_TIPS: Record<string, string[]> = {
  ieso_custom: [
    'Focus on peak demand reduction (kW) — this often yields higher incentives than kWh savings.',
    'Include a detailed M&V plan showing how savings will be measured post-installation.',
    'Highlight any BAS/controls upgrades that enable load shifting or demand response.',
    'Submit pre-approval BEFORE any equipment purchases or work begins.',
  ],
  ieso_prescriptive: [
    'Ensure equipment models are on the IESO qualified products list.',
    'Keep all receipts and equipment specifications for post-installation verification.',
    'LED fixtures must replace existing fluorescent/HID — new construction not eligible.',
  ],
  enbridge_custom: [
    'Highlight gas savings in cubic metres (m3) — this is the primary metric.',
    'Provide detailed before/after equipment specifications.',
    'Include heating degree day normalization in your savings calculations.',
    'Boiler replacement or ASHP projects typically have the highest gas savings.',
  ],
  enbridge_p4p: [
    'Free energy coaching is included — take advantage of it.',
    'Target 20% gas reduction over 3 years for maximum incentive.',
    'Low-cost/no-cost operational improvements count toward savings.',
  ],
  ct_itc: [
    'File with T2 corporate tax return — only taxable Canadian corporations eligible.',
    'Ensure cost basis is reduced by any grants received (IESO, Enbridge) before calculating 30%.',
    'Eligible equipment: ASHP, Solar PV, DHW heat pumps. LEDs are NOT eligible.',
    'Keep detailed records of equipment costs segregated from installation labor.',
  ],
  cib_private: [
    'Must demonstrate a minimum 30% GHG reduction from the retrofit project.',
    'Include a 20-year cash flow projection showing loan serviceability.',
    'CIB financing is through partner banks (Scotiabank/BMO) — contact them directly.',
    'ASHRAE Level 2 audit is typically required as supporting documentation.',
  ],
  cib_public: [
    'Direct application for MUSH entities (municipalities, universities, schools, hospitals).',
    'Must demonstrate a minimum 30% GHG reduction.',
    'Include lifecycle cost analysis and climate risk assessment.',
  ],
  bdc_green: [
    'Must intend to achieve or maintain a green building certification (BOMA BEST Silver, ENERGY STAR 75+, or LEED Silver).',
    'Interest-only first 36 months reduces initial cash flow burden.',
    'Up to 100% of project costs can be financed.',
  ],
};

// ─── Eligibility Checklist ────────────────────────────────────────────────────

function getEligibilityChecklist(program: IncentiveProgram, state: ReturnType<typeof useApp>['state']): { label: string; met: boolean }[] {
  const checks: { label: string; met: boolean }[] = [];
  const { buildingData, userProfile, pathways, selectedPathway } = state;
  const pathway = pathways.find(p => p.type === selectedPathway) || pathways[0];

  // Region check
  if (program.region.length > 0) {
    checks.push({
      label: `Building in eligible region (${program.region.join(', ')})`,
      met: program.region.includes(buildingData.province || 'ON'),
    });
  }

  // Ownership type
  if (program.ownershipTypes.length > 0) {
    const orgType = userProfile.organizationType;
    checks.push({
      label: `Eligible ownership type (${program.ownershipTypes.slice(0, 3).join(', ')}${program.ownershipTypes.length > 3 ? '...' : ''})`,
      met: orgType ? program.ownershipTypes.includes(orgType) : false,
    });
  }

  // GHG reduction threshold
  if (program.minGHGReduction) {
    const ghgPct = (pathway?.ghgReductionPct || 0) / 100;
    checks.push({
      label: `Minimum ${(program.minGHGReduction * 100).toFixed(0)}% GHG reduction`,
      met: ghgPct >= program.minGHGReduction,
    });
  }

  // Pre-approval
  if (program.preApprovalRequired) {
    checks.push({
      label: 'Pre-approval obtained before work begins',
      met: false,
    });
  }

  // Active status
  checks.push({
    label: 'Program currently accepting applications',
    met: program.isActive,
  });

  return checks;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const IncentiveApplications: React.FC = () => {
  const { state } = useApp();
  const { pathways, selectedPathway, incentiveStack } = state;
  const [statuses, setStatuses] = useState<Record<string, ApplicationStatus>>({});
  const [expandedProgram, setExpandedProgram] = useState<string | null>(null);
  const [draftingProgram, setDraftingProgram] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const pathway = pathways.find(p => p.type === selectedPathway) || pathways[0];

  // Get eligible programs from the incentive stack, or fall back to filtering manually
  const eligiblePrograms = useMemo(() => {
    if (incentiveStack?.eligible) {
      return incentiveStack.eligible
        .filter(r => r.eligible && r.estimatedAmount > 0)
        .map(r => ({
          program: r.program,
          amount: r.estimatedAmount,
        }));
    }

    // Fallback: show all active programs
    return INCENTIVE_PROGRAMS
      .filter(p => p.isActive)
      .map(p => ({
        program: p,
        amount: 0,
      }));
  }, [incentiveStack]);

  const setStatus = (programId: string, status: ApplicationStatus) => {
    setStatuses(prev => ({ ...prev, [programId]: status }));
  };

  const handleDraftApplication = async (program: IncentiveProgram) => {
    setDraftingProgram(program.id);
    try {
      const prompt = `Draft an application overview / preparation document for the ${program.name} program for this building retrofit project. Include:
1. Executive summary of the project and expected outcomes
2. Key data points to include in the application (energy savings, GHG reduction, costs, payback)
3. Required supporting documentation checklist
4. Specific tips for a strong application to this program
5. Timeline and next steps

Be specific to THIS building and THIS project — use the actual numbers.`;

      const draft = await generateReport(prompt, state.buildingData, pathways, state.userProfile);
      setDrafts(prev => ({ ...prev, [program.id]: draft }));
    } catch (error) {
      setDrafts(prev => ({
        ...prev,
        [program.id]: `Error generating draft. Please try again or contact support.\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }));
    } finally {
      setDraftingProgram(null);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-3">
          <div className="bg-purple-100 rounded-full p-2">
            <FileCheck size={20} className="text-purple-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Incentive Applications</h2>
            <p className="text-sm text-slate-500">
              Track and prepare applications for {eligiblePrograms.length} eligible programs
              {incentiveStack && (
                <span className="ml-1">
                  — total potential incentives: <strong className="text-emerald-600">{formatCurrency(incentiveStack.totalGrants + incentiveStack.ctItcAmount)}</strong>
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Application Sequence Note */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Lightbulb size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <strong>Application Order Matters.</strong> Programs are sorted by recommended application sequence.
          Apply for pre-approval programs (IESO, Enbridge) first, then financing (CIB), then tax credits (CT ITC) at year-end.
        </div>
      </div>

      {/* Program Cards */}
      {eligiblePrograms
        .sort((a, b) => a.program.applicationSequence - b.program.applicationSequence)
        .map(({ program, amount }) => {
          const status = statuses[program.id] || 'not_started';
          const statusConfig = STATUS_CONFIG[status];
          const isExpanded = expandedProgram === program.id;
          const tips = PROGRAM_TIPS[program.id] || [];
          const checklist = getEligibilityChecklist(program, state);
          const isDrafting = draftingProgram === program.id;
          const draft = drafts[program.id];

          return (
            <div
              key={program.id}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden transition-all hover:shadow-sm"
            >
              {/* Program Header */}
              <button
                onClick={() => setExpandedProgram(isExpanded ? null : program.id)}
                className="w-full text-left p-5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-sm text-slate-900">{program.name}</h3>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusConfig.bg} ${statusConfig.color}`}>
                        {statusConfig.icon}
                        {statusConfig.label}
                      </span>
                      {program.preApprovalRequired && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
                          Pre-Approval Required
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{program.provider} — {program.description}</p>
                    {amount > 0 && (
                      <div className="text-sm font-bold text-emerald-600 mt-2">
                        Estimated: {formatCurrency(amount)}
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0 ml-3">
                    {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                  </div>
                </div>

                {/* Status Tracker */}
                <div className="flex items-center gap-1 mt-4">
                  {STATUS_ORDER.map((s, idx) => {
                    const currentIdx = STATUS_ORDER.indexOf(status);
                    const isReached = idx <= currentIdx;
                    return (
                      <React.Fragment key={s}>
                        <div className={`h-1.5 flex-1 rounded-full transition-colors ${
                          isReached ? 'bg-emerald-400' : 'bg-slate-200'
                        }`} />
                      </React.Fragment>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-1">
                  {STATUS_ORDER.map(s => (
                    <span key={s} className={`text-[10px] ${s === status ? 'font-semibold text-slate-700' : 'text-slate-400'}`}>
                      {STATUS_CONFIG[s].label}
                    </span>
                  ))}
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="border-t border-slate-200 p-5 space-y-5 animate-fadeIn">
                  {/* Status Buttons */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Update Status</h4>
                    <div className="flex gap-2 flex-wrap">
                      {STATUS_ORDER.map(s => (
                        <button
                          key={s}
                          onClick={() => setStatus(program.id, s)}
                          className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                            s === status
                              ? `${STATUS_CONFIG[s].bg} ${STATUS_CONFIG[s].color} border-current`
                              : 'border-slate-200 text-slate-500 hover:border-slate-300'
                          }`}
                        >
                          {STATUS_CONFIG[s].icon}
                          {STATUS_CONFIG[s].label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Eligibility Checklist */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Eligibility Requirements</h4>
                    <div className="space-y-1.5">
                      {checklist.map((check, cIdx) => (
                        <div key={cIdx} className="flex items-center gap-2">
                          {check.met ? (
                            <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                          ) : (
                            <AlertCircle size={14} className="text-amber-500 flex-shrink-0" />
                          )}
                          <span className={`text-xs ${check.met ? 'text-slate-600' : 'text-amber-700 font-medium'}`}>
                            {check.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Application Tips */}
                  {tips.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Application Tips</h4>
                      <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                        {tips.map((tip, tIdx) => (
                          <div key={tIdx} className="flex items-start gap-2">
                            <ArrowRight size={12} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                            <span className="text-xs text-slate-700">{tip}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pre-approval Warning */}
                  {program.preApprovalRequired && program.preApprovalTiming && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                      <AlertCircle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
                      <span className="text-xs text-red-800 font-medium">
                        {program.preApprovalTiming}
                      </span>
                    </div>
                  )}

                  {/* Draft Application Button */}
                  <div className="pt-2 border-t border-slate-100">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleDraftApplication(program)}
                      isLoading={isDrafting}
                      disabled={isDrafting}
                    >
                      {isDrafting ? (
                        <>
                          <Loader2 size={14} className="mr-1 animate-spin" />
                          Generating Draft...
                        </>
                      ) : (
                        <>
                          <FileText size={14} className="mr-1" />
                          Draft Application
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Draft Output */}
                  {draft && (
                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Generated Draft</h4>
                      <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap text-xs leading-relaxed">
                        {draft}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

      {eligiblePrograms.length === 0 && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-8 text-center">
          <AlertCircle size={32} className="mx-auto text-slate-400 mb-3" />
          <h3 className="font-bold text-slate-700">No Eligible Programs Found</h3>
          <p className="text-sm text-slate-500 mt-1">
            Select a pathway and complete the assessment to see eligible incentive programs.
          </p>
        </div>
      )}
    </div>
  );
};

export default IncentiveApplications;
