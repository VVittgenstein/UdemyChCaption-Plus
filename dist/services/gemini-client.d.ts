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
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
/**
 * Set the logging level
 */
export declare function setLogLevel(level: LogLevel): void;
/**
 * Call Gemini generateContent API with streaming
 *
 * @param options - Request options
 * @returns API response
 */
export declare function generateContent(options: GeminiRequestOptions): Promise<GeminiResponse>;
/**
 * Validate a Gemini API key by making a test request
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
 * Gemini uses similar tokenization to GPT models
 *
 * @param text - Text to estimate
 * @returns Estimated token count
 */
export declare function estimateTokens(text: string): number;
/**
 * Convert OpenAI-style messages to Gemini format
 * Useful for unified interface in translator module
 */
export declare function convertFromOpenAIFormat(messages: Array<{
    role: string;
    content: string;
}>): {
    systemInstruction?: string;
    contents: GeminiContent[];
};
declare const _default: {
    generateContent: typeof generateContent;
    validateApiKey: typeof validateApiKey;
    estimateTokens: typeof estimateTokens;
    convertFromOpenAIFormat: typeof convertFromOpenAIFormat;
    setLogLevel: typeof setLogLevel;
};
export default _default;
//# sourceMappingURL=gemini-client.d.ts.map