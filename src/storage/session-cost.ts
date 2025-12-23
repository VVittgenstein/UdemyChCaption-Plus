/**
 * Session Cost Tracking
 *
 * Task ID: T-20251223-act-016-build-cost-estimate
 *
 * Tracks token usage and estimated USD cost for the current browser session.
 * Uses chrome.storage.session when available (MV3), with an in-memory fallback.
 */

export interface SessionCostTotals {
  totalTokens: number;
  totalCostUsd: number;
  updatedAt: number;
}

export interface TranslationEstimateSnapshot {
  taskId: string;
  provider: 'openai' | 'gemini';
  model: string;
  cueCount: number;
  estimatedTotalTokens: number;
  estimatedCostUsd: number;
  createdAt: number;
}

export interface TranslationActualSnapshot {
  taskId: string;
  provider: 'openai' | 'gemini';
  model: string;
  tokensUsed: number;
  costUsd: number;
  createdAt: number;
}

export interface SessionCostState {
  totals: SessionCostTotals;
  lastEstimate?: TranslationEstimateSnapshot;
  lastActual?: TranslationActualSnapshot;
}

const STORAGE_KEY = 'udemy-caption-plus:session-cost';

const DEFAULT_STATE: SessionCostState = {
  totals: {
    totalTokens: 0,
    totalCostUsd: 0,
    updatedAt: 0,
  },
};

let memoryState: SessionCostState | null = null;

function hasSessionStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.session;
}

function loadFromMemory(): SessionCostState {
  if (!memoryState) memoryState = structuredClone(DEFAULT_STATE);
  return memoryState;
}

function saveToMemory(state: SessionCostState): void {
  memoryState = state;
}

export async function loadSessionCostState(): Promise<SessionCostState> {
  if (!hasSessionStorage()) {
    return loadFromMemory();
  }

  return new Promise((resolve) => {
    chrome.storage.session.get({ [STORAGE_KEY]: DEFAULT_STATE }, (result) => {
      resolve((result as Record<string, SessionCostState>)[STORAGE_KEY] ?? structuredClone(DEFAULT_STATE));
    });
  });
}

export async function saveSessionCostState(state: SessionCostState): Promise<void> {
  if (!hasSessionStorage()) {
    saveToMemory(state);
    return;
  }

  return new Promise((resolve, reject) => {
    chrome.storage.session.set({ [STORAGE_KEY]: state }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

export async function updateSessionCostState(patch: Partial<SessionCostState>): Promise<SessionCostState> {
  const current = await loadSessionCostState();
  const next: SessionCostState = {
    ...current,
    ...patch,
    totals: {
      ...current.totals,
      ...(patch.totals || {}),
    },
  };

  await saveSessionCostState(next);
  return next;
}

export async function addSessionCost(deltaTokens: number, deltaCostUsd: number): Promise<SessionCostState> {
  const current = await loadSessionCostState();
  const now = Date.now();

  const next: SessionCostState = {
    ...current,
    totals: {
      totalTokens: current.totals.totalTokens + deltaTokens,
      totalCostUsd: current.totals.totalCostUsd + deltaCostUsd,
      updatedAt: now,
    },
  };

  await saveSessionCostState(next);
  return next;
}

