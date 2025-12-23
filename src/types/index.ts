/**
 * UdemyChCaption-Plus Type Definitions
 *
 * Task ID: T-20251223-act-005-build-subtitle-fetch
 */

// ============================================
// Subtitle Types
// ============================================

/**
 * Represents a subtitle track from Udemy video player
 */
export interface SubtitleTrack {
  /** URL to the WebVTT file */
  url: string;
  /** Language code (e.g., 'en', 'zh-CN') */
  language: string;
  /** Display label (e.g., 'English', 'English [Auto]') */
  label: string;
  /** Whether this is the default track */
  isDefault: boolean;
  /** Track kind: 'subtitles' or 'captions' */
  kind: 'subtitles' | 'captions';
}

/**
 * Result of subtitle fetch operation
 */
export interface SubtitleFetchResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Available subtitle tracks */
  tracks: SubtitleTrack[];
  /** Error message if failed */
  error?: string;
  /** Fetch method used */
  method: 'track-element' | 'videojs-api' | 'network-intercept' | 'none';
}

/**
 * VTT content with metadata
 */
export interface VTTContent {
  /** Raw VTT text content */
  content: string;
  /** Source URL */
  url: string;
  /** Language code */
  language: string;
  /** Content hash for cache validation */
  hash: string;
}

// ============================================
// Video Detection Types
// ============================================

/**
 * Video element detection result
 */
export interface VideoDetectionResult {
  /** Whether video was found */
  found: boolean;
  /** The video element if found */
  video: HTMLVideoElement | null;
  /** Udemy course info extracted from page */
  courseInfo: CourseInfo | null;
  /** Detection timestamp */
  timestamp: number;
}

/**
 * Course information extracted from Udemy page
 */
export interface CourseInfo {
  /** Course ID (numeric) */
  courseId: string;
  /** Course slug from URL */
  courseSlug: string;
  /** Current lecture ID */
  lectureId: string;
  /** Course title (if available) */
  courseTitle?: string;
  /** Current section/chapter name (if available) */
  sectionTitle?: string;
  /** Current lecture title (if available) */
  lectureTitle?: string;
}

// ============================================
// Message Types (Content Script <-> Service Worker)
// ============================================

/**
 * Translation request sent to Service Worker
 */
export interface TranslateRequest {
  /** Unique task identifier */
  taskId: string;
  /** VTT content to translate */
  vttContent: string;
  /** Course ID */
  courseId: string;
  /** Lecture ID */
  lectureId: string;
  /** Course name for context */
  courseName?: string;
  /** Section name for context */
  sectionName?: string;
  /** LLM provider */
  provider: 'openai' | 'gemini';
  /** Model name */
  model: string;
}

/**
 * Translation result from Service Worker
 */
export interface TranslateResult {
  /** Whether translation succeeded */
  success: boolean;
  /** Translated VTT content */
  translatedVTT?: string;
  /** Error message if failed */
  error?: string;
  /** Tokens consumed */
  tokensUsed?: number;
  /** Estimated cost in USD */
  estimatedCost?: number;
}

/**
 * Message types for content script to background communication
 */
export type MessageToBackground =
  | { type: 'TRANSLATE_SUBTITLE'; payload: TranslateRequest }
  | { type: 'CHECK_CACHE'; payload: { courseId: string; lectureId: string } }
  | { type: 'PRELOAD_NEXT'; payload: { courseId: string; nextLectureId: string } }
  | { type: 'GET_SETTINGS' }
  | { type: 'CANCEL_TRANSLATION'; payload: { taskId: string } };

/**
 * Message types for background to content script communication
 */
export type MessageToContent =
  | { type: 'TRANSLATION_COMPLETE'; payload: TranslateResult }
  | { type: 'TRANSLATION_PROGRESS'; payload: { taskId: string; progress: number } }
  | { type: 'CACHE_HIT'; payload: { translatedVTT: string } }
  | { type: 'CACHE_MISS' }
  | { type: 'SETTINGS'; payload: UserSettings };

// ============================================
// Settings Types
// ============================================

/**
 * User settings stored in chrome.storage.sync
 */
export interface UserSettings {
  /** LLM provider */
  provider: 'openai' | 'gemini';
  /** API key (encrypted) */
  apiKey: string;
  /** Model name */
  model: string;
  /** Main toggle for subtitle replacement */
  enabled: boolean;
  /** Auto-translate on page load */
  autoTranslate: boolean;
  /** Preload next lecture */
  preloadEnabled: boolean;
  /** Show cost estimate */
  showCostEstimate: boolean;
  /** Show loading indicator */
  showLoadingIndicator: boolean;
}

// ============================================
// Cache Types
// ============================================

/**
 * Subtitle cache entry stored in IndexedDB
 */
export interface SubtitleCacheEntry {
  /** Primary key: `${courseId}-${lectureId}` */
  id: string;
  /** Course ID */
  courseId: string;
  /** Lecture ID */
  lectureId: string;
  /** Course name */
  courseName: string;
  /** Lecture name */
  lectureName: string;
  /** Hash of original subtitle content */
  originalHash: string;
  /** Translated VTT content */
  translatedVTT: string;
  /** LLM provider used */
  provider: string;
  /** Model name used */
  model: string;
  /** Tokens consumed */
  tokensUsed: number;
  /** Estimated cost in USD */
  estimatedCost: number;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
}

// ============================================
// Utility Types
// ============================================

/**
 * Logger level
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Generic async operation result
 */
export interface AsyncResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
