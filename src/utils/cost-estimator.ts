/**
 * Cost Estimator Utilities
 *
 * Task ID: T-20251223-act-016-build-cost-estimate
 *
 * Converts token usage to an estimated USD cost based on a simple per-1K-tokens pricing table.
 * Note: Prices are approximate and should be kept in sync with the models exposed in the UI.
 */

export const DEFAULT_COST_PER_1K_TOKENS_USD = 0.005;

/**
 * Model pricing (USD per 1K tokens).
 *
 * The translator treats prompt+completion tokens the same for estimation purposes.
 */
export const MODEL_COST_PER_1K_TOKENS_USD: Record<string, number> = {
  // OpenAI GPT-5 series
  'gpt-5.2': 0.01,
  'gpt-5.1': 0.008,
  'gpt-5-pro': 0.015,
  'gpt-5': 0.006,

  // Gemini 3.x / 2.5 series
  'gemini-3-pro-preview': 0.005,
  'gemini-3-flash-preview': 0.001,
  'gemini-2.5-pro': 0.003,
  'gemini-2.5-flash': 0.0005,
};

export function getCostPer1kTokensUSD(model: string): number {
  return MODEL_COST_PER_1K_TOKENS_USD[model] ?? DEFAULT_COST_PER_1K_TOKENS_USD;
}

export function calculateCost(model: string, tokenCount: number): number {
  const pricePerK = getCostPer1kTokensUSD(model);
  return (tokenCount / 1000) * pricePerK;
}

