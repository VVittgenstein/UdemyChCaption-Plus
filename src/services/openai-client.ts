/**
 * OpenAI API Client Module
 *
 * Provides a client for calling OpenAI Chat Completions API with streaming support.
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
 * @see https://platform.openai.com/docs/api-reference/chat
 */

// ============================================
// Types
// ============================================

/**
 * OpenAI API request message
 */
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * OpenAI API request options
 */
export interface OpenAIRequestOptions {
  /** API Key */
  apiKey: string;
  /** Model to use */
  model: string;
  /** Messages for the conversation */
  messages: OpenAIMessage[];
  /** Temperature (0-2, default 0.3 for translation) */
  temperature?: number;
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Request timeout in milliseconds (default 60000) */
  timeout?: number;
  /** Enable streaming (default true) */
  stream?: boolean;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * OpenAI API response
 */
export interface OpenAIResponse {
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
 * Streaming chunk from OpenAI
 */
interface StreamDelta {
  content?: string;
}

/**
 * Streaming response chunk
 */
interface StreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: StreamDelta;
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ============================================
// Constants
// ============================================

const LOG_PREFIX = '[OpenAI Client]';
const OPENAI_API_BASE = 'https://api.openai.com/v1';
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
 * Call OpenAI Chat Completions API with streaming
 *
 * @param options - Request options
 * @returns API response
 */
export async function chatCompletion(options: OpenAIRequestOptions): Promise<OpenAIResponse> {
  const {
    apiKey,
    model,
    messages,
    temperature = 0.3,
    maxTokens,
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

  if (!messages || messages.length === 0) {
    return { success: false, error: 'Messages are required', errorCode: 'MISSING_MESSAGES' };
  }

  // Build request body
  const requestBody: Record<string, unknown> = {
    model,
    messages,
    temperature,
    stream,
    stream_options: stream ? { include_usage: true } : undefined,
  };

  if (maxTokens) {
    requestBody.max_tokens = maxTokens;
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

  try {
    log('info', `Calling OpenAI API with model: ${model}`);

    const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
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
          errorCode = errorJson.error.code || errorCode;
        }
      } catch {
        // Use default error message
      }

      log('error', 'API error:', errorMessage);

      // Provide user-friendly messages for common errors
      if (response.status === 401) {
        errorMessage = 'Invalid API key. Please check your OpenAI API key.';
        errorCode = 'INVALID_API_KEY';
      } else if (response.status === 429) {
        errorMessage = 'Rate limit exceeded. Please try again later.';
        errorCode = 'RATE_LIMIT';
      } else if (response.status === 500 || response.status === 503) {
        errorMessage = 'OpenAI service is temporarily unavailable. Please try again.';
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
    return {
      success: true,
      content: data.choices?.[0]?.message?.content || '',
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
      totalTokens: data.usage?.total_tokens,
      model: data.model,
      finishReason: data.choices?.[0]?.finish_reason,
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
 * Handle streaming response from OpenAI
 */
async function handleStreamingResponse(
  response: Response,
  requestModel: string
): Promise<OpenAIResponse> {
  const reader = response.body?.getReader();
  if (!reader) {
    return { success: false, error: 'No response body', errorCode: 'NO_RESPONSE_BODY' };
  }

  const decoder = new TextDecoder();
  let content = '';
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;
  let totalTokens: number | undefined;
  let model = requestModel;
  let finishReason: string | undefined;

  try {
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed || trimmed === 'data: [DONE]') {
          continue;
        }

        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6);
          try {
            const chunk = JSON.parse(jsonStr) as StreamChunk;

            // Extract content delta
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              content += delta;
            }

            // Extract finish reason
            const reason = chunk.choices?.[0]?.finish_reason;
            if (reason) {
              finishReason = reason;
            }

            // Extract usage from final chunk (when stream_options.include_usage is true)
            if (chunk.usage) {
              promptTokens = chunk.usage.prompt_tokens;
              completionTokens = chunk.usage.completion_tokens;
              totalTokens = chunk.usage.total_tokens;
            }

            // Extract model
            if (chunk.model) {
              model = chunk.model;
            }
          } catch (parseError) {
            log('debug', 'Failed to parse chunk:', jsonStr);
          }
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
      model,
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
 * Validate an OpenAI API key by making a test request
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
    const response = await fetch(`${OPENAI_API_BASE}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { valid: false, error: 'Invalid API key' };
      }
      return { valid: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const data = await response.json();
    const models = data.data
      ?.filter((m: { id: string }) => m.id.startsWith('gpt'))
      ?.map((m: { id: string }) => m.id) || [];

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
 * Uses the rule of thumb: ~4 characters per token for English
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

// ============================================
// Exports
// ============================================

export default {
  chatCompletion,
  validateApiKey,
  estimateTokens,
  setLogLevel,
};
