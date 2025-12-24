/**
 * Unit Tests for Preloader
 * Task ID: T-20251223-act-011-build-preload
 */

import 'fake-indexeddb/auto';

jest.mock('../translator', () => ({
  translateVTT: jest.fn(),
}));

import { preloadLecture } from '../preloader';
import { subtitleCache } from '../../storage/subtitle-cache';
import { saveSettings } from '../../storage/settings-manager';
import { loadSessionCostState, updateSessionCostState } from '../../storage/session-cost';
import { translateVTT } from '../translator';

const mockTranslateVTT = translateVTT as jest.MockedFunction<typeof translateVTT>;

describe('preloadLecture', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    localStorage.clear();
    await updateSessionCostState({
      totals: { totalTokens: 0, totalCostUsd: 0, updatedAt: 0 },
      lastEstimate: undefined,
      lastActual: undefined,
    });
    await subtitleCache.clear().catch(() => {});
  });

  test('translates and stores next lecture into cache', async () => {
    await saveSettings({
      enabled: true,
      preloadEnabled: true,
      provider: 'openai',
      model: 'gpt-5.1',
      apiKey: 'test-key',
    });

    const lectureId = '999';
    const courseId = '5059176';
    const vttUrl = 'https://example.com/en.vtt';
    const originalVtt = `WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello`;

    const fetchMock = jest.fn(async (url: any) => {
      const href = typeof url === 'string' ? url : String(url);

      if (href.includes(`/subscribed-courses/${courseId}/lectures/${lectureId}/`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            title: 'Next Lecture',
            asset: { captions: [{ locale: 'en', url: vttUrl }] },
          }),
        } as any;
      }

      if (href === vttUrl) {
        return {
          ok: true,
          status: 200,
          text: async () => originalVtt,
        } as any;
      }

      throw new Error(`Unexpected fetch URL: ${href}`);
    });

    (globalThis as any).fetch = fetchMock;

    mockTranslateVTT.mockResolvedValue({
      success: true,
      translatedVTT: `WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n你好`,
      tokensUsed: 10,
      estimatedCost: 0.001,
    } as any);

    const result = await preloadLecture({
      courseId,
      lectureId,
      courseName: 'Course',
      sectionName: 'Section',
      lectureName: 'Next Lecture',
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('translated');

    const cached = await subtitleCache.get(courseId, lectureId);
    expect(cached.hit).toBe(true);
    expect(cached.entry?.translatedVTT).toContain('你好');
    expect(mockTranslateVTT).toHaveBeenCalledTimes(1);

    const sessionState = await loadSessionCostState();
    expect(sessionState.totals.totalTokens).toBe(10);
    expect(sessionState.totals.totalCostUsd).toBeCloseTo(0.001);
    expect(sessionState.lastActual?.provider).toBe('openai');
    expect(sessionState.lastActual?.model).toBe('gpt-5.1');
    expect(sessionState.lastActual?.tokensUsed).toBe(10);
    expect(sessionState.lastActual?.costUsd).toBeCloseTo(0.001);
  });

  test('skips translation when cache is valid', async () => {
    await saveSettings({
      enabled: true,
      preloadEnabled: true,
      provider: 'openai',
      model: 'gpt-5.1',
      apiKey: 'test-key',
    });

    const lectureId = '999';
    const courseId = '5059176';
    const vttUrl = 'https://example.com/en.vtt';
    const originalVtt = `WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello`;

    const fetchMock = jest.fn(async (url: any) => {
      const href = typeof url === 'string' ? url : String(url);

      if (href.includes(`/subscribed-courses/${courseId}/lectures/${lectureId}/`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            title: 'Next Lecture',
            asset: { captions: [{ locale: 'en', url: vttUrl }] },
          }),
        } as any;
      }

      if (href === vttUrl) {
        return {
          ok: true,
          status: 200,
          text: async () => originalVtt,
        } as any;
      }

      throw new Error(`Unexpected fetch URL: ${href}`);
    });

    (globalThis as any).fetch = fetchMock;

    mockTranslateVTT.mockResolvedValue({
      success: true,
      translatedVTT: `WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n你好`,
      tokensUsed: 10,
      estimatedCost: 0.001,
    } as any);

    const first = await preloadLecture({ courseId, lectureId });
    expect(first.status).toBe('translated');

    mockTranslateVTT.mockClear();

    const second = await preloadLecture({ courseId, lectureId });
    expect(second.ok).toBe(true);
    expect(second.status).toBe('cached');
    expect(mockTranslateVTT).not.toHaveBeenCalled();

    const sessionState = await loadSessionCostState();
    expect(sessionState.totals.totalTokens).toBe(10);
    expect(sessionState.totals.totalCostUsd).toBeCloseTo(0.001);
  });
});
