/**
 * Subtitle Version Checker
 *
 * Task ID: T-20251223-act-012-build-retranslate
 * Updated: T-20251231-act-022-cache-match-fix
 *
 * Responsibilities:
 * - Check cache by courseId + lectureId
 * - Decide whether to retranslate (cache miss or user forces refresh)
 *
 * Note: We no longer check subtitle content hash because Udemy's auto-generated
 * subtitles may vary slightly between page loads (different cue counts, timestamps),
 * causing unnecessary retranslation. Using courseId + lectureId as the sole cache
 * key provides stable caching behavior.
 */

import type { SubtitleCacheEntry } from '../types';
import { subtitleCache } from '../storage/subtitle-cache';
import { calculateHash } from '../utils/hash';

export type VersionDecision = 'use_cache' | 'retranslate';

export type VersionDecisionReason =
  | 'cache_valid'
  | 'cache_miss'
  | 'force';

export interface VersionCheckParams {
  courseId: string;
  lectureId: string;
  /**
   * Original VTT content (optional). When provided, the hash will be
   * computed and returned in the result for storage purposes.
   * Note: The hash is NOT used for cache decision (only courseId + lectureId).
   */
  originalVtt?: string;
  /**
   * Force retranslation even if cache exists.
   */
  force?: boolean;
}

export interface VersionCheckResult {
  decision: VersionDecision;
  reason: VersionDecisionReason;
  cacheHit: boolean;
  cachedEntry?: SubtitleCacheEntry;
  /**
   * Hash of the original VTT content (when originalVtt was provided).
   * Used for storage, not for cache decision.
   */
  originalHash?: string;
}

/**
 * Check whether a cached translation exists for the given course/lecture.
 */
export async function checkSubtitleVersion(
  params: VersionCheckParams
): Promise<VersionCheckResult> {
  const { courseId, lectureId, originalVtt, force = false } = params;

  // Compute hash if originalVtt is provided (for storage purposes, not cache decision)
  const originalHash = originalVtt ? await calculateHash(originalVtt) : undefined;

  // Only check by courseId + lectureId, no hash comparison
  const cacheResult = await subtitleCache.get(courseId, lectureId);

  if (force) {
    return {
      decision: 'retranslate',
      reason: 'force',
      cacheHit: cacheResult.hit,
      cachedEntry: cacheResult.entry,
      originalHash,
    };
  }

  if (!cacheResult.hit) {
    return {
      decision: 'retranslate',
      reason: 'cache_miss',
      cacheHit: false,
      originalHash,
    };
  }

  return {
    decision: 'use_cache',
    reason: 'cache_valid',
    cacheHit: true,
    cachedEntry: cacheResult.entry,
    originalHash,
  };
}

