/**
 * LLM Translator Module (Refactored)
 *
 * Translates WebVTT subtitles using LLM APIs (OpenAI / Gemini).
 * New approach: Direct VTT input → LLM → Complete VTT output
 *
 * Task ID: T-20251223-act-007-build-llm-translator (Refactored)
 *
 * Features:
 * - Direct VTT file translation (input entire VTT, output translated VTT)
 * - Duration-based batching (10 minutes per batch)
 * - Supports GPT-5.x and Gemini 2.5/3.x models
 * - Course context in prompts
 * - Token usage and cost tracking
 * - Timeout handling and retry mechanism
 */
import type { VTTFile, CourseInfo } from '../types';
/**
 * Translation request options
 */
export interface TranslationOptions {
    /** LLM provider */
    provider: 'openai' | 'gemini';
    /** API key */
    apiKey: string;
    /** Model name */
    model: string;
    /** Course context for better terminology */
    courseContext?: CourseContext;
    /** Request timeout in milliseconds (default: 120000 for longer VTT) */
    timeout?: number;
    /** Maximum retry attempts (default: 2) */
    maxRetries?: number;
    /** Temperature (default: 0.3) */
    temperature?: number;
    /** Abort signal for cancellation */
    signal?: AbortSignal;
    /** Max duration per batch in milliseconds (default: 600000 = 10 minutes) */
    maxBatchDurationMs?: number;
    /** Progress callback (0-100) */
    onProgress?: (progress: number) => void;
}
/**
 * Course context for translation
 */
export interface CourseContext {
    /** Course name */
    courseName?: string;
    /** Section/chapter name */
    sectionName?: string;
    /** Lecture name */
    lectureName?: string;
    /** Subject/topic hints */
    subject?: string;
}
/**
 * Translation result
 */
export interface TranslationResult {
    /** Whether translation succeeded */
    success: boolean;
    /** Translated VTT content as string */
    translatedVTT?: string;
    /** Translated VTT as parsed structure */
    translatedVTTFile?: VTTFile;
    /** Error message if failed */
    error?: string;
    /** Error code */
    errorCode?: string;
    /** Tokens used (prompt + completion) */
    tokensUsed?: number;
    /** Prompt tokens */
    promptTokens?: number;
    /** Completion tokens */
    completionTokens?: number;
    /** Estimated cost in USD */
    estimatedCost?: number;
    /** Model used */
    model?: string;
    /** Number of cues translated */
    cueCount?: number;
    /** Number of batches used */
    batchCount?: number;
    /** Translation duration in milliseconds */
    durationMs?: number;
}
/**
 * Validation result for translated VTT
 */
interface ValidationResult {
    valid: boolean;
    errors: string[];
}
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
/**
 * Set the logging level
 */
export declare function setLogLevel(level: LogLevel): void;
/**
 * Build the system prompt for VTT translation
 * Target: English to Chinese translation
 */
export declare function buildSystemPrompt(courseContext?: CourseContext): string;
/**
 * Build the user prompt with the VTT content
 */
export declare function buildUserPrompt(vttContent: string): string;
/**
 * Split a VTT file into batches based on duration
 *
 * @param vttFile - Parsed VTT file
 * @param maxDurationMs - Maximum duration per batch in milliseconds
 * @returns Array of VTT file batches
 */
export declare function splitVTTByDuration(vttFile: VTTFile, maxDurationMs: number): VTTFile[];
/**
 * Get the duration span of cues in a VTT file
 */
export declare function getVTTDurationSpan(vttFile: VTTFile): {
    startMs: number;
    endMs: number;
    durationMs: number;
};
/**
 * Parse the LLM response as a VTT file
 */
export declare function parseTranslatedVTTResponse(response: string): {
    success: boolean;
    vttFile?: VTTFile;
    error?: string;
};
/**
 * Validate that the translated VTT matches the original structure
 */
export declare function validateTranslatedVTT(original: VTTFile, translated: VTTFile): ValidationResult;
/**
 * Translate VTT content using LLM (new direct VTT approach)
 *
 * @param vttContent - Raw VTT content string
 * @param options - Translation options
 * @returns Translation result
 */
export declare function translateVTT(vttContent: string, options: TranslationOptions): Promise<TranslationResult>;
/**
 * Estimate token count for text
 */
export declare function estimateTokens(provider: 'openai' | 'gemini', text: string): number;
/**
 * Calculate cost based on model and token count
 */
export declare function calculateCost(model: string, tokenCount: number): number;
/**
 * Estimate translation cost before running
 */
export declare function estimateTranslationCost(vttContent: string, provider: 'openai' | 'gemini', model: string): {
    cueCount: number;
    estimatedPromptTokens: number;
    estimatedOutputTokens: number;
    estimatedTotalTokens: number;
    estimatedCost: number;
    estimatedBatches: number;
};
/**
 * Create a CourseContext from CourseInfo
 */
export declare function createCourseContext(courseInfo: CourseInfo): CourseContext;
/**
 * Translator class for object-oriented usage
 */
export declare class Translator {
    private options;
    constructor(options?: Partial<TranslationOptions>);
    /**
     * Configure the translator
     */
    configure(options: Partial<TranslationOptions>): void;
    /**
     * Translate VTT content
     */
    translate(vttContent: string, overrideOptions?: Partial<TranslationOptions>): Promise<TranslationResult>;
    /**
     * Estimate cost for translation
     */
    estimateCost(vttContent: string): ReturnType<typeof estimateTranslationCost>;
    /**
     * Set course context
     */
    setCourseContext(context: CourseContext): void;
}
export declare const translator: Translator;
declare const _default: {
    translateVTT: typeof translateVTT;
    estimateTranslationCost: typeof estimateTranslationCost;
    estimateTokens: typeof estimateTokens;
    calculateCost: typeof calculateCost;
    buildSystemPrompt: typeof buildSystemPrompt;
    buildUserPrompt: typeof buildUserPrompt;
    splitVTTByDuration: typeof splitVTTByDuration;
    parseTranslatedVTTResponse: typeof parseTranslatedVTTResponse;
    validateTranslatedVTT: typeof validateTranslatedVTT;
    createCourseContext: typeof createCourseContext;
    Translator: typeof Translator;
    translator: Translator;
    setLogLevel: typeof setLogLevel;
};
export default _default;
//# sourceMappingURL=translator.d.ts.map