/**
 * Subtitle Fetcher Module
 *
 * Responsible for detecting and fetching subtitle tracks from Udemy video player.
 *
 * Task ID: T-20251223-act-005-build-subtitle-fetch
 *
 * Acceptance Criteria:
 * - [x] Content Script 在 Udemy 课程播放页加载后 3 秒内识别视频元素
 * - [x] 成功提取原始字幕 URL（优先英文 WebVTT）
 * - [x] 控制台/日志可见字幕抓取状态
 */

import type {
  SubtitleTrack,
  SubtitleFetchResult,
  VTTContent,
  VideoDetectionResult,
  CourseInfo,
  AsyncResult,
} from '../types';
import { calculateHash } from '../utils/hash';

// ============================================
// Constants
// ============================================

/** Logger prefix for all subtitle fetcher logs */
const LOG_PREFIX = '[SubtitleFetcher]';

/** Maximum time to wait for video detection (ms) */
const VIDEO_DETECTION_TIMEOUT = 3000;

/** Polling interval for video detection (ms) */
const VIDEO_DETECTION_POLL_INTERVAL = 100;

/** Preferred language priority for subtitle selection */
const LANGUAGE_PRIORITY = ['en', 'en-US', 'en-GB', 'en-AU'];

// ============================================
// Logger Utility
// ============================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLogLevel: LogLevel = 'info';

function log(level: LogLevel, ...args: unknown[]): void {
  if (LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel]) {
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    console[method](LOG_PREFIX, `[${level.toUpperCase()}]`, ...args);
  }
}

/**
 * Set the logging level
 */
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

// ============================================
// URL and Course Info Extraction
// ============================================

/**
 * Extract course information from current Udemy URL
 */
export function extractCourseInfo(): CourseInfo | null {
  const url = window.location.href;

  // Pattern: /course/{slug}/learn/lecture/{lecture_id}
  const match = url.match(/\/course\/([^\/]+)\/learn\/lecture\/(\d+)/);
  if (!match) {
    log('debug', 'URL does not match Udemy course page pattern:', url);
    return null;
  }

  const courseSlug = match[1];
  const lectureId = match[2];

  // Try to get course ID from performance entries or page data
  const courseId = getCourseIdFromPage();

  const info: CourseInfo = {
    courseId: courseId || '',
    courseSlug,
    lectureId,
    courseTitle: getCourseTitle(),
    sectionTitle: getSectionTitle(),
    lectureTitle: getLectureTitle(),
  };

  log('info', 'Extracted course info:', info);
  return info;
}

/**
 * Try to get course ID from page data or network requests
 */
function getCourseIdFromPage(): string {
  // Method 1: Check UD global object (Udemy's internal data)
  try {
    // @ts-ignore - UD is Udemy's global object
    if (typeof UD !== 'undefined' && UD?.config?.brand?.course?.id) {
      // @ts-ignore
      return String(UD.config.brand.course.id);
    }
  } catch (e) {
    // UD not available
  }

  // Method 2: Check performance entries for API calls containing course ID
  try {
    const apiCalls = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    for (const call of apiCalls) {
      const match = call.name.match(/api-2\.0\/courses\/(\d+)/);
      if (match) {
        return match[1];
      }
    }
  } catch (e) {
    // Performance API not available
  }

  // Method 3: Check for data attribute on page elements
  const courseElement = document.querySelector('[data-course-id]');
  if (courseElement) {
    return courseElement.getAttribute('data-course-id') || '';
  }

  return '';
}

/**
 * Get course title from page
 */
function getCourseTitle(): string | undefined {
  // Try multiple selectors
  const selectors = [
    '[data-purpose="course-header-title"]',
    '.udlite-heading-xl',
    'h1[class*="course-title"]',
    'title',
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element?.textContent) {
      const text = element.textContent.trim();
      // Clean up title (remove " | Udemy" suffix if from title tag)
      return text.replace(/\s*\|\s*Udemy\s*$/i, '');
    }
  }

  return undefined;
}

/**
 * Get current section title from sidebar
 */
function getSectionTitle(): string | undefined {
  const sectionElement = document.querySelector(
    '[data-purpose="section-heading"][aria-expanded="true"]'
  );
  return sectionElement?.textContent?.trim();
}

/**
 * Get current lecture title
 */
function getLectureTitle(): string | undefined {
  const lectureElement = document.querySelector(
    '[data-purpose="curriculum-item-link"][aria-current="true"]'
  );
  return lectureElement?.textContent?.trim();
}

// ============================================
// Video Detection
// ============================================

/**
 * Detect video element on Udemy page
 * Waits up to VIDEO_DETECTION_TIMEOUT for video to appear
 */
export async function detectVideo(): Promise<VideoDetectionResult> {
  log('info', 'Starting video detection...');
  const startTime = Date.now();

  return new Promise((resolve) => {
    const check = () => {
      const video = findVideoElement();
      const elapsed = Date.now() - startTime;

      if (video) {
        log('info', `Video element found in ${elapsed}ms`);
        resolve({
          found: true,
          video,
          courseInfo: extractCourseInfo(),
          timestamp: Date.now(),
        });
        return;
      }

      if (elapsed >= VIDEO_DETECTION_TIMEOUT) {
        log('warn', `Video detection timeout after ${elapsed}ms`);
        resolve({
          found: false,
          video: null,
          courseInfo: extractCourseInfo(),
          timestamp: Date.now(),
        });
        return;
      }

      // Continue polling
      setTimeout(check, VIDEO_DETECTION_POLL_INTERVAL);
    };

    check();
  });
}

/**
 * Find video element on page
 */
function findVideoElement(): HTMLVideoElement | null {
  // Primary selector: Udemy video player
  const selectors = [
    'video[data-purpose="video-player"]',
    'video.vjs-tech',
    '.video-js video',
    'video',
  ];

  for (const selector of selectors) {
    const video = document.querySelector<HTMLVideoElement>(selector);
    if (video && isValidVideoElement(video)) {
      log('debug', `Found video with selector: ${selector}`);
      return video;
    }
  }

  return null;
}

/**
 * Check if video element is valid and ready
 */
function isValidVideoElement(video: HTMLVideoElement): boolean {
  // Check if video has a source
  if (!video.src && !video.querySelector('source')) {
    return false;
  }

  // Check if video is visible
  const rect = video.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return false;
  }

  return true;
}

// ============================================
// Subtitle Track Extraction
// ============================================

/**
 * Get subtitle tracks from video element
 */
export async function getSubtitleTracks(
  video: HTMLVideoElement,
  courseInfo?: CourseInfo | null
): Promise<SubtitleFetchResult> {
  log('info', 'Extracting subtitle tracks...');

  const result: SubtitleFetchResult = {
    success: false,
    tracks: [],
    method: 'none',
  };

  // Method 1: Check existing <track> elements
  const trackElements = getTracksFromElements(video);
  if (trackElements.length > 0) {
    result.tracks = trackElements;
    result.method = 'track-element';
    result.success = true;
    log('info', `Found ${trackElements.length} tracks from <track> elements`);
    return result;
  }

  // Method 2: Check TextTrack API
  const textTracks = getTracksFromTextTrackAPI(video);
  if (textTracks.length > 0) {
    // Only return early if we have tracks with valid URLs
    // TextTrack API doesn't always expose URLs, so continue to network intercept if needed
    const tracksWithUrls = textTracks.filter((t) => t.url);
    if (tracksWithUrls.length > 0) {
      result.tracks = textTracks;
      result.method = 'videojs-api';
      result.success = true;
      log('info', `Found ${textTracks.length} tracks from TextTrack API`);
      return result;
    }
    log('debug', `TextTrack API found ${textTracks.length} tracks but none have URLs, trying network intercept`);
  }

  // Method 3: Udemy Captions API (preferred over network intercept)
  if (courseInfo?.lectureId) {
    const apiTracks = await getTracksFromCaptionsAPI(courseInfo);
    if (apiTracks.length > 0) {
      result.tracks = apiTracks;
      result.method = 'udemy-api';
      result.success = true;
      log('info', `Found ${apiTracks.length} tracks from Udemy captions API`);
      return result;
    }
  }

  // Method 4: Intercept network requests for VTT files (fallback)
  const networkTracks = await getTracksFromNetworkIntercept();
  if (networkTracks.length > 0) {
    result.tracks = networkTracks;
    result.method = 'network-intercept';
    result.success = true;
    log('info', `Found ${networkTracks.length} tracks from network intercept`);
    return result;
  }

  log('warn', 'No subtitle tracks found');
  result.error = 'No subtitle tracks available';
  return result;
}

/**
 * Extract tracks from <track> DOM elements
 */
function getTracksFromElements(video: HTMLVideoElement): SubtitleTrack[] {
  const tracks: SubtitleTrack[] = [];
  const trackElements = video.querySelectorAll('track');

  trackElements.forEach((track) => {
    if (track.src && (track.kind === 'subtitles' || track.kind === 'captions')) {
      tracks.push({
        url: track.src,
        language: track.srclang || 'unknown',
        label: track.label || track.srclang || 'Unknown',
        isDefault: track.default,
        kind: track.kind as 'subtitles' | 'captions',
      });
    }
  });

  return tracks;
}

/**
 * Extract tracks from HTML5 TextTrack API
 */
function getTracksFromTextTrackAPI(video: HTMLVideoElement): SubtitleTrack[] {
  const tracks: SubtitleTrack[] = [];
  const textTracks = video.textTracks;

  if (!textTracks || textTracks.length === 0) {
    return tracks;
  }

  for (let i = 0; i < textTracks.length; i++) {
    const track = textTracks[i];
    if (track.kind === 'subtitles' || track.kind === 'captions') {
      // Note: TextTrack API doesn't provide URL directly
      // We need to reconstruct from cues or use other methods
      tracks.push({
        url: '', // URL not directly available from TextTrack API
        language: track.language || 'unknown',
        label: track.label || track.language || 'Unknown',
        isDefault: track.mode === 'showing',
        kind: track.kind as 'subtitles' | 'captions',
      });
    }
  }

  return tracks;
}

function isLikelyThumbnailSpriteVttUrl(url: URL): boolean {
  const path = url.pathname.toLowerCase();
  if (path.includes('thumb-sprites')) return true;
  if (path.includes('thumb_sprites')) return true;
  if (path.includes('storyboard')) return true;
  if (path.includes('thumbnail')) return true;
  return false;
}

function normalizeLocale(locale: string): string {
  const normalized = locale.trim().replace(/_/g, '-');
  const [language, region, ...rest] = normalized.split('-').filter(Boolean);
  if (!language) return normalized;
  if (!region) return language.toLowerCase();
  const suffix = rest.length > 0 ? `-${rest.join('-')}` : '';
  return `${language.toLowerCase()}-${region.toUpperCase()}${suffix}`;
}

function toStringIfPresent(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function inferLanguageFromUrl(url: string): string {
  const match =
    url.match(/[_-]([a-z]{2}(?:-[A-Z]{2})?)[_.]/) ||
    url.match(/lang[=_]([a-z]{2}(?:-[A-Z]{2})?)/i) ||
    url.match(/locale[=_]([a-z]{2}(?:[_-][A-Z]{2})?)/i);
  if (!match?.[1]) return 'unknown';
  return normalizeLocale(match[1]);
}

function asAbsoluteUrl(raw: string): string {
  try {
    return new URL(raw).toString();
  } catch {
    return new URL(raw, 'https://www.udemy.com').toString();
  }
}

function dedupeTracks(tracks: SubtitleTrack[]): SubtitleTrack[] {
  const seen = new Set<string>();
  const result: SubtitleTrack[] = [];
  for (const track of tracks) {
    if (!track.url) continue;
    const normalized = asAbsoluteUrl(track.url);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push({ ...track, url: normalized });
  }
  return result;
}

function extractTracksFromCaptionArray(items: unknown[]): SubtitleTrack[] {
  const tracks: SubtitleTrack[] = [];

  for (const item of items) {
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
    if (!url) continue;

    const parsed = tryParseUrl(url);
    if (parsed && isLikelyThumbnailSpriteVttUrl(parsed)) continue;

    // Only keep VTT-like URLs
    if (parsed && !looksLikeVttResource(parsed)) continue;
    if (!parsed && !url.includes('.vtt')) continue;

    const languageRaw =
      toStringIfPresent(obj.language) ||
      toStringIfPresent(obj.locale) ||
      toStringIfPresent(obj.srclang) ||
      toStringIfPresent(obj.language_code) ||
      toStringIfPresent(obj.lang) ||
      null;
    const language = languageRaw ? normalizeLocale(languageRaw) : inferLanguageFromUrl(url);

    const label =
      toStringIfPresent(obj.label) ||
      toStringIfPresent(obj.display_title) ||
      toStringIfPresent(obj.title) ||
      (language.toLowerCase().startsWith('en') ? 'English' : language || 'Unknown');

    const isDefault =
      (typeof obj.is_default === 'boolean' && obj.is_default) ||
      (typeof obj.default === 'boolean' && obj.default) ||
      language.toLowerCase() === 'en';

    tracks.push({ url, language, label, isDefault, kind: 'subtitles' });
  }

  return tracks;
}

function collectVttUrlsRecursively(data: unknown, maxNodes: number = 2000): SubtitleTrack[] {
  const tracks: SubtitleTrack[] = [];
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
      if (typeof value === 'string') {
        const parsed = tryParseUrl(value);
        if (!parsed) continue;
        if (isLikelyThumbnailSpriteVttUrl(parsed)) continue;
        if (!looksLikeVttResource(parsed)) continue;

        const languageRaw =
          toStringIfPresent(obj.language) ||
          toStringIfPresent(obj.locale) ||
          toStringIfPresent(obj.srclang) ||
          toStringIfPresent(obj.language_code) ||
          toStringIfPresent(obj.lang) ||
          null;
        const language = languageRaw ? normalizeLocale(languageRaw) : inferLanguageFromUrl(value);
        const label = language.toLowerCase().startsWith('en') ? 'English' : language || 'Unknown';
        tracks.push({ url: value, language, label, isDefault: language.toLowerCase() === 'en', kind: 'subtitles' });
      } else if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return tracks;
}

function extractCaptionTracks(data: unknown): SubtitleTrack[] {
  const tracks: SubtitleTrack[] = [];
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

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function getTracksFromCaptionsAPI(courseInfo: CourseInfo): Promise<SubtitleTrack[]> {
  const lectureId = courseInfo.lectureId;
  if (!lectureId) return [];

  const attempts: string[] = [
    `https://www.udemy.com/api-2.0/lectures/${encodeURIComponent(lectureId)}/captions/`,
    `https://www.udemy.com/api-2.0/lectures/${encodeURIComponent(lectureId)}/?fields[lecture]=asset&fields[asset]=captions`,
  ];

  // Some endpoints require numeric course id, but courseInfo.courseId might be missing/slug.
  if (courseInfo.courseId && /^\d+$/.test(courseInfo.courseId)) {
    attempts.unshift(
      `https://www.udemy.com/api-2.0/users/me/subscribed-courses/${encodeURIComponent(courseInfo.courseId)}/lectures/${encodeURIComponent(lectureId)}/?fields[lecture]=asset&fields[asset]=captions`
    );
  }

  let lastError: unknown = null;
  for (const url of attempts) {
    try {
      const data = await fetchJson(url);
      const tracks = extractCaptionTracks(data);
      if (tracks.length > 0) return tracks;
      lastError = new Error('No caption tracks found');
    } catch (error) {
      lastError = error;
    }
  }

  log('debug', 'Captions API lookup failed:', lastError);
  return [];
}

/**
 * Try to get subtitle URLs from intercepted network requests
 */
async function getTracksFromNetworkIntercept(): Promise<SubtitleTrack[]> {
  const tracks: SubtitleTrack[] = [];

  try {
    // Check performance entries for VTT file requests
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

    for (const entry of entries) {
      const parsed = tryParseUrl(entry.name);
      if (!parsed) continue;

      if (isLikelyThumbnailSpriteVttUrl(parsed)) continue;
      if (!looksLikeVttResource(parsed)) continue;

      // Try to extract language from URL
      const langMatch =
        entry.name.match(/[_-]([a-z]{2}(?:-[A-Z]{2})?)[_.]/) ||
        entry.name.match(/lang[=_]([a-z]{2}(?:-[A-Z]{2})?)/i) ||
        entry.name.match(/locale[=_]([a-z]{2}(?:[_-][A-Z]{2})?)/i);
      const language = langMatch ? langMatch[1].replace(/_/g, '-') : 'unknown';

      tracks.push({
        url: entry.name,
        language,
        label:
          language.toLowerCase().startsWith('en')
            ? 'English'
            : language === 'unknown'
              ? 'Unknown'
              : language,
        isDefault: language.toLowerCase() === 'en',
        kind: 'subtitles',
      });
    }

    // Deduplicate by URL
    const uniqueTracks = tracks.filter(
      (track, index, self) =>
        index === self.findIndex((t) => t.url === track.url)
    );

    return uniqueTracks;
  } catch (e) {
    log('debug', 'Network intercept failed:', e);
    return [];
  }
}

function tryParseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    try {
      return new URL(raw, 'https://www.udemy.com');
    } catch {
      return null;
    }
  }
}

function looksLikeVttResource(url: URL): boolean {
  const pathname = url.pathname.toLowerCase();
  if (pathname.includes('.vtt')) return true;

  const keys = ['format', 'type', 'fmt', 'ext', 'extension', 'mime'];
  for (const key of keys) {
    const value = url.searchParams.get(key);
    if (!value) continue;
    const normalized = value.toLowerCase();
    if (normalized === 'vtt' || normalized === 'text/vtt' || normalized === 'webvtt') return true;
  }

  return false;
}

function isLikelyThumbnailSpriteVttContent(content: string): boolean {
  const sample = content.replace(/^\uFEFF/, '').slice(0, 20000).toLowerCase();
  const xywhHits = sample.match(/#xywh=/g)?.length ?? 0;
  if (xywhHits === 0) return false;
  if (xywhHits >= 3) return true;
  return (
    sample.includes('thumb-sprites') ||
    sample.includes('thumb_sprites') ||
    sample.includes('storyboard') ||
    sample.includes('thumbnail')
  );
}

/**
 * Select the best subtitle track based on language priority
 */
export function selectPreferredTrack(tracks: SubtitleTrack[]): SubtitleTrack | null {
  if (tracks.length === 0) {
    return null;
  }

  // Check for preferred languages in order
  for (const lang of LANGUAGE_PRIORITY) {
    const track = tracks.find(
      (t) => t.language.toLowerCase() === lang.toLowerCase()
    );
    if (track) {
      log('info', `Selected track: ${track.label} (${track.language})`);
      return track;
    }
  }

  // Check for any English variant
  const englishTrack = tracks.find((t) =>
    t.language.toLowerCase().startsWith('en')
  );
  if (englishTrack) {
    log('info', `Selected English track: ${englishTrack.label}`);
    return englishTrack;
  }

  // Check for default track
  const defaultTrack = tracks.find((t) => t.isDefault);
  if (defaultTrack) {
    log('info', `Selected default track: ${defaultTrack.label}`);
    return defaultTrack;
  }

  // Fall back to first track
  log('info', `Selected first available track: ${tracks[0].label}`);
  return tracks[0];
}

// ============================================
// VTT Content Fetching
// ============================================

/**
 * Fetch VTT content from URL via background script
 * Background script can bypass CORS restrictions with proper host_permissions
 */
export async function fetchVTT(url: string): Promise<AsyncResult<VTTContent>> {
  log('info', `Fetching VTT from: ${url}`);

  if (!url) {
    return {
      success: false,
      error: 'No URL provided',
    };
  }

  try {
    let content: string;

    // Use background script to fetch VTT to bypass CORS in extension context.
    // For unit tests / non-extension environments, fall back to direct fetch().
    if (typeof chrome !== 'undefined' && !!chrome.runtime?.sendMessage) {
      const response = await chrome.runtime.sendMessage({
        type: 'FETCH_VTT',
        payload: { url },
      });

      if (!response?.ok) {
        const errorMsg = response?.error || 'Failed to fetch VTT';
        log('error', `VTT fetch failed: ${errorMsg}`);
        return {
          success: false,
          error: errorMsg,
        };
      }

      content = response.content;
    } else {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(url, { credentials: 'include', signal: controller.signal });
        if (!response.ok) {
          return {
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
          };
        }
        content = await response.text();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isTimeout = message.toLowerCase().includes('aborted');
        return {
          success: false,
          error: isTimeout ? 'Request timeout' : message,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // Validate VTT content
    if (!isValidVTT(content)) {
      log('error', 'Invalid VTT content received');
      return {
        success: false,
        error: 'Invalid VTT format',
      };
    }

    // Extract language from URL
    const langMatch = url.match(/[_-]([a-z]{2}(?:-[A-Z]{2})?)[_.]/) ||
                     url.match(/lang[=_]([a-z]{2}(?:-[A-Z]{2})?)/i);
    const language = langMatch ? langMatch[1] : 'unknown';

    // Calculate hash for cache validation
    const hash = await calculateHash(content);

    log('info', `VTT fetched successfully: ${content.length} bytes, hash: ${hash.substring(0, 8)}...`);

    return {
      success: true,
      data: {
        content,
        url,
        language,
        hash,
      },
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    log('error', `VTT fetch error: ${error}`);

    return {
      success: false,
      error,
    };
  }
}

/**
 * Validate VTT content format
 */
function isValidVTT(content: string): boolean {
  // VTT file must start with WEBVTT
  // Strip BOM (U+FEFF) if present - common from some CDNs
  const stripped = content.replace(/^\uFEFF/, '').trim();
  return stripped.startsWith('WEBVTT');
}

// ============================================
// Main API
// ============================================

/**
 * Main entry point: Detect video and fetch subtitles
 *
 * This is the primary function to be called from the content script entry point.
 * It handles the complete flow:
 * 1. Detect video element
 * 2. Extract available subtitle tracks
 * 3. Select preferred track (English by default)
 * 4. Fetch VTT content
 *
 * @returns Result containing video detection status and subtitle content
 */
export async function fetchSubtitles(): Promise<{
  videoDetection: VideoDetectionResult;
  subtitleResult: SubtitleFetchResult;
  vttContent: VTTContent | null;
  selectedTrack: SubtitleTrack | null;
}> {
  log('info', '=== Starting subtitle fetch process ===');

  // Step 1: Detect video
  const videoDetection = await detectVideo();
  if (!videoDetection.found || !videoDetection.video) {
    log('warn', 'Video not found, aborting subtitle fetch');
    return {
      videoDetection,
      subtitleResult: {
        success: false,
        tracks: [],
        method: 'none',
        error: 'Video element not found',
      },
      vttContent: null,
      selectedTrack: null,
    };
  }

  // Step 2: Get subtitle tracks
  const subtitleResult = await getSubtitleTracks(videoDetection.video, videoDetection.courseInfo);
  if (!subtitleResult.success || subtitleResult.tracks.length === 0) {
    log('warn', 'No subtitle tracks found');
    return {
      videoDetection,
      subtitleResult,
      vttContent: null,
      selectedTrack: null,
    };
  }

  // Step 3: Select preferred track
  const candidateTracks = subtitleResult.tracks.filter((track) => track.url);
  const preferredTrack = selectPreferredTrack(candidateTracks);
  if (!preferredTrack || !preferredTrack.url) {
    log('warn', 'No suitable track selected or track has no URL');
    return {
      videoDetection,
      subtitleResult,
      vttContent: null,
      selectedTrack: preferredTrack,
    };
  }

  // Step 4: Fetch VTT content
  const orderedTracks = [
    preferredTrack,
    ...candidateTracks.filter((track) => track.url !== preferredTrack.url),
  ];

  let selectedTrack: SubtitleTrack | null = null;
  let vttContent: VTTContent | null = null;

  for (const track of orderedTracks) {
    const vttResult = await fetchVTT(track.url);
    if (vttResult.success && vttResult.data) {
      if (isLikelyThumbnailSpriteVttContent(vttResult.data.content)) {
        log('warn', `Detected thumbnail sprite VTT, skipping track: ${track.label} (${track.language})`);
        continue;
      }
      selectedTrack = track;
      vttContent = vttResult.data;
      break;
    }
    log(
      'warn',
      `Failed to fetch VTT for track ${track.label} (${track.language}): ${vttResult.error || 'unknown error'}`
    );
  }

  log('info', '=== Subtitle fetch process complete ===');

  return {
    videoDetection,
    subtitleResult,
    vttContent,
    selectedTrack,
  };
}

/**
 * Export SubtitleFetcher class for object-oriented usage
 */
export class SubtitleFetcher {
  private video: HTMLVideoElement | null = null;
  private courseInfo: CourseInfo | null = null;
  private tracks: SubtitleTrack[] = [];

  /**
   * Initialize the fetcher by detecting video and extracting info
   */
  async initialize(): Promise<boolean> {
    const result = await detectVideo();
    this.video = result.video;
    this.courseInfo = result.courseInfo;
    return result.found;
  }

  /**
   * Get the detected video element
   */
  getVideo(): HTMLVideoElement | null {
    return this.video;
  }

  /**
   * Get extracted course information
   */
  getCourseInfo(): CourseInfo | null {
    return this.courseInfo;
  }

  /**
   * Get available subtitle tracks
   */
  async getSubtitleTracks(): Promise<SubtitleTrack[]> {
    if (!this.video) {
      log('warn', 'Video not initialized');
      return [];
    }

    const result = await getSubtitleTracks(this.video, this.courseInfo);
    this.tracks = result.tracks;
    return this.tracks;
  }

  /**
   * Fetch VTT content from a track
   */
  async fetchVTT(url: string): Promise<VTTContent | null> {
    const result = await fetchVTT(url);
    return result.success ? result.data! : null;
  }

  /**
   * Select preferred track from available tracks
   */
  selectPreferredTrack(): SubtitleTrack | null {
    return selectPreferredTrack(this.tracks);
  }
}

// Export for direct use
export default {
  fetchSubtitles,
  detectVideo,
  getSubtitleTracks,
  fetchVTT,
  selectPreferredTrack,
  extractCourseInfo,
  setLogLevel,
  SubtitleFetcher,
};
