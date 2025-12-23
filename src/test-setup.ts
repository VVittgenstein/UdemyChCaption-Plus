/**
 * Jest Test Setup
 * Provides polyfills for browser APIs not available in jsdom
 */

// Polyfill for structuredClone (required by fake-indexeddb v6+)
if (typeof structuredClone === 'undefined') {
  (global as Record<string, unknown>).structuredClone = <T>(obj: T): T => {
    return JSON.parse(JSON.stringify(obj));
  };
}
