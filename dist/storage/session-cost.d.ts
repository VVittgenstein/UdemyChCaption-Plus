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
export declare function loadSessionCostState(): Promise<SessionCostState>;
export declare function saveSessionCostState(state: SessionCostState): Promise<void>;
export declare function updateSessionCostState(patch: Partial<SessionCostState>): Promise<SessionCostState>;
export declare function addSessionCost(deltaTokens: number, deltaCostUsd: number): Promise<SessionCostState>;
//# sourceMappingURL=session-cost.d.ts.map