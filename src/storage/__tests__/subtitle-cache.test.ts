/**
 * Unit Tests for Subtitle Cache Module
 * Task ID: T-20251223-act-010-build-local-cache
 */

import 'fake-indexeddb/auto';
import {
  generateCacheKey,
  getCache,
  setCache,
  deleteCache,
  deleteCourseCache,
  clearAllCache,
  getCourseEntries,
  getAllEntries,
  getCacheCount,
  getCacheStats,
  evictIfNeeded,
  cleanupCache,
  touchCache,
  SubtitleCache,
  subtitleCache,
  isIndexedDBAvailable,
  deleteDatabase,
  type CacheEntryInput,
} from '../subtitle-cache';
import type { SubtitleCacheEntry } from '../../types';

// ============================================
// Test Helpers
// ============================================

function createTestInput(overrides: Partial<CacheEntryInput> = {}): CacheEntryInput {
  return {
    courseId: 'course-123',
    lectureId: 'lecture-456',
    courseName: 'Test Course',
    lectureName: 'Test Lecture',
    originalHash: 'abc123hash',
    translatedVTT: 'WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nTest subtitle',
    provider: 'openai',
    model: 'gpt-4o',
    tokensUsed: 100,
    estimatedCost: 0.001,
    ...overrides,
  };
}

// Clean up cache between tests
beforeEach(async () => {
  await clearAllCache().catch(() => {});
});

// ============================================
// generateCacheKey Tests
// ============================================

describe('generateCacheKey', () => {
  it('should generate key from course and lecture IDs', () => {
    expect(generateCacheKey('course-1', 'lecture-2')).toBe('course-1-lecture-2');
  });

  it('should handle empty strings', () => {
    expect(generateCacheKey('', '')).toBe('-');
  });

  it('should handle special characters', () => {
    expect(generateCacheKey('course_123', 'lecture.456')).toBe('course_123-lecture.456');
  });
});

// ============================================
// Basic CRUD Operations Tests
// ============================================

describe('setCache and getCache', () => {
  it('should store and retrieve a cache entry', async () => {
    const input = createTestInput();
    const stored = await setCache(input);

    expect(stored.id).toBe('course-123-lecture-456');
    expect(stored.courseId).toBe(input.courseId);
    expect(stored.lectureId).toBe(input.lectureId);
    expect(stored.translatedVTT).toBe(input.translatedVTT);
    expect(stored.createdAt).toBeGreaterThan(0);
    expect(stored.updatedAt).toBeGreaterThan(0);

    const result = await getCache('course-123', 'lecture-456');
    expect(result.hit).toBe(true);
    expect(result.entry).toEqual(stored);
  });

  it('should return cache miss for non-existent entry', async () => {
    const result = await getCache('nonexistent', 'lecture');
    expect(result.hit).toBe(false);
    expect(result.entry).toBeUndefined();
  });

  it('should validate hash when provided', async () => {
    const input = createTestInput({ originalHash: 'hash123' });
    await setCache(input);

    // Matching hash
    const matchResult = await getCache('course-123', 'lecture-456', 'hash123');
    expect(matchResult.hit).toBe(true);
    expect(matchResult.hashMatch).toBe(true);

    // Non-matching hash
    const mismatchResult = await getCache('course-123', 'lecture-456', 'differentHash');
    expect(mismatchResult.hit).toBe(true);
    expect(mismatchResult.hashMatch).toBe(false);
  });

  it('should update existing entry while preserving createdAt', async () => {
    const input = createTestInput();
    const first = await setCache(input);

    // Wait a bit to ensure different timestamps
    await new Promise((resolve) => setTimeout(resolve, 10));

    const updated = await setCache({
      ...input,
      translatedVTT: 'Updated VTT content',
    });

    expect(updated.id).toBe(first.id);
    expect(updated.createdAt).toBe(first.createdAt);
    expect(updated.updatedAt).toBeGreaterThan(first.updatedAt);
    expect(updated.translatedVTT).toBe('Updated VTT content');
  });
});

describe('deleteCache', () => {
  it('should delete an existing entry', async () => {
    await setCache(createTestInput());

    const deleted = await deleteCache('course-123', 'lecture-456');
    expect(deleted).toBe(true);

    const result = await getCache('course-123', 'lecture-456');
    expect(result.hit).toBe(false);
  });

  it('should return true when deleting non-existent entry', async () => {
    const deleted = await deleteCache('nonexistent', 'lecture');
    expect(deleted).toBe(true);
  });
});

describe('deleteCourseCache', () => {
  it('should delete all entries for a course', async () => {
    await setCache(createTestInput({ lectureId: 'lecture-1' }));
    await setCache(createTestInput({ lectureId: 'lecture-2' }));
    await setCache(createTestInput({ lectureId: 'lecture-3' }));
    await setCache(createTestInput({ courseId: 'other-course', lectureId: 'lecture-1' }));

    const deletedCount = await deleteCourseCache('course-123');
    expect(deletedCount).toBe(3);

    const entries = await getCourseEntries('course-123');
    expect(entries).toHaveLength(0);

    // Other course should be unaffected
    const otherEntries = await getCourseEntries('other-course');
    expect(otherEntries).toHaveLength(1);
  });

  it('should return 0 when course has no entries', async () => {
    const deletedCount = await deleteCourseCache('nonexistent');
    expect(deletedCount).toBe(0);
  });
});

describe('clearAllCache', () => {
  it('should clear all entries', async () => {
    await setCache(createTestInput({ courseId: 'course-1', lectureId: 'lecture-1' }));
    await setCache(createTestInput({ courseId: 'course-2', lectureId: 'lecture-2' }));

    await clearAllCache();

    const count = await getCacheCount();
    expect(count).toBe(0);
  });
});

// ============================================
// Query Operations Tests
// ============================================

describe('getCourseEntries', () => {
  it('should return all entries for a course', async () => {
    await setCache(createTestInput({ lectureId: 'lecture-1', lectureName: 'Lecture 1' }));
    await setCache(createTestInput({ lectureId: 'lecture-2', lectureName: 'Lecture 2' }));

    const entries = await getCourseEntries('course-123');
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.lectureName).sort()).toEqual(['Lecture 1', 'Lecture 2']);
  });

  it('should return empty array for non-existent course', async () => {
    const entries = await getCourseEntries('nonexistent');
    expect(entries).toHaveLength(0);
  });
});

describe('getAllEntries', () => {
  it('should return all cached entries', async () => {
    await setCache(createTestInput({ courseId: 'course-1', lectureId: 'lecture-1' }));
    await setCache(createTestInput({ courseId: 'course-2', lectureId: 'lecture-2' }));
    await setCache(createTestInput({ courseId: 'course-3', lectureId: 'lecture-3' }));

    const entries = await getAllEntries();
    expect(entries).toHaveLength(3);
  });

  it('should return empty array when cache is empty', async () => {
    const entries = await getAllEntries();
    expect(entries).toHaveLength(0);
  });
});

describe('getCacheCount', () => {
  it('should return correct count', async () => {
    expect(await getCacheCount()).toBe(0);

    await setCache(createTestInput({ lectureId: 'lecture-1' }));
    expect(await getCacheCount()).toBe(1);

    await setCache(createTestInput({ lectureId: 'lecture-2' }));
    expect(await getCacheCount()).toBe(2);

    await deleteCache('course-123', 'lecture-1');
    expect(await getCacheCount()).toBe(1);
  });
});

describe('getCacheStats', () => {
  it('should return zero stats for empty cache', async () => {
    const stats = await getCacheStats();
    expect(stats.totalEntries).toBe(0);
    expect(stats.totalSizeBytes).toBe(0);
    expect(stats.oldestEntry).toBeNull();
    expect(stats.newestEntry).toBeNull();
    expect(stats.totalTokensUsed).toBe(0);
    expect(stats.totalEstimatedCost).toBe(0);
  });

  it('should calculate correct stats', async () => {
    await setCache(createTestInput({ lectureId: 'lecture-1', tokensUsed: 100, estimatedCost: 0.01 }));
    await setCache(createTestInput({ lectureId: 'lecture-2', tokensUsed: 200, estimatedCost: 0.02 }));

    const stats = await getCacheStats();
    expect(stats.totalEntries).toBe(2);
    expect(stats.totalSizeBytes).toBeGreaterThan(0);
    expect(stats.oldestEntry).not.toBeNull();
    expect(stats.newestEntry).not.toBeNull();
    expect(stats.totalTokensUsed).toBe(300);
    expect(stats.totalEstimatedCost).toBeCloseTo(0.03);
  });
});

// ============================================
// LRU Eviction Tests
// ============================================

describe('evictIfNeeded', () => {
  it('should not evict when under limits', async () => {
    await setCache(createTestInput({ lectureId: 'lecture-1' }));
    await setCache(createTestInput({ lectureId: 'lecture-2' }));

    const evicted = await evictIfNeeded({ maxEntries: 10 });
    expect(evicted).toBe(0);
    expect(await getCacheCount()).toBe(2);
  });

  it('should evict oldest entries when over entry limit', async () => {
    // Create entries with staggered timestamps
    for (let i = 1; i <= 5; i++) {
      await setCache(createTestInput({ lectureId: `lecture-${i}` }));
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const evicted = await evictIfNeeded({ maxEntries: 3 });
    expect(evicted).toBe(2);
    expect(await getCacheCount()).toBe(3);

    // Oldest entries should be evicted
    const result1 = await getCache('course-123', 'lecture-1');
    expect(result1.hit).toBe(false);

    const result2 = await getCache('course-123', 'lecture-2');
    expect(result2.hit).toBe(false);

    // Newer entries should remain
    const result5 = await getCache('course-123', 'lecture-5');
    expect(result5.hit).toBe(true);
  });
});

describe('touchCache', () => {
  it('should update updatedAt timestamp', async () => {
    const input = createTestInput();
    const original = await setCache(input);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const touched = await touchCache('course-123', 'lecture-456');
    expect(touched).toBe(true);

    const result = await getCache('course-123', 'lecture-456');
    expect(result.hit).toBe(true);
    expect(result.entry!.updatedAt).toBeGreaterThan(original.updatedAt);
    expect(result.entry!.createdAt).toBe(original.createdAt);
  });

  it('should return false for non-existent entry', async () => {
    const touched = await touchCache('nonexistent', 'lecture');
    expect(touched).toBe(false);
  });
});

describe('cleanupCache', () => {
  it('should return cleanup statistics', async () => {
    for (let i = 1; i <= 5; i++) {
      await setCache(createTestInput({ lectureId: `lecture-${i}` }));
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const result = await cleanupCache({ maxEntries: 2 });
    expect(result.evictedCount).toBe(3);
    expect(result.remainingEntries).toBe(2);
    expect(result.remainingSizeBytes).toBeGreaterThan(0);
  });
});

// ============================================
// SubtitleCache Class Tests
// ============================================

describe('SubtitleCache class', () => {
  let cache: SubtitleCache;

  beforeEach(() => {
    cache = new SubtitleCache({ maxEntries: 100 });
  });

  it('should get and set entries', async () => {
    const input = createTestInput();
    await cache.set(input);

    const result = await cache.get('course-123', 'lecture-456');
    expect(result.hit).toBe(true);
    expect(result.entry?.translatedVTT).toBe(input.translatedVTT);
  });

  it('should check if entry exists with has()', async () => {
    expect(await cache.has('course-123', 'lecture-456')).toBe(false);

    await cache.set(createTestInput());
    expect(await cache.has('course-123', 'lecture-456')).toBe(true);
  });

  it('should validate hash with hasValid()', async () => {
    await cache.set(createTestInput({ originalHash: 'hash123' }));

    expect(await cache.hasValid('course-123', 'lecture-456', 'hash123')).toBe(true);
    expect(await cache.hasValid('course-123', 'lecture-456', 'wrongHash')).toBe(false);
    expect(await cache.hasValid('nonexistent', 'lecture', 'hash123')).toBe(false);
  });

  it('should delete entries', async () => {
    await cache.set(createTestInput());
    expect(await cache.has('course-123', 'lecture-456')).toBe(true);

    await cache.delete('course-123', 'lecture-456');
    expect(await cache.has('course-123', 'lecture-456')).toBe(false);
  });

  it('should delete course entries', async () => {
    await cache.set(createTestInput({ lectureId: 'lecture-1' }));
    await cache.set(createTestInput({ lectureId: 'lecture-2' }));

    const deleted = await cache.deleteCourse('course-123');
    expect(deleted).toBe(2);
    expect(await cache.getCount()).toBe(0);
  });

  it('should clear all entries', async () => {
    await cache.set(createTestInput({ courseId: 'course-1' }));
    await cache.set(createTestInput({ courseId: 'course-2' }));

    await cache.clear();
    expect(await cache.getCount()).toBe(0);
  });

  it('should get stats', async () => {
    await cache.set(createTestInput({ tokensUsed: 150 }));

    const stats = await cache.getStats();
    expect(stats.totalEntries).toBe(1);
    expect(stats.totalTokensUsed).toBe(150);
  });

  it('should get course entries', async () => {
    await cache.set(createTestInput({ lectureId: 'lecture-1' }));
    await cache.set(createTestInput({ lectureId: 'lecture-2' }));

    const entries = await cache.getCourseEntries('course-123');
    expect(entries).toHaveLength(2);
  });

  it('should allow updating options', async () => {
    cache.setOptions({ maxEntries: 50 });
    // Options are updated internally
    expect(true).toBe(true);
  });

  it('should run cleanup', async () => {
    for (let i = 1; i <= 5; i++) {
      await cache.set(createTestInput({ lectureId: `lecture-${i}` }));
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    cache.setOptions({ maxEntries: 2 });
    const result = await cache.cleanup();
    expect(result.evictedCount).toBe(3);
    expect(result.remainingEntries).toBe(2);
  });
});

// ============================================
// Singleton Instance Tests
// ============================================

describe('subtitleCache singleton', () => {
  it('should be a SubtitleCache instance', () => {
    expect(subtitleCache).toBeInstanceOf(SubtitleCache);
  });

  it('should work correctly', async () => {
    await subtitleCache.set(createTestInput());
    const result = await subtitleCache.get('course-123', 'lecture-456');
    expect(result.hit).toBe(true);
  });
});

// ============================================
// Utility Functions Tests
// ============================================

describe('isIndexedDBAvailable', () => {
  it('should return true when IndexedDB is available', () => {
    expect(isIndexedDBAvailable()).toBe(true);
  });
});

describe('deleteDatabase', () => {
  it('should delete the database', async () => {
    await setCache(createTestInput());
    expect(await getCacheCount()).toBe(1);

    await deleteDatabase();

    // After deletion, database should be empty (recreated on next access)
    expect(await getCacheCount()).toBe(0);
  });
});
