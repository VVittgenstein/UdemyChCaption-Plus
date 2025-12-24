"use strict";
(() => {
  // src/popup/popup.ts
  var PROVIDER_MODELS = {
    openai: [
      { value: "gpt-5.2", label: "GPT-5.2" },
      { value: "gpt-5.1", label: "GPT-5.1 (\u63A8\u8350)" },
      { value: "gpt-5-pro", label: "GPT-5 Pro" },
      { value: "gpt-5", label: "GPT-5" }
    ],
    gemini: [
      { value: "gemini-3-pro-preview", label: "Gemini 3 Pro Preview" },
      { value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview (\u63A8\u8350)" },
      { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }
    ]
  };
  var DEFAULT_SETTINGS = {
    provider: "openai",
    apiKey: "",
    model: "gpt-5.1",
    enabled: true,
    autoTranslate: true,
    preloadEnabled: true,
    showCostEstimate: true,
    showLoadingIndicator: true
  };
  var API_ENDPOINTS = {
    openai: "https://api.openai.com/v1/models",
    gemini: "https://generativelanguage.googleapis.com/v1beta/models"
  };
  var SESSION_COST_KEY = "udemy-caption-plus:session-cost";
  var DEFAULT_SESSION_COST_STATE = {
    totals: {
      totalTokens: 0,
      totalCostUsd: 0,
      updatedAt: 0
    }
  };
  var elements;
  var statusAutoHideTimer = null;
  var currentRetranslateTaskId = null;
  var sessionCostState = structuredClone(DEFAULT_SESSION_COST_STATE);
  async function loadSettings() {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage?.sync) {
        chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
          resolve(result);
        });
      } else {
        const stored = localStorage.getItem("udemy-caption-settings");
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
  async function saveSettings(settings) {
    return new Promise((resolve, reject) => {
      if (typeof chrome !== "undefined" && chrome.storage?.sync) {
        chrome.storage.sync.set(settings, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      } else {
        const current = localStorage.getItem("udemy-caption-settings");
        const merged = { ...current ? JSON.parse(current) : DEFAULT_SETTINGS, ...settings };
        localStorage.setItem("udemy-caption-settings", JSON.stringify(merged));
        resolve();
      }
    });
  }
  function hasSessionStorage() {
    return typeof chrome !== "undefined" && !!chrome.storage?.session;
  }
  async function loadSessionCost() {
    if (hasSessionStorage()) {
      return new Promise((resolve) => {
        chrome.storage.session.get({ [SESSION_COST_KEY]: DEFAULT_SESSION_COST_STATE }, (result) => {
          const value = result[SESSION_COST_KEY];
          resolve(value ?? structuredClone(DEFAULT_SESSION_COST_STATE));
        });
      });
    }
    const stored = localStorage.getItem(SESSION_COST_KEY);
    if (!stored) return structuredClone(DEFAULT_SESSION_COST_STATE);
    try {
      return { ...structuredClone(DEFAULT_SESSION_COST_STATE), ...JSON.parse(stored) };
    } catch {
      return structuredClone(DEFAULT_SESSION_COST_STATE);
    }
  }
  async function notifySettingsChanged(settings) {
    if (typeof chrome !== "undefined" && chrome.tabs) {
      try {
        const tabs = await chrome.tabs.query({ url: "*://*.udemy.com/*" });
        for (const tab of tabs) {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
              type: "SETTINGS_UPDATED",
              payload: settings
            }).catch(() => {
            });
          }
        }
      } catch {
      }
    }
  }
  async function validateOpenAIKey(apiKey) {
    try {
      const response = await fetch(API_ENDPOINTS.openai, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      });
      if (response.ok) {
        return { valid: true };
      }
      if (response.status === 401) {
        return { valid: false, error: "API Key \u65E0\u6548\u6216\u5DF2\u8FC7\u671F" };
      }
      if (response.status === 429) {
        return { valid: false, error: "\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5" };
      }
      const data = await response.json().catch(() => ({}));
      return {
        valid: false,
        error: data.error?.message || `\u9A8C\u8BC1\u5931\u8D25 (${response.status})`
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "\u7F51\u7EDC\u9519\u8BEF\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u8FDE\u63A5"
      };
    }
  }
  async function validateGeminiKey(apiKey) {
    try {
      const response = await fetch(`${API_ENDPOINTS.gemini}?key=${apiKey}`, {
        method: "GET"
      });
      if (response.ok) {
        return { valid: true };
      }
      if (response.status === 400 || response.status === 403) {
        return { valid: false, error: "API Key \u65E0\u6548" };
      }
      if (response.status === 429) {
        return { valid: false, error: "\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5" };
      }
      const data = await response.json().catch(() => ({}));
      return {
        valid: false,
        error: data.error?.message || `\u9A8C\u8BC1\u5931\u8D25 (${response.status})`
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "\u7F51\u7EDC\u9519\u8BEF\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u8FDE\u63A5"
      };
    }
  }
  async function validateApiKey(provider, apiKey) {
    if (!apiKey.trim()) {
      return { valid: false, error: "\u8BF7\u8F93\u5165 API Key" };
    }
    if (provider === "openai") {
      if (!apiKey.startsWith("sk-")) {
        return { valid: false, error: 'OpenAI API Key \u5E94\u4EE5 "sk-" \u5F00\u5934' };
      }
      return validateOpenAIKey(apiKey);
    }
    return validateGeminiKey(apiKey);
  }
  function getDOMElements() {
    return {
      enabled: document.getElementById("enabled"),
      settingsForm: document.getElementById("settings-form"),
      provider: document.getElementById("provider"),
      apiKey: document.getElementById("apiKey"),
      model: document.getElementById("model"),
      toggleApiKeyVisibility: document.getElementById("toggle-apikey-visibility"),
      saveBtn: document.getElementById("save-btn"),
      retranslateBtn: document.getElementById("retranslate-btn"),
      statusMessage: document.getElementById("status-message"),
      validationResult: document.getElementById("validation-result"),
      costDisplay: document.getElementById("cost-display"),
      costEstimate: document.getElementById("cost-estimate"),
      costActual: document.getElementById("cost-actual"),
      costSession: document.getElementById("cost-session"),
      autoTranslate: document.getElementById("autoTranslate"),
      preloadEnabled: document.getElementById("preloadEnabled"),
      showCostEstimate: document.getElementById("showCostEstimate"),
      showLoadingIndicator: document.getElementById("showLoadingIndicator")
    };
  }
  function updateModelOptions(provider) {
    const models = PROVIDER_MODELS[provider] || [];
    elements.model.innerHTML = models.map((m) => `<option value="${m.value}">${m.label}</option>`).join("");
  }
  function showStatus(message, type, autoHide = true) {
    if (statusAutoHideTimer) {
      clearTimeout(statusAutoHideTimer);
      statusAutoHideTimer = null;
    }
    elements.statusMessage.textContent = message;
    elements.statusMessage.className = `status-message ${type}`;
    elements.statusMessage.classList.remove("hidden");
    if (autoHide) {
      statusAutoHideTimer = window.setTimeout(() => {
        elements.statusMessage.classList.add("hidden");
        statusAutoHideTimer = null;
      }, 3e3);
    }
  }
  function setCostDisplayVisible(visible) {
    if (visible) {
      elements.costDisplay.classList.remove("hidden");
    } else {
      elements.costDisplay.classList.add("hidden");
    }
  }
  function formatTokenCount(tokenCount) {
    if (!Number.isFinite(tokenCount) || tokenCount <= 0) return "0";
    if (tokenCount >= 1e6) return `${(tokenCount / 1e6).toFixed(2)}M`;
    if (tokenCount >= 1e4) return `${(tokenCount / 1e3).toFixed(1)}K`;
    return tokenCount.toLocaleString();
  }
  function formatUsd(costUsd) {
    if (!Number.isFinite(costUsd) || costUsd <= 0) return "$0";
    const abs = Math.abs(costUsd);
    if (abs >= 10) return `$${costUsd.toFixed(2)}`;
    if (abs >= 1) return `$${costUsd.toFixed(3)}`;
    if (abs >= 0.1) return `$${costUsd.toFixed(4)}`;
    return `$${costUsd.toFixed(6)}`;
  }
  function formatTokensAndCost(tokenCount, costUsd, approx) {
    const tokens = `${formatTokenCount(tokenCount)} tokens`;
    const cost = formatUsd(costUsd);
    return `${approx ? "\u2248 " : ""}${tokens} \xB7 ${approx ? "\u2248 " : ""}${cost}`;
  }
  function renderCostDisplay() {
    const estimate = sessionCostState.lastEstimate;
    const actual = sessionCostState.lastActual;
    if (estimate) {
      elements.costEstimate.textContent = formatTokensAndCost(
        estimate.estimatedTotalTokens,
        estimate.estimatedCostUsd,
        true
      );
    } else {
      elements.costEstimate.textContent = "-";
    }
    if (actual) {
      elements.costActual.textContent = formatTokensAndCost(actual.tokensUsed, actual.costUsd, false);
    } else {
      elements.costActual.textContent = "-";
    }
    elements.costSession.textContent = formatTokensAndCost(
      sessionCostState.totals.totalTokens,
      sessionCostState.totals.totalCostUsd,
      false
    );
  }
  function showValidationResult(valid, message) {
    elements.validationResult.className = `validation-result ${valid ? "success" : "error"}`;
    elements.validationResult.querySelector(".validation-text").textContent = message;
    elements.validationResult.classList.remove("hidden");
  }
  function hideValidationResult() {
    elements.validationResult.classList.add("hidden");
  }
  function setButtonLoading(loading) {
    if (loading) {
      elements.saveBtn.classList.add("loading");
      elements.saveBtn.disabled = true;
    } else {
      elements.saveBtn.classList.remove("loading");
      elements.saveBtn.disabled = false;
    }
  }
  function setRetranslateButtonLoading(loading) {
    if (loading) {
      elements.retranslateBtn.classList.add("loading");
      elements.retranslateBtn.disabled = true;
    } else {
      elements.retranslateBtn.classList.remove("loading");
      elements.retranslateBtn.disabled = false;
    }
  }
  function updateFormState(enabled) {
    if (enabled) {
      elements.settingsForm.classList.remove("disabled");
    } else {
      elements.settingsForm.classList.add("disabled");
    }
  }
  function populateForm(settings) {
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
    setCostDisplayVisible(settings.showCostEstimate);
  }
  function getFormValues() {
    return {
      enabled: elements.enabled.checked,
      provider: elements.provider.value,
      apiKey: elements.apiKey.value,
      model: elements.model.value,
      autoTranslate: elements.autoTranslate.checked,
      preloadEnabled: elements.preloadEnabled.checked,
      showCostEstimate: elements.showCostEstimate.checked,
      showLoadingIndicator: elements.showLoadingIndicator.checked
    };
  }
  function handleProviderChange() {
    const provider = elements.provider.value;
    updateModelOptions(provider);
    hideValidationResult();
  }
  function handleApiKeyVisibilityToggle() {
    const isPassword = elements.apiKey.type === "password";
    elements.apiKey.type = isPassword ? "text" : "password";
    const eyePath = document.getElementById("eye-path");
    if (eyePath) {
      if (isPassword) {
        eyePath.setAttribute(
          "d",
          "M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"
        );
      } else {
        eyePath.setAttribute(
          "d",
          "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
        );
      }
    }
  }
  async function handleEnabledChange() {
    const enabled = elements.enabled.checked;
    updateFormState(enabled);
    try {
      await saveSettings({ enabled });
      const settings = getFormValues();
      await notifySettingsChanged(settings);
    } catch (error) {
      showStatus("\u4FDD\u5B58\u5931\u8D25", "error");
    }
  }
  async function handleAdditionalSettingChange(key) {
    const checkbox = elements[key];
    if (!checkbox) return;
    try {
      await saveSettings({ [key]: checkbox.checked });
      const settings = getFormValues();
      await notifySettingsChanged(settings);
      if (key === "showCostEstimate") {
        setCostDisplayVisible(checkbox.checked);
        if (checkbox.checked) {
          sessionCostState = await loadSessionCost();
          renderCostDisplay();
        }
      }
    } catch (error) {
      showStatus("\u4FDD\u5B58\u5931\u8D25", "error");
    }
  }
  async function handleFormSubmit(event) {
    event.preventDefault();
    hideValidationResult();
    setButtonLoading(true);
    const settings = getFormValues();
    try {
      const validation = await validateApiKey(settings.provider, settings.apiKey);
      if (validation.valid) {
        await saveSettings(settings);
        await notifySettingsChanged(settings);
        showValidationResult(true, "API Key \u9A8C\u8BC1\u6210\u529F\uFF0C\u8BBE\u7F6E\u5DF2\u4FDD\u5B58");
      } else {
        showValidationResult(false, validation.error || "\u9A8C\u8BC1\u5931\u8D25");
      }
    } catch (error) {
      showValidationResult(
        false,
        error instanceof Error ? error.message : "\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5"
      );
    } finally {
      setButtonLoading(false);
    }
  }
  function generateTaskId() {
    return `retranslate-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
  async function getActiveUdemyTabId() {
    if (typeof chrome === "undefined" || !chrome.tabs?.query) return null;
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) return null;
    if (tab.url && !/\/\/([^/]*\.)?udemy\.com\//i.test(tab.url)) {
      return null;
    }
    return tab.id;
  }
  async function handleRetranslateClick() {
    const tabId = await getActiveUdemyTabId();
    if (!tabId) {
      showStatus("\u8BF7\u5148\u6253\u5F00 Udemy \u8BFE\u7A0B\u64AD\u653E\u9875", "error");
      return;
    }
    const taskId = generateTaskId();
    currentRetranslateTaskId = taskId;
    setRetranslateButtonLoading(true);
    showStatus("\u5DF2\u53D1\u8D77\u91CD\u8BD1\u8BF7\u6C42\u2026", "info", false);
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: "RETRANSLATE_CURRENT",
        payload: { taskId }
      });
    } catch (error) {
      currentRetranslateTaskId = null;
      setRetranslateButtonLoading(false);
      showStatus("\u53D1\u9001\u5931\u8D25\uFF1A\u8BF7\u5237\u65B0\u8BFE\u7A0B\u9875\u540E\u91CD\u8BD5", "error");
    }
  }
  function setupRetranslateMessageListener() {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || typeof message !== "object") return;
      if (message.type === "COST_ESTIMATE") {
        const payload = message.payload;
        if (!payload || typeof payload !== "object") return;
        const taskId = typeof payload.taskId === "string" ? payload.taskId : "";
        const provider = payload.provider === "gemini" ? "gemini" : "openai";
        const model = typeof payload.model === "string" ? payload.model : "";
        const cueCount = typeof payload.cueCount === "number" ? payload.cueCount : 0;
        const estimatedTotalTokens = typeof payload.estimatedTotalTokens === "number" ? payload.estimatedTotalTokens : 0;
        const estimatedCostUsd = typeof payload.estimatedCostUsd === "number" ? payload.estimatedCostUsd : 0;
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
            createdAt: Date.now()
          }
        };
        if (elements.showCostEstimate.checked) {
          renderCostDisplay();
        }
        return;
      }
      if (message.type === "CACHE_HIT") {
        const payload = message.payload;
        if (!payload || typeof payload !== "object") return;
        const taskId = typeof payload.taskId === "string" ? payload.taskId : "";
        const provider = payload.provider === "gemini" ? "gemini" : "openai";
        const model = typeof payload.model === "string" ? payload.model : "";
        const tokensUsed = typeof payload.tokensUsed === "number" ? payload.tokensUsed : 0;
        const costUsd = typeof payload.costUsd === "number" ? payload.costUsd : 0;
        if (taskId && model && (tokensUsed > 0 || costUsd > 0)) {
          sessionCostState = {
            ...sessionCostState,
            lastActual: {
              taskId,
              provider,
              model,
              tokensUsed,
              costUsd,
              createdAt: Date.now()
            }
          };
          if (elements.showCostEstimate.checked) {
            renderCostDisplay();
          }
        }
        return;
      }
      if (message.type === "TRANSLATION_PROGRESS") {
        const taskId = message.payload?.taskId;
        const progress = message.payload?.progress;
        if (!currentRetranslateTaskId || taskId !== currentRetranslateTaskId) return;
        if (typeof progress !== "number") return;
        const clamped = Math.max(0, Math.min(100, Math.round(progress)));
        showStatus(`\u91CD\u8BD1\u4E2D\u2026 ${clamped}%`, "info", false);
        return;
      }
      if (message.type === "TRANSLATION_COMPLETE") {
        const payload = message.payload;
        const taskId = payload?.taskId;
        if (payload && typeof payload === "object") {
          const tokensUsed = typeof payload.tokensUsed === "number" ? payload.tokensUsed : 0;
          const costUsd = typeof payload.estimatedCost === "number" ? payload.estimatedCost : 0;
          const sessionTotalTokens = typeof payload.sessionTotalTokens === "number" ? payload.sessionTotalTokens : null;
          const sessionTotalCostUsd = typeof payload.sessionTotalCostUsd === "number" ? payload.sessionTotalCostUsd : null;
          if (typeof taskId === "string") {
            const estimateMatch = sessionCostState.lastEstimate?.taskId === taskId ? sessionCostState.lastEstimate : null;
            const fallbackProvider = estimateMatch ? estimateMatch.provider : "openai";
            const fallbackModel = estimateMatch ? estimateMatch.model : elements.model.value;
            const provider = payload.provider === "gemini" ? "gemini" : payload.provider === "openai" ? "openai" : fallbackProvider;
            const model = typeof payload.model === "string" ? payload.model : fallbackModel;
            if (model && (tokensUsed > 0 || costUsd > 0)) {
              sessionCostState = {
                ...sessionCostState,
                lastActual: {
                  taskId,
                  provider,
                  model,
                  tokensUsed,
                  costUsd,
                  createdAt: Date.now()
                }
              };
            }
          }
          if (sessionTotalTokens !== null && sessionTotalCostUsd !== null) {
            sessionCostState = {
              ...sessionCostState,
              totals: {
                totalTokens: sessionTotalTokens,
                totalCostUsd: sessionTotalCostUsd,
                updatedAt: Date.now()
              }
            };
          }
          if (elements.showCostEstimate.checked) {
            renderCostDisplay();
          }
        }
        if (!currentRetranslateTaskId) return;
        if (taskId && taskId !== currentRetranslateTaskId) return;
        const success = payload?.success === true;
        const errorText = payload?.error;
        currentRetranslateTaskId = null;
        setRetranslateButtonLoading(false);
        showStatus(success ? "\u91CD\u8BD1\u5B8C\u6210" : `\u91CD\u8BD1\u5931\u8D25\uFF1A${errorText || "\u672A\u77E5\u9519\u8BEF"}`, success ? "success" : "error");
      }
    });
  }
  async function init() {
    elements = getDOMElements();
    const settings = await loadSettings();
    populateForm(settings);
    if (settings.showCostEstimate) {
      sessionCostState = await loadSessionCost();
      renderCostDisplay();
    }
    elements.provider.addEventListener("change", handleProviderChange);
    elements.toggleApiKeyVisibility.addEventListener("click", handleApiKeyVisibilityToggle);
    elements.enabled.addEventListener("change", handleEnabledChange);
    elements.settingsForm.addEventListener("submit", handleFormSubmit);
    elements.autoTranslate.addEventListener(
      "change",
      () => handleAdditionalSettingChange("autoTranslate")
    );
    elements.preloadEnabled.addEventListener(
      "change",
      () => handleAdditionalSettingChange("preloadEnabled")
    );
    elements.showCostEstimate.addEventListener(
      "change",
      () => handleAdditionalSettingChange("showCostEstimate")
    );
    elements.showLoadingIndicator.addEventListener(
      "change",
      () => handleAdditionalSettingChange("showLoadingIndicator")
    );
    elements.retranslateBtn.addEventListener("click", handleRetranslateClick);
    setupRetranslateMessageListener();
    elements.apiKey.addEventListener("input", hideValidationResult);
  }
  document.addEventListener("DOMContentLoaded", init);
})();
//# sourceMappingURL=popup.js.map
