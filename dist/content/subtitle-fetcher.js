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
/** VTT file fetch timeout (ms) */
const VTT_FETCH_TIMEOUT = 10000;
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
let currentLogLevel = 'info';
function log(level, ...args) {
    if (LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel]) {
        const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
        console[method](LOG_PREFIX, `[${level.toUpperCase()}]`, ...args);
    }
}
/**
 * Set the logging level
 */
export function setLogLevel(level) {
    currentLogLevel = level;
}
// ============================================
// URL and Course Info Extraction
// ============================================
/**
 * Extract course information from current Udemy URL
 */
export function extractCourseInfo() {
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
    const info = {
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
function getCourseIdFromPage() {
    // Method 1: Check UD global object (Udemy's internal data)
    try {
        // @ts-ignore - UD is Udemy's global object
        if (typeof UD !== 'undefined' && UD?.config?.brand?.course?.id) {
            // @ts-ignore
            return String(UD.config.brand.course.id);
        }
    }
    catch (e) {
        // UD not available
    }
    // Method 2: Check performance entries for API calls containing course ID
    try {
        const apiCalls = performance.getEntriesByType('resource');
        for (const call of apiCalls) {
            const match = call.name.match(/api-2\.0\/courses\/(\d+)/);
            if (match) {
                return match[1];
            }
        }
    }
    catch (e) {
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
function getCourseTitle() {
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
function getSectionTitle() {
    const sectionElement = document.querySelector('[data-purpose="section-heading"][aria-expanded="true"]');
    return sectionElement?.textContent?.trim();
}
/**
 * Get current lecture title
 */
function getLectureTitle() {
    const lectureElement = document.querySelector('[data-purpose="curriculum-item-link"][aria-current="true"]');
    return lectureElement?.textContent?.trim();
}
// ============================================
// Video Detection
// ============================================
/**
 * Detect video element on Udemy page
 * Waits up to VIDEO_DETECTION_TIMEOUT for video to appear
 */
export async function detectVideo() {
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
function findVideoElement() {
    // Primary selector: Udemy video player
    const selectors = [
        'video[data-purpose="video-player"]',
        'video.vjs-tech',
        '.video-js video',
        'video',
    ];
    for (const selector of selectors) {
        const video = document.querySelector(selector);
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
function isValidVideoElement(video) {
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
export async function getSubtitleTracks(video) {
    log('info', 'Extracting subtitle tracks...');
    const result = {
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
    // Method 3: Intercept network requests for VTT files
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
function getTracksFromElements(video) {
    const tracks = [];
    const trackElements = video.querySelectorAll('track');
    trackElements.forEach((track) => {
        if (track.src && (track.kind === 'subtitles' || track.kind === 'captions')) {
            tracks.push({
                url: track.src,
                language: track.srclang || 'unknown',
                label: track.label || track.srclang || 'Unknown',
                isDefault: track.default,
                kind: track.kind,
            });
        }
    });
    return tracks;
}
/**
 * Extract tracks from HTML5 TextTrack API
 */
function getTracksFromTextTrackAPI(video) {
    const tracks = [];
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
                kind: track.kind,
            });
        }
    }
    return tracks;
}
/**
 * Try to get subtitle URLs from intercepted network requests
 */
async function getTracksFromNetworkIntercept() {
    const tracks = [];
    try {
        // Check performance entries for VTT file requests
        const entries = performance.getEntriesByType('resource');
        for (const entry of entries) {
            if (entry.name.includes('.vtt') || entry.name.includes('caption')) {
                // Try to extract language from URL
                const langMatch = entry.name.match(/[_-]([a-z]{2}(?:-[A-Z]{2})?)[_.]/) ||
                    entry.name.match(/lang[=_]([a-z]{2}(?:-[A-Z]{2})?)/i);
                const language = langMatch ? langMatch[1] : 'en';
                tracks.push({
                    url: entry.name,
                    language,
                    label: language === 'en' ? 'English' : language,
                    isDefault: language === 'en',
                    kind: 'subtitles',
                });
            }
        }
        // Deduplicate by URL
        const uniqueTracks = tracks.filter((track, index, self) => index === self.findIndex((t) => t.url === track.url));
        return uniqueTracks;
    }
    catch (e) {
        log('debug', 'Network intercept failed:', e);
        return [];
    }
}
/**
 * Select the best subtitle track based on language priority
 */
export function selectPreferredTrack(tracks) {
    if (tracks.length === 0) {
        return null;
    }
    // Check for preferred languages in order
    for (const lang of LANGUAGE_PRIORITY) {
        const track = tracks.find((t) => t.language.toLowerCase() === lang.toLowerCase());
        if (track) {
            log('info', `Selected track: ${track.label} (${track.language})`);
            return track;
        }
    }
    // Check for any English variant
    const englishTrack = tracks.find((t) => t.language.toLowerCase().startsWith('en'));
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
 * Fetch VTT content from URL
 */
export async function fetchVTT(url) {
    log('info', `Fetching VTT from: ${url}`);
    if (!url) {
        return {
            success: false,
            error: 'No URL provided',
        };
    }
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), VTT_FETCH_TIMEOUT);
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            log('error', `VTT fetch failed: ${response.status} ${response.statusText}`);
            return {
                success: false,
                error: `HTTP ${response.status}: ${response.statusText}`,
            };
        }
        const content = await response.text();
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
    }
    catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error';
        log('error', `VTT fetch error: ${error}`);
        if (error.includes('aborted')) {
            return {
                success: false,
                error: 'Request timeout',
            };
        }
        return {
            success: false,
            error,
        };
    }
}
/**
 * Validate VTT content format
 */
function isValidVTT(content) {
    // VTT file must start with WEBVTT
    // Strip BOM (U+FEFF) if present - common from some CDNs
    const stripped = content.replace(/^\uFEFF/, '').trim();
    return stripped.startsWith('WEBVTT');
}
/**
 * Calculate SHA-256 hash of content
 */
async function calculateHash(content) {
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(content);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    catch (e) {
        // Fallback for environments without crypto.subtle
        return simpleHash(content);
    }
}
/**
 * Simple hash fallback
 */
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
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
export async function fetchSubtitles() {
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
    const subtitleResult = await getSubtitleTracks(videoDetection.video);
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
    const selectedTrack = selectPreferredTrack(subtitleResult.tracks);
    if (!selectedTrack || !selectedTrack.url) {
        log('warn', 'No suitable track selected or track has no URL');
        return {
            videoDetection,
            subtitleResult,
            vttContent: null,
            selectedTrack,
        };
    }
    // Step 4: Fetch VTT content
    const vttResult = await fetchVTT(selectedTrack.url);
    log('info', '=== Subtitle fetch process complete ===');
    return {
        videoDetection,
        subtitleResult,
        vttContent: vttResult.success ? vttResult.data : null,
        selectedTrack,
    };
}
/**
 * Export SubtitleFetcher class for object-oriented usage
 */
export class SubtitleFetcher {
    constructor() {
        this.video = null;
        this.courseInfo = null;
        this.tracks = [];
    }
    /**
     * Initialize the fetcher by detecting video and extracting info
     */
    async initialize() {
        const result = await detectVideo();
        this.video = result.video;
        this.courseInfo = result.courseInfo;
        return result.found;
    }
    /**
     * Get the detected video element
     */
    getVideo() {
        return this.video;
    }
    /**
     * Get extracted course information
     */
    getCourseInfo() {
        return this.courseInfo;
    }
    /**
     * Get available subtitle tracks
     */
    async getSubtitleTracks() {
        if (!this.video) {
            log('warn', 'Video not initialized');
            return [];
        }
        const result = await getSubtitleTracks(this.video);
        this.tracks = result.tracks;
        return this.tracks;
    }
    /**
     * Fetch VTT content from a track
     */
    async fetchVTT(url) {
        const result = await fetchVTT(url);
        return result.success ? result.data : null;
    }
    /**
     * Select preferred track from available tracks
     */
    selectPreferredTrack() {
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
//# sourceMappingURL=subtitle-fetcher.js.map