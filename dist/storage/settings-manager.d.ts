/**
 * Settings Manager for Udemy 字幕增强
 * Task ID: T-20251223-act-009-build-popup-settings
 *
 * Provides a unified interface for reading and writing user settings
 * using chrome.storage.sync. Can be used by popup, content script,
 * and service worker.
 */
import type { UserSettings } from '../types';
/**
 * Default settings
 */
export declare const DEFAULT_SETTINGS: UserSettings;
/**
 * Available models for each provider
 */
export declare const PROVIDER_MODELS: Record<string, {
    value: string;
    label: string;
    costPer1kTokens: number;
}[]>;
/**
 * Load settings from storage
 * Uses chrome.storage.sync in extension context, localStorage as fallback
 */
export declare function loadSettings(): Promise<UserSettings>;
/**
 * Save settings to storage
 * Uses chrome.storage.sync in extension context, localStorage as fallback
 */
export declare function saveSettings(settings: Partial<UserSettings>): Promise<void>;
/**
 * Clear all settings and reset to defaults
 */
export declare function resetSettings(): Promise<void>;
/**
 * Get a single setting value
 */
export declare function getSetting<K extends keyof UserSettings>(key: K): Promise<UserSettings[K]>;
/**
 * Set a single setting value
 */
export declare function setSetting<K extends keyof UserSettings>(key: K, value: UserSettings[K]): Promise<void>;
type SettingsChangeCallback = (newSettings: UserSettings, oldSettings: UserSettings) => void;
/**
 * Subscribe to settings changes
 * Returns an unsubscribe function
 */
export declare function onSettingsChange(callback: SettingsChangeCallback): () => void;
/**
 * Check if settings are valid for translation
 */
export declare function isConfigured(settings: UserSettings): boolean;
/**
 * Check if translation is enabled
 */
export declare function isEnabled(settings: UserSettings): boolean;
/**
 * Get model info for the current settings
 */
export declare function getModelInfo(settings: UserSettings): {
    label: string;
    costPer1kTokens: number;
} | null;
/**
 * Estimate cost for a given number of tokens
 */
export declare function estimateCost(settings: UserSettings, tokenCount: number): number;
/**
 * Settings Manager class for object-oriented usage
 */
export declare class SettingsManager {
    private cachedSettings;
    private unsubscribe;
    /**
     * Initialize the settings manager
     */
    init(): Promise<UserSettings>;
    /**
     * Get current settings (from cache if available)
     */
    getSettings(): Promise<UserSettings>;
    /**
     * Update settings
     */
    updateSettings(settings: Partial<UserSettings>): Promise<void>;
    /**
     * Check if translation is enabled
     */
    isEnabled(): boolean;
    /**
     * Check if settings are configured
     */
    isConfigured(): boolean;
    /**
     * Cleanup
     */
    destroy(): void;
}
export declare const settingsManager: SettingsManager;
export {};
//# sourceMappingURL=settings-manager.d.ts.map