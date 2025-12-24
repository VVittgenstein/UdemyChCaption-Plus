/**
 * Next Lecture Detector
 *
 * Task ID: T-20251223-act-011-build-preload
 *
 * Uses Udemy Curriculum API (preferred) to resolve the "next lecture" ID for the
 * current lecture page. Includes a best-effort UD global fallback.
 */
export interface NextLectureDetectionParams {
    /** Course id used for cache key; may be numeric id or course slug */
    courseId: string;
    /** Course slug from URL */
    courseSlug: string;
    /** Current lecture id from URL */
    currentLectureId: string;
    /** Optional AbortSignal */
    signal?: AbortSignal;
}
export interface NextLectureDetectionResult {
    /** Next lecture id if present */
    nextLectureId: string | null;
    /** Next lecture title if available */
    nextLectureTitle?: string;
    /** Whether current lecture is the last lecture in the course */
    isLastLecture: boolean;
    /** Detection method used */
    method: 'curriculum-api' | 'ud-fallback' | 'none';
    /** Error message (best-effort) */
    error?: string;
}
/**
 * Detect the next lecture ID for the current lecture.
 */
export declare function detectNextLecture(params: NextLectureDetectionParams): Promise<NextLectureDetectionResult>;
//# sourceMappingURL=next-lecture-detector.d.ts.map