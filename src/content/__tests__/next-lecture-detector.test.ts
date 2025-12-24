/**
 * Unit Tests for Next Lecture Detector
 * Task ID: T-20251223-act-011-build-preload
 */

import { detectNextLecture } from '../next-lecture-detector';

describe('detectNextLecture', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    delete (window as any).UD;
  });

  test('resolves next lecture via curriculum API', async () => {
    const fetchMock = jest.fn(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            { _class: 'lecture', id: 111, title: 'Intro', object_index: 1, is_published: true },
            { _class: 'chapter', id: 1, title: 'Chapter', object_index: 1 },
            { _class: 'lecture', id: 222, title: 'Next', object_index: 2, is_published: true },
          ],
        }),
      } as any;
    });

    (globalThis as any).fetch = fetchMock;

    const result = await detectNextLecture({
      courseId: '5059176',
      courseSlug: 'test-course',
      currentLectureId: '111',
    });

    expect(result.method).toBe('curriculum-api');
    expect(result.nextLectureId).toBe('222');
    expect(result.nextLectureTitle).toBe('Next');
    expect(result.isLastLecture).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('returns isLastLecture when current lecture is last', async () => {
    const fetchMock = jest.fn(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            { _class: 'lecture', id: 111, title: 'Only', object_index: 1, is_published: true },
          ],
        }),
      } as any;
    });

    (globalThis as any).fetch = fetchMock;

    const result = await detectNextLecture({
      courseId: '5059176',
      courseSlug: 'test-course',
      currentLectureId: '111',
    });

    expect(result.method).toBe('curriculum-api');
    expect(result.nextLectureId).toBeNull();
    expect(result.isLastLecture).toBe(true);
  });

  test('falls back to UD global when API fails', async () => {
    (window as any).UD = { lecture: { nextLecture: { id: 333, title: 'From UD' } } };

    const fetchMock = jest.fn(async () => {
      return { ok: false, status: 500, json: async () => ({}) } as any;
    });
    (globalThis as any).fetch = fetchMock;

    const result = await detectNextLecture({
      courseId: '5059176',
      courseSlug: 'test-course',
      currentLectureId: '111',
    });

    expect(result.method).toBe('ud-fallback');
    expect(result.nextLectureId).toBe('333');
    expect(result.nextLectureTitle).toBe('From UD');
  });
});

