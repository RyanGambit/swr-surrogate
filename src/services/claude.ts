import type { BuildingData, UserProfile, Pathway, ChatMessage } from '@/types';

// ─── Claude API Integration ────────────────────────────────────────────────
// Uses a proxy endpoint to avoid exposing API keys client-side.
// For development, can use direct API calls with env variable.

const API_URL = import.meta.env.VITE_CLAUDE_API_URL || '/api/chat';
const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || '';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function callClaude(
  messages: ClaudeMessage[],
  systemPrompt: string,
  model: string = 'claude-sonnet-4-20250514'
): Promise<string> {
  // If we have a direct API key (dev mode), call Anthropic directly
  if (API_KEY) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${err}`);
    }

    const data = await response.json();
    return data.content[0]?.text || '';
  }

  // Otherwise use proxy endpoint
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, system: systemPrompt, model }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  return data.content || data.text || '';
}

// ─── Scout Intake Chat ──────────────────────────────────────────────────────

export function buildIntakeSystemPrompt(
  building: Partial<BuildingData>,
  userProfile: Partial<UserProfile>
): string {
  return `You are Scout, a conversational deep retrofit assessment advisor for Ontario commercial and institutional buildings. You are currently in the INTAKE phase — gathering building details through natural conversation.

YOUR PERSONALITY:
- Professional but warm, direct, never condescending
- Use concrete numbers and examples from Ontario retrofit programs
- Acknowledge uncertainty openly
- Proactively surface information the user didn't know to ask about

BUILDING DATA COLLECTED SO FAR:
${JSON.stringify(building, null, 2)}

USER PROFILE:
${JSON.stringify(userProfile, null, 2)}

BASELINE ENERGY METRICS:
- Total EUI: ${building.totalEUI || 'Not yet calculated'} ekWh/m²
- Estimated GHG: ${building.estimatedGHG || 'Not yet calculated'} tCO2e/yr
- Annual Electricity: ${building.annualElectricitykWh ? `${building.annualElectricitykWh.toLocaleString()} kWh` : 'Not yet calculated'}
- Annual Gas: ${building.annualGasM3 ? `${building.annualGasM3.toLocaleString()} m³` : 'Not yet calculated'}

DATA QUALITY:
- Confidence Level: ${building.confidenceLevel || 0.15} (0-1 scale, higher = more data)
- Utility Bills: ${building.utilityBillUploaded ? 'Uploaded (real data)' : building.utilityBillSimulated ? 'Simulated' : 'Not provided'}
- Capital Plan: ${building.capitalPlanUploaded ? 'Uploaded (real data)' : building.capitalPlanSimulated ? 'Simulated' : 'Not provided'}
- Reserve Fund Study: ${building.reserveFundStudyUploaded ? 'Uploaded (real data)' : building.reserveFundStudySimulated ? 'Simulated' : 'Not provided'}
${building.assumptions?.length ? `\nASSUMPTIONS MADE:\n${building.assumptions.map((a: any) => `- ${a.parameter}: assumed ${a.assumedValue} (${a.improvementPrompt})`).join('\n')}` : ''}

When data is simulated, proactively tell the user which values are estimates and how they could improve accuracy. When assumptions are listed, mention them when relevant to the question.

YOUR TASK:
Ask follow-up questions about the building to fill gaps in the data. Focus on:
1. Equipment condition and age (heating, cooling, ventilation)
2. Business type operating in the building (affects retrofit economics)
3. Known issues (comfort complaints, equipment failures, leaks)
4. Recent renovations or planned capital work
5. Existing solar, BAS, or certifications
6. Tenant count and lease structure (for multi-tenant buildings)

CRITICAL RULES:
- When the user provides information, extract structured data and include it in your response as a JSON block wrapped in <data> tags. Example:
  <data>{"heatingAge": 30, "hvacCondition": "poor", "knownIssues": ["boiler unreliable"]}</data>
- Keep questions conversational, not like a form
- 5-8 turns typical before generating results
- When you have enough info (or the user wants to proceed), say "I have enough to generate your assessment" and include <ready>true</ready>
- Never say "I don't have access to" — you have the full assessment context
- Always be specific to THIS building, THIS ownership type, THIS region
- When the user says "I don't know," make a reasonable assumption, flag it, and explain how to improve it`;
}

// ─── Scout Dashboard Advisor ────────────────────────────────────────────────

export function buildAdvisorSystemPrompt(
  building: Partial<BuildingData>,
  userProfile: Partial<UserProfile>,
  pathways: Pathway[]
): string {
  const ownershipFrames: Record<string, string> = {
    'single_building': 'Monthly/annual cash flow, simple payback, total savings over 20 years',
    'small_portfolio': 'NOI impact, asset value uplift, portfolio-level incentive stacking',
    'large_portfolio': 'NAV impact, regulatory risk, hold period analysis',
    'condo_corp': 'Per-unit assessment impact, reserve fund integration, common fee stability',
    'municipality': 'Budget relief, council mandate compliance, GHG reporting alignment',
    'reit': 'NAV protection, GRESB score, regulatory compliance timeline',
    'institutional': 'Budget relief, mandate compliance, lifecycle cost analysis',
  };

  const financialFrame = ownershipFrames[userProfile.ownershipModel || 'single_building'] || 'Cash flow and payback analysis';

  return `You are Scout, a deep retrofit assessment advisor for Ontario commercial buildings.

BUILDING CONTEXT:
${JSON.stringify(building, null, 2)}

BASELINE ENERGY METRICS:
- Total EUI: ${building.totalEUI || 'Not yet calculated'} ekWh/m²
- Estimated GHG: ${building.estimatedGHG || 'Not yet calculated'} tCO2e/yr
- Annual Electricity: ${building.annualElectricitykWh ? `${building.annualElectricitykWh.toLocaleString()} kWh` : 'Not yet calculated'}
- Annual Gas: ${building.annualGasM3 ? `${building.annualGasM3.toLocaleString()} m³` : 'Not yet calculated'}

DATA QUALITY:
- Confidence Level: ${building.confidenceLevel || 0.15} (0-1 scale, higher = more data)
- Utility Bills: ${building.utilityBillUploaded ? 'Uploaded (real data)' : building.utilityBillSimulated ? 'Simulated' : 'Not provided'}
- Capital Plan: ${building.capitalPlanUploaded ? 'Uploaded (real data)' : building.capitalPlanSimulated ? 'Simulated' : 'Not provided'}
- Reserve Fund Study: ${building.reserveFundStudyUploaded ? 'Uploaded (real data)' : building.reserveFundStudySimulated ? 'Simulated' : 'Not provided'}
${building.assumptions?.length ? `\nASSUMPTIONS MADE:\n${building.assumptions.map((a: any) => `- ${a.parameter}: assumed ${a.assumedValue} (${a.improvementPrompt})`).join('\n')}` : ''}

When data is simulated, proactively tell the user which values are estimates and how they could improve accuracy. When assumptions are listed, mention them when relevant to the question.

USER PROFILE:
${JSON.stringify(userProfile, null, 2)}

PATHWAYS:
${pathways.map(p => `${p.name}: $${p.grossCapitalCost.toLocaleString()} gross, $${p.netCost.toLocaleString()} net, $${p.annualSavings.toLocaleString()}/yr savings, ${p.ghgReductionPct}% GHG, ${p.simplePayback}yr payback, $${p.totalIncentives.toLocaleString()} incentives, CIB eligible: ${p.cibEligible}
  Measures: ${p.measures.map(m => m.name).join(', ')}`).join('\n')}

OWNERSHIP TYPE: ${userProfile.ownershipModel || 'unknown'}
FINANCIAL FRAME: ${financialFrame}

You can help the user:
- Understand assessment results and compare pathways
- Explain specific incentive programs and eligibility
- Draft emails to partners (LDC, engineering firms, financing bodies)
- Clarify next steps and application sequencing
- Interpret financial metrics (NPV, IRR, payback)
- Explore what-if scenarios
- Generate documents (business case, board memo, etc.)

CRITICAL RULES:
- Be direct and specific to THEIR building
- Use ${financialFrame} language
- Never say "I don't have access to" — you have the full context
- When discussing incentives, always mention IESO/Enbridge pre-approval requirements
- If recommending a turnkey provider and the building qualifies, route there instead of separate LDC + engineer + financing
- Include specific dollar amounts, not vague ranges`;
}

// ─── Send Message ───────────────────────────────────────────────────────────

export async function sendChatMessage(
  history: ChatMessage[],
  newMessage: string,
  systemPrompt: string
): Promise<string> {
  const messages: ClaudeMessage[] = history
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: m.content,
    }));

  messages.push({ role: 'user', content: newMessage });

  return callClaude(messages, systemPrompt);
}

// ─── Extract Structured Data from Chat Response ─────────────────────────────

export function extractChatData(response: string): {
  cleanText: string;
  extractedData: Record<string, unknown> | null;
  isReady: boolean;
} {
  let cleanText = response;
  let extractedData: Record<string, unknown> | null = null;
  let isReady = false;

  // Extract <data> blocks
  const dataMatch = response.match(/<data>([\s\S]*?)<\/data>/);
  if (dataMatch) {
    try {
      extractedData = JSON.parse(dataMatch[1]);
      cleanText = cleanText.replace(/<data>[\s\S]*?<\/data>/g, '').trim();
    } catch {
      // Invalid JSON, ignore
    }
  }

  // Check for <ready> flag
  const readyMatch = response.match(/<ready>(true|false)<\/ready>/);
  if (readyMatch) {
    isReady = readyMatch[1] === 'true';
    cleanText = cleanText.replace(/<ready>[\s\S]*?<\/ready>/g, '').trim();
  }

  return { cleanText, extractedData, isReady };
}

// ─── Generate Report ────────────────────────────────────────────────────────

export async function generateReport(
  prompt: string,
  building: Partial<BuildingData>,
  pathways: Pathway[],
  userProfile: Partial<UserProfile>
): Promise<string> {
  const systemPrompt = `You are Scout, generating a professional document for a building retrofit assessment.

BUILDING: ${JSON.stringify(building, null, 2)}
PATHWAYS: ${JSON.stringify(pathways.map(p => ({ name: p.name, ghgReduction: p.ghgReductionPct, grossCost: p.grossCapitalCost, netCost: p.netCost, incentives: p.totalIncentives, annualSavings: p.annualSavings, payback: p.simplePayback })), null, 2)}
USER PROFILE: ${JSON.stringify(userProfile, null, 2)}

Generate a professional GitHub Flavored Markdown document. Include specific numbers, tables where appropriate, and actionable recommendations. Frame for ${userProfile.ownershipModel || 'building owner'}.`;

  return callClaude(
    [{ role: 'user', content: prompt }],
    systemPrompt
  );
}
