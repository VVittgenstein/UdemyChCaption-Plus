/**
 * Subtitle Version Checker
 *
 * Task ID: T-20251223-act-012-build-retranslate
 *
 * Responsibilities:
 * - Compute/accept original subtitle hash
 * - Compare with cached entry hash
 * - Decide whether to retranslate (subtitle updated or user forces refresh)
 */
import { subtitleCache } from '../storage/subtitle-cache';
import { calculateHash } from '../utils/hash';
async function resolveOriginalHash(params) {
    if (params.originalHash)
        return params.originalHash;
    if (params.originalVtt !== undefined)
        return calculateHash(params.originalVtt);
    throw new Error('Either originalHash or originalVtt must be provided');
}
/**
 * Check whether the cached translation is still valid for the current original subtitle version.
 */
export async function checkSubtitleVersion(params) {
    const originalHash = await resolveOriginalHash(params);
    const { courseId, lectureId, force = false } = params;
    const cacheResult = await subtitleCache.get(courseId, lectureId, originalHash);
    if (force) {
        return {
            decision: 'retranslate',
            reason: 'force',
            originalHash,
            cacheHit: cacheResult.hit,
            hashMatch: cacheResult.hashMatch,
            cachedEntry: cacheResult.entry,
        };
    }
    if (!cacheResult.hit) {
        return {
            decision: 'retranslate',
            reason: 'cache_miss',
            originalHash,
            cacheHit: false,
        };
    }
    if (cacheResult.hashMatch === false) {
        return {
            decision: 'retranslate',
            reason: 'hash_changed',
            originalHash,
            cacheHit: true,
            hashMatch: false,
            cachedEntry: cacheResult.entry,
        };
    }
    return {
        decision: 'use_cache',
        reason: 'cache_valid',
        originalHash,
        cacheHit: true,
        hashMatch: true,
        cachedEntry: cacheResult.entry,
    };
}
//# sourceMappingURL=version-checker.js.map