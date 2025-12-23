/**
 * Google Gemini API Client Module
 *
 * Provides a client for calling Google Gemini API with streaming support.
 * Designed to work in Chrome Extension Service Worker environment with keepalive mechanism.
 *
 * Task ID: T-20251223-act-007-build-llm-translator
 *
 * Features:
 * - Streaming API support (avoids 30s fetch timeout)
 * - Service Worker keepalive mechanism
 * - Timeout handling (configurable, default 60s)
 * - Error handling and retry support
 *
 * @see https://ai.google.dev/gemini-api/docs/text-generation
 */

// ============================================
// Types
// ============================================

/**
 * Gemini content part
 */
export interface GeminiPart {
  text: string;
}

/**
 * Gemini content (message)
 */
export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

/**
 * Gemini API request options
 */
export interface GeminiRequestOptions {
  /** API Key */
  apiKey: string;
  /** Model to use */
  model: string;
  /** System instruction */
  systemInstruction?: string;
  /** Conversation contents */
  contents: GeminiContent[];
  /** Temperature (0-2, default 0.3 for translation) */
  temperature?: number;
  /** Maximum tokens in response */
  maxOutputTokens?: number;
  /** Request timeout in milliseconds (default 60000) */
  timeout?: number;
  /** Enable streaming (default true) */
  stream?: boolean;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Gemini API response
 */
export interface GeminiResponse {
  /** Whether the request succeeded */
  success: boolean;
  /** Response content */
  content?: string;
  /** Error message if failed */
  error?: string;
  /** Error code */
  errorCode?: string;
  /** Prompt tokens used */
  promptTokens?: number;
  /** Completion tokens used */
  completionTokens?: number;
  /** Total tokens used */
  totalTokens?: number;
  /** Model used */
  model?: string;
  /** Finish reason */
  finishReason?: string;
}

/**
 * Gemini streaming chunk
 */
interface GeminiStreamChunk {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
      role?: string;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

// ============================================
// Constants
// ============================================

const LOG_PREFIX = '[Gemini Client]';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_TIMEOUT = 60000; // 60 seconds
const KEEPALIVE_INTERVAL = 25000; // 25 seconds (under 30s SW idle timeout)

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
// Service Worker Keepalive
// ============================================

let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the keepalive timer to prevent Service Worker from sleeping
 * Uses chrome.runtime.getPlatformInfo as a lightweight API call
 */
function startKeepalive(): void {
  if (keepaliveTimer) return;

  keepaliveTimer = setInterval(() => {
    // Use chrome API if available (Chrome Extension environment)
    if (typeof chrome !== 'undefined' && chrome.runtime?.getPlatformInfo) {
      chrome.runtime.getPlatformInfo(() => {
        log('debug', 'Keepalive ping');
      });
    }
  }, KEEPALIVE_INTERVAL);

  log('debug', 'Keepalive timer started');
}

/**
 * Stop the keepalive timer
 */
function stopKeepalive(): void {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
    log('debug', 'Keepalive timer stopped');
  }
}

// ============================================
// Main API Functions
// ============================================

/**
 * Call Gemini generateContent API with streaming
 *
 * @param options - Request options
 * @returns API response
 */
export async function generateContent(options: GeminiRequestOptions): Promise<GeminiResponse> {
  const {
    apiKey,
    model,
    systemInstruction,
    contents,
    temperature = 0.3,
    maxOutputTokens,
    timeout = DEFAULT_TIMEOUT,
    stream = true,
    signal,
  } = options;

  // Validate inputs
  if (!apiKey) {
    return { success: false, error: 'API key is required', errorCode: 'MISSING_API_KEY' };
  }

  if (!model) {
    return { success: false, error: 'Model is required', errorCode: 'MISSING_MODEL' };
  }

  if (!contents || contents.length === 0) {
    return { success: false, error: 'Contents are required', errorCode: 'MISSING_CONTENTS' };
  }

  // Build request body
  const requestBody: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature,
      ...(maxOutputTokens && { maxOutputTokens }),
    },
  };

  // Add system instruction if provided
  if (systemInstruction) {
    requestBody.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Combine with external signal if provided
  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }

  // Start keepalive for long-running requests
  startKeepalive();

  // Determine endpoint based on streaming
  const endpoint = stream ? 'streamGenerateContent' : 'generateContent';
  const url = `${GEMINI_API_BASE}/models/${model}:${endpoint}?key=${apiKey}`;

  try {
    log('info', `Calling Gemini API with model: ${model}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle HTTP errors
    if (!response.ok) {
      const errorBody = await response.text();
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      let errorCode = `HTTP_${response.status}`;

      try {
        const errorJson = JSON.parse(errorBody);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
          errorCode = errorJson.error.status || errorCode;
        }
      } catch {
        // Use default error message
      }

      log('error', 'API error:', errorMessage);

      // Provide user-friendly messages for common errors
      if (response.status === 400) {
        if (errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('API key not valid')) {
          errorMessage = 'Invalid API key. Please check your Gemini API key.';
          errorCode = 'INVALID_API_KEY';
        }
      } else if (response.status === 429) {
        errorMessage = 'Rate limit exceeded. Please try again later.';
        errorCode = 'RATE_LIMIT';
      } else if (response.status === 500 || response.status === 503) {
        errorMessage = 'Gemini service is temporarily unavailable. Please try again.';
        errorCode = 'SERVICE_UNAVAILABLE';
      }

      return { success: false, error: errorMessage, errorCode };
    }

    // Handle streaming response
    if (stream) {
      return await handleStreamingResponse(response, model);
    }

    // Handle non-streaming response
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
      success: true,
      content: text,
      promptTokens: data.usageMetadata?.promptTokenCount,
      completionTokens: data.usageMetadata?.candidatesTokenCount,
      totalTokens: data.usageMetadata?.totalTokenCount,
      model,
      finishReason: data.candidates?.[0]?.finishReason,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        log('warn', 'Request aborted or timed out');
        return { success: false, error: 'Request timed out or was cancelled', errorCode: 'TIMEOUT' };
      }

      log('error', 'Request failed:', error.message);
      return { success: false, error: error.message, errorCode: 'NETWORK_ERROR' };
    }

    return { success: false, error: 'Unknown error occurred', errorCode: 'UNKNOWN_ERROR' };
  } finally {
    stopKeepalive();
  }
}

/**
 * Handle streaming response from Gemini
 */
async function handleStreamingResponse(
  response: Response,
  requestModel: string
): Promise<GeminiResponse> {
  const reader = response.body?.getReader();
  if (!reader) {
    return { success: false, error: 'No response body', errorCode: 'NO_RESPONSE_BODY' };
  }

  const decoder = new TextDecoder();
  let content = '';
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;
  let totalTokens: number | undefined;
  let finishReason: string | undefined;

  try {
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Gemini uses JSON array streaming format
      // Each chunk starts with [ and ends with ] or contains ,{...}
      // We need to parse individual JSON objects from the stream

      // Try to extract complete JSON objects from buffer
      const extracted = extractJsonObjects(buffer);
      buffer = extracted.remaining;

      for (const jsonStr of extracted.objects) {
        try {
          const chunk = JSON.parse(jsonStr) as GeminiStreamChunk;

          // Extract content
          const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            content += text;
          }

          // Extract finish reason
          const reason = chunk.candidates?.[0]?.finishReason;
          if (reason) {
            finishReason = reason;
          }

          // Extract usage metadata
          if (chunk.usageMetadata) {
            promptTokens = chunk.usageMetadata.promptTokenCount;
            completionTokens = chunk.usageMetadata.candidatesTokenCount;
            totalTokens = chunk.usageMetadata.totalTokenCount;
          }
        } catch (parseError) {
          log('debug', 'Failed to parse chunk:', jsonStr);
        }
      }
    }

    log('info', `Streaming complete. Received ${content.length} characters`);

    return {
      success: true,
      content,
      promptTokens,
      completionTokens,
      totalTokens,
      model: requestModel,
      finishReason,
    };
  } catch (error) {
    log('error', 'Streaming error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Streaming failed',
      errorCode: 'STREAMING_ERROR',
    };
  } finally {
    reader.releaseLock();
  }
}

/**
 * Extract complete JSON objects from a buffer containing Gemini's streaming response
 * Gemini returns chunks in format: [{...},{...},...] or line-delimited JSON
 */
function extractJsonObjects(buffer: string): { objects: string[]; remaining: string } {
  const objects: string[] = [];
  let remaining = buffer;

  // Try to find complete JSON objects
  // Gemini can return either newline-delimited JSON or array format

  // First, try line-delimited format
  const lines = remaining.split('\n');
  remaining = lines.pop() || ''; // Keep last (possibly incomplete) line

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '[' || trimmed === ']' || trimmed === ',') {
      continue;
    }

    // Remove leading comma and array brackets
    let jsonStr = trimmed;
    if (jsonStr.startsWith(',')) {
      jsonStr = jsonStr.substring(1);
    }
    if (jsonStr.startsWith('[')) {
      jsonStr = jsonStr.substring(1);
    }
    if (jsonStr.endsWith(',')) {
      jsonStr = jsonStr.slice(0, -1);
    }
    if (jsonStr.endsWith(']')) {
      jsonStr = jsonStr.slice(0, -1);
    }

    jsonStr = jsonStr.trim();
    if (jsonStr && jsonStr.startsWith('{') && jsonStr.endsWith('}')) {
      objects.push(jsonStr);
    }
  }

  return { objects, remaining };
}

/**
 * Validate a Gemini API key by making a test request
 *
 * @param apiKey - API key to validate
 * @returns Validation result
 */
export async function validateApiKey(apiKey: string): Promise<{
  valid: boolean;
  error?: string;
  models?: string[];
}> {
  try {
    const response = await fetch(
      `${GEMINI_API_BASE}/models?key=${apiKey}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      if (response.status === 400 || response.status === 401) {
        return { valid: false, error: 'Invalid API key' };
      }
      return { valid: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const data = await response.json();
    const models = data.models
      ?.filter((m: { name: string }) => m.name.includes('gemini'))
      ?.map((m: { name: string }) => m.name.replace('models/', '')) || [];

    return { valid: true, models };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Validation failed',
    };
  }
}

/**
 * Estimate token count for a string (rough approximation)
 * Gemini uses similar tokenization to GPT models
 *
 * @param text - Text to estimate
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  // For CJK characters, use ~1.5 tokens per character
  // For other text, use ~4 characters per token
  const cjkChars = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f]/g)?.length || 0;
  const otherChars = text.length - cjkChars;

  return Math.ceil(cjkChars * 1.5 + otherChars / 4);
}

/**
 * Convert OpenAI-style messages to Gemini format
 * Useful for unified interface in translator module
 */
export function convertFromOpenAIFormat(
  messages: Array<{ role: string; content: string }>
): { systemInstruction?: string; contents: GeminiContent[] } {
  let systemInstruction: string | undefined;
  const contents: GeminiContent[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      // System messages become system instruction
      systemInstruction = msg.content;
    } else {
      // Map user/assistant to user/model
      const role = msg.role === 'assistant' ? 'model' : 'user';
      contents.push({
        role,
        parts: [{ text: msg.content }],
      });
    }
  }

  return { systemInstruction, contents };
}

// ============================================
// Exports
// ============================================

export default {
  generateContent,
  validateApiKey,
  estimateTokens,
  convertFromOpenAIFormat,
  setLogLevel,
};
