/**
 * Unit Tests for Subtitle Version Checker
 * Task ID: T-20251223-act-012-build-retranslate
 * Updated: T-20251231-act-022-cache-match-fix
 *
 * Note: Cache decision is now based only on courseId + lectureId.
 * Hash is computed for storage but not used for cache comparison.
 */

import 'fake-indexeddb/auto';
import { clearAllCache } from '../../storage/subtitle-cache';
import { subtitleCache } from '../../storage/subtitle-cache';
import { checkSubtitleVersion } from '../version-checker';

beforeEach(async () => {
  await clearAllCache().catch(() => {});
});

describe('checkSubtitleVersion', () => {
  it('should request retranslation on cache miss', async () => {
    const result = await checkSubtitleVersion({
      courseId: 'course-1',
      lectureId: 'lecture-1',
    });

    expect(result.decision).toBe('retranslate');
    expect(result.reason).toBe('cache_miss');
    expect(result.cacheHit).toBe(false);
  });

  it('should use cache when entry exists (no hash comparison)', async () => {
    await subtitleCache.set({
      courseId: 'course-1',
      lectureId: 'lecture-1',
      courseName: 'Course',
      lectureName: 'Lecture',
      originalHash: 'hash-a',
      translatedVTT: 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n你好',
      provider: 'openai',
      model: 'gpt-5.1',
      tokensUsed: 10,
      estimatedCost: 0.0001,
    });

    const result = await checkSubtitleVersion({
      courseId: 'course-1',
      lectureId: 'lecture-1',
    });

    expect(result.decision).toBe('use_cache');
    expect(result.reason).toBe('cache_valid');
    expect(result.cacheHit).toBe(true);
    expect(result.cachedEntry?.translatedVTT).toContain('WEBVTT');
  });

  it('should use cache even when stored hash differs (hash no longer compared)', async () => {
    await subtitleCache.set({
      courseId: 'course-1',
      lectureId: 'lecture-1',
      courseName: 'Course',
      lectureName: 'Lecture',
      originalHash: 'hash-old',
      translatedVTT: 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n旧翻译',
      provider: 'openai',
      model: 'gpt-5.1',
      tokensUsed: 10,
      estimatedCost: 0.0001,
    });

    // Pass different originalVtt - should still use cache since only courseId+lectureId matter
    const result = await checkSubtitleVersion({
      courseId: 'course-1',
      lectureId: 'lecture-1',
      originalVtt: 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nNew content',
    });

    expect(result.decision).toBe('use_cache');
    expect(result.reason).toBe('cache_valid');
    expect(result.cacheHit).toBe(true);
    // originalHash should be computed from the passed VTT
    expect(result.originalHash).toBeDefined();
    expect(typeof result.originalHash).toBe('string');
  });

  it('should force retranslation when force=true', async () => {
    await subtitleCache.set({
      courseId: 'course-1',
      lectureId: 'lecture-1',
      courseName: 'Course',
      lectureName: 'Lecture',
      originalHash: 'hash-a',
      translatedVTT: 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n你好',
      provider: 'openai',
      model: 'gpt-5.1',
      tokensUsed: 10,
      estimatedCost: 0.0001,
    });

    const result = await checkSubtitleVersion({
      courseId: 'course-1',
      lectureId: 'lecture-1',
      force: true,
    });

    expect(result.decision).toBe('retranslate');
    expect(result.reason).toBe('force');
    expect(result.cacheHit).toBe(true);
  });

  it('should compute originalHash when originalVtt is provided', async () => {
    const vttContent = 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello';

    const result = await checkSubtitleVersion({
      courseId: 'course-1',
      lectureId: 'lecture-1',
      originalVtt: vttContent,
    });

    expect(result.decision).toBe('retranslate');
    expect(result.reason).toBe('cache_miss');
    expect(result.originalHash).toBeDefined();
    expect(typeof result.originalHash).toBe('string');
    expect(result.originalHash!.length).toBeGreaterThan(0);
  });

  it('should not include originalHash when originalVtt is not provided', async () => {
    const result = await checkSubtitleVersion({
      courseId: 'course-1',
      lectureId: 'lecture-1',
    });

    expect(result.originalHash).toBeUndefined();
  });
});
