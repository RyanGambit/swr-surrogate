import { createContext, useContext } from 'react';
import type { AppState, AppStep, UserProfile, BuildingData, ChatMessage, Pathway, ProFormaResult, IncentiveStackResult, ActionPlan, PathwayType } from '@/types';

// ─── Actions ────────────────────────────────────────────────────────────────

export type AppAction =
  | { type: 'SET_STEP'; step: AppStep }
  | { type: 'UPDATE_USER_PROFILE'; data: Partial<UserProfile> }
  | { type: 'UPDATE_BUILDING'; data: Partial<BuildingData> }
  | { type: 'ADD_CHAT_MESSAGE'; message: ChatMessage }
  | { type: 'SET_PATHWAYS'; pathways: Pathway[] }
  | { type: 'SELECT_PATHWAY'; pathway: PathwayType }
  | { type: 'SET_PRO_FORMA'; proForma: ProFormaResult }
  | { type: 'SET_INCENTIVE_STACK'; stack: IncentiveStackResult }
  | { type: 'SET_ACTION_PLAN'; plan: ActionPlan }
  | { type: 'LOAD_SESSION'; state: AppState }
  | { type: 'RESET' };

// ─── Initial State ──────────────────────────────────────────────────────────

export function createInitialState(): AppState {
  return {
    currentStep: 'building',
    userProfile: {},
    buildingData: {},
    chatHistory: [],
    pathways: [],
    selectedPathway: null,
    proForma: null,
    incentiveStack: null,
    actionPlan: null,
    sessionId: crypto.randomUUID(),
    lastSaved: null,
  };
}

// ─── Reducer ────────────────────────────────────────────────────────────────

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, currentStep: action.step };

    case 'UPDATE_USER_PROFILE':
      return { ...state, userProfile: { ...state.userProfile, ...action.data } };

    case 'UPDATE_BUILDING':
      return { ...state, buildingData: { ...state.buildingData, ...action.data } };

    case 'ADD_CHAT_MESSAGE':
      return { ...state, chatHistory: [...state.chatHistory, action.message] };

    case 'SET_PATHWAYS':
      return { ...state, pathways: action.pathways };

    case 'SELECT_PATHWAY':
      return { ...state, selectedPathway: action.pathway };

    case 'SET_PRO_FORMA':
      return { ...state, proForma: action.proForma };

    case 'SET_INCENTIVE_STACK':
      return { ...state, incentiveStack: action.stack };

    case 'SET_ACTION_PLAN':
      return { ...state, actionPlan: action.plan };

    case 'LOAD_SESSION':
      return { ...action.state };

    case 'RESET':
      return createInitialState();

    default:
      return state;
  }
}

// ─── Context ────────────────────────────────────────────────────────────────

export const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}>({
  state: createInitialState(),
  dispatch: () => {},
});

export function useApp() {
  return useContext(AppContext);
}

// ─── LocalStorage Persistence ───────────────────────────────────────────────

const STORAGE_KEY = 'scout_session';

export function saveSession(state: AppState): void {
  try {
    const toSave = { ...state, lastSaved: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // Storage full or not available
  }
}

export function loadSession(): AppState | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    // Restore Date objects
    if (parsed.chatHistory) {
      parsed.chatHistory = parsed.chatHistory.map((m: ChatMessage & { timestamp: string }) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      }));
    }
    if (parsed.lastSaved) {
      parsed.lastSaved = new Date(parsed.lastSaved);
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
