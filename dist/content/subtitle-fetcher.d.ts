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
import type { SubtitleTrack, SubtitleFetchResult, VTTContent, VideoDetectionResult, CourseInfo, AsyncResult } from '../types';
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
/**
 * Set the logging level
 */
export declare function setLogLevel(level: LogLevel): void;
/**
 * Extract course information from current Udemy URL
 */
export declare function extractCourseInfo(): CourseInfo | null;
/**
 * Detect video element on Udemy page
 * Waits up to VIDEO_DETECTION_TIMEOUT for video to appear
 */
export declare function detectVideo(): Promise<VideoDetectionResult>;
/**
 * Get subtitle tracks from video element
 */
export declare function getSubtitleTracks(video: HTMLVideoElement): Promise<SubtitleFetchResult>;
/**
 * Select the best subtitle track based on language priority
 */
export declare function selectPreferredTrack(tracks: SubtitleTrack[]): SubtitleTrack | null;
/**
 * Fetch VTT content from URL
 */
export declare function fetchVTT(url: string): Promise<AsyncResult<VTTContent>>;
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
export declare function fetchSubtitles(): Promise<{
    videoDetection: VideoDetectionResult;
    subtitleResult: SubtitleFetchResult;
    vttContent: VTTContent | null;
    selectedTrack: SubtitleTrack | null;
}>;
/**
 * Export SubtitleFetcher class for object-oriented usage
 */
export declare class SubtitleFetcher {
    private video;
    private courseInfo;
    private tracks;
    /**
     * Initialize the fetcher by detecting video and extracting info
     */
    initialize(): Promise<boolean>;
    /**
     * Get the detected video element
     */
    getVideo(): HTMLVideoElement | null;
    /**
     * Get extracted course information
     */
    getCourseInfo(): CourseInfo | null;
    /**
     * Get available subtitle tracks
     */
    getSubtitleTracks(): Promise<SubtitleTrack[]>;
    /**
     * Fetch VTT content from a track
     */
    fetchVTT(url: string): Promise<VTTContent | null>;
    /**
     * Select preferred track from available tracks
     */
    selectPreferredTrack(): SubtitleTrack | null;
}
declare const _default: {
    fetchSubtitles: typeof fetchSubtitles;
    detectVideo: typeof detectVideo;
    getSubtitleTracks: typeof getSubtitleTracks;
    fetchVTT: typeof fetchVTT;
    selectPreferredTrack: typeof selectPreferredTrack;
    extractCourseInfo: typeof extractCourseInfo;
    setLogLevel: typeof setLogLevel;
    SubtitleFetcher: typeof SubtitleFetcher;
};
export default _default;
//# sourceMappingURL=subtitle-fetcher.d.ts.map