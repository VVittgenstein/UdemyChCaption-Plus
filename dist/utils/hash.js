/**
 * Hash Utilities
 *
 * Shared hashing helpers for subtitle versioning and cache validation.
 */
/**
 * Calculate SHA-256 hash of content (hex string).
 * Falls back to a simple non-cryptographic hash when crypto.subtle is unavailable.
 */
export async function calculateHash(content) {
    try {
        if (typeof crypto === 'undefined' || !crypto.subtle?.digest) {
            throw new Error('crypto.subtle not available');
        }
        const encoder = new TextEncoder();
        const data = encoder.encode(content);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    catch {
        return simpleHash(content);
    }
}
/**
 * Simple hash fallback (32-bit, hex string).
 * Not cryptographically secure; only used when SHA-256 is unavailable.
 */
export function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
}
//# sourceMappingURL=hash.js.map