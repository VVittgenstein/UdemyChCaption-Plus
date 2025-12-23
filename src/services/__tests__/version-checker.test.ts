/**
 * Unit Tests for Subtitle Version Checker
 * Task ID: T-20251223-act-012-build-retranslate
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
      originalHash: 'hash-a',
    });

    expect(result.decision).toBe('retranslate');
    expect(result.reason).toBe('cache_miss');
    expect(result.cacheHit).toBe(false);
  });

  it('should use cache when hash matches', async () => {
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
      originalHash: 'hash-a',
    });

    expect(result.decision).toBe('use_cache');
    expect(result.reason).toBe('cache_valid');
    expect(result.cacheHit).toBe(true);
    expect(result.hashMatch).toBe(true);
    expect(result.cachedEntry?.translatedVTT).toContain('WEBVTT');
  });

  it('should request retranslation when hash changed', async () => {
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

    const result = await checkSubtitleVersion({
      courseId: 'course-1',
      lectureId: 'lecture-1',
      originalHash: 'hash-new',
    });

    expect(result.decision).toBe('retranslate');
    expect(result.reason).toBe('hash_changed');
    expect(result.cacheHit).toBe(true);
    expect(result.hashMatch).toBe(false);
  });

  it('should force retranslation even when hash matches', async () => {
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
      originalHash: 'hash-a',
      force: true,
    });

    expect(result.decision).toBe('retranslate');
    expect(result.reason).toBe('force');
    expect(result.cacheHit).toBe(true);
    expect(result.hashMatch).toBe(true);
  });
});

