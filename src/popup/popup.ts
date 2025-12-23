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

// ============================================
// Constants
// ============================================

/**
 * Available models for each provider
 */
const PROVIDER_MODELS: Record<string, { value: string; label: string }[]> = {
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o (推荐)' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (更快)' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'gpt-4', label: 'GPT-4' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (经济)' },
  ],
  gemini: [
    { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash (推荐)' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (更快)' },
    { value: 'gemini-1.5-flash-8b', label: 'Gemini 1.5 Flash-8B (经济)' },
  ],
};

/**
 * Default settings
 */
const DEFAULT_SETTINGS: UserSettings = {
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
 * API endpoints for validation
 */
const API_ENDPOINTS = {
  openai: 'https://api.openai.com/v1/models',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
};

// ============================================
// DOM Elements
// ============================================

interface DOMElements {
  // Main toggle
  enabled: HTMLInputElement;
  // Form elements
  settingsForm: HTMLFormElement;
  provider: HTMLSelectElement;
  apiKey: HTMLInputElement;
  model: HTMLSelectElement;
  toggleApiKeyVisibility: HTMLButtonElement;
  // Buttons
  saveBtn: HTMLButtonElement;
  retranslateBtn: HTMLButtonElement;
  // Status
  statusMessage: HTMLDivElement;
  validationResult: HTMLDivElement;
  // Additional settings
  autoTranslate: HTMLInputElement;
  preloadEnabled: HTMLInputElement;
  showCostEstimate: HTMLInputElement;
  showLoadingIndicator: HTMLInputElement;
}

let elements: DOMElements;
let statusAutoHideTimer: number | null = null;
let currentRetranslateTaskId: string | null = null;

// ============================================
// Storage Functions
// ============================================

/**
 * Load settings from chrome.storage.sync
 */
async function loadSettings(): Promise<UserSettings> {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
        resolve(result as UserSettings);
      });
    } else {
      // Fallback for development/testing
      const stored = localStorage.getItem('udemy-caption-settings');
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
 * Save settings to chrome.storage.sync
 */
async function saveSettings(settings: Partial<UserSettings>): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.set(settings, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    } else {
      // Fallback for development/testing
      const current = localStorage.getItem('udemy-caption-settings');
      const merged = { ...(current ? JSON.parse(current) : DEFAULT_SETTINGS), ...settings };
      localStorage.setItem('udemy-caption-settings', JSON.stringify(merged));
      resolve();
    }
  });
}

/**
 * Notify content scripts of settings change
 */
async function notifySettingsChanged(settings: UserSettings): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    try {
      const tabs = await chrome.tabs.query({ url: '*://*.udemy.com/*' });
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'SETTINGS_UPDATED',
            payload: settings,
          }).catch(() => {
            // Tab might not have content script loaded
          });
        }
      }
    } catch {
      // Ignore errors
    }
  }
}

// ============================================
// API Validation Functions
// ============================================

/**
 * Validate OpenAI API key
 */
async function validateOpenAIKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch(API_ENDPOINTS.openai, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      return { valid: true };
    }

    if (response.status === 401) {
      return { valid: false, error: 'API Key 无效或已过期' };
    }

    if (response.status === 429) {
      return { valid: false, error: '请求过于频繁，请稍后重试' };
    }

    const data = await response.json().catch(() => ({}));
    return {
      valid: false,
      error: data.error?.message || `验证失败 (${response.status})`,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : '网络错误，请检查网络连接',
    };
  }
}

/**
 * Validate Gemini API key
 */
async function validateGeminiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_ENDPOINTS.gemini}?key=${apiKey}`, {
      method: 'GET',
    });

    if (response.ok) {
      return { valid: true };
    }

    if (response.status === 400 || response.status === 403) {
      return { valid: false, error: 'API Key 无效' };
    }

    if (response.status === 429) {
      return { valid: false, error: '请求过于频繁，请稍后重试' };
    }

    const data = await response.json().catch(() => ({}));
    return {
      valid: false,
      error: data.error?.message || `验证失败 (${response.status})`,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : '网络错误，请检查网络连接',
    };
  }
}

/**
 * Validate API key based on provider
 */
async function validateApiKey(
  provider: 'openai' | 'gemini',
  apiKey: string
): Promise<{ valid: boolean; error?: string }> {
  if (!apiKey.trim()) {
    return { valid: false, error: '请输入 API Key' };
  }

  if (provider === 'openai') {
    // Basic format check for OpenAI keys
    if (!apiKey.startsWith('sk-')) {
      return { valid: false, error: 'OpenAI API Key 应以 "sk-" 开头' };
    }
    return validateOpenAIKey(apiKey);
  }

  return validateGeminiKey(apiKey);
}

// ============================================
// UI Functions
// ============================================

/**
 * Get DOM elements
 */
function getDOMElements(): DOMElements {
  return {
    enabled: document.getElementById('enabled') as HTMLInputElement,
    settingsForm: document.getElementById('settings-form') as HTMLFormElement,
    provider: document.getElementById('provider') as HTMLSelectElement,
    apiKey: document.getElementById('apiKey') as HTMLInputElement,
    model: document.getElementById('model') as HTMLSelectElement,
    toggleApiKeyVisibility: document.getElementById('toggle-apikey-visibility') as HTMLButtonElement,
    saveBtn: document.getElementById('save-btn') as HTMLButtonElement,
    retranslateBtn: document.getElementById('retranslate-btn') as HTMLButtonElement,
    statusMessage: document.getElementById('status-message') as HTMLDivElement,
    validationResult: document.getElementById('validation-result') as HTMLDivElement,
    autoTranslate: document.getElementById('autoTranslate') as HTMLInputElement,
    preloadEnabled: document.getElementById('preloadEnabled') as HTMLInputElement,
    showCostEstimate: document.getElementById('showCostEstimate') as HTMLInputElement,
    showLoadingIndicator: document.getElementById('showLoadingIndicator') as HTMLInputElement,
  };
}

/**
 * Update model select options based on provider
 */
function updateModelOptions(provider: string): void {
  const models = PROVIDER_MODELS[provider] || [];
  elements.model.innerHTML = models
    .map((m) => `<option value="${m.value}">${m.label}</option>`)
    .join('');
}

/**
 * Show status message
 */
function showStatus(message: string, type: 'success' | 'error' | 'info', autoHide = true): void {
  if (statusAutoHideTimer) {
    clearTimeout(statusAutoHideTimer);
    statusAutoHideTimer = null;
  }

  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message ${type}`;
  elements.statusMessage.classList.remove('hidden');

  if (autoHide) {
    // Auto-hide after 3 seconds
    statusAutoHideTimer = window.setTimeout(() => {
      elements.statusMessage.classList.add('hidden');
      statusAutoHideTimer = null;
    }, 3000);
  }
}

/**
 * Show validation result
 */
function showValidationResult(valid: boolean, message: string): void {
  elements.validationResult.className = `validation-result ${valid ? 'success' : 'error'}`;
  elements.validationResult.querySelector('.validation-text')!.textContent = message;
  elements.validationResult.classList.remove('hidden');
}

/**
 * Hide validation result
 */
function hideValidationResult(): void {
  elements.validationResult.classList.add('hidden');
}

/**
 * Set button loading state
 */
function setButtonLoading(loading: boolean): void {
  if (loading) {
    elements.saveBtn.classList.add('loading');
    elements.saveBtn.disabled = true;
  } else {
    elements.saveBtn.classList.remove('loading');
    elements.saveBtn.disabled = false;
  }
}

/**
 * Set retranslate button loading state
 */
function setRetranslateButtonLoading(loading: boolean): void {
  if (loading) {
    elements.retranslateBtn.classList.add('loading');
    elements.retranslateBtn.disabled = true;
  } else {
    elements.retranslateBtn.classList.remove('loading');
    elements.retranslateBtn.disabled = false;
  }
}

/**
 * Update form disabled state based on main toggle
 */
function updateFormState(enabled: boolean): void {
  if (enabled) {
    elements.settingsForm.classList.remove('disabled');
  } else {
    elements.settingsForm.classList.add('disabled');
  }
}

/**
 * Populate form with settings
 */
function populateForm(settings: UserSettings): void {
  elements.enabled.checked = settings.enabled;
  elements.provider.value = settings.provider;
  updateModelOptions(settings.provider);
  elements.model.value = settings.model;
  elements.apiKey.value = settings.apiKey;
  elements.autoTranslate.checked = settings.autoTranslate;
  elements.preloadEnabled.checked = settings.preloadEnabled;
  elements.showCostEstimate.checked = settings.showCostEstimate;
  elements.showLoadingIndicator.checked = settings.showLoadingIndicator;
  updateFormState(settings.enabled);
}

/**
 * Get current form values
 */
function getFormValues(): UserSettings {
  return {
    enabled: elements.enabled.checked,
    provider: elements.provider.value as 'openai' | 'gemini',
    apiKey: elements.apiKey.value,
    model: elements.model.value,
    autoTranslate: elements.autoTranslate.checked,
    preloadEnabled: elements.preloadEnabled.checked,
    showCostEstimate: elements.showCostEstimate.checked,
    showLoadingIndicator: elements.showLoadingIndicator.checked,
  };
}

// ============================================
// Event Handlers
// ============================================

/**
 * Handle provider change
 */
function handleProviderChange(): void {
  const provider = elements.provider.value;
  updateModelOptions(provider);
  hideValidationResult();
}

/**
 * Handle API key visibility toggle
 */
function handleApiKeyVisibilityToggle(): void {
  const isPassword = elements.apiKey.type === 'password';
  elements.apiKey.type = isPassword ? 'text' : 'password';

  // Update eye icon
  const eyePath = document.getElementById('eye-path');
  if (eyePath) {
    if (isPassword) {
      // Show "eye-off" icon path
      eyePath.setAttribute(
        'd',
        'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z'
      );
    } else {
      // Show "eye" icon path
      eyePath.setAttribute(
        'd',
        'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z'
      );
    }
  }
}

/**
 * Handle main toggle change
 */
async function handleEnabledChange(): Promise<void> {
  const enabled = elements.enabled.checked;
  updateFormState(enabled);

  try {
    await saveSettings({ enabled });
    const settings = getFormValues();
    await notifySettingsChanged(settings);
  } catch (error) {
    showStatus('保存失败', 'error');
  }
}

/**
 * Handle additional setting change
 */
async function handleAdditionalSettingChange(key: keyof UserSettings): Promise<void> {
  const checkbox = elements[key as keyof DOMElements] as HTMLInputElement;
  if (!checkbox) return;

  try {
    await saveSettings({ [key]: checkbox.checked });
    const settings = getFormValues();
    await notifySettingsChanged(settings);
  } catch (error) {
    showStatus('保存失败', 'error');
  }
}

/**
 * Handle form submission (save & validate)
 */
async function handleFormSubmit(event: Event): Promise<void> {
  event.preventDefault();
  hideValidationResult();
  setButtonLoading(true);

  const settings = getFormValues();

  try {
    // Validate API key
    const validation = await validateApiKey(settings.provider, settings.apiKey);

    if (validation.valid) {
      // Save settings
      await saveSettings(settings);
      await notifySettingsChanged(settings);
      showValidationResult(true, 'API Key 验证成功，设置已保存');
    } else {
      showValidationResult(false, validation.error || '验证失败');
    }
  } catch (error) {
    showValidationResult(
      false,
      error instanceof Error ? error.message : '保存失败，请重试'
    );
  } finally {
    setButtonLoading(false);
  }
}

// ============================================
// Retranslate Handlers
// ============================================

function generateTaskId(): string {
  return `retranslate-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function getActiveUdemyTabId(): Promise<number | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) return null;

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id) return null;

  // Best-effort URL check: only allow udemy pages
  if (tab.url && !/\/\/([^/]*\.)?udemy\.com\//i.test(tab.url)) {
    return null;
  }

  return tab.id;
}

async function handleRetranslateClick(): Promise<void> {
  const tabId = await getActiveUdemyTabId();
  if (!tabId) {
    showStatus('请先打开 Udemy 课程播放页', 'error');
    return;
  }

  const taskId = generateTaskId();
  currentRetranslateTaskId = taskId;
  setRetranslateButtonLoading(true);
  showStatus('已发起重译请求…', 'info', false);

  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'RETRANSLATE_CURRENT',
      payload: { taskId },
    });
  } catch (error) {
    currentRetranslateTaskId = null;
    setRetranslateButtonLoading(false);
    showStatus('发送失败：请刷新课程页后重试', 'error');
  }
}

function setupRetranslateMessageListener(): void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;

  chrome.runtime.onMessage.addListener((message: any) => {
    if (!message || typeof message !== 'object') return;

    if (message.type === 'TRANSLATION_PROGRESS') {
      const taskId = message.payload?.taskId;
      const progress = message.payload?.progress;
      if (!currentRetranslateTaskId || taskId !== currentRetranslateTaskId) return;
      if (typeof progress !== 'number') return;

      const clamped = Math.max(0, Math.min(100, Math.round(progress)));
      showStatus(`重译中… ${clamped}%`, 'info', false);
      return;
    }

    if (message.type === 'TRANSLATION_COMPLETE') {
      const payload = message.payload;
      const taskId = payload?.taskId;

      // Only react when we have an active task; if taskId is missing, treat it as best-effort.
      if (!currentRetranslateTaskId) return;
      if (taskId && taskId !== currentRetranslateTaskId) return;

      const success = payload?.success === true;
      const errorText = payload?.error;

      currentRetranslateTaskId = null;
      setRetranslateButtonLoading(false);
      showStatus(success ? '重译完成' : `重译失败：${errorText || '未知错误'}`, success ? 'success' : 'error');
    }
  });
}

// ============================================
// Initialization
// ============================================

/**
 * Initialize popup
 */
async function init(): Promise<void> {
  elements = getDOMElements();

  // Load and populate settings
  const settings = await loadSettings();
  populateForm(settings);

  // Event listeners
  elements.provider.addEventListener('change', handleProviderChange);
  elements.toggleApiKeyVisibility.addEventListener('click', handleApiKeyVisibilityToggle);
  elements.enabled.addEventListener('change', handleEnabledChange);
  elements.settingsForm.addEventListener('submit', handleFormSubmit);

  // Additional settings listeners
  elements.autoTranslate.addEventListener('change', () =>
    handleAdditionalSettingChange('autoTranslate')
  );
  elements.preloadEnabled.addEventListener('change', () =>
    handleAdditionalSettingChange('preloadEnabled')
  );
  elements.showCostEstimate.addEventListener('change', () =>
    handleAdditionalSettingChange('showCostEstimate')
  );
  elements.showLoadingIndicator.addEventListener('change', () =>
    handleAdditionalSettingChange('showLoadingIndicator')
  );

  // Manual retranslate button
  elements.retranslateBtn.addEventListener('click', handleRetranslateClick);
  setupRetranslateMessageListener();

  // Hide validation result when API key changes
  elements.apiKey.addEventListener('input', hideValidationResult);
}

// Start initialization when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Export for testing
export {
  loadSettings,
  saveSettings,
  validateApiKey,
  validateOpenAIKey,
  validateGeminiKey,
  PROVIDER_MODELS,
  DEFAULT_SETTINGS,
};
