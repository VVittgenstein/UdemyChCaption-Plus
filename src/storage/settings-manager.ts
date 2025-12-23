/**
 * Settings Manager for Udemy 字幕增强
 * Task ID: T-20251223-act-009-build-popup-settings
 *
 * Provides a unified interface for reading and writing user settings
 * using chrome.storage.sync. Can be used by popup, content script,
 * and service worker.
 */

import type { UserSettings } from '../types';

// ============================================
// Constants
// ============================================

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: UserSettings = {
  provider: 'openai',
  apiKey: '',
  model: 'gpt-4o',
  enabled: true,
  autoTranslate: true,
  preloadEnabled: true,
  showCostEstimate: true,
  showLoadingIndicator: true,
};

/**
 * Available models for each provider
 */
export const PROVIDER_MODELS: Record<string, { value: string; label: string; costPer1kTokens: number }[]> = {
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o', costPer1kTokens: 0.005 },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini', costPer1kTokens: 0.00015 },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', costPer1kTokens: 0.01 },
    { value: 'gpt-4', label: 'GPT-4', costPer1kTokens: 0.03 },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', costPer1kTokens: 0.0005 },
  ],
  gemini: [
    { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash', costPer1kTokens: 0.0 },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', costPer1kTokens: 0.00125 },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', costPer1kTokens: 0.000075 },
    { value: 'gemini-1.5-flash-8b', label: 'Gemini 1.5 Flash-8B', costPer1kTokens: 0.0000375 },
  ],
};

/**
 * Storage key for settings
 */
const STORAGE_KEY = 'udemy-caption-settings';

// ============================================
// Type Guards
// ============================================

/**
 * Check if running in Chrome extension context
 */
function isChromeExtension(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.sync;
}

// ============================================
// Storage Operations
// ============================================

/**
 * Load settings from storage
 * Uses chrome.storage.sync in extension context, localStorage as fallback
 */
export async function loadSettings(): Promise<UserSettings> {
  return new Promise((resolve) => {
    if (isChromeExtension()) {
      chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
        resolve(result as UserSettings);
      });
    } else {
      // Fallback for development/testing
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          resolve({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
        } catch {
          resolve(DEFAULT_SETTINGS);
        }
      } else {
        resolve(DEFAULT_SETTINGS);
      }
    }
  });
}

/**
 * Save settings to storage
 * Uses chrome.storage.sync in extension context, localStorage as fallback
 */
export async function saveSettings(settings: Partial<UserSettings>): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isChromeExtension()) {
      chrome.storage.sync.set(settings, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    } else {
      // Fallback for development/testing
      try {
        const current = localStorage.getItem(STORAGE_KEY);
        const merged = { ...(current ? JSON.parse(current) : DEFAULT_SETTINGS), ...settings };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        resolve();
      } catch (error) {
        reject(error);
      }
    }
  });
}

/**
 * Clear all settings and reset to defaults
 */
export async function resetSettings(): Promise<void> {
  return saveSettings(DEFAULT_SETTINGS);
}

/**
 * Get a single setting value
 */
export async function getSetting<K extends keyof UserSettings>(key: K): Promise<UserSettings[K]> {
  const settings = await loadSettings();
  return settings[key];
}

/**
 * Set a single setting value
 */
export async function setSetting<K extends keyof UserSettings>(
  key: K,
  value: UserSettings[K]
): Promise<void> {
  return saveSettings({ [key]: value });
}

// ============================================
// Settings Change Listener
// ============================================

type SettingsChangeCallback = (newSettings: UserSettings, oldSettings: UserSettings) => void;

const changeListeners: Set<SettingsChangeCallback> = new Set();

/**
 * Subscribe to settings changes
 * Returns an unsubscribe function
 */
export function onSettingsChange(callback: SettingsChangeCallback): () => void {
  changeListeners.add(callback);

  // Set up chrome.storage listener if in extension context
  if (isChromeExtension() && changeListeners.size === 1) {
    chrome.storage.onChanged.addListener(handleStorageChange);
  }

  return () => {
    changeListeners.delete(callback);
    if (isChromeExtension() && changeListeners.size === 0) {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    }
  };
}

/**
 * Handle chrome.storage change events
 */
function handleStorageChange(
  changes: { [key: string]: chrome.storage.StorageChange },
  areaName: string
): void {
  if (areaName !== 'sync') return;

  // Build old and new settings objects
  const oldSettings: Partial<UserSettings> = {};
  const newSettings: Partial<UserSettings> = {};

  for (const key of Object.keys(changes) as Array<keyof UserSettings>) {
    if (key in DEFAULT_SETTINGS) {
      oldSettings[key] = changes[key].oldValue;
      newSettings[key] = changes[key].newValue;
    }
  }

  // Notify listeners
  loadSettings().then((currentSettings) => {
    const previousSettings = { ...currentSettings };
    for (const key of Object.keys(oldSettings) as Array<keyof UserSettings>) {
      if (oldSettings[key] !== undefined) {
        (previousSettings as Record<string, unknown>)[key] = oldSettings[key];
      }
    }

    for (const listener of changeListeners) {
      try {
        listener(currentSettings, previousSettings);
      } catch (error) {
        console.error('[SettingsManager] Error in change listener:', error);
      }
    }
  });
}

// ============================================
// Utility Functions
// ============================================

/**
 * Check if settings are valid for translation
 */
export function isConfigured(settings: UserSettings): boolean {
  return !!settings.apiKey && !!settings.model && !!settings.provider;
}

/**
 * Check if translation is enabled
 */
export function isEnabled(settings: UserSettings): boolean {
  return settings.enabled && isConfigured(settings);
}

/**
 * Get model info for the current settings
 */
export function getModelInfo(settings: UserSettings): {
  label: string;
  costPer1kTokens: number;
} | null {
  const models = PROVIDER_MODELS[settings.provider];
  if (!models) return null;

  const model = models.find((m) => m.value === settings.model);
  return model ? { label: model.label, costPer1kTokens: model.costPer1kTokens } : null;
}

/**
 * Estimate cost for a given number of tokens
 */
export function estimateCost(settings: UserSettings, tokenCount: number): number {
  const modelInfo = getModelInfo(settings);
  if (!modelInfo) return 0;

  return (tokenCount / 1000) * modelInfo.costPer1kTokens;
}

// ============================================
// Export SettingsManager class for OOP usage
// ============================================

/**
 * Settings Manager class for object-oriented usage
 */
export class SettingsManager {
  private cachedSettings: UserSettings | null = null;
  private unsubscribe: (() => void) | null = null;

  /**
   * Initialize the settings manager
   */
  async init(): Promise<UserSettings> {
    this.cachedSettings = await loadSettings();

    // Subscribe to changes to keep cache updated
    this.unsubscribe = onSettingsChange((newSettings) => {
      this.cachedSettings = newSettings;
    });

    return this.cachedSettings;
  }

  /**
   * Get current settings (from cache if available)
   */
  async getSettings(): Promise<UserSettings> {
    if (this.cachedSettings) {
      return this.cachedSettings;
    }
    return loadSettings();
  }

  /**
   * Update settings
   */
  async updateSettings(settings: Partial<UserSettings>): Promise<void> {
    await saveSettings(settings);
    if (this.cachedSettings) {
      this.cachedSettings = { ...this.cachedSettings, ...settings };
    }
  }

  /**
   * Check if translation is enabled
   */
  isEnabled(): boolean {
    if (!this.cachedSettings) return false;
    return isEnabled(this.cachedSettings);
  }

  /**
   * Check if settings are configured
   */
  isConfigured(): boolean {
    if (!this.cachedSettings) return false;
    return isConfigured(this.cachedSettings);
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.cachedSettings = null;
  }
}

// Export singleton instance
export const settingsManager = new SettingsManager();
