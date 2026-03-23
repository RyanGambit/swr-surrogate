import React, { useState } from 'react';
import { useApp } from '@/app/store';
import { Button } from '@/components/shared/Button';
import { generateReport } from '@/services/claude';
import {
  FileText, FileBarChart, FileBadge, Users, Download,
  Sparkles, Send, Loader2, ClipboardCopy, Check, FileOutput,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface DocumentItem {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  phase: string;
}

const DOCUMENTS: DocumentItem[] = [
  {
    id: 'building-assessment',
    icon: <FileBarChart size={24} />,
    title: 'Building Assessment PDF',
    description: 'Complete retrofit assessment including energy baseline, GHG analysis, building scorecard, and data confidence levels.',
    phase: 'Phase D',
  },
  {
    id: 'business-case',
    icon: <FileText size={24} />,
    title: 'Business Case One-Pager',
    description: 'Executive summary for decision-makers. Includes NPV, payback, 9-lever value stack, and ownership-framed recommendation.',
    phase: 'Phase D',
  },
  {
    id: 'incentive-drafts',
    icon: <FileBadge size={24} />,
    title: 'Incentive Application Drafts',
    description: 'Pre-filled application templates for IESO Save on Energy, Enbridge, and CT ITC. Requires manual review before submission.',
    phase: 'Phase D',
  },
  {
    id: 'partner-package',
    icon: <Users size={24} />,
    title: 'Partner Contact Package',
    description: 'Draft emails and contact briefs for recommended turnkey providers, engineering firms, and financing bodies.',
    phase: 'Phase D',
  },
  {
    id: 'session-export',
    icon: <FileOutput size={24} />,
    title: 'Session Export',
    description: 'Full JSON export of your Scout session including building data, pathways, incentive analysis, and chat history.',
    phase: 'Phase D',
  },
];

export const OutputsView: React.FC = () => {
  const { state } = useApp();
  const { buildingData, pathways, userProfile } = state;

  const [customPrompt, setCustomPrompt] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerateCustom = async () => {
    if (!customPrompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setGeneratedContent('');

    try {
      const result = await generateReport(customPrompt, buildingData, pathways, userProfile);
      setGeneratedContent(result);
    } catch (err) {
      setGeneratedContent('Failed to generate document. Please check your API connection and try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSession = () => {
    const exportData = {
      exportDate: new Date().toISOString(),
      sessionId: state.sessionId,
      buildingData: state.buildingData,
      userProfile: state.userProfile,
      pathways: state.pathways,
      selectedPathway: state.selectedPathway,
      incentiveStack: state.incentiveStack,
      proForma: state.proForma,
      chatHistory: state.chatHistory.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scout-session-${state.sessionId.slice(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Document List */}
      <div>
        <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
          <FileText size={20} className="text-slate-600" />
          Downloadable Documents
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          PDF generation is coming in Phase D. Session export is available now.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DOCUMENTS.map(doc => (
            <div
              key={doc.id}
              className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-4 transition-all hover:shadow-sm"
            >
              <div className="bg-slate-100 rounded-lg p-3 text-slate-500 flex-shrink-0">
                {doc.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-slate-900 text-sm">{doc.title}</h4>
                <p className="text-xs text-slate-500 mt-1">{doc.description}</p>
                <div className="mt-3">
                  {doc.id === 'session-export' ? (
                    <Button variant="primary" size="sm" onClick={handleDownloadSession}>
                      <Download size={14} className="mr-1" />
                      Export JSON
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled>
                      <Download size={14} className="mr-1" />
                      Coming Soon
                    </Button>
                  )}
                </div>
              </div>
              <span className="text-xs text-slate-400 font-medium flex-shrink-0">{doc.phase}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Custom Document Generation */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-base font-bold text-slate-900 mb-1 flex items-center gap-2">
          <Sparkles size={18} className="text-purple-600" />
          Custom Document Generation
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          Ask Scout to generate any custom document using your building data and assessment results.
        </p>

        <div className="space-y-3">
          {/* Suggestion chips */}
          <div className="flex flex-wrap gap-2">
            {[
              'Write a board memo recommending the deep retrofit pathway',
              'Draft an email to our LDC about pre-approval for incentives',
              'Create a tenant communication about the upcoming retrofit',
              'Generate a capital plan justification for the assessment',
            ].map(suggestion => (
              <button
                key={suggestion}
                onClick={() => setCustomPrompt(suggestion)}
                className="text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full hover:bg-slate-200 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGenerateCustom()}
              placeholder="Describe the document you need..."
              className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm"
              disabled={isGenerating}
            />
            <Button
              onClick={handleGenerateCustom}
              disabled={!customPrompt.trim() || isGenerating}
              isLoading={isGenerating}
            >
              {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </Button>
          </div>

          {/* Generated Content */}
          {generatedContent && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-slate-700">Generated Document</span>
                <Button variant="ghost" size="sm" onClick={handleCopy}>
                  {copied ? (
                    <>
                      <Check size={14} className="mr-1 text-emerald-600" />
                      <span className="text-emerald-600">Copied</span>
                    </>
                  ) : (
                    <>
                      <ClipboardCopy size={14} className="mr-1" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 prose prose-sm max-w-none overflow-auto max-h-[500px] scout-scroll">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{generatedContent}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
