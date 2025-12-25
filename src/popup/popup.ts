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
    { value: 'gpt-5.2', label: 'GPT-5.2' },
    { value: 'gpt-5.1', label: 'GPT-5.1 (推荐)' },
    { value: 'gpt-5-pro', label: 'GPT-5 Pro' },
    { value: 'gpt-5', label: 'GPT-5' },
  ],
  gemini: [
    { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview (推荐)' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  ],
};

/**
 * Default settings
 */
const DEFAULT_SETTINGS: UserSettings = {
  provider: 'openai',
  apiKey: '',
  model: 'gpt-5.1',
  openaiBaseUrl: '',
  geminiBaseUrl: '',
  enabled: true,
  autoTranslate: true,
  preloadEnabled: true,
  showCostEstimate: true,
  showLoadingIndicator: true,
};

// ============================================
// Session Cost (chrome.storage.session)
// ============================================

interface SessionCostState {
  totals: {
    totalTokens: number;
    totalCostUsd: number;
    updatedAt: number;
  };
  lastEstimate?: {
    taskId: string;
    provider: 'openai' | 'gemini';
    model: string;
    cueCount: number;
    estimatedTotalTokens: number;
    estimatedCostUsd: number;
    createdAt: number;
  };
  lastActual?: {
    taskId: string;
    provider: 'openai' | 'gemini';
    model: string;
    tokensUsed: number;
    costUsd: number;
    createdAt: number;
  };
}

const SESSION_COST_KEY = 'udemy-caption-plus:session-cost';

const DEFAULT_SESSION_COST_STATE: SessionCostState = {
  totals: {
    totalTokens: 0,
    totalCostUsd: 0,
    updatedAt: 0,
  },
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
  // Custom API endpoints
  toggleApiAdvanced: HTMLButtonElement;
  apiAdvancedContent: HTMLDivElement;
  openaiBaseUrl: HTMLInputElement;
  geminiBaseUrl: HTMLInputElement;
  // Buttons
  saveBtn: HTMLButtonElement;
  retranslateBtn: HTMLButtonElement;
  // Status
  statusMessage: HTMLDivElement;
  validationResult: HTMLDivElement;
  // Cost display
  costDisplay: HTMLDivElement;
  costEstimate: HTMLSpanElement;
  costActual: HTMLSpanElement;
  costSession: HTMLSpanElement;
  // Additional settings
  autoTranslate: HTMLInputElement;
  preloadEnabled: HTMLInputElement;
  showCostEstimate: HTMLInputElement;
  showLoadingIndicator: HTMLInputElement;
}

let elements: DOMElements;
let statusAutoHideTimer: number | null = null;
let currentRetranslateTaskId: string | null = null;
let sessionCostState: SessionCostState = structuredClone(DEFAULT_SESSION_COST_STATE);

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

// ============================================
// Session Cost Functions
// ============================================

function hasSessionStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.session;
}

async function loadSessionCost(): Promise<SessionCostState> {
  if (hasSessionStorage()) {
    return new Promise((resolve) => {
      chrome.storage.session.get({ [SESSION_COST_KEY]: DEFAULT_SESSION_COST_STATE }, (result) => {
        const value = (result as Record<string, SessionCostState>)[SESSION_COST_KEY];
        resolve(value ?? structuredClone(DEFAULT_SESSION_COST_STATE));
      });
    });
  }

  // Development/testing fallback
  const stored = localStorage.getItem(SESSION_COST_KEY);
  if (!stored) return structuredClone(DEFAULT_SESSION_COST_STATE);
  try {
    return { ...structuredClone(DEFAULT_SESSION_COST_STATE), ...JSON.parse(stored) } as SessionCostState;
  } catch {
    return structuredClone(DEFAULT_SESSION_COST_STATE);
  }
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
 * Convert a base URL to a Chrome "host permission" match pattern.
 *
 * Note: Chrome match patterns do not include ports; they match by scheme + host + path.
 */
function baseUrlToHostPermissionPattern(baseUrl: string): string | null {
  const trimmed = baseUrl.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return `${url.protocol}//${url.hostname}/*`;
  } catch {
    return null;
  }
}

async function ensureHostPermissionForBaseUrl(baseUrl: string): Promise<{ ok: boolean; error?: string }> {
  const pattern = baseUrlToHostPermissionPattern(baseUrl);
  if (!pattern) return { ok: true };

  if (typeof chrome === 'undefined' || !chrome.permissions?.contains || !chrome.permissions?.request) {
    return { ok: true };
  }

  const alreadyGranted = await new Promise<boolean>((resolve) => {
    chrome.permissions.contains({ origins: [pattern] }, (result) => resolve(!!result));
  });

  if (alreadyGranted) {
    return { ok: true };
  }

  const granted = await new Promise<boolean>((resolve) => {
    chrome.permissions.request({ origins: [pattern] }, (result) => resolve(!!result));
  });

  if (granted) {
    return { ok: true };
  }

  const endpoint = pattern.replace(/\/\*$/, '');
  return { ok: false, error: `未授权访问该端点：${endpoint}` };
}

/**
 * Validate OpenAI API key
 */
async function validateOpenAIKey(
  apiKey: string,
  baseUrl?: string
): Promise<{ valid: boolean; error?: string }> {
  const effectiveBaseUrl = baseUrl?.trim() || 'https://api.openai.com/v1';

  try {
    const response = await fetch(`${effectiveBaseUrl}/models`, {
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
    const hasCustomUrl = !!baseUrl?.trim();
    return {
      valid: false,
      error: hasCustomUrl
        ? '无法连接到自定义端点，请检查 URL 是否正确'
        : (error instanceof Error ? error.message : '网络错误，请检查网络连接'),
    };
  }
}

/**
 * Validate Gemini API key
 */
async function validateGeminiKey(
  apiKey: string,
  baseUrl?: string
): Promise<{ valid: boolean; error?: string }> {
  const effectiveBaseUrl = baseUrl?.trim() || 'https://generativelanguage.googleapis.com/v1beta';

  try {
    const response = await fetch(`${effectiveBaseUrl}/models?key=${apiKey}`, {
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
    const hasCustomUrl = !!baseUrl?.trim();
    return {
      valid: false,
      error: hasCustomUrl
        ? '无法连接到自定义端点，请检查 URL 是否正确'
        : (error instanceof Error ? error.message : '网络错误，请检查网络连接'),
    };
  }
}

/**
 * Validate API key based on provider
 */
async function validateApiKey(
  provider: 'openai' | 'gemini',
  apiKey: string,
  customBaseUrl?: string
): Promise<{ valid: boolean; error?: string }> {
  if (!apiKey.trim()) {
    return { valid: false, error: '请输入 API Key' };
  }

  const hasCustomUrl = !!customBaseUrl?.trim();

  if (provider === 'openai') {
    // Only check sk- prefix when using official endpoint
    if (!hasCustomUrl && !apiKey.startsWith('sk-')) {
      return { valid: false, error: 'OpenAI API Key 应以 "sk-" 开头' };
    }
    return validateOpenAIKey(apiKey, customBaseUrl);
  }

  return validateGeminiKey(apiKey, customBaseUrl);
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
    toggleApiAdvanced: document.getElementById('toggle-api-advanced') as HTMLButtonElement,
    apiAdvancedContent: document.getElementById('api-advanced-content') as HTMLDivElement,
    openaiBaseUrl: document.getElementById('openaiBaseUrl') as HTMLInputElement,
    geminiBaseUrl: document.getElementById('geminiBaseUrl') as HTMLInputElement,
    saveBtn: document.getElementById('save-btn') as HTMLButtonElement,
    retranslateBtn: document.getElementById('retranslate-btn') as HTMLButtonElement,
    statusMessage: document.getElementById('status-message') as HTMLDivElement,
    validationResult: document.getElementById('validation-result') as HTMLDivElement,
    costDisplay: document.getElementById('cost-display') as HTMLDivElement,
    costEstimate: document.getElementById('cost-estimate') as HTMLSpanElement,
    costActual: document.getElementById('cost-actual') as HTMLSpanElement,
    costSession: document.getElementById('cost-session') as HTMLSpanElement,
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

function setCostDisplayVisible(visible: boolean): void {
  if (visible) {
    elements.costDisplay.classList.remove('hidden');
  } else {
    elements.costDisplay.classList.add('hidden');
  }
}

function formatTokenCount(tokenCount: number): string {
  if (!Number.isFinite(tokenCount) || tokenCount <= 0) return '0';
  if (tokenCount >= 1_000_000) return `${(tokenCount / 1_000_000).toFixed(2)}M`;
  if (tokenCount >= 10_000) return `${(tokenCount / 1_000).toFixed(1)}K`;
  return tokenCount.toLocaleString();
}

function formatUsd(costUsd: number): string {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return '$0';
  const abs = Math.abs(costUsd);
  if (abs >= 10) return `$${costUsd.toFixed(2)}`;
  if (abs >= 1) return `$${costUsd.toFixed(3)}`;
  if (abs >= 0.1) return `$${costUsd.toFixed(4)}`;
  return `$${costUsd.toFixed(6)}`;
}

function formatTokensAndCost(tokenCount: number, costUsd: number, approx: boolean): string {
  const tokens = `${formatTokenCount(tokenCount)} tokens`;
  const cost = formatUsd(costUsd);
  return `${approx ? '≈ ' : ''}${tokens} · ${approx ? '≈ ' : ''}${cost}`;
}

function renderCostDisplay(): void {
  const estimate = sessionCostState.lastEstimate;
  const actual = sessionCostState.lastActual;

  if (estimate) {
    elements.costEstimate.textContent = formatTokensAndCost(
      estimate.estimatedTotalTokens,
      estimate.estimatedCostUsd,
      true
    );
  } else {
    elements.costEstimate.textContent = '-';
  }

  if (actual) {
    elements.costActual.textContent = formatTokensAndCost(actual.tokensUsed, actual.costUsd, false);
  } else {
    elements.costActual.textContent = '-';
  }

  elements.costSession.textContent = formatTokensAndCost(
    sessionCostState.totals.totalTokens,
    sessionCostState.totals.totalCostUsd,
    false
  );
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
  elements.openaiBaseUrl.value = settings.openaiBaseUrl || '';
  elements.geminiBaseUrl.value = settings.geminiBaseUrl || '';
  elements.autoTranslate.checked = settings.autoTranslate;
  elements.preloadEnabled.checked = settings.preloadEnabled;
  elements.showCostEstimate.checked = settings.showCostEstimate;
  elements.showLoadingIndicator.checked = settings.showLoadingIndicator;
  updateFormState(settings.enabled);
  setCostDisplayVisible(settings.showCostEstimate);
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
    openaiBaseUrl: elements.openaiBaseUrl.value.trim(),
    geminiBaseUrl: elements.geminiBaseUrl.value.trim(),
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
 * Handle API advanced settings toggle
 */
function handleApiAdvancedToggle(): void {
  const isHidden = elements.apiAdvancedContent.classList.contains('hidden');

  if (isHidden) {
    elements.apiAdvancedContent.classList.remove('hidden');
    elements.toggleApiAdvanced.classList.add('expanded');
  } else {
    elements.apiAdvancedContent.classList.add('hidden');
    elements.toggleApiAdvanced.classList.remove('expanded');
  }
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

    if (key === 'showCostEstimate') {
      setCostDisplayVisible(checkbox.checked);
      if (checkbox.checked) {
        sessionCostState = await loadSessionCost();
        renderCostDisplay();
      }
    }
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

  // Get the appropriate base URL for the current provider
  const customBaseUrl = settings.provider === 'openai'
    ? settings.openaiBaseUrl
    : settings.geminiBaseUrl;
  const effectiveBaseUrl = customBaseUrl || (settings.provider === 'openai'
    ? 'https://api.openai.com/v1'
    : 'https://generativelanguage.googleapis.com/v1beta');

  try {
    // Ensure host permission for the API endpoint (required for service worker fetch)
    const permission = await ensureHostPermissionForBaseUrl(effectiveBaseUrl);
    if (!permission.ok) {
      showValidationResult(false, permission.error || '未授权访问该端点');
      return;
    }

    // Validate API key with custom URL
    const validation = await validateApiKey(settings.provider, settings.apiKey, customBaseUrl);

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

    if (message.type === 'COST_ESTIMATE') {
      const payload = message.payload;
      if (!payload || typeof payload !== 'object') return;

      const taskId = typeof payload.taskId === 'string' ? payload.taskId : '';
      const provider = payload.provider === 'gemini' ? 'gemini' : 'openai';
      const model = typeof payload.model === 'string' ? payload.model : '';
      const cueCount = typeof payload.cueCount === 'number' ? payload.cueCount : 0;
      const estimatedTotalTokens =
        typeof payload.estimatedTotalTokens === 'number' ? payload.estimatedTotalTokens : 0;
      const estimatedCostUsd =
        typeof payload.estimatedCostUsd === 'number' ? payload.estimatedCostUsd : 0;

      if (!taskId || !model) return;

      sessionCostState = {
        ...sessionCostState,
        lastEstimate: {
          taskId,
          provider,
          model,
          cueCount,
          estimatedTotalTokens,
          estimatedCostUsd,
          createdAt: Date.now(),
        },
      };

      if (elements.showCostEstimate.checked) {
        renderCostDisplay();
      }
      return;
    }

    if (message.type === 'CACHE_HIT') {
      const payload = message.payload;
      if (!payload || typeof payload !== 'object') return;

      const taskId = typeof payload.taskId === 'string' ? payload.taskId : '';
      const provider = payload.provider === 'gemini' ? 'gemini' : 'openai';
      const model = typeof payload.model === 'string' ? payload.model : '';
      const tokensUsed = typeof payload.tokensUsed === 'number' ? payload.tokensUsed : 0;
      const costUsd = typeof payload.costUsd === 'number' ? payload.costUsd : 0;

      if (taskId && model && (tokensUsed > 0 || costUsd > 0)) {
        sessionCostState = {
          ...sessionCostState,
          lastActual: {
            taskId,
            provider,
            model,
            tokensUsed,
            costUsd,
            createdAt: Date.now(),
          },
        };
        if (elements.showCostEstimate.checked) {
          renderCostDisplay();
        }
      }
      return;
    }

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

      // Update cost display (best-effort, not limited to popup-initiated tasks)
      if (payload && typeof payload === 'object') {
        const tokensUsed = typeof payload.tokensUsed === 'number' ? payload.tokensUsed : 0;
        const costUsd = typeof payload.estimatedCost === 'number' ? payload.estimatedCost : 0;
        const sessionTotalTokens =
          typeof payload.sessionTotalTokens === 'number' ? payload.sessionTotalTokens : null;
        const sessionTotalCostUsd =
          typeof payload.sessionTotalCostUsd === 'number' ? payload.sessionTotalCostUsd : null;

        if (typeof taskId === 'string') {
          const estimateMatch = sessionCostState.lastEstimate?.taskId === taskId
            ? sessionCostState.lastEstimate
            : null;
          const fallbackProvider = estimateMatch ? estimateMatch.provider : 'openai';
          const fallbackModel = estimateMatch ? estimateMatch.model : elements.model.value;

          const provider =
            payload.provider === 'gemini' ? 'gemini' : payload.provider === 'openai' ? 'openai' : fallbackProvider;
          const model = typeof payload.model === 'string' ? payload.model : fallbackModel;

          if (model && (tokensUsed > 0 || costUsd > 0)) {
            sessionCostState = {
              ...sessionCostState,
              lastActual: {
                taskId,
                provider,
                model,
                tokensUsed,
                costUsd,
                createdAt: Date.now(),
              },
            };
          }
        }

        if (sessionTotalTokens !== null && sessionTotalCostUsd !== null) {
          sessionCostState = {
            ...sessionCostState,
            totals: {
              totalTokens: sessionTotalTokens,
              totalCostUsd: sessionTotalCostUsd,
              updatedAt: Date.now(),
            },
          };
        }

        if (elements.showCostEstimate.checked) {
          renderCostDisplay();
        }
      }

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

  if (settings.showCostEstimate) {
    sessionCostState = await loadSessionCost();
    renderCostDisplay();
  }

  // Event listeners
  elements.provider.addEventListener('change', handleProviderChange);
  elements.toggleApiKeyVisibility.addEventListener('click', handleApiKeyVisibilityToggle);
  elements.toggleApiAdvanced.addEventListener('click', handleApiAdvancedToggle);
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
