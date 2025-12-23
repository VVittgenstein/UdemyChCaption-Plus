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
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
/**
 * Set the logging level
 */
export declare function setLogLevel(level: LogLevel): void;
/**
 * Call OpenAI Chat Completions API with streaming
 *
 * @param options - Request options
 * @returns API response
 */
export declare function chatCompletion(options: OpenAIRequestOptions): Promise<OpenAIResponse>;
/**
 * Validate an OpenAI API key by making a test request
 *
 * @param apiKey - API key to validate
 * @returns Validation result
 */
export declare function validateApiKey(apiKey: string): Promise<{
    valid: boolean;
    error?: string;
    models?: string[];
}>;
/**
 * Estimate token count for a string (rough approximation)
 * Uses the rule of thumb: ~4 characters per token for English
 *
 * @param text - Text to estimate
 * @returns Estimated token count
 */
export declare function estimateTokens(text: string): number;
declare const _default: {
    chatCompletion: typeof chatCompletion;
    validateApiKey: typeof validateApiKey;
    estimateTokens: typeof estimateTokens;
    setLogLevel: typeof setLogLevel;
};
export default _default;
//# sourceMappingURL=openai-client.d.ts.map