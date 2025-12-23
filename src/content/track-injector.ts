/**
 * Track Injector Module
 *
 * Dynamically injects translated subtitle tracks into Udemy video player.
 * Uses Data URI approach to bypass CSP restrictions.
 *
 * Task ID: T-20251223-act-008-build-track-injector
 *
 * Acceptance Criteria:
 * - [x] 动态创建 <track> 元素并添加到视频 DOM
 * - [x] 使用 data URI 或 chrome.runtime.getURL 绕过 CSP
 * - [x] Udemy 播放器字幕菜单显示"中文（优化）"轨道选项
 * - [x] 选中后字幕同步视频时间轴正常显示
 * - [x] 全屏模式下字幕样式与原生一致
 * - [x] 窗口大小变化时字幕自动适配
 *
 * @see spike-report-track-inject.md
 */

import { generateDataUri } from '../utils/webvtt-generator';
import type { VTTFile } from '../types';

// ============================================
// Types
// ============================================

/**
 * Track injection options
 */
export interface TrackInjectionOptions {
  /** Track label displayed in subtitle menu */
  label?: string;
  /** Language code (e.g., 'zh-CN') */
  language?: string;
  /** Track kind: 'subtitles' or 'captions' */
  kind?: 'subtitles' | 'captions';
  /** Whether to activate the track immediately after injection */
  activate?: boolean;
  /** Whether to deactivate other tracks when activating this one */
  exclusive?: boolean;
}

/**
 * Result of track injection operation
 */
export interface TrackInjectionResult {
  /** Whether injection succeeded */
  success: boolean;
  /** The injected track element (if successful) */
  track?: HTMLTrackElement;
  /** Error message if injection failed */
  error?: string;
  /** Method used for injection */
  method: 'data-uri' | 'blob-url' | 'text-track-api';
}

/**
 * Information about an injected track
 */
export interface InjectedTrackInfo {
  /** Track element reference */
  element: HTMLTrackElement;
  /** Track label */
  label: string;
  /** Language code */
  language: string;
  /** Track kind */
  kind: 'subtitles' | 'captions';
  /** Data URI or Blob URL */
  src: string;
  /** Whether track is currently active */
  isActive: boolean;
  /** Whether track uses exclusive activation (deactivates other tracks) */
  exclusive: boolean;
  /** Injection timestamp */
  injectedAt: number;
}

/**
 * Track activation state
 */
export type TrackMode = 'disabled' | 'hidden' | 'showing';

// ============================================
// Constants
// ============================================

/** Logger prefix */
const LOG_PREFIX = '[TrackInjector]';

/** Default track label */
export const DEFAULT_LABEL = '中文（优化）';

/** Default language code */
export const DEFAULT_LANGUAGE = 'zh-CN';

/** Custom attribute to identify our injected tracks */
export const INJECTED_TRACK_ATTR = 'data-udemy-caption-plus';

/** Event dispatched when track is injected */
export const TRACK_INJECTED_EVENT = 'udemycaptionplus:trackinjected';

/** Event dispatched when track is activated */
export const TRACK_ACTIVATED_EVENT = 'udemycaptionplus:trackactivated';

// ============================================
// Logger
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
 * Set the logging level for the injector
 */
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

// ============================================
// State Management
// ============================================

/** Map of video elements to their injected tracks */
const injectedTracks = new WeakMap<HTMLVideoElement, InjectedTrackInfo[]>();

/** Track cleanup handlers */
const cleanupHandlers = new WeakMap<HTMLVideoElement, () => void>();

/**
 * Get all injected tracks for a video element
 */
export function getInjectedTracks(video: HTMLVideoElement): InjectedTrackInfo[] {
  return injectedTracks.get(video) || [];
}

/**
 * Register an injected track
 */
function registerTrack(video: HTMLVideoElement, trackInfo: InjectedTrackInfo): void {
  const tracks = injectedTracks.get(video) || [];
  tracks.push(trackInfo);
  injectedTracks.set(video, tracks);
}

/**
 * Unregister an injected track
 */
function unregisterTrack(video: HTMLVideoElement, trackElement: HTMLTrackElement): void {
  const tracks = injectedTracks.get(video) || [];
  const index = tracks.findIndex((t) => t.element === trackElement);
  if (index !== -1) {
    tracks.splice(index, 1);
    injectedTracks.set(video, tracks);
  }
}

// ============================================
// Core Injection Functions
// ============================================

/**
 * Inject a translated subtitle track into a video element
 *
 * @param video - Target video element
 * @param vttContent - VTT content (string or parsed VTTFile)
 * @param options - Injection options
 * @returns Injection result
 */
export function injectTrack(
  video: HTMLVideoElement,
  vttContent: string | VTTFile,
  options: TrackInjectionOptions = {}
): TrackInjectionResult {
  const {
    label = DEFAULT_LABEL,
    language = DEFAULT_LANGUAGE,
    kind = 'subtitles',
    activate = true,
    exclusive = true,
  } = options;

  log('info', `Injecting track: "${label}" (${language})`);

  // Validate video element
  if (!video || !(video instanceof HTMLVideoElement)) {
    log('error', 'Invalid video element');
    return {
      success: false,
      error: 'Invalid video element',
      method: 'data-uri',
    };
  }

  // Check if we already injected a track with the same label
  const existingTracks = getInjectedTracks(video);
  const existingTrack = existingTracks.find((t) => t.label === label);
  if (existingTrack) {
    log('info', `Track "${label}" already exists, updating...`);
    // Remove existing track and inject new one
    removeTrack(video, existingTrack.element);
  }

  try {
    // Generate Data URI from VTT content
    const dataUri = generateDataUri(vttContent);

    // Create track element
    const track = document.createElement('track');
    track.kind = kind;
    track.label = label;
    track.srclang = language;
    track.src = dataUri;
    track.setAttribute(INJECTED_TRACK_ATTR, 'true');

    // Add track to video
    video.appendChild(track);

    // Wait for track to load before activating
    track.addEventListener('load', () => {
      log('debug', `Track "${label}" loaded successfully`);
    }, { once: true });

    track.addEventListener('error', (e) => {
      log('error', `Track "${label}" failed to load:`, e);
    }, { once: true });

    // Register track
    const trackInfo: InjectedTrackInfo = {
      element: track,
      label,
      language,
      kind,
      src: dataUri,
      isActive: false,
      exclusive,
      injectedAt: Date.now(),
    };
    registerTrack(video, trackInfo);

    // Setup cleanup handler if not already done
    setupCleanup(video);

    // Activate track if requested
    if (activate) {
      // Use setTimeout to ensure track is added to DOM before activation
      setTimeout(() => {
        activateTrack(video, track, exclusive);
        trackInfo.isActive = true;
      }, 0);
    }

    // Dispatch custom event for external listeners
    video.dispatchEvent(new CustomEvent(TRACK_INJECTED_EVENT, {
      detail: { track, label, language },
    }));

    log('info', `Track "${label}" injected successfully`);

    return {
      success: true,
      track,
      method: 'data-uri',
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    log('error', `Track injection failed: ${error}`);
    return {
      success: false,
      error,
      method: 'data-uri',
    };
  }
}

/**
 * Inject a track using Blob URL (alternative method)
 *
 * @param video - Target video element
 * @param vttContent - VTT content string
 * @param options - Injection options
 * @returns Injection result
 */
export function injectTrackBlob(
  video: HTMLVideoElement,
  vttContent: string,
  options: TrackInjectionOptions = {}
): TrackInjectionResult {
  const {
    label = DEFAULT_LABEL,
    language = DEFAULT_LANGUAGE,
    kind = 'subtitles',
    activate = true,
    exclusive = true,
  } = options;

  log('info', `Injecting track via Blob URL: "${label}" (${language})`);

  if (!video || !(video instanceof HTMLVideoElement)) {
    log('error', 'Invalid video element');
    return {
      success: false,
      error: 'Invalid video element',
      method: 'blob-url',
    };
  }

  // Check if we already injected a track with the same label
  const existingTracks = getInjectedTracks(video);
  const existingTrack = existingTracks.find((t) => t.label === label);
  if (existingTrack) {
    log('info', `Track "${label}" already exists, updating...`);
    // Remove existing track and inject new one
    removeTrack(video, existingTrack.element);
  }

  try {
    // Create Blob URL
    const blob = new Blob([vttContent], { type: 'text/vtt' });
    const blobUrl = URL.createObjectURL(blob);

    // Create track element
    const track = document.createElement('track');
    track.kind = kind;
    track.label = label;
    track.srclang = language;
    track.src = blobUrl;
    track.setAttribute(INJECTED_TRACK_ATTR, 'true');
    track.setAttribute('data-blob-url', blobUrl); // Store for cleanup

    // Add track to video
    video.appendChild(track);

    // Register track
    const trackInfo: InjectedTrackInfo = {
      element: track,
      label,
      language,
      kind,
      src: blobUrl,
      isActive: false,
      exclusive,
      injectedAt: Date.now(),
    };
    registerTrack(video, trackInfo);

    // Setup cleanup handler
    setupCleanup(video);

    // Activate if requested
    if (activate) {
      setTimeout(() => {
        activateTrack(video, track, exclusive);
        trackInfo.isActive = true;
      }, 0);
    }

    video.dispatchEvent(new CustomEvent(TRACK_INJECTED_EVENT, {
      detail: { track, label, language },
    }));

    log('info', `Track "${label}" injected via Blob URL successfully`);

    return {
      success: true,
      track,
      method: 'blob-url',
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    log('error', `Blob URL track injection failed: ${error}`);
    return {
      success: false,
      error,
      method: 'blob-url',
    };
  }
}

/**
 * Inject a track using TextTrack API (programmatic approach)
 *
 * This method creates a <track> element with a minimal empty VTT, then uses
 * the TextTrack API to add cues programmatically. This ensures proper tracking
 * and cleanup while allowing dynamic cue management.
 *
 * @param video - Target video element
 * @param cues - Array of cue data [startTime, endTime, text]
 * @param options - Injection options
 * @returns Injection result
 */
export function injectTrackCues(
  video: HTMLVideoElement,
  cues: Array<{ startTime: number; endTime: number; text: string }>,
  options: TrackInjectionOptions = {}
): TrackInjectionResult {
  const {
    label = DEFAULT_LABEL,
    language = DEFAULT_LANGUAGE,
    kind = 'subtitles',
    activate = true,
    exclusive = true,
  } = options;

  log('info', `Injecting track via TextTrack API: "${label}" (${language}), ${cues.length} cues`);

  if (!video || !(video instanceof HTMLVideoElement)) {
    log('error', 'Invalid video element');
    return {
      success: false,
      error: 'Invalid video element',
      method: 'text-track-api',
    };
  }

  // Check if we already injected a track with the same label
  const existingTracks = getInjectedTracks(video);
  const existingTrack = existingTracks.find((t) => t.label === label);
  if (existingTrack) {
    log('info', `Track "${label}" already exists, updating...`);
    removeTrack(video, existingTrack.element);
  }

  try {
    // Create a minimal empty VTT data URI for the track element
    const emptyVttDataUri = 'data:text/vtt;charset=utf-8,' + encodeURIComponent('WEBVTT\n\n');

    // Create track element
    const track = document.createElement('track');
    track.kind = kind;
    track.label = label;
    track.srclang = language;
    track.src = emptyVttDataUri;
    track.setAttribute(INJECTED_TRACK_ATTR, 'true');
    track.setAttribute('data-injection-method', 'text-track-api');

    // Register track info (before adding to DOM so it's tracked immediately)
    const trackInfo: InjectedTrackInfo = {
      element: track,
      label,
      language,
      kind,
      src: emptyVttDataUri,
      isActive: false,
      exclusive,
      injectedAt: Date.now(),
    };
    registerTrack(video, trackInfo);

    // Setup cleanup handler
    setupCleanup(video);

    // Add track to video
    video.appendChild(track);

    // Function to add cues and optionally activate
    const addCuesAndActivate = () => {
      const textTrack = track.track;
      if (!textTrack) {
        log('warn', `TextTrack not available for "${label}"`);
        return;
      }

      // Add cues to the TextTrack
      for (const cue of cues) {
        const vttCue = new VTTCue(cue.startTime, cue.endTime, cue.text);
        textTrack.addCue(vttCue);
      }

      log('debug', `Added ${cues.length} cues to track "${label}"`);

      // Activate if requested
      if (activate) {
        if (exclusive) {
          // Deactivate other tracks
          const allTracks = getInjectedTracks(video);
          for (let i = 0; i < video.textTracks.length; i++) {
            const tt = video.textTracks[i];
            if (tt !== textTrack && tt.mode === 'showing') {
              tt.mode = 'disabled';
              log('debug', `Deactivated track: "${tt.label}"`);
              // Clear isActive flag for any injected track we disabled
              const disabledTrackInfo = allTracks.find(
                (t) => t.element.track === tt || (t.label === tt.label && t.language === tt.language)
              );
              if (disabledTrackInfo) {
                disabledTrackInfo.isActive = false;
              }
            }
          }
        }
        textTrack.mode = 'showing';
        trackInfo.isActive = true;

        // Dispatch activation event
        video.dispatchEvent(new CustomEvent(TRACK_ACTIVATED_EVENT, {
          detail: { track, label },
        }));
      }
    };

    // Add load handler to add cues after track loads
    track.addEventListener('load', () => {
      log('debug', `Track "${label}" loaded, adding cues`);
      addCuesAndActivate();
    }, { once: true });

    track.addEventListener('error', (e) => {
      log('error', `Track "${label}" failed to load:`, e);
    }, { once: true });

    // Dispatch custom event for external listeners
    video.dispatchEvent(new CustomEvent(TRACK_INJECTED_EVENT, {
      detail: { track, label, language },
    }));

    log('info', `Track "${label}" injected via TextTrack API with ${cues.length} cues`);

    return {
      success: true,
      track,
      method: 'text-track-api',
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    log('error', `TextTrack API injection failed: ${error}`);
    return {
      success: false,
      error,
      method: 'text-track-api',
    };
  }
}

// ============================================
// Track Activation/Deactivation
// ============================================

/**
 * Activate a track element
 *
 * @param video - Video element
 * @param track - Track element to activate
 * @param exclusive - Whether to deactivate other tracks
 */
export function activateTrack(
  video: HTMLVideoElement,
  track: HTMLTrackElement,
  exclusive: boolean = true
): void {
  log('debug', `Activating track: "${track.label}"`);

  // Find the corresponding TextTrack
  const textTracks = video.textTracks;

  // Deactivate other tracks if exclusive
  if (exclusive) {
    const allTracks = getInjectedTracks(video);
    for (let i = 0; i < textTracks.length; i++) {
      const tt = textTracks[i];
      if (tt.label !== track.label && tt.mode === 'showing') {
        tt.mode = 'disabled';
        log('debug', `Deactivated track: "${tt.label}"`);
        // Clear isActive flag for any injected track we disabled
        const disabledTrackInfo = allTracks.find(
          (t) => t.element.track === tt || (t.label === tt.label && t.language === tt.language)
        );
        if (disabledTrackInfo) {
          disabledTrackInfo.isActive = false;
        }
      }
    }
  }

  // Find and activate our track
  for (let i = 0; i < textTracks.length; i++) {
    const tt = textTracks[i];
    if (tt.label === track.label && tt.language === track.srclang) {
      tt.mode = 'showing';
      log('info', `Track "${track.label}" activated`);

      // Update our tracking
      const tracks = getInjectedTracks(video);
      const trackInfo = tracks.find((t) => t.element === track);
      if (trackInfo) {
        trackInfo.isActive = true;
      }

      // Dispatch activation event
      video.dispatchEvent(new CustomEvent(TRACK_ACTIVATED_EVENT, {
        detail: { track, label: track.label },
      }));

      // Try to notify Video.js about track change
      notifyVideoJsTrackChange(video);

      break;
    }
  }
}

/**
 * Deactivate a track element
 *
 * @param video - Video element
 * @param track - Track element to deactivate
 */
export function deactivateTrack(
  video: HTMLVideoElement,
  track: HTMLTrackElement
): void {
  log('debug', `Deactivating track: "${track.label}"`);

  const textTracks = video.textTracks;

  for (let i = 0; i < textTracks.length; i++) {
    const tt = textTracks[i];
    if (tt.label === track.label && tt.language === track.srclang) {
      tt.mode = 'disabled';
      log('info', `Track "${track.label}" deactivated`);

      // Update our tracking
      const tracks = getInjectedTracks(video);
      const trackInfo = tracks.find((t) => t.element === track);
      if (trackInfo) {
        trackInfo.isActive = false;
      }

      break;
    }
  }
}

/**
 * Set track mode
 *
 * @param video - Video element
 * @param track - Track element
 * @param mode - Track mode
 */
export function setTrackMode(
  video: HTMLVideoElement,
  track: HTMLTrackElement,
  mode: TrackMode
): void {
  const textTracks = video.textTracks;

  for (let i = 0; i < textTracks.length; i++) {
    const tt = textTracks[i];
    if (tt.label === track.label && tt.language === track.srclang) {
      tt.mode = mode;
      log('debug', `Track "${track.label}" mode set to: ${mode}`);

      // Update our tracking
      const tracks = getInjectedTracks(video);
      const trackInfo = tracks.find((t) => t.element === track);
      if (trackInfo) {
        trackInfo.isActive = mode === 'showing';
      }

      break;
    }
  }
}

/**
 * Try to notify Video.js about track changes
 * This may help update the CC menu in Video.js-based players
 */
function notifyVideoJsTrackChange(video: HTMLVideoElement): void {
  try {
    // Dispatch texttrackchange event
    const event = new Event('change', { bubbles: true });
    video.textTracks.dispatchEvent(event);

    // Also dispatch on video element
    video.dispatchEvent(new Event('texttrackchange', { bubbles: true }));

    log('debug', 'Video.js track change notification dispatched');
  } catch (e) {
    log('debug', 'Failed to notify Video.js:', e);
  }
}

// ============================================
// Track Removal & Cleanup
// ============================================

/**
 * Remove a track element from video
 *
 * @param video - Video element
 * @param track - Track element to remove
 */
export function removeTrack(
  video: HTMLVideoElement,
  track: HTMLTrackElement
): void {
  log('info', `Removing track: "${track.label}"`);

  // Deactivate first
  deactivateTrack(video, track);

  // Revoke Blob URL if used
  const blobUrl = track.getAttribute('data-blob-url');
  if (blobUrl) {
    try {
      URL.revokeObjectURL(blobUrl);
      log('debug', 'Blob URL revoked');
    } catch (e) {
      log('debug', 'Failed to revoke Blob URL:', e);
    }
  }

  // Remove from DOM
  track.remove();

  // Unregister
  unregisterTrack(video, track);

  log('info', `Track "${track.label}" removed`);
}

/**
 * Remove all injected tracks from a video
 *
 * @param video - Video element
 */
export function removeAllTracks(video: HTMLVideoElement): void {
  log('info', 'Removing all injected tracks');

  // Make a copy of the array since removeTrack modifies it
  const tracks = [...getInjectedTracks(video)];
  const count = tracks.length;

  for (const trackInfo of tracks) {
    removeTrack(video, trackInfo.element);
  }

  log('info', `Removed ${count} tracks`);
}

/**
 * Setup cleanup handler for video element
 * Ensures tracks are cleaned up when video is removed from DOM
 */
function setupCleanup(video: HTMLVideoElement): void {
  if (cleanupHandlers.has(video)) {
    return; // Already set up
  }

  // Use MutationObserver to detect when video is removed from DOM
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) {
        if (node === video || (node instanceof Element && node.contains(video))) {
          log('debug', 'Video element removed from DOM, cleaning up tracks');
          removeAllTracks(video);
          observer.disconnect();
          cleanupHandlers.delete(video);
        }
      }
    }
  });

  // Observe parent element
  const parent = video.parentElement;
  if (parent) {
    observer.observe(parent, { childList: true, subtree: true });
  }

  const cleanup = () => {
    observer.disconnect();
    removeAllTracks(video);
  };

  cleanupHandlers.set(video, cleanup);
}

// ============================================
// Update Track Content
// ============================================

/**
 * Options for updating track content
 */
export interface TrackUpdateOptions {
  /** Override the exclusive activation behavior (defaults to original track's setting) */
  exclusive?: boolean;
}

/**
 * Update the content of an existing injected track
 *
 * @param video - Video element
 * @param trackOrLabel - Track element or label string
 * @param newContent - New VTT content
 * @param options - Update options (allows overriding exclusive behavior)
 * @returns Whether update was successful
 */
export function updateTrackContent(
  video: HTMLVideoElement,
  trackOrLabel: HTMLTrackElement | string,
  newContent: string | VTTFile,
  options: TrackUpdateOptions = {}
): boolean {
  const label = typeof trackOrLabel === 'string' ? trackOrLabel : trackOrLabel.label;

  log('info', `Updating track content: "${label}"`);

  const tracks = getInjectedTracks(video);
  const trackInfo = tracks.find((t) => t.label === label);

  if (!trackInfo) {
    log('warn', `Track "${label}" not found`);
    return false;
  }

  const wasActive = trackInfo.isActive;
  // Preserve original exclusive setting unless overridden
  const exclusive = options.exclusive ?? trackInfo.exclusive;

  // Remove old track and inject new one
  removeTrack(video, trackInfo.element);

  const result = injectTrack(video, newContent, {
    label,
    language: trackInfo.language,
    kind: trackInfo.kind,
    activate: wasActive,
    exclusive,
  });

  return result.success;
}

// ============================================
// Query Functions
// ============================================

/**
 * Check if a video has any injected tracks
 */
export function hasInjectedTracks(video: HTMLVideoElement): boolean {
  return getInjectedTracks(video).length > 0;
}

/**
 * Get the currently active injected track
 */
export function getActiveInjectedTrack(video: HTMLVideoElement): InjectedTrackInfo | null {
  const tracks = getInjectedTracks(video);
  return tracks.find((t) => t.isActive) || null;
}

/**
 * Find an injected track by label
 */
export function findTrackByLabel(
  video: HTMLVideoElement,
  label: string
): InjectedTrackInfo | null {
  const tracks = getInjectedTracks(video);
  return tracks.find((t) => t.label === label) || null;
}

// ============================================
// TrackInjector Class (OOP Interface)
// ============================================

/**
 * Object-oriented interface for track injection
 */
export class TrackInjector {
  private video: HTMLVideoElement;
  private defaultOptions: TrackInjectionOptions;

  constructor(video: HTMLVideoElement, options: TrackInjectionOptions = {}) {
    this.video = video;
    this.defaultOptions = {
      label: DEFAULT_LABEL,
      language: DEFAULT_LANGUAGE,
      kind: 'subtitles',
      activate: true,
      exclusive: true,
      ...options,
    };
  }

  /**
   * Inject a track
   */
  inject(vttContent: string | VTTFile, options?: TrackInjectionOptions): TrackInjectionResult {
    return injectTrack(this.video, vttContent, { ...this.defaultOptions, ...options });
  }

  /**
   * Inject using Blob URL
   */
  injectBlob(vttContent: string, options?: TrackInjectionOptions): TrackInjectionResult {
    return injectTrackBlob(this.video, vttContent, { ...this.defaultOptions, ...options });
  }

  /**
   * Inject using TextTrack API
   */
  injectCues(
    cues: Array<{ startTime: number; endTime: number; text: string }>,
    options?: TrackInjectionOptions
  ): TrackInjectionResult {
    return injectTrackCues(this.video, cues, { ...this.defaultOptions, ...options });
  }

  /**
   * Get all injected tracks
   */
  getTracks(): InjectedTrackInfo[] {
    return getInjectedTracks(this.video);
  }

  /**
   * Get active track
   */
  getActiveTrack(): InjectedTrackInfo | null {
    return getActiveInjectedTrack(this.video);
  }

  /**
   * Activate a track by label
   */
  activateByLabel(label: string, exclusive: boolean = true): boolean {
    const trackInfo = findTrackByLabel(this.video, label);
    if (!trackInfo) {
      return false;
    }
    activateTrack(this.video, trackInfo.element, exclusive);
    return true;
  }

  /**
   * Deactivate a track by label
   */
  deactivateByLabel(label: string): boolean {
    const trackInfo = findTrackByLabel(this.video, label);
    if (!trackInfo) {
      return false;
    }
    deactivateTrack(this.video, trackInfo.element);
    return true;
  }

  /**
   * Update track content
   */
  update(label: string, newContent: string | VTTFile, options?: TrackUpdateOptions): boolean {
    return updateTrackContent(this.video, label, newContent, options);
  }

  /**
   * Remove a track by label
   */
  remove(label: string): boolean {
    const trackInfo = findTrackByLabel(this.video, label);
    if (!trackInfo) {
      return false;
    }
    removeTrack(this.video, trackInfo.element);
    return true;
  }

  /**
   * Remove all injected tracks
   */
  removeAll(): void {
    removeAllTracks(this.video);
  }

  /**
   * Check if any tracks are injected
   */
  hasTracks(): boolean {
    return hasInjectedTracks(this.video);
  }

  /**
   * Get the video element
   */
  getVideo(): HTMLVideoElement {
    return this.video;
  }
}

// ============================================
// Exports
// ============================================

export default {
  // Core functions
  injectTrack,
  injectTrackBlob,
  injectTrackCues,
  activateTrack,
  deactivateTrack,
  setTrackMode,
  removeTrack,
  removeAllTracks,
  updateTrackContent,

  // Query functions
  getInjectedTracks,
  hasInjectedTracks,
  getActiveInjectedTrack,
  findTrackByLabel,

  // Utilities
  setLogLevel,

  // Class
  TrackInjector,

  // Constants
  DEFAULT_LABEL,
  DEFAULT_LANGUAGE,
  INJECTED_TRACK_ATTR,
  TRACK_INJECTED_EVENT,
  TRACK_ACTIVATED_EVENT,
};
