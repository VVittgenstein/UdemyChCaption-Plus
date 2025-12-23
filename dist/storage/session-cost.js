/**
 * Session Cost Tracking
 *
 * Task ID: T-20251223-act-016-build-cost-estimate
 *
 * Tracks token usage and estimated USD cost for the current browser session.
 * Uses chrome.storage.session when available (MV3), with an in-memory fallback.
 */
const STORAGE_KEY = 'udemy-caption-plus:session-cost';
const DEFAULT_STATE = {
    totals: {
        totalTokens: 0,
        totalCostUsd: 0,
        updatedAt: 0,
    },
};
let memoryState = null;
function hasSessionStorage() {
    return typeof chrome !== 'undefined' && !!chrome.storage?.session;
}
function loadFromMemory() {
    if (!memoryState)
        memoryState = structuredClone(DEFAULT_STATE);
    return memoryState;
}
function saveToMemory(state) {
    memoryState = state;
}
export async function loadSessionCostState() {
    if (!hasSessionStorage()) {
        return loadFromMemory();
    }
    return new Promise((resolve) => {
        chrome.storage.session.get({ [STORAGE_KEY]: DEFAULT_STATE }, (result) => {
            resolve(result[STORAGE_KEY] ?? structuredClone(DEFAULT_STATE));
        });
    });
}
export async function saveSessionCostState(state) {
    if (!hasSessionStorage()) {
        saveToMemory(state);
        return;
    }
    return new Promise((resolve, reject) => {
        chrome.storage.session.set({ [STORAGE_KEY]: state }, () => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            }
            else {
                resolve();
            }
        });
    });
}
export async function updateSessionCostState(patch) {
    const current = await loadSessionCostState();
    const next = {
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
export async function addSessionCost(deltaTokens, deltaCostUsd) {
    const current = await loadSessionCostState();
    const now = Date.now();
    const next = {
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
//# sourceMappingURL=session-cost.js.map