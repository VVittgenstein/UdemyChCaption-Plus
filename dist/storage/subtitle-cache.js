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
// ============================================
// Constants
// ============================================
/** Database name */
const DB_NAME = 'UdemyCaptionCache';
/** Database version - increment when schema changes */
const DB_VERSION = 1;
/** Object store name for subtitle cache */
const STORE_NAME = 'subtitles';
/** Default maximum cache entries (LRU eviction threshold) */
const DEFAULT_MAX_ENTRIES = 500;
/** Default maximum cache size in bytes (100MB) */
const DEFAULT_MAX_SIZE_BYTES = 100 * 1024 * 1024;
// ============================================
// IndexedDB Helpers
// ============================================
/**
 * Open the IndexedDB database
 */
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => {
            reject(new Error(`Failed to open database: ${request.error?.message}`));
        };
        request.onsuccess = () => {
            resolve(request.result);
        };
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            // Create object store if it doesn't exist
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                // Indexes for efficient queries
                store.createIndex('courseId', 'courseId', { unique: false });
                store.createIndex('lectureId', 'lectureId', { unique: false });
                store.createIndex('updatedAt', 'updatedAt', { unique: false });
                store.createIndex('createdAt', 'createdAt', { unique: false });
                store.createIndex('provider', 'provider', { unique: false });
                store.createIndex('model', 'model', { unique: false });
            }
        };
    });
}
/**
 * Generate cache key from course and lecture IDs
 */
export function generateCacheKey(courseId, lectureId) {
    return `${courseId}-${lectureId}`;
}
/**
 * Estimate the size of a cache entry in bytes
 */
function estimateEntrySize(entry) {
    // Rough estimation: JSON stringify length * 2 (for UTF-16)
    return JSON.stringify(entry).length * 2;
}
// ============================================
// Core Cache Operations
// ============================================
/**
 * Get a cached subtitle entry
 * @param courseId Course ID
 * @param lectureId Lecture ID
 * @param originalHash Optional hash to verify content hasn't changed
 */
export async function getCache(courseId, lectureId, originalHash) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const key = generateCacheKey(courseId, lectureId);
        const request = store.get(key);
        request.onerror = () => {
            db.close();
            reject(new Error(`Failed to get cache entry: ${request.error?.message}`));
        };
        request.onsuccess = () => {
            db.close();
            const entry = request.result;
            if (!entry) {
                resolve({ hit: false });
                return;
            }
            // If hash provided, check if it matches
            if (originalHash !== undefined) {
                const hashMatch = entry.originalHash === originalHash;
                resolve({ hit: true, entry, hashMatch });
            }
            else {
                resolve({ hit: true, entry });
            }
        };
    });
}
/**
 * Store a translated subtitle in cache
 * Updates existing entry if present, creates new otherwise
 */
export async function setCache(input, options = {}) {
    const { autoEvict = true } = options;
    const db = await openDatabase();
    const now = Date.now();
    const key = generateCacheKey(input.courseId, input.lectureId);
    // Check for existing entry to preserve createdAt
    const existingEntry = await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);
        request.onerror = () => reject(new Error('Failed to check existing entry'));
        request.onsuccess = () => resolve(request.result);
    });
    const entry = {
        id: key,
        courseId: input.courseId,
        lectureId: input.lectureId,
        courseName: input.courseName,
        lectureName: input.lectureName,
        originalHash: input.originalHash,
        translatedVTT: input.translatedVTT,
        provider: input.provider,
        model: input.model,
        tokensUsed: input.tokensUsed,
        estimatedCost: input.estimatedCost,
        createdAt: existingEntry?.createdAt ?? now,
        updatedAt: now,
    };
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(entry);
        request.onerror = () => {
            db.close();
            reject(new Error(`Failed to set cache entry: ${request.error?.message}`));
        };
        request.onsuccess = () => {
            db.close();
            // Trigger eviction check in background if enabled
            if (autoEvict) {
                evictIfNeeded(options).catch(console.error);
            }
            resolve(entry);
        };
    });
}
/**
 * Delete a cached subtitle entry
 */
export async function deleteCache(courseId, lectureId) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const key = generateCacheKey(courseId, lectureId);
        const request = store.delete(key);
        request.onerror = () => {
            db.close();
            reject(new Error(`Failed to delete cache entry: ${request.error?.message}`));
        };
        request.onsuccess = () => {
            db.close();
            resolve(true);
        };
    });
}
/**
 * Delete all cached subtitles for a course
 */
export async function deleteCourseCache(courseId) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('courseId');
        const request = index.openCursor(IDBKeyRange.only(courseId));
        let deletedCount = 0;
        request.onerror = () => {
            db.close();
            reject(new Error(`Failed to delete course cache: ${request.error?.message}`));
        };
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                deletedCount++;
                cursor.continue();
            }
            else {
                db.close();
                resolve(deletedCount);
            }
        };
    });
}
/**
 * Clear all cached subtitles
 */
export async function clearAllCache() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        request.onerror = () => {
            db.close();
            reject(new Error(`Failed to clear cache: ${request.error?.message}`));
        };
        request.onsuccess = () => {
            db.close();
            resolve();
        };
    });
}
// ============================================
// Query Operations
// ============================================
/**
 * Get all cached entries for a course
 */
export async function getCourseEntries(courseId) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('courseId');
        const request = index.getAll(IDBKeyRange.only(courseId));
        request.onerror = () => {
            db.close();
            reject(new Error(`Failed to get course entries: ${request.error?.message}`));
        };
        request.onsuccess = () => {
            db.close();
            resolve(request.result);
        };
    });
}
/**
 * Get all cached entries
 */
export async function getAllEntries() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onerror = () => {
            db.close();
            reject(new Error(`Failed to get all entries: ${request.error?.message}`));
        };
        request.onsuccess = () => {
            db.close();
            resolve(request.result);
        };
    });
}
/**
 * Get total number of cached entries
 */
export async function getCacheCount() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.count();
        request.onerror = () => {
            db.close();
            reject(new Error(`Failed to get cache count: ${request.error?.message}`));
        };
        request.onsuccess = () => {
            db.close();
            resolve(request.result);
        };
    });
}
/**
 * Get cache statistics
 */
export async function getCacheStats() {
    const entries = await getAllEntries();
    if (entries.length === 0) {
        return {
            totalEntries: 0,
            totalSizeBytes: 0,
            oldestEntry: null,
            newestEntry: null,
            totalTokensUsed: 0,
            totalEstimatedCost: 0,
        };
    }
    let totalSizeBytes = 0;
    let oldestEntry = Infinity;
    let newestEntry = 0;
    let totalTokensUsed = 0;
    let totalEstimatedCost = 0;
    for (const entry of entries) {
        totalSizeBytes += estimateEntrySize(entry);
        oldestEntry = Math.min(oldestEntry, entry.createdAt);
        newestEntry = Math.max(newestEntry, entry.updatedAt);
        totalTokensUsed += entry.tokensUsed;
        totalEstimatedCost += entry.estimatedCost;
    }
    return {
        totalEntries: entries.length,
        totalSizeBytes,
        oldestEntry: oldestEntry === Infinity ? null : oldestEntry,
        newestEntry: newestEntry === 0 ? null : newestEntry,
        totalTokensUsed,
        totalEstimatedCost,
    };
}
// ============================================
// LRU Eviction
// ============================================
/**
 * Check if eviction is needed and perform LRU eviction
 */
export async function evictIfNeeded(options = {}) {
    const { maxEntries = DEFAULT_MAX_ENTRIES, maxSizeBytes = DEFAULT_MAX_SIZE_BYTES } = options;
    const stats = await getCacheStats();
    // Check if eviction is needed
    const needsEntryEviction = stats.totalEntries > maxEntries;
    const needsSizeEviction = stats.totalSizeBytes > maxSizeBytes;
    if (!needsEntryEviction && !needsSizeEviction) {
        return 0;
    }
    // Get entries sorted by updatedAt (LRU order)
    const entries = await getAllEntries();
    entries.sort((a, b) => a.updatedAt - b.updatedAt);
    let evictedCount = 0;
    let currentSize = stats.totalSizeBytes;
    let currentCount = stats.totalEntries;
    for (const entry of entries) {
        // Stop if both conditions are satisfied
        const countOk = currentCount <= maxEntries;
        const sizeOk = currentSize <= maxSizeBytes;
        if (countOk && sizeOk)
            break;
        // Evict this entry
        await deleteCache(entry.courseId, entry.lectureId);
        evictedCount++;
        currentCount--;
        currentSize -= estimateEntrySize(entry);
    }
    return evictedCount;
}
/**
 * Manually trigger cache cleanup with custom limits
 */
export async function cleanupCache(options = {}) {
    const evictedCount = await evictIfNeeded(options);
    const stats = await getCacheStats();
    return {
        evictedCount,
        remainingEntries: stats.totalEntries,
        remainingSizeBytes: stats.totalSizeBytes,
    };
}
// ============================================
// Touch (Update Access Time)
// ============================================
/**
 * Update the access time of a cache entry (for LRU tracking)
 * Call this when a cached entry is used
 */
export async function touchCache(courseId, lectureId) {
    const db = await openDatabase();
    const key = generateCacheKey(courseId, lectureId);
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const getRequest = store.get(key);
        getRequest.onerror = () => {
            db.close();
            reject(new Error(`Failed to touch cache entry: ${getRequest.error?.message}`));
        };
        getRequest.onsuccess = () => {
            const entry = getRequest.result;
            if (!entry) {
                db.close();
                resolve(false);
                return;
            }
            // Update the updatedAt timestamp
            entry.updatedAt = Date.now();
            const putRequest = store.put(entry);
            putRequest.onerror = () => {
                db.close();
                reject(new Error(`Failed to update cache entry: ${putRequest.error?.message}`));
            };
            putRequest.onsuccess = () => {
                db.close();
                resolve(true);
            };
        };
    });
}
// ============================================
// SubtitleCache Class (OOP Interface)
// ============================================
/**
 * Object-oriented interface for subtitle cache operations
 */
export class SubtitleCache {
    constructor(options = {}) {
        this.options = {
            maxEntries: options.maxEntries ?? DEFAULT_MAX_ENTRIES,
            maxSizeBytes: options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES,
            autoEvict: options.autoEvict ?? true,
        };
    }
    /**
     * Get a cached subtitle, optionally validating hash
     */
    async get(courseId, lectureId, originalHash) {
        const result = await getCache(courseId, lectureId, originalHash);
        // Touch the entry if found to update LRU order
        if (result.hit) {
            await touchCache(courseId, lectureId).catch(() => { });
        }
        return result;
    }
    /**
     * Store a translated subtitle
     */
    async set(input) {
        return setCache(input, this.options);
    }
    /**
     * Delete a cached subtitle
     */
    async delete(courseId, lectureId) {
        return deleteCache(courseId, lectureId);
    }
    /**
     * Delete all cached subtitles for a course
     */
    async deleteCourse(courseId) {
        return deleteCourseCache(courseId);
    }
    /**
     * Clear all cached subtitles
     */
    async clear() {
        return clearAllCache();
    }
    /**
     * Get all cached entries for a course
     */
    async getCourseEntries(courseId) {
        return getCourseEntries(courseId);
    }
    /**
     * Get cache statistics
     */
    async getStats() {
        return getCacheStats();
    }
    /**
     * Get total number of cached entries
     */
    async getCount() {
        return getCacheCount();
    }
    /**
     * Check if a subtitle is cached
     */
    async has(courseId, lectureId) {
        const result = await getCache(courseId, lectureId);
        return result.hit;
    }
    /**
     * Check if a subtitle is cached with matching hash
     */
    async hasValid(courseId, lectureId, originalHash) {
        const result = await getCache(courseId, lectureId, originalHash);
        return result.hit && result.hashMatch === true;
    }
    /**
     * Manually trigger cache cleanup
     */
    async cleanup() {
        return cleanupCache(this.options);
    }
    /**
     * Update cache options
     */
    setOptions(options) {
        this.options = { ...this.options, ...options };
    }
}
// ============================================
// Export Singleton Instance
// ============================================
/** Default subtitle cache instance */
export const subtitleCache = new SubtitleCache();
// ============================================
// Database Management
// ============================================
/**
 * Check if IndexedDB is available
 */
export function isIndexedDBAvailable() {
    return typeof indexedDB !== 'undefined';
}
/**
 * Delete the entire database (for troubleshooting)
 */
export async function deleteDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.onerror = () => {
            reject(new Error(`Failed to delete database: ${request.error?.message}`));
        };
        request.onsuccess = () => {
            resolve();
        };
        request.onblocked = () => {
            reject(new Error('Database deletion blocked - close all connections first'));
        };
    });
}
//# sourceMappingURL=subtitle-cache.js.map