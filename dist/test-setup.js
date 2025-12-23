"use strict";
/**
 * Jest Test Setup
 * Provides polyfills for browser APIs not available in jsdom
 */
// Polyfill for structuredClone (required by fake-indexeddb v6+)
if (typeof structuredClone === 'undefined') {
    global.structuredClone = (obj) => {
        return JSON.parse(JSON.stringify(obj));
    };
}
//# sourceMappingURL=test-setup.js.map