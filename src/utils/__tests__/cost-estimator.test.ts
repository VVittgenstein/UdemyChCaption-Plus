/**
 * Cost Estimator Tests
 *
 * Task ID: T-20251223-act-016-build-cost-estimate
 */

import { calculateCost, getCostPer1kTokensUSD, DEFAULT_COST_PER_1K_TOKENS_USD } from '../cost-estimator';

describe('cost-estimator', () => {
  test('returns configured pricing for known models', () => {
    expect(getCostPer1kTokensUSD('gpt-5.1')).toBeGreaterThan(0);
    expect(getCostPer1kTokensUSD('gemini-2.5-flash')).toBeGreaterThan(0);
  });

  test('falls back to default pricing for unknown models', () => {
    expect(getCostPer1kTokensUSD('some-unknown-model')).toBe(DEFAULT_COST_PER_1K_TOKENS_USD);
  });

  test('calculates cost proportionally to token usage', () => {
    const price = getCostPer1kTokensUSD('gpt-5.1');
    expect(calculateCost('gpt-5.1', 0)).toBe(0);
    expect(calculateCost('gpt-5.1', 1000)).toBeCloseTo(price, 10);
    expect(calculateCost('gpt-5.1', 2500)).toBeCloseTo(price * 2.5, 10);
  });
});

