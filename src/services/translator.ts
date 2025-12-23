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

import type { VTTFile, VTTCue, CourseInfo } from '../types';
import { parseVTT, timestampToMs } from '../utils/webvtt-parser';
import { generateVTT, mergeVTTFiles } from '../utils/webvtt-generator';
import { chatCompletion, estimateTokens as openaiEstimateTokens } from './openai-client';
import { generateContent, convertFromOpenAIFormat, estimateTokens as geminiEstimateTokens } from './gemini-client';

// ============================================
// Types
// ============================================

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

// ============================================
// Constants
// ============================================

const LOG_PREFIX = '[Translator]';
const DEFAULT_TIMEOUT = 120000; // 120 seconds for longer content
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_BATCH_DURATION_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Model pricing (per 1K tokens, input+output average)
 */
const MODEL_PRICING: Record<string, number> = {
  // OpenAI GPT-5 series
  'gpt-5.2': 0.01,
  'gpt-5.1': 0.008,
  'gpt-5-pro': 0.015,
  'gpt-5': 0.006,
  // Gemini 3.x / 2.5 series
  'gemini-3-pro-preview': 0.005,
  'gemini-3-flash-preview': 0.001,
  'gemini-2.5-pro': 0.003,
  'gemini-2.5-flash': 0.0005,
};

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
 * Set the logging level
 */
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

// ============================================
// Prompt Building
// ============================================

/**
 * Build the system prompt for VTT translation
 * Target: English to Chinese translation
 */
export function buildSystemPrompt(courseContext?: CourseContext): string {
  let prompt = `You are an expert subtitle translator. You will receive a WebVTT subtitle file.
Translate all subtitle text from English to Chinese (简体中文).

CRITICAL RULES - YOU MUST FOLLOW THESE EXACTLY:
1. Output a COMPLETE, VALID WebVTT file
2. Start your output with "WEBVTT" header
3. Keep ALL timestamps EXACTLY as they are - do not modify any timestamp
4. Translate ONLY the text content between timestamps
5. Preserve cue IDs if present (the line before timestamps)
6. Preserve all cue settings (text after the --> timestamp)
7. Do NOT add any explanations, notes, or markdown formatting
8. Do NOT wrap the output in code blocks
9. Keep the same number of cues as the input

For technical terms commonly kept in English (API, HTTP, JavaScript, React, etc.), keep them as-is.
Use natural, fluent Chinese expressions - avoid word-for-word translation.`;

  // Add course context if available
  if (courseContext) {
    const contextParts: string[] = [];

    if (courseContext.courseName) {
      contextParts.push(`Course: "${courseContext.courseName}"`);
    }
    if (courseContext.sectionName) {
      contextParts.push(`Section: "${courseContext.sectionName}"`);
    }
    if (courseContext.lectureName) {
      contextParts.push(`Lecture: "${courseContext.lectureName}"`);
    }
    if (courseContext.subject) {
      contextParts.push(`Subject: ${courseContext.subject}`);
    }

    if (contextParts.length > 0) {
      prompt += `\n\nCONTEXT (use this to improve terminology translation):
${contextParts.join('\n')}`;
    }
  }

  return prompt;
}

/**
 * Build the user prompt with the VTT content
 */
export function buildUserPrompt(vttContent: string): string {
  return `Translate this WebVTT file to Chinese (简体中文). Output ONLY the translated WebVTT file, nothing else:

${vttContent}`;
}

// ============================================
// VTT Duration-Based Splitting
// ============================================

/**
 * Split a VTT file into batches based on duration
 *
 * @param vttFile - Parsed VTT file
 * @param maxDurationMs - Maximum duration per batch in milliseconds
 * @returns Array of VTT file batches
 */
export function splitVTTByDuration(vttFile: VTTFile, maxDurationMs: number): VTTFile[] {
  if (vttFile.cues.length === 0) {
    return [vttFile];
  }

  const batches: VTTFile[] = [];
  let currentBatchCues: VTTCue[] = [];
  let batchStartTime = timestampToMs(vttFile.cues[0].startTime);

  for (const cue of vttFile.cues) {
    const cueEndMs = timestampToMs(cue.endTime);

    // If adding this cue would exceed max duration, start a new batch
    if (currentBatchCues.length > 0 && (cueEndMs - batchStartTime) > maxDurationMs) {
      // Save current batch
      batches.push({
        header: vttFile.header,
        cues: currentBatchCues,
        // Don't include styles/regions/notes in intermediate batches
      });

      // Start new batch
      currentBatchCues = [];
      batchStartTime = timestampToMs(cue.startTime);
    }

    currentBatchCues.push(cue);
  }

  // Add the last batch
  if (currentBatchCues.length > 0) {
    batches.push({
      header: vttFile.header,
      cues: currentBatchCues,
      styles: vttFile.styles,
      regions: vttFile.regions,
      notes: vttFile.notes,
    });
  }

  return batches;
}

/**
 * Get the duration span of cues in a VTT file
 */
export function getVTTDurationSpan(vttFile: VTTFile): { startMs: number; endMs: number; durationMs: number } {
  if (vttFile.cues.length === 0) {
    return { startMs: 0, endMs: 0, durationMs: 0 };
  }

  const startMs = timestampToMs(vttFile.cues[0].startTime);
  const endMs = timestampToMs(vttFile.cues[vttFile.cues.length - 1].endTime);

  return {
    startMs,
    endMs,
    durationMs: endMs - startMs,
  };
}

// ============================================
// VTT Response Parsing and Validation
// ============================================

/**
 * Parse the LLM response as a VTT file
 */
export function parseTranslatedVTTResponse(response: string): {
  success: boolean;
  vttFile?: VTTFile;
  error?: string;
} {
  // Clean up the response
  let cleanedResponse = response.trim();

  // Remove markdown code blocks if present
  if (cleanedResponse.startsWith('```')) {
    cleanedResponse = cleanedResponse
      .replace(/^```(?:vtt|webvtt)?\s*\n?/i, '')
      .replace(/\n?```\s*$/, '');
  }

  // Ensure WEBVTT header
  if (!cleanedResponse.startsWith('WEBVTT')) {
    // Try to find WEBVTT in the response
    const webvttIndex = cleanedResponse.indexOf('WEBVTT');
    if (webvttIndex !== -1) {
      cleanedResponse = cleanedResponse.substring(webvttIndex);
    } else {
      return {
        success: false,
        error: 'Response does not contain valid WEBVTT header',
      };
    }
  }

  // Parse the VTT content
  const parseResult = parseVTT(cleanedResponse);

  if (!parseResult.success || !parseResult.data) {
    return {
      success: false,
      error: parseResult.error || 'Failed to parse VTT response',
    };
  }

  return {
    success: true,
    vttFile: parseResult.data,
  };
}

/**
 * Validate that the translated VTT matches the original structure
 */
export function validateTranslatedVTT(original: VTTFile, translated: VTTFile): ValidationResult {
  const errors: string[] = [];

  // 1. Check cue count
  if (original.cues.length !== translated.cues.length) {
    errors.push(`Cue count mismatch: expected ${original.cues.length}, got ${translated.cues.length}`);
  }

  // 2. Check timestamps match
  const checkCount = Math.min(original.cues.length, translated.cues.length);
  for (let i = 0; i < checkCount; i++) {
    const origCue = original.cues[i];
    const transCue = translated.cues[i];

    const origStartMs = timestampToMs(origCue.startTime);
    const origEndMs = timestampToMs(origCue.endTime);
    const transStartMs = timestampToMs(transCue.startTime);
    const transEndMs = timestampToMs(transCue.endTime);

    if (origStartMs !== transStartMs || origEndMs !== transEndMs) {
      errors.push(`Timestamp mismatch at cue ${i + 1}: expected ${origStartMs}-${origEndMs}, got ${transStartMs}-${transEndMs}`);
      // Only report first few timestamp errors
      if (errors.length >= 5) {
        errors.push('(more timestamp errors omitted)');
        break;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================
// Main Translation Functions
// ============================================

/**
 * Translate VTT content using LLM (new direct VTT approach)
 *
 * @param vttContent - Raw VTT content string
 * @param options - Translation options
 * @returns Translation result
 */
export async function translateVTT(
  vttContent: string,
  options: TranslationOptions
): Promise<TranslationResult> {
  const startTime = Date.now();

  const {
    provider,
    apiKey,
    model,
    courseContext,
    timeout = DEFAULT_TIMEOUT,
    maxRetries = DEFAULT_MAX_RETRIES,
    temperature = DEFAULT_TEMPERATURE,
    maxBatchDurationMs = DEFAULT_MAX_BATCH_DURATION_MS,
    signal,
    onProgress,
  } = options;

  const reportProgress = (progress: number): void => {
    if (!onProgress) return;
    try {
      onProgress(progress);
    } catch (e) {
      log('warn', 'onProgress callback error:', e);
    }
  };

  // Parse VTT content
  const parseResult = parseVTT(vttContent);
  if (!parseResult.success || !parseResult.data) {
    return {
      success: false,
      error: parseResult.error || 'Failed to parse VTT content',
      errorCode: 'PARSE_ERROR',
    };
  }

  const vttFile = parseResult.data;
  const cueCount = vttFile.cues.length;

  if (cueCount === 0) {
    return {
      success: false,
      error: 'No subtitle cues found in VTT content',
      errorCode: 'EMPTY_CONTENT',
    };
  }

  // Split into batches by duration
  const batches = splitVTTByDuration(vttFile, maxBatchDurationMs);
  const batchCount = batches.length;

  log('info', `Translating ${cueCount} cues in ${batchCount} batch(es) using ${provider}/${model}`);
  reportProgress(0);

  // Translate each batch
  const translatedBatches: VTTFile[] = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  const systemPrompt = buildSystemPrompt(courseContext);

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    // Check for cancellation
    if (signal?.aborted) {
      return {
        success: false,
        error: 'Translation cancelled',
        errorCode: 'CANCELLED',
      };
    }

    const batch = batches[batchIndex];
    const batchVttContent = generateVTT(batch);
    const duration = getVTTDurationSpan(batch);

    log('info', `Processing batch ${batchIndex + 1}/${batchCount} (${batch.cues.length} cues, ${Math.round(duration.durationMs / 1000)}s)`);

    // Translate batch with retry
    const result = await translateBatchWithRetry(
      batch,
      batchVttContent,
      systemPrompt,
      provider,
      apiKey,
      model,
      temperature,
      timeout,
      maxRetries,
      signal
    );

    if (!result.success || !result.vttFile) {
      return {
        success: false,
        error: result.error || `Batch ${batchIndex + 1} translation failed`,
        errorCode: result.errorCode || 'BATCH_FAILED',
        durationMs: Date.now() - startTime,
      };
    }

    translatedBatches.push(result.vttFile);
    totalPromptTokens += result.promptTokens || 0;
    totalCompletionTokens += result.completionTokens || 0;

    const progress = Math.round(((batchIndex + 1) / batchCount) * 100);
    reportProgress(progress);
  }

  // Merge all translated batches
  const mergedVTT = mergeVTTFiles(translatedBatches);
  const translatedVTTContent = generateVTT(mergedVTT);

  // Calculate cost
  const tokensUsed = totalPromptTokens + totalCompletionTokens;
  const cost = calculateCost(model, tokensUsed);
  const durationMs = Date.now() - startTime;

  log('info', `Translation complete in ${durationMs}ms, ${tokensUsed} tokens, $${cost.toFixed(6)}`);
  reportProgress(100);

  return {
    success: true,
    translatedVTT: translatedVTTContent,
    translatedVTTFile: mergedVTT,
    tokensUsed,
    promptTokens: totalPromptTokens,
    completionTokens: totalCompletionTokens,
    estimatedCost: cost,
    model,
    cueCount,
    batchCount,
    durationMs,
  };
}

/**
 * Translate a single batch with retry logic
 */
async function translateBatchWithRetry(
  originalBatch: VTTFile,
  batchVttContent: string,
  systemPrompt: string,
  provider: 'openai' | 'gemini',
  apiKey: string,
  model: string,
  temperature: number,
  timeout: number,
  maxRetries: number,
  signal?: AbortSignal
): Promise<{
  success: boolean;
  vttFile?: VTTFile;
  error?: string;
  errorCode?: string;
  promptTokens?: number;
  completionTokens?: number;
}> {
  const userPrompt = buildUserPrompt(batchVttContent);

  let lastError: string | undefined;
  let lastErrorCode: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      log('info', `Retry attempt ${attempt}/${maxRetries}`);
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
    }

    // Check for cancellation
    if (signal?.aborted) {
      return { success: false, error: 'Translation cancelled', errorCode: 'CANCELLED' };
    }

    // Call LLM
    const response = await callLLM(
      provider,
      apiKey,
      model,
      systemPrompt,
      userPrompt,
      temperature,
      timeout,
      signal
    );

    if (!response.success || !response.content) {
      lastError = response.error;
      lastErrorCode = response.errorCode;

      // Don't retry on auth errors
      if (response.errorCode === 'INVALID_API_KEY' || response.errorCode === 'MISSING_API_KEY') {
        break;
      }
      continue;
    }

    // Parse the response as VTT
    const parseResult = parseTranslatedVTTResponse(response.content);

    if (!parseResult.success || !parseResult.vttFile) {
      lastError = parseResult.error || 'Failed to parse LLM response as VTT';
      lastErrorCode = 'PARSE_RESPONSE_ERROR';
      log('warn', `Parse error: ${lastError}`);
      continue;
    }

    // Validate the translated VTT
    const validation = validateTranslatedVTT(originalBatch, parseResult.vttFile);

    if (!validation.valid) {
      lastError = `Validation failed: ${validation.errors.join('; ')}`;
      lastErrorCode = 'VALIDATION_ERROR';
      log('warn', `Validation error: ${lastError}`);

      // If cue count matches but timestamps differ, we might be able to fix it
      // For now, just retry
      continue;
    }

    // Success!
    return {
      success: true,
      vttFile: parseResult.vttFile,
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
    };
  }

  return {
    success: false,
    error: lastError || 'Translation failed after retries',
    errorCode: lastErrorCode || 'TRANSLATION_FAILED',
  };
}

/**
 * Call LLM API (OpenAI or Gemini)
 */
async function callLLM(
  provider: 'openai' | 'gemini',
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  timeout: number,
  signal?: AbortSignal
): Promise<{
  success: boolean;
  content?: string;
  error?: string;
  errorCode?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  model?: string;
}> {
  if (provider === 'openai') {
    return chatCompletion({
      apiKey,
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      timeout,
      signal,
    });
  } else {
    // Gemini
    const { systemInstruction, contents } = convertFromOpenAIFormat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    return generateContent({
      apiKey,
      model,
      systemInstruction,
      contents,
      temperature,
      timeout,
      signal,
    });
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Estimate token count for text
 */
export function estimateTokens(provider: 'openai' | 'gemini', text: string): number {
  if (provider === 'openai') {
    return openaiEstimateTokens(text);
  } else {
    return geminiEstimateTokens(text);
  }
}

/**
 * Calculate cost based on model and token count
 */
export function calculateCost(model: string, tokenCount: number): number {
  const pricePerK = MODEL_PRICING[model] || 0.005; // Default to $0.005/1K if unknown
  return (tokenCount / 1000) * pricePerK;
}

/**
 * Estimate translation cost before running
 */
export function estimateTranslationCost(
  vttContent: string,
  provider: 'openai' | 'gemini',
  model: string
): {
  cueCount: number;
  estimatedPromptTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedCost: number;
  estimatedBatches: number;
} {
  const parseResult = parseVTT(vttContent);
  if (!parseResult.success || !parseResult.data) {
    return {
      cueCount: 0,
      estimatedPromptTokens: 0,
      estimatedOutputTokens: 0,
      estimatedTotalTokens: 0,
      estimatedCost: 0,
      estimatedBatches: 0,
    };
  }

  const cueCount = parseResult.data.cues.length;
  const batches = splitVTTByDuration(parseResult.data, DEFAULT_MAX_BATCH_DURATION_MS);

  // Estimate tokens per batch
  const systemPrompt = buildSystemPrompt();
  let totalPromptTokens = 0;

  for (const batch of batches) {
    const batchVtt = generateVTT(batch);
    const userPrompt = buildUserPrompt(batchVtt);
    totalPromptTokens += estimateTokens(provider, systemPrompt + userPrompt);
  }

  // Output is roughly similar size to input for VTT translation
  const estimatedOutputTokens = Math.ceil(totalPromptTokens * 1.2);
  const estimatedTotalTokens = totalPromptTokens + estimatedOutputTokens;
  const estimatedCost = calculateCost(model, estimatedTotalTokens);

  return {
    cueCount,
    estimatedPromptTokens: totalPromptTokens,
    estimatedOutputTokens,
    estimatedTotalTokens,
    estimatedCost,
    estimatedBatches: batches.length,
  };
}

/**
 * Create a CourseContext from CourseInfo
 */
export function createCourseContext(courseInfo: CourseInfo): CourseContext {
  return {
    courseName: courseInfo.courseTitle,
    sectionName: courseInfo.sectionTitle,
    lectureName: courseInfo.lectureTitle,
  };
}

// ============================================
// Translator Class (OOP Interface)
// ============================================

/**
 * Translator class for object-oriented usage
 */
export class Translator {
  private options: Partial<TranslationOptions>;

  constructor(options: Partial<TranslationOptions> = {}) {
    this.options = options;
  }

  /**
   * Configure the translator
   */
  configure(options: Partial<TranslationOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Translate VTT content
   */
  async translate(
    vttContent: string,
    overrideOptions?: Partial<TranslationOptions>
  ): Promise<TranslationResult> {
    const mergedOptions = { ...this.options, ...overrideOptions } as TranslationOptions;

    if (!mergedOptions.provider) {
      return { success: false, error: 'Provider is required', errorCode: 'MISSING_PROVIDER' };
    }
    if (!mergedOptions.apiKey) {
      return { success: false, error: 'API key is required', errorCode: 'MISSING_API_KEY' };
    }
    if (!mergedOptions.model) {
      return { success: false, error: 'Model is required', errorCode: 'MISSING_MODEL' };
    }

    return translateVTT(vttContent, mergedOptions);
  }

  /**
   * Estimate cost for translation
   */
  estimateCost(vttContent: string): ReturnType<typeof estimateTranslationCost> {
    const provider = this.options.provider || 'openai';
    const model = this.options.model || 'gpt-5.1';
    return estimateTranslationCost(vttContent, provider, model);
  }

  /**
   * Set course context
   */
  setCourseContext(context: CourseContext): void {
    this.options.courseContext = context;
  }
}

// ============================================
// Export singleton and default
// ============================================

export const translator = new Translator();

export default {
  translateVTT,
  estimateTranslationCost,
  estimateTokens,
  calculateCost,
  buildSystemPrompt,
  buildUserPrompt,
  splitVTTByDuration,
  parseTranslatedVTTResponse,
  validateTranslatedVTT,
  createCourseContext,
  Translator,
  translator,
  setLogLevel,
};
