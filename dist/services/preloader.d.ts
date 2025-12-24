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
/**
 * Preload + translate a lecture's subtitle into cache.
 */
export declare function preloadLecture(request: PreloadRequest): Promise<PreloadResult>;
//# sourceMappingURL=preloader.d.ts.map