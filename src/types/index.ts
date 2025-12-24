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
  method: 'track-element' | 'videojs-api' | 'udemy-api' | 'network-intercept' | 'none';
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
  /** Hash of original subtitle content (for cache validation) */
  originalHash?: string;
  /** Course ID */
  courseId: string;
  /** Lecture ID */
  lectureId: string;
  /** Course name for context */
  courseName?: string;
  /** Section name for context */
  sectionName?: string;
  /** Lecture name for context */
  lectureName?: string;
  /** Force retranslation even if cache matches */
  force?: boolean;
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
  /** Task identifier (for correlating progress/completion) */
  taskId?: string;
  /** Translated VTT content */
  translatedVTT?: string;
  /** Error message if failed */
  error?: string;
  /** LLM provider used (if available) */
  provider?: 'openai' | 'gemini';
  /** Model name used (if available) */
  model?: string;
  /** Tokens consumed */
  tokensUsed?: number;
  /** Estimated/actual cost in USD */
  estimatedCost?: number;
  /** Session total tokens (best-effort, if available) */
  sessionTotalTokens?: number;
  /** Session total cost in USD (best-effort, if available) */
  sessionTotalCostUsd?: number;
}

/**
 * Translation cost estimate emitted before running the translation
 */
export interface CostEstimateResult {
  taskId: string;
  provider: 'openai' | 'gemini';
  model: string;
  cueCount: number;
  estimatedPromptTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedCostUsd: number;
  estimatedBatches: number;
}

/**
 * Message types for content script to background communication
 */
export type MessageToBackground =
  | { type: 'TRANSLATE_SUBTITLE'; payload: TranslateRequest }
  | { type: 'CHECK_CACHE'; payload: { courseId: string; lectureId: string } }
  | {
      type: 'PRELOAD_NEXT';
      payload: {
        courseId: string;
        nextLectureId: string;
        nextLectureTitle?: string;
        courseName?: string;
        sectionName?: string;
      };
    }
  | { type: 'GET_SETTINGS' }
  | { type: 'CANCEL_TRANSLATION'; payload: { taskId: string } };

/**
 * Message types for background to content script communication
 */
export type MessageToContent =
  | { type: 'TRANSLATION_COMPLETE'; payload: TranslateResult }
  | { type: 'TRANSLATION_PROGRESS'; payload: { taskId: string; progress: number } }
  | { type: 'COST_ESTIMATE'; payload: CostEstimateResult }
  | { type: 'CACHE_HIT'; payload: { translatedVTT: string; taskId?: string } }
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
// WebVTT Types
// ============================================

/**
 * Represents a parsed WebVTT timestamp
 * Format: HH:MM:SS.mmm or MM:SS.mmm
 */
export interface VTTTimestamp {
  /** Hours (0-99) */
  hours: number;
  /** Minutes (0-59) */
  minutes: number;
  /** Seconds (0-59) */
  seconds: number;
  /** Milliseconds (0-999) */
  milliseconds: number;
}

/**
 * Represents a single WebVTT cue (subtitle entry)
 */
export interface VTTCue {
  /** Optional cue identifier */
  id?: string;
  /** Start timestamp */
  startTime: VTTTimestamp;
  /** End timestamp */
  endTime: VTTTimestamp;
  /** Text content (may contain VTT formatting tags) */
  text: string;
  /** Optional cue settings (position, alignment, etc.) */
  settings?: string;
}

/**
 * Represents a parsed WebVTT file
 */
export interface VTTFile {
  /** Optional header text (after WEBVTT marker) */
  header?: string;
  /** Optional style blocks */
  styles?: string[];
  /** Optional region definitions */
  regions?: VTTRegion[];
  /** Array of subtitle cues */
  cues: VTTCue[];
  /** Optional notes (comments) */
  notes?: string[];
}

/**
 * Represents a WebVTT region definition
 */
export interface VTTRegion {
  /** Region identifier */
  id: string;
  /** Region settings */
  settings: string;
}

/**
 * Result of WebVTT parsing operation
 */
export interface VTTParseResult {
  /** Whether parsing succeeded */
  success: boolean;
  /** Parsed VTT file structure */
  data?: VTTFile;
  /** Error message if parsing failed */
  error?: string;
  /** Warnings encountered during parsing */
  warnings?: string[];
}

/**
 * Options for WebVTT generation
 */
export interface VTTGeneratorOptions {
  /** Include cue IDs in output (default: true if present) */
  includeCueIds?: boolean;
  /** Include style blocks in output (default: true) */
  includeStyles?: boolean;
  /** Include region definitions in output (default: true) */
  includeRegions?: boolean;
  /** Include notes/comments in output (default: false) */
  includeNotes?: boolean;
  /** Use short timestamp format (MM:SS.mmm) when hours is 0 (default: false) */
  useShortTimestamp?: boolean;
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
