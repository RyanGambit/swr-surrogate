import React, { useState, useMemo } from 'react';
import { useApp } from '@/app/store';
import { Button } from '@/components/shared/Button';
import { formatCurrencyFull, formatCurrency, formatPercent } from '@/utils/formatting';
import { generateReport } from '@/services/claude';
import type { IncentiveResult, IncentiveProgram, PaymentTiming } from '@/types';
import {
  CheckCircle2, AlertTriangle, XCircle, Clock, Circle, Send,
  Layers, DollarSign, ShieldCheck, Info, ChevronDown, ChevronRight,
  ArrowRight, Lightbulb, Loader2, FileText, AlertCircle,
} from 'lucide-react';

const TIMING_LABELS: Record<PaymentTiming, string> = {
  upfront: 'Upfront / Day 0',
  point_of_sale: 'Point of Sale',
  post_completion: 'Post-Completion',
  tax_filing: 'Tax Filing (12-18 mo)',
  ongoing: 'Ongoing / Annual',
};

const TYPE_COLORS: Record<string, string> = {
  grant: 'bg-emerald-100 text-emerald-700',
  tax_credit: 'bg-purple-100 text-purple-700',
  financing: 'bg-blue-100 text-blue-700',
  rebate: 'bg-amber-100 text-amber-700',
  performance: 'bg-indigo-100 text-indigo-700',
};

type ApplicationStatus = 'not_started' | 'in_progress' | 'submitted' | 'approved';

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  not_started: { label: 'Not Started', color: 'text-slate-500', bg: 'bg-slate-100', icon: <Circle size={14} /> },
  in_progress: { label: 'In Progress', color: 'text-blue-600', bg: 'bg-blue-100', icon: <Clock size={14} /> },
  submitted: { label: 'Submitted', color: 'text-amber-600', bg: 'bg-amber-100', icon: <Send size={14} /> },
  approved: { label: 'Approved', color: 'text-emerald-600', bg: 'bg-emerald-100', icon: <CheckCircle2 size={14} /> },
};

const STATUS_ORDER: ApplicationStatus[] = ['not_started', 'in_progress', 'submitted', 'approved'];

const PROGRAM_TIPS: Record<string, string[]> = {
  ieso_custom: [
    'Focus on peak demand reduction (kW) — often yields higher incentives than kWh savings.',
    'Include a detailed M&V plan showing how savings will be measured post-installation.',
    'Submit pre-approval BEFORE any equipment purchases or work begins.',
  ],
  ieso_prescriptive: [
    'Ensure equipment models are on the IESO qualified products list.',
    'LED fixtures must replace existing fluorescent/HID — new construction not eligible.',
  ],
  enbridge_custom: [
    'Highlight gas savings in cubic metres (m3) — this is the primary metric.',
    'Boiler replacement or ASHP projects typically have the highest gas savings.',
  ],
  enbridge_p4p: [
    'Free energy coaching is included — take advantage of it.',
    'Target 20% gas reduction over 3 years for maximum incentive.',
  ],
  ct_itc: [
    'File with T2 corporate tax return — only taxable Canadian corporations eligible.',
    'Ensure cost basis is reduced by any grants received BEFORE calculating 30%.',
    'Eligible equipment: ASHP, Solar PV, DHW heat pumps. LEDs are NOT eligible.',
  ],
  cib_private: [
    'Must demonstrate a minimum 30% GHG reduction.',
    'CIB financing is through partner banks (Scotiabank/BMO) — contact them directly.',
    'ASHRAE Level 2 audit is typically required as supporting documentation.',
  ],
  cib_public: [
    'Direct application for MUSH entities (municipalities, universities, schools, hospitals).',
    'Include lifecycle cost analysis and climate risk assessment.',
  ],
  bdc_green: [
    'Must intend to achieve or maintain green building certification.',
    'Interest-only first 36 months reduces initial cash flow burden.',
  ],
};

function getEligibilityChecklist(program: IncentiveProgram, state: ReturnType<typeof useApp>['state']): { label: string; met: boolean }[] {
  const checks: { label: string; met: boolean }[] = [];
  const { buildingData, userProfile, pathways, selectedPathway } = state;
  const pathway = pathways.find(p => p.type === selectedPathway) || pathways[0];

  if (program.region.length > 0) {
    checks.push({
      label: `Building in eligible region (${program.region.join(', ')})`,
      met: program.region.includes(buildingData.province || 'ON'),
    });
  }

  if (program.ownershipTypes.length > 0) {
    const orgType = userProfile.organizationType;
    checks.push({
      label: `Eligible ownership type`,
      met: orgType ? program.ownershipTypes.includes(orgType) : false,
    });
  }

  if (program.minGHGReduction) {
    const ghgPct = (pathway?.ghgReductionPct || 0) / 100;
    checks.push({
      label: `Minimum ${(program.minGHGReduction * 100).toFixed(0)}% GHG reduction`,
      met: ghgPct >= program.minGHGReduction,
    });
  }

  if (program.preApprovalRequired) {
    checks.push({ label: 'Pre-approval obtained before work begins', met: false });
  }

  checks.push({ label: 'Program currently accepting applications', met: program.isActive });
  return checks;
}

export const IncentivesView: React.FC = () => {
  const { state } = useApp();
  const { pathways, selectedPathway } = state;
  const [statuses, setStatuses] = useState<Record<string, ApplicationStatus>>({});
  const [expandedProgram, setExpandedProgram] = useState<string | null>(null);
  const [draftingProgram, setDraftingProgram] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const pathway = pathways.find(p => p.type === selectedPathway) || pathways[0];

  if (!pathway) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-500">Select a pathway to view incentive eligibility.</p>
      </div>
    );
  }

  const incentives = pathway.incentiveBreakdown;
  const eligible = incentives.filter(i => i.eligible);
  const totalIncentives = pathway.totalIncentives;
  const coveragePct = pathway.grossCapitalCost > 0 ? totalIncentives / pathway.grossCapitalCost : 0;

  const upfrontTotal = eligible
    .filter(i => i.paymentTiming === 'upfront' || i.paymentTiming === 'point_of_sale')
    .reduce((sum, i) => sum + i.estimatedAmount, 0);
  const delayedTotal = eligible
    .filter(i => i.paymentTiming !== 'upfront' && i.paymentTiming !== 'point_of_sale')
    .reduce((sum, i) => sum + i.estimatedAmount, 0);

  const sortedEligible = [...eligible].sort(
    (a, b) => (a.program.applicationSequence || 99) - (b.program.applicationSequence || 99)
  );

  const hasPreApproval = eligible.some(i => i.program.preApprovalRequired);

  const setStatus = (programId: string, status: ApplicationStatus) => {
    setStatuses(prev => ({ ...prev, [programId]: status }));
  };

  const handleDraftApplication = async (program: IncentiveProgram) => {
    setDraftingProgram(program.id);
    try {
      const prompt = `Draft an application overview for the ${program.name} program for this building retrofit. Include: executive summary, key data points, required docs checklist, tips, and next steps. Use actual building numbers.`;
      const draft = await generateReport(prompt, state.buildingData, pathways, state.userProfile);
      setDrafts(prev => ({ ...prev, [program.id]: draft }));
    } catch (error) {
      setDrafts(prev => ({
        ...prev,
        [program.id]: `Error generating draft. ${error instanceof Error ? error.message : 'Please try again.'}`,
      }));
    } finally {
      setDraftingProgram(null);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
          <div className="text-emerald-600 mb-1"><DollarSign size={18} /></div>
          <div className="text-xs text-slate-500 font-medium">Total Incentives</div>
          <div className="text-lg font-bold text-emerald-700">{formatCurrency(totalIncentives)}</div>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <div className="text-blue-600 mb-1"><Layers size={18} /></div>
          <div className="text-xs text-slate-500 font-medium">Coverage</div>
          <div className="text-lg font-bold text-blue-700">{formatPercent(coveragePct)}</div>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
          <div className="text-purple-600 mb-1"><CheckCircle2 size={18} /></div>
          <div className="text-xs text-slate-500 font-medium">Programs Eligible</div>
          <div className="text-lg font-bold text-purple-700">{eligible.length} of {incentives.length}</div>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
          <div className="text-amber-600 mb-1"><Clock size={18} /></div>
          <div className="text-xs text-slate-500 font-medium">Upfront / Delayed</div>
          <div className="text-lg font-bold text-amber-700">
            {formatCurrency(upfrontTotal)} / {formatCurrency(delayedTotal)}
          </div>
        </div>
      </div>

      {/* Pre-approval Warning */}
      {hasPreApproval && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-red-800 text-sm">Pre-Approval Required Before Any Work</div>
            <p className="text-sm text-red-700 mt-1">
              Starting construction or purchasing equipment without pre-approval will <strong>permanently disqualify</strong> you
              from IESO and Enbridge programs. Apply first, then proceed.
            </p>
          </div>
        </div>
      )}

      {/* Integrated Application Sequence */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Layers size={18} className="text-indigo-600" />
            Application Sequence ({sortedEligible.length} programs)
          </h3>
          <p className="text-xs text-slate-500">Click to expand details, requirements & tips</p>
        </div>

        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-5 top-8 bottom-4 w-0.5 bg-slate-200 z-0" />

          <div className="space-y-3">
            {sortedEligible.map((incentive, idx) => {
              const { program, estimatedAmount, paymentTiming } = incentive;
              const seq = program.applicationSequence || 0;
              const isExpanded = expandedProgram === program.id;
              const status = statuses[program.id] || 'not_started';
              const statusConfig = STATUS_CONFIG[status];
              const tips = PROGRAM_TIPS[program.id] || [];
              const checklist = getEligibilityChecklist(program, state);
              const isDrafting = draftingProgram === program.id;
              const draft = drafts[program.id];
              const typeColor = TYPE_COLORS[program.type] || 'bg-slate-100 text-slate-700';

              const stepColor = seq <= 1
                ? 'bg-red-500 text-white'
                : seq <= 3 ? 'bg-amber-500 text-white'
                : seq <= 5 ? 'bg-blue-500 text-white'
                : 'bg-slate-400 text-white';
              const stepLabel = seq <= 1 ? 'APPLY FIRST' : seq <= 3 ? 'EARLY' : seq <= 5 ? 'MID' : 'AFTER WORK';

              return (
                <div key={program.id} className="flex items-start gap-3 relative">
                  {/* Step number */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 z-10 ${stepColor}`}>
                    {idx + 1}
                  </div>

                  {/* Card */}
                  <div className="flex-1 bg-white rounded-xl border border-slate-200 overflow-hidden transition-all hover:shadow-sm">
                    {/* Header — always visible */}
                    <button
                      onClick={() => setExpandedProgram(isExpanded ? null : program.id)}
                      className="w-full text-left p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-slate-900">{program.name}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${stepColor}`}>{stepLabel}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${typeColor}`}>
                              {program.type.replace(/_/g, ' ')}
                            </span>
                            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusConfig.bg} ${statusConfig.color}`}>
                              {statusConfig.icon}
                              {statusConfig.label}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 mt-1">{program.provider}</div>
                          {program.preApprovalRequired && (
                            <div className="flex items-center gap-1 mt-1 text-xs text-red-600 font-semibold">
                              <AlertTriangle size={10} />
                              Pre-approval required — {program.preApprovalTiming || 'before work begins'}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                          <div className="text-right">
                            <div className="text-sm font-bold text-emerald-700">{formatCurrencyFull(estimatedAmount)}</div>
                            <div className="text-[10px] text-slate-400">{TIMING_LABELS[paymentTiming]}</div>
                          </div>
                          {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                        </div>
                      </div>

                      {/* Status progress bar */}
                      <div className="flex items-center gap-1 mt-3">
                        {STATUS_ORDER.map((s, sIdx) => {
                          const currentIdx = STATUS_ORDER.indexOf(status);
                          return (
                            <div key={s} className={`h-1 flex-1 rounded-full ${sIdx <= currentIdx ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                          );
                        })}
                      </div>
                    </button>

                    {/* Expanded — requirements, tips, status, draft */}
                    {isExpanded && (
                      <div className="border-t border-slate-200 p-4 space-y-4 animate-fadeIn bg-slate-50/50">
                        <p className="text-xs text-slate-600">{program.description}</p>

                        {/* Status Buttons */}
                        <div>
                          <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Update Status</h4>
                          <div className="flex gap-1.5 flex-wrap">
                            {STATUS_ORDER.map(s => (
                              <button
                                key={s}
                                onClick={() => setStatus(program.id, s)}
                                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-colors ${
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

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Requirements */}
                          <div>
                            <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Requirements</h4>
                            <div className="space-y-1">
                              {checklist.map((check, cIdx) => (
                                <div key={cIdx} className="flex items-center gap-1.5">
                                  {check.met ? (
                                    <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0" />
                                  ) : (
                                    <AlertCircle size={12} className="text-amber-500 flex-shrink-0" />
                                  )}
                                  <span className={`text-xs ${check.met ? 'text-slate-600' : 'text-amber-700 font-medium'}`}>
                                    {check.label}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Tips */}
                          {tips.length > 0 && (
                            <div>
                              <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Tips</h4>
                              <div className="space-y-1">
                                {tips.map((tip, tIdx) => (
                                  <div key={tIdx} className="flex items-start gap-1.5">
                                    <Lightbulb size={10} className="text-amber-500 flex-shrink-0 mt-0.5" />
                                    <span className="text-xs text-slate-600">{tip}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* CT ITC note */}
                        {program.id === 'ct_itc' && (
                          <div className="text-xs text-slate-500 bg-purple-50 rounded-lg p-2 border border-purple-100">
                            <strong>Stacking note:</strong> Grants from IESO/Enbridge reduce the eligible cost base before the 30% credit is calculated.
                            Always apply for grants first.
                          </div>
                        )}

                        {/* Draft button */}
                        <div className="pt-2 border-t border-slate-200 flex items-center gap-3">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleDraftApplication(program)}
                            isLoading={isDrafting}
                            disabled={isDrafting}
                          >
                            {isDrafting ? (
                              <><Loader2 size={14} className="mr-1 animate-spin" /> Generating...</>
                            ) : (
                              <><FileText size={14} className="mr-1" /> Draft Application</>
                            )}
                          </Button>
                          {program.expiryDate && (
                            <span className="text-[10px] text-slate-400 flex items-center gap-1">
                              <Info size={10} /> Expires: {program.expiryDate}
                            </span>
                          )}
                        </div>

                        {/* Draft output */}
                        {draft && (
                          <div className="bg-white rounded-lg p-4 border border-slate-200">
                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Generated Draft</h4>
                            <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap text-xs leading-relaxed">
                              {draft}
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
        </div>
      </div>

      {/* Incentive Coverage Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-2">Incentive Coverage</h3>
        <div className="flex items-center gap-4 mb-2">
          <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden relative">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all flex items-center justify-end pr-3"
              style={{ width: `${Math.min(coveragePct * 100, 100)}%` }}
            >
              {coveragePct > 0.15 && (
                <span className="text-xs font-bold text-white">{formatPercent(coveragePct)}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span>Gross: {formatCurrencyFull(pathway.grossCapitalCost)}</span>
          <span>Incentives: {formatCurrencyFull(totalIncentives)}</span>
          <span>Net: {formatCurrencyFull(pathway.netCost)}</span>
        </div>
      </div>

      {/* Stacking Rules — compact */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <ShieldCheck size={14} className="text-indigo-500" /> Stacking Rules
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-600">
          <div className="flex items-start gap-1.5">
            <Info size={12} className="text-red-500 flex-shrink-0 mt-0.5" />
            <span><strong>IESO/Enbridge first.</strong> Pre-approval before any work or purchases.</span>
          </div>
          <div className="flex items-start gap-1.5">
            <Info size={12} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <span><strong>CT ITC last.</strong> Grants reduce cost base before 30% credit.</span>
          </div>
          <div className="flex items-start gap-1.5">
            <Info size={12} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <span><strong>CIB stacks with all.</strong> Low-interest financing, requires 30% GHG.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
