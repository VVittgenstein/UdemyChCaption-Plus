/**
 * Hash Utilities
 *
 * Shared hashing helpers for subtitle versioning and cache validation.
 */
/**
 * Calculate SHA-256 hash of content (hex string).
 * Falls back to a simple non-cryptographic hash when crypto.subtle is unavailable.
 */
export declare function calculateHash(content: string): Promise<string>;
/**
 * Simple hash fallback (32-bit, hex string).
 * Not cryptographically secure; only used when SHA-256 is unavailable.
 */
export declare function simpleHash(str: string): string;
//# sourceMappingURL=hash.d.ts.map