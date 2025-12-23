/**
 * Popup Settings Panel for Udemy 字幕增强
 * Task ID: T-20251223-act-009-build-popup-settings
 *
 * Handles:
 * - Provider selection (OpenAI / Gemini)
 * - API Key input and validation
 * - Model selection
 * - Main toggle for subtitle replacement
 * - Settings persistence via chrome.storage.sync
 */
import type { UserSettings } from '../types';
/**
 * Available models for each provider
 */
declare const PROVIDER_MODELS: Record<string, {
    value: string;
    label: string;
}[]>;
/**
 * Default settings
 */
declare const DEFAULT_SETTINGS: UserSettings;
/**
 * Load settings from chrome.storage.sync
 */
declare function loadSettings(): Promise<UserSettings>;
/**
 * Save settings to chrome.storage.sync
 */
declare function saveSettings(settings: Partial<UserSettings>): Promise<void>;
/**
 * Validate OpenAI API key
 */
declare function validateOpenAIKey(apiKey: string): Promise<{
    valid: boolean;
    error?: string;
}>;
/**
 * Validate Gemini API key
 */
declare function validateGeminiKey(apiKey: string): Promise<{
    valid: boolean;
    error?: string;
}>;
/**
 * Validate API key based on provider
 */
declare function validateApiKey(provider: 'openai' | 'gemini', apiKey: string): Promise<{
    valid: boolean;
    error?: string;
}>;
export { loadSettings, saveSettings, validateApiKey, validateOpenAIKey, validateGeminiKey, PROVIDER_MODELS, DEFAULT_SETTINGS, };
//# sourceMappingURL=popup.d.ts.map