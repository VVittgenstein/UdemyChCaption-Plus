/**
 * Subtitle Cache Module - IndexedDB Storage for Translated Subtitles
 * Task ID: T-20251223-act-010-build-local-cache
 *
 * Provides persistent storage for translated subtitles using IndexedDB.
 * Features:
 * - Cache by course/lecture ID with original subtitle hash validation
 * - LRU eviction when cache size exceeds limit
 * - Query, write, delete operations
 * - Statistics and maintenance utilities
 */
import type { SubtitleCacheEntry } from '../types';
/**
 * Options for cache operations
 */
export interface CacheOptions {
    /** Maximum number of entries to keep (default: 500) */
    maxEntries?: number;
    /** Maximum cache size in bytes (default: 100MB) */
    maxSizeBytes?: number;
    /** Enable auto-eviction when limits exceeded (default: true) */
    autoEvict?: boolean;
}
/**
 * Cache statistics
 */
export interface CacheStats {
    /** Total number of cached entries */
    totalEntries: number;
    /** Approximate total size in bytes */
    totalSizeBytes: number;
    /** Oldest entry timestamp */
    oldestEntry: number | null;
    /** Newest entry timestamp */
    newestEntry: number | null;
    /** Total tokens used across all cached translations */
    totalTokensUsed: number;
    /** Total estimated cost across all cached translations */
    totalEstimatedCost: number;
}
/**
 * Cache lookup result
 */
export interface CacheLookupResult {
    /** Whether cache hit occurred */
    hit: boolean;
    /** Cached entry if found */
    entry?: SubtitleCacheEntry;
    /** Whether hash matched (relevant only if entry found) */
    hashMatch?: boolean;
}
/**
 * Input for creating a cache entry
 */
export interface CacheEntryInput {
    courseId: string;
    lectureId: string;
    courseName: string;
    lectureName: string;
    originalHash: string;
    translatedVTT: string;
    provider: string;
    model: string;
    tokensUsed: number;
    estimatedCost: number;
}
/**
 * Generate cache key from course and lecture IDs
 */
export declare function generateCacheKey(courseId: string, lectureId: string): string;
/**
 * Get a cached subtitle entry
 * @param courseId Course ID
 * @param lectureId Lecture ID
 * @param originalHash Optional hash to verify content hasn't changed
 */
export declare function getCache(courseId: string, lectureId: string, originalHash?: string): Promise<CacheLookupResult>;
/**
 * Store a translated subtitle in cache
 * Updates existing entry if present, creates new otherwise
 */
export declare function setCache(input: CacheEntryInput, options?: CacheOptions): Promise<SubtitleCacheEntry>;
/**
 * Delete a cached subtitle entry
 */
export declare function deleteCache(courseId: string, lectureId: string): Promise<boolean>;
/**
 * Delete all cached subtitles for a course
 */
export declare function deleteCourseCache(courseId: string): Promise<number>;
/**
 * Clear all cached subtitles
 */
export declare function clearAllCache(): Promise<void>;
/**
 * Get all cached entries for a course
 */
export declare function getCourseEntries(courseId: string): Promise<SubtitleCacheEntry[]>;
/**
 * Get all cached entries
 */
export declare function getAllEntries(): Promise<SubtitleCacheEntry[]>;
/**
 * Get total number of cached entries
 */
export declare function getCacheCount(): Promise<number>;
/**
 * Get cache statistics
 */
export declare function getCacheStats(): Promise<CacheStats>;
/**
 * Check if eviction is needed and perform LRU eviction
 */
export declare function evictIfNeeded(options?: CacheOptions): Promise<number>;
/**
 * Manually trigger cache cleanup with custom limits
 */
export declare function cleanupCache(options?: CacheOptions): Promise<{
    evictedCount: number;
    remainingEntries: number;
    remainingSizeBytes: number;
}>;
/**
 * Update the access time of a cache entry (for LRU tracking)
 * Call this when a cached entry is used
 */
export declare function touchCache(courseId: string, lectureId: string): Promise<boolean>;
/**
 * Object-oriented interface for subtitle cache operations
 */
export declare class SubtitleCache {
    private options;
    constructor(options?: CacheOptions);
    /**
     * Get a cached subtitle, optionally validating hash
     */
    get(courseId: string, lectureId: string, originalHash?: string): Promise<CacheLookupResult>;
    /**
     * Store a translated subtitle
     */
    set(input: CacheEntryInput): Promise<SubtitleCacheEntry>;
    /**
     * Delete a cached subtitle
     */
    delete(courseId: string, lectureId: string): Promise<boolean>;
    /**
     * Delete all cached subtitles for a course
     */
    deleteCourse(courseId: string): Promise<number>;
    /**
     * Clear all cached subtitles
     */
    clear(): Promise<void>;
    /**
     * Get all cached entries for a course
     */
    getCourseEntries(courseId: string): Promise<SubtitleCacheEntry[]>;
    /**
     * Get cache statistics
     */
    getStats(): Promise<CacheStats>;
    /**
     * Get total number of cached entries
     */
    getCount(): Promise<number>;
    /**
     * Check if a subtitle is cached
     */
    has(courseId: string, lectureId: string): Promise<boolean>;
    /**
     * Check if a subtitle is cached with matching hash
     */
    hasValid(courseId: string, lectureId: string, originalHash: string): Promise<boolean>;
    /**
     * Manually trigger cache cleanup
     */
    cleanup(): Promise<{
        evictedCount: number;
        remainingEntries: number;
        remainingSizeBytes: number;
    }>;
    /**
     * Update cache options
     */
    setOptions(options: Partial<CacheOptions>): void;
}
/** Default subtitle cache instance */
export declare const subtitleCache: SubtitleCache;
/**
 * Check if IndexedDB is available
 */
export declare function isIndexedDBAvailable(): boolean;
/**
 * Delete the entire database (for troubleshooting)
 */
export declare function deleteDatabase(): Promise<void>;
//# sourceMappingURL=subtitle-cache.d.ts.map