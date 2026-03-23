import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '@/app/store';
import { Button } from '@/components/shared/Button';
import { sendChatMessage, buildAdvisorSystemPrompt } from '@/services/claude';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, X, Sparkles } from 'lucide-react';
import type { ChatMessage } from '@/types';

interface DashboardAdvisorProps {
  onClose: () => void;
}

export const DashboardAdvisor: React.FC<DashboardAdvisorProps> = ({ onClose }) => {
  const { state, dispatch } = useApp();
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [advisorMessages, setAdvisorMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const systemPrompt = buildAdvisorSystemPrompt(
    state.buildingData,
    state.userProfile,
    state.pathways
  );

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [advisorMessages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Send initial greeting if no messages
  useEffect(() => {
    if (advisorMessages.length === 0) {
      const pathway = state.pathways.find(p => p.type === state.selectedPathway) || state.pathways[0];
      let greeting = `I'm here to help you dig into your assessment results. `;
      if (pathway) {
        greeting += `You're looking at the **${pathway.name}** pathway. `;
      }
      greeting += `\n\nI can help you:\n- Compare pathways and understand trade-offs\n- Explain incentive eligibility and application steps\n- Draft emails to partners or your LDC\n- Interpret financial metrics\n- Explore what-if scenarios\n\nWhat would you like to know?`;

      setAdvisorMessages([{
        id: crypto.randomUUID(),
        role: 'assistant',
        content: greeting,
        timestamp: new Date(),
      }]);
    }
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isTyping) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    setAdvisorMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await sendChatMessage(
        advisorMessages,
        trimmed,
        systemPrompt
      );

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };

      setAdvisorMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      setAdvisorMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'I had trouble processing that request. Please try again or rephrase your question.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsTyping(false);
    }
  }, [input, isTyping, advisorMessages, systemPrompt]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-emerald-100 rounded-lg p-1.5">
            <Sparkles size={16} className="text-emerald-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Scout Advisor</h3>
            <p className="text-xs text-slate-500">Ask about your assessment</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scout-scroll">
        {advisorMessages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-50 text-slate-800 border border-slate-200'
              }`}
            >
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm text-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-slate-50 rounded-2xl px-4 py-3 border border-slate-200">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-200 bg-white flex-shrink-0">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Ask about your assessment..."
            className="flex-1 px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
            disabled={isTyping}
          />
          <Button onClick={handleSend} disabled={!input.trim() || isTyping} size="sm">
            <Send size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
};
