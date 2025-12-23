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
import type { SubtitleCacheEntry } from '../types';
export type VersionDecision = 'use_cache' | 'retranslate';
export type VersionDecisionReason = 'cache_valid' | 'cache_miss' | 'hash_changed' | 'force';
export interface VersionCheckParams {
    courseId: string;
    lectureId: string;
    /**
     * Hash of the original VTT content.
     * If not provided, `originalVtt` must be provided so we can compute it.
     */
    originalHash?: string;
    /**
     * Original VTT content used to compute hash when `originalHash` is not provided.
     */
    originalVtt?: string;
    /**
     * Force retranslation even if cache hash matches.
     */
    force?: boolean;
}
export interface VersionCheckResult {
    decision: VersionDecision;
    reason: VersionDecisionReason;
    originalHash: string;
    cacheHit: boolean;
    hashMatch?: boolean;
    cachedEntry?: SubtitleCacheEntry;
}
/**
 * Check whether the cached translation is still valid for the current original subtitle version.
 */
export declare function checkSubtitleVersion(params: VersionCheckParams): Promise<VersionCheckResult>;
//# sourceMappingURL=version-checker.d.ts.map