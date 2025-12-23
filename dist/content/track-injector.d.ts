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
import type { VTTFile } from '../types';
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
/** Default track label */
export declare const DEFAULT_LABEL = "\u4E2D\u6587\uFF08\u4F18\u5316\uFF09";
/** Default language code */
export declare const DEFAULT_LANGUAGE = "zh-CN";
/** Custom attribute to identify our injected tracks */
export declare const INJECTED_TRACK_ATTR = "data-udemy-caption-plus";
/** Event dispatched when track is injected */
export declare const TRACK_INJECTED_EVENT = "udemycaptionplus:trackinjected";
/** Event dispatched when track is activated */
export declare const TRACK_ACTIVATED_EVENT = "udemycaptionplus:trackactivated";
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
/**
 * Set the logging level for the injector
 */
export declare function setLogLevel(level: LogLevel): void;
/**
 * Get all injected tracks for a video element
 */
export declare function getInjectedTracks(video: HTMLVideoElement): InjectedTrackInfo[];
/**
 * Inject a translated subtitle track into a video element
 *
 * @param video - Target video element
 * @param vttContent - VTT content (string or parsed VTTFile)
 * @param options - Injection options
 * @returns Injection result
 */
export declare function injectTrack(video: HTMLVideoElement, vttContent: string | VTTFile, options?: TrackInjectionOptions): TrackInjectionResult;
/**
 * Inject a track using Blob URL (alternative method)
 *
 * @param video - Target video element
 * @param vttContent - VTT content string
 * @param options - Injection options
 * @returns Injection result
 */
export declare function injectTrackBlob(video: HTMLVideoElement, vttContent: string, options?: TrackInjectionOptions): TrackInjectionResult;
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
export declare function injectTrackCues(video: HTMLVideoElement, cues: Array<{
    startTime: number;
    endTime: number;
    text: string;
}>, options?: TrackInjectionOptions): TrackInjectionResult;
/**
 * Activate a track element
 *
 * @param video - Video element
 * @param track - Track element to activate
 * @param exclusive - Whether to deactivate other tracks
 */
export declare function activateTrack(video: HTMLVideoElement, track: HTMLTrackElement, exclusive?: boolean): void;
/**
 * Deactivate a track element
 *
 * @param video - Video element
 * @param track - Track element to deactivate
 */
export declare function deactivateTrack(video: HTMLVideoElement, track: HTMLTrackElement): void;
/**
 * Set track mode
 *
 * @param video - Video element
 * @param track - Track element
 * @param mode - Track mode
 */
export declare function setTrackMode(video: HTMLVideoElement, track: HTMLTrackElement, mode: TrackMode): void;
/**
 * Remove a track element from video
 *
 * @param video - Video element
 * @param track - Track element to remove
 */
export declare function removeTrack(video: HTMLVideoElement, track: HTMLTrackElement): void;
/**
 * Remove all injected tracks from a video
 *
 * @param video - Video element
 */
export declare function removeAllTracks(video: HTMLVideoElement): void;
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
export declare function updateTrackContent(video: HTMLVideoElement, trackOrLabel: HTMLTrackElement | string, newContent: string | VTTFile, options?: TrackUpdateOptions): boolean;
/**
 * Check if a video has any injected tracks
 */
export declare function hasInjectedTracks(video: HTMLVideoElement): boolean;
/**
 * Get the currently active injected track
 */
export declare function getActiveInjectedTrack(video: HTMLVideoElement): InjectedTrackInfo | null;
/**
 * Find an injected track by label
 */
export declare function findTrackByLabel(video: HTMLVideoElement, label: string): InjectedTrackInfo | null;
/**
 * Object-oriented interface for track injection
 */
export declare class TrackInjector {
    private video;
    private defaultOptions;
    constructor(video: HTMLVideoElement, options?: TrackInjectionOptions);
    /**
     * Inject a track
     */
    inject(vttContent: string | VTTFile, options?: TrackInjectionOptions): TrackInjectionResult;
    /**
     * Inject using Blob URL
     */
    injectBlob(vttContent: string, options?: TrackInjectionOptions): TrackInjectionResult;
    /**
     * Inject using TextTrack API
     */
    injectCues(cues: Array<{
        startTime: number;
        endTime: number;
        text: string;
    }>, options?: TrackInjectionOptions): TrackInjectionResult;
    /**
     * Get all injected tracks
     */
    getTracks(): InjectedTrackInfo[];
    /**
     * Get active track
     */
    getActiveTrack(): InjectedTrackInfo | null;
    /**
     * Activate a track by label
     */
    activateByLabel(label: string, exclusive?: boolean): boolean;
    /**
     * Deactivate a track by label
     */
    deactivateByLabel(label: string): boolean;
    /**
     * Update track content
     */
    update(label: string, newContent: string | VTTFile, options?: TrackUpdateOptions): boolean;
    /**
     * Remove a track by label
     */
    remove(label: string): boolean;
    /**
     * Remove all injected tracks
     */
    removeAll(): void;
    /**
     * Check if any tracks are injected
     */
    hasTracks(): boolean;
    /**
     * Get the video element
     */
    getVideo(): HTMLVideoElement;
}
declare const _default: {
    injectTrack: typeof injectTrack;
    injectTrackBlob: typeof injectTrackBlob;
    injectTrackCues: typeof injectTrackCues;
    activateTrack: typeof activateTrack;
    deactivateTrack: typeof deactivateTrack;
    setTrackMode: typeof setTrackMode;
    removeTrack: typeof removeTrack;
    removeAllTracks: typeof removeAllTracks;
    updateTrackContent: typeof updateTrackContent;
    getInjectedTracks: typeof getInjectedTracks;
    hasInjectedTracks: typeof hasInjectedTracks;
    getActiveInjectedTrack: typeof getActiveInjectedTrack;
    findTrackByLabel: typeof findTrackByLabel;
    setLogLevel: typeof setLogLevel;
    TrackInjector: typeof TrackInjector;
    DEFAULT_LABEL: string;
    DEFAULT_LANGUAGE: string;
    INJECTED_TRACK_ATTR: string;
    TRACK_INJECTED_EVENT: string;
    TRACK_ACTIVATED_EVENT: string;
};
export default _default;
//# sourceMappingURL=track-injector.d.ts.map