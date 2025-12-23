/**
 * Cost Estimator Utilities
 *
 * Task ID: T-20251223-act-016-build-cost-estimate
 *
 * Converts token usage to an estimated USD cost based on a simple per-1K-tokens pricing table.
 * Note: Prices are approximate and should be kept in sync with the models exposed in the UI.
 */
export declare const DEFAULT_COST_PER_1K_TOKENS_USD = 0.005;
/**
 * Model pricing (USD per 1K tokens).
 *
 * The translator treats prompt+completion tokens the same for estimation purposes.
 */
export declare const MODEL_COST_PER_1K_TOKENS_USD: Record<string, number>;
export declare function getCostPer1kTokensUSD(model: string): number;
export declare function calculateCost(model: string, tokenCount: number): number;
//# sourceMappingURL=cost-estimator.d.ts.map