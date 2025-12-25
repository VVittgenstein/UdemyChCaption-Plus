/**
 * Preloader - Background subtitle preloading for next lecture
 *
 * Task ID: T-20251223-act-011-build-preload
 *
 * Responsibilities:
 * - Fetch next lecture subtitle (WebVTT) in the background
 * - Translate silently via existing LLM translator
 * - Store translation into IndexedDB cache
 * - Support cancellation via AbortSignal
 */

import { loadSettings, isEnabled } from '../storage/settings-manager';
import { subtitleCache } from '../storage/subtitle-cache';
import { addSessionCost, updateSessionCostState } from '../storage/session-cost';
import { checkSubtitleVersion } from './version-checker';
import { translateVTT } from './translator';

export interface PreloadRequest {
  courseId: string;
  lectureId: string;
  courseName?: string;
  sectionName?: string;
  lectureName?: string;
  signal?: AbortSignal;
}

export interface PreloadResult {
  ok: boolean;
  status: 'disabled' | 'cached' | 'translated' | 'aborted' | 'error';
  courseId: string;
  lectureId: string;
  originalHash?: string;
  provider?: 'openai' | 'gemini';
  model?: string;
  error?: string;
}

type CaptionTrack = {
  url: string;
  language: string;
  label?: string;
};

const LOG_PREFIX = '[UdemyCaptionPlus][Preloader]';
const LANGUAGE_PRIORITY = ['en', 'en-US', 'en-GB', 'en-AU'];

function log(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(LOG_PREFIX, ...args);
}

function warn(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.warn(LOG_PREFIX, ...args);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isNumericId(value: string): boolean {
  return /^\d+$/.test(value);
}

function normalizeLocale(locale: string): string {
  const normalized = locale.trim().replace(/_/g, '-');
  const [language, region, ...rest] = normalized.split('-').filter(Boolean);
  if (!language) return normalized;
  if (!region) return language.toLowerCase();
  const suffix = rest.length > 0 ? `-${rest.join('-')}` : '';
  return `${language.toLowerCase()}-${region.toUpperCase()}${suffix}`;
}

function inferLanguageFromUrl(url: string): string {
  const match =
    url.match(/[_-]([a-z]{2}(?:-[A-Z]{2})?)[_.]/) ||
    url.match(/lang[=_]([a-z]{2}(?:-[A-Z]{2})?)/i) ||
    url.match(/locale[=_]([a-z]{2}(?:[_-][A-Z]{2})?)/i);
  if (!match?.[1]) return 'en';
  return normalizeLocale(match[1]);
}

function asAbsoluteUrl(url: string): string {
  try {
    return new URL(url).toString();
  } catch {
    return new URL(url, 'https://www.udemy.com').toString();
  }
}

function dedupeTracks(tracks: CaptionTrack[]): CaptionTrack[] {
  const seen = new Set<string>();
  const result: CaptionTrack[] = [];
  for (const track of tracks) {
    if (!track.url) continue;
    const url = asAbsoluteUrl(track.url);
    if (seen.has(url)) continue;
    seen.add(url);
    result.push({ ...track, url });
  }
  return result;
}

function pickPreferredTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (tracks.length === 0) return null;

  for (const lang of LANGUAGE_PRIORITY) {
    const hit = tracks.find((t) => t.language.toLowerCase() === lang.toLowerCase());
    if (hit) return hit;
  }

  const english = tracks.find((t) => t.language.toLowerCase().startsWith('en'));
  if (english) return english;

  return tracks[0] || null;
}

function toStringIfPresent(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function extractTracksFromCaptionArray(captions: unknown[]): CaptionTrack[] {
  const tracks: CaptionTrack[] = [];

  for (const item of captions) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;

    const url =
      toStringIfPresent(obj.url) ||
      toStringIfPresent(obj.download_url) ||
      toStringIfPresent(obj.downloadUrl) ||
      toStringIfPresent(obj.vtt_url) ||
      toStringIfPresent(obj.vttUrl) ||
      toStringIfPresent(obj.file) ||
      null;

    if (!url || !url.includes('.vtt')) continue;

    const languageRaw =
      toStringIfPresent(obj.language) ||
      toStringIfPresent(obj.locale) ||
      toStringIfPresent(obj.srclang) ||
      toStringIfPresent(obj.language_code) ||
      toStringIfPresent(obj.lang) ||
      null;

    const language = languageRaw ? normalizeLocale(languageRaw) : inferLanguageFromUrl(url);
    const label = toStringIfPresent(obj.label) || language;

    tracks.push({ url, language, label });
  }

  return tracks;
}

function collectVttUrlsRecursively(data: unknown, maxNodes: number = 2000): CaptionTrack[] {
  const tracks: CaptionTrack[] = [];
  const visited = new Set<unknown>();
  const queue: unknown[] = [data];
  let visitedCount = 0;

  while (queue.length > 0 && visitedCount < maxNodes) {
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;
    if (visited.has(node)) continue;
    visited.add(node);
    visitedCount++;

    if (Array.isArray(node)) {
      for (const item of node) queue.push(item);
      continue;
    }

    const obj = node as Record<string, unknown>;
    const keys = Object.keys(obj);
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === 'string' && value.includes('.vtt')) {
        const languageRaw =
          toStringIfPresent(obj.language) ||
          toStringIfPresent(obj.locale) ||
          toStringIfPresent(obj.srclang) ||
          toStringIfPresent(obj.language_code) ||
          toStringIfPresent(obj.lang) ||
          null;
        const language = languageRaw ? normalizeLocale(languageRaw) : inferLanguageFromUrl(value);
        tracks.push({ url: value, language, label: language });
      } else if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return tracks;
}

function extractCaptionTracks(data: unknown): CaptionTrack[] {
  const tracks: CaptionTrack[] = [];
  const root = data as any;

  const arrays: unknown[][] = [];
  if (Array.isArray(root?.asset?.captions)) arrays.push(root.asset.captions);
  if (Array.isArray(root?.asset?.caption_tracks)) arrays.push(root.asset.caption_tracks);
  if (Array.isArray(root?.captions)) arrays.push(root.captions);
  if (Array.isArray(root?.results)) arrays.push(root.results);

  for (const arr of arrays) tracks.push(...extractTracksFromCaptionArray(arr));
  tracks.push(...collectVttUrlsRecursively(data));

  return dedupeTracks(tracks);
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { credentials: 'include', signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function resolveNumericCourseId(courseId: string, signal?: AbortSignal): Promise<string | null> {
  if (isNumericId(courseId)) return courseId;
  try {
    const url = `https://www.udemy.com/api-2.0/courses/${encodeURIComponent(courseId)}/?fields[course]=id`;
    const data = (await fetchJson(url, signal)) as { id?: number | string } | null;
    const id = toStringIfPresent(data?.id);
    if (id && isNumericId(id)) return id;
  } catch {
    // ignore
  }
  return null;
}

async function fetchLectureCaptionTracks(
  courseId: string,
  lectureId: string,
  signal?: AbortSignal
): Promise<{ lectureTitle?: string; tracks: CaptionTrack[] }> {
  const numericCourseId = await resolveNumericCourseId(courseId, signal);

  const attempts: Array<() => Promise<{ lectureTitle?: string; tracks: CaptionTrack[] }>> = [];

  if (numericCourseId) {
    attempts.push(async () => {
      const url =
        `https://www.udemy.com/api-2.0/users/me/subscribed-courses/${numericCourseId}/lectures/${lectureId}/` +
        `?fields[lecture]=title,asset&fields[asset]=captions`;
      const data = (await fetchJson(url, signal)) as any;
      const tracks = extractCaptionTracks(data);
      return { lectureTitle: typeof data?.title === 'string' ? data.title : undefined, tracks };
    });
  }

  attempts.push(async () => {
    const url =
      `https://www.udemy.com/api-2.0/lectures/${lectureId}/` +
      `?fields[lecture]=title,asset&fields[asset]=captions`;
    const data = (await fetchJson(url, signal)) as any;
    const tracks = extractCaptionTracks(data);
    return { lectureTitle: typeof data?.title === 'string' ? data.title : undefined, tracks };
  });

  attempts.push(async () => {
    const url = `https://www.udemy.com/api-2.0/lectures/${lectureId}/captions/`;
    const data = (await fetchJson(url, signal)) as any;
    const tracks = extractCaptionTracks(data);
    return { lectureTitle: undefined, tracks };
  });

  if (numericCourseId) {
    attempts.push(async () => {
      const url =
        `https://www.udemy.com/api-2.0/courses/${numericCourseId}/subscriber-curriculum-items/` +
        `?page_size=1400&fields[lecture]=title,asset&fields[asset]=captions&caching_intent=True`;
      const data = (await fetchJson(url, signal)) as any;
      const results = Array.isArray(data?.results) ? data.results : [];
      const lecture = results.find((item: any) => item && item._class === 'lecture' && String(item.id) === lectureId);
      const tracks = extractCaptionTracks(lecture);
      return { lectureTitle: typeof lecture?.title === 'string' ? lecture.title : undefined, tracks };
    });
  }

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result.tracks.length > 0) return result;
      lastError = new Error('No caption tracks found');
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function fetchVtt(url: string, signal?: AbortSignal): Promise<string> {
  const resolved = asAbsoluteUrl(url);
  const response = await fetch(resolved, { credentials: 'include', signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch VTT (${response.status})`);
  }
  return response.text();
}

/**
 * Preload + translate a lecture's subtitle into cache.
 */
export async function preloadLecture(request: PreloadRequest): Promise<PreloadResult> {
  const { courseId, lectureId, signal } = request;

  try {
    const settings = await loadSettings();
    if (!isEnabled(settings) || !settings.preloadEnabled) {
      return { ok: true, status: 'disabled', courseId, lectureId };
    }

    const { lectureTitle, tracks } = await fetchLectureCaptionTracks(courseId, lectureId, signal);
    const selected = pickPreferredTrack(tracks);
    if (!selected) {
      return {
        ok: false,
        status: 'error',
        courseId,
        lectureId,
        error: 'No subtitle tracks available for preload',
      };
    }

    const originalVtt = await fetchVtt(selected.url, signal);
    if (!originalVtt.trim().startsWith('WEBVTT')) {
      return {
        ok: false,
        status: 'error',
        courseId,
        lectureId,
        error: 'Fetched subtitle is not a valid WebVTT file',
      };
    }

    const version = await checkSubtitleVersion({
      courseId,
      lectureId,
      originalVtt,
      force: false,
    });

    if (version.decision === 'use_cache') {
      log('Cache valid, skip preload:', `${courseId}-${lectureId}`);
      return {
        ok: true,
        status: 'cached',
        courseId,
        lectureId,
        originalHash: version.originalHash,
      };
    }

    log('Preloading translation:', `${courseId}-${lectureId}`);

    const baseUrl = settings.provider === 'openai' ? settings.openaiBaseUrl : settings.geminiBaseUrl;

    const result = await translateVTT(originalVtt, {
      provider: settings.provider,
      apiKey: settings.apiKey,
      model: settings.model,
      baseUrl: baseUrl || undefined,
      courseContext: {
        courseName: request.courseName,
        sectionName: request.sectionName,
        lectureName: request.lectureName || lectureTitle,
      },
      signal,
    });

    const actualTokens = typeof result.tokensUsed === 'number' ? result.tokensUsed : 0;
    const actualCostUsd = typeof result.estimatedCost === 'number' ? result.estimatedCost : 0;
    const now = Date.now();
    const taskId = `preload-${courseId}-${lectureId}-${now}`;

    if (!result.success || !result.translatedVTT) {
      if (actualTokens > 0 || actualCostUsd > 0) {
        await addSessionCost(actualTokens, actualCostUsd);
        await updateSessionCostState({
          lastActual: {
            taskId,
            provider: settings.provider,
            model: settings.model,
            tokensUsed: actualTokens,
            costUsd: actualCostUsd,
            createdAt: now,
          },
        });
      }

      return {
        ok: false,
        status: 'error',
        courseId,
        lectureId,
        originalHash: version.originalHash,
        provider: settings.provider,
        model: settings.model,
        error: result.error || 'Translation failed',
      };
    }

    if (actualTokens > 0 || actualCostUsd > 0) {
      await addSessionCost(actualTokens, actualCostUsd);
      await updateSessionCostState({
        lastActual: {
          taskId,
          provider: settings.provider,
          model: settings.model,
          tokensUsed: actualTokens,
          costUsd: actualCostUsd,
          createdAt: now,
        },
      });
    }

    await subtitleCache.set({
      courseId,
      lectureId,
      courseName: request.courseName || '',
      lectureName: request.lectureName || lectureTitle || lectureId,
      originalHash: version.originalHash,
      translatedVTT: result.translatedVTT,
      provider: settings.provider,
      model: settings.model,
      tokensUsed: actualTokens,
      estimatedCost: actualCostUsd,
    });

    return {
      ok: true,
      status: 'translated',
      courseId,
      lectureId,
      originalHash: version.originalHash,
      provider: settings.provider,
      model: settings.model,
    };
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) {
      warn('Preload aborted:', `${courseId}-${lectureId}`);
      return { ok: true, status: 'aborted', courseId, lectureId };
    }
    warn('Preload failed:', error);
    return { ok: false, status: 'error', courseId, lectureId, error: String(error) };
  }
}
