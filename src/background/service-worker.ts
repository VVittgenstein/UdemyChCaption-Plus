/**
 * Service Worker Entrypoint (Manifest V3)
 *
 * Focus for Task ID: T-20251223-act-012-build-retranslate
 * - Check cached subtitle version by originalHash
 * - Force retranslation when requested
 * - Send progress + completion updates (for Popup UI)
 */

import { loadSettings, isEnabled } from '../storage/settings-manager';
import { subtitleCache } from '../storage/subtitle-cache';
import { addSessionCost, updateSessionCostState } from '../storage/session-cost';
import { checkSubtitleVersion } from '../services/version-checker';
import { estimateTranslationCost, translateVTT } from '../services/translator';
import { preloadLecture } from '../services/preloader';
import { calculateHash } from '../utils/hash';

type AnyMessage = { type: string; payload?: any; meta?: any };

const activeControllers = new Map<string, AbortController>();
const activePreloadByTab = new Map<
  number,
  { controller: AbortController; courseId: string; lectureId: string }
>();

function sendToTab(tabId: number, message: AnyMessage): void {
  if (typeof chrome === 'undefined' || !chrome.tabs?.sendMessage) return;
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

function sendToPopup(message: AnyMessage): void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
  chrome.runtime.sendMessage({ ...message, meta: { ...(message.meta || {}), target: 'popup' } }).catch(() => {});
}

function sendProgress(tabId: number, taskId: string, progress: number): void {
  const payload = { taskId, progress };
  sendToTab(tabId, { type: 'TRANSLATION_PROGRESS', payload, meta: { target: 'content' } });
  sendToPopup({ type: 'TRANSLATION_PROGRESS', payload });
}

function sendCostEstimate(tabId: number, payload: any): void {
  sendToTab(tabId, { type: 'COST_ESTIMATE', payload, meta: { target: 'content' } });
  sendToPopup({ type: 'COST_ESTIMATE', payload });
}

function sendComplete(tabId: number, payload: any): void {
  sendToTab(tabId, { type: 'TRANSLATION_COMPLETE', payload, meta: { target: 'content' } });
  sendToPopup({ type: 'TRANSLATION_COMPLETE', payload });
}

async function handleTranslateSubtitle(sender: chrome.runtime.MessageSender, payload: any): Promise<void> {
  const tabId = sender.tab?.id;
  if (!tabId) {
    return;
  }

  const taskId: string = payload?.taskId || `translate-${Date.now()}`;
  const vttContent: string | undefined = payload?.vttContent;
  const courseId: string | undefined = payload?.courseId;
  const lectureId: string | undefined = payload?.lectureId;
  const force: boolean = payload?.force === true;

  if (!vttContent || !courseId || !lectureId) {
    sendComplete(tabId, { taskId, success: false, error: 'Missing required fields' });
    return;
  }

  const settings = await loadSettings();
  if (!isEnabled(settings)) {
    sendComplete(tabId, { taskId, success: false, error: 'Translation is disabled or not configured' });
    return;
  }

  const provider = payload?.provider || settings.provider;
  const model = payload?.model || settings.model;
  const apiKey = settings.apiKey;

  const originalHash: string = payload?.originalHash || (await calculateHash(vttContent));

  const version = await checkSubtitleVersion({
    courseId,
    lectureId,
    originalHash,
    force,
  });

  if (version.decision === 'use_cache' && version.cachedEntry?.translatedVTT) {
    sendToTab(tabId, {
      type: 'CACHE_HIT',
      payload: { taskId, translatedVTT: version.cachedEntry.translatedVTT },
      meta: { target: 'content' },
    });
    // Popup UI: best-effort notification (no auto-hide here; Popup decides)
    sendToPopup({
      type: 'CACHE_HIT',
      payload: {
        taskId,
        provider: version.cachedEntry.provider,
        model: version.cachedEntry.model,
        tokensUsed: version.cachedEntry.tokensUsed,
        costUsd: version.cachedEntry.estimatedCost,
        fromCache: true,
      },
    });
    return;
  }

  // Cancel any existing task with the same id
  const existing = activeControllers.get(taskId);
  if (existing) {
    existing.abort();
    activeControllers.delete(taskId);
  }

  const controller = new AbortController();
  activeControllers.set(taskId, controller);

  if (settings.showCostEstimate) {
    const estimate = estimateTranslationCost(vttContent, provider, model);
    const estimatePayload = {
      taskId,
      provider,
      model,
      cueCount: estimate.cueCount,
      estimatedPromptTokens: estimate.estimatedPromptTokens,
      estimatedOutputTokens: estimate.estimatedOutputTokens,
      estimatedTotalTokens: estimate.estimatedTotalTokens,
      estimatedCostUsd: estimate.estimatedCost,
      estimatedBatches: estimate.estimatedBatches,
    };

    sendCostEstimate(tabId, estimatePayload);
    await updateSessionCostState({
      lastEstimate: {
        taskId,
        provider,
        model,
        cueCount: estimate.cueCount,
        estimatedTotalTokens: estimate.estimatedTotalTokens,
        estimatedCostUsd: estimate.estimatedCost,
        createdAt: Date.now(),
      },
    });
  }

  sendProgress(tabId, taskId, 0);

  const result = await translateVTT(vttContent, {
    provider,
    apiKey,
    model,
    courseContext: {
      courseName: payload?.courseName,
      sectionName: payload?.sectionName,
      lectureName: payload?.lectureName,
    },
    signal: controller.signal,
    onProgress: (progress) => sendProgress(tabId, taskId, progress),
  });

  activeControllers.delete(taskId);

  const actualTokens = typeof result.tokensUsed === 'number' ? result.tokensUsed : 0;
  const actualCostUsd = typeof result.estimatedCost === 'number' ? result.estimatedCost : 0;

  if (result.success && result.translatedVTT) {
    const sessionState = await addSessionCost(actualTokens, actualCostUsd);
    await updateSessionCostState({
      lastActual: {
        taskId,
        provider,
        model,
        tokensUsed: actualTokens,
        costUsd: actualCostUsd,
        createdAt: Date.now(),
      },
    });

    await subtitleCache.set({
      courseId,
      lectureId,
      courseName: payload?.courseName || '',
      lectureName: payload?.lectureName || payload?.lectureId || '',
      originalHash,
      translatedVTT: result.translatedVTT,
      provider,
      model,
      tokensUsed: actualTokens,
      estimatedCost: actualCostUsd,
    });

    sendComplete(tabId, {
      taskId,
      success: true,
      translatedVTT: result.translatedVTT,
      provider,
      model,
      tokensUsed: actualTokens,
      estimatedCost: actualCostUsd,
      sessionTotalTokens: sessionState.totals.totalTokens,
      sessionTotalCostUsd: sessionState.totals.totalCostUsd,
    });
    return;
  }

  if (actualTokens > 0 || actualCostUsd > 0) {
    const sessionState = await addSessionCost(actualTokens, actualCostUsd);
    await updateSessionCostState({
      lastActual: {
        taskId,
        provider,
        model,
        tokensUsed: actualTokens,
        costUsd: actualCostUsd,
        createdAt: Date.now(),
      },
    });

    sendComplete(tabId, {
      taskId,
      success: false,
      error: result.error || 'Translation failed',
      provider,
      model,
      tokensUsed: actualTokens,
      estimatedCost: actualCostUsd,
      sessionTotalTokens: sessionState.totals.totalTokens,
      sessionTotalCostUsd: sessionState.totals.totalCostUsd,
    });
    return;
  }

  sendComplete(tabId, {
    taskId,
    success: false,
    error: result.error || 'Translation failed',
    tokensUsed: 0,
    estimatedCost: 0,
  });
}

function handleCancel(taskId: string | undefined): void {
  if (!taskId) return;
  const controller = activeControllers.get(taskId);
  if (!controller) return;
  controller.abort();
  activeControllers.delete(taskId);
}

/** VTT fetch timeout (ms) */
const VTT_FETCH_TIMEOUT = 10000;

/**
 * Handle FETCH_VTT message from content script
 * Background script can bypass CORS restrictions with proper host_permissions
 * Note: Uses Promise chains instead of async/await to ensure sendResponse works correctly
 */
function handleFetchVTT(
  payload: { url: string },
  sendResponse: (response: { ok: boolean; content?: string; error?: string }) => void
): void {
  const url = payload?.url;

  if (!url) {
    sendResponse({ ok: false, error: 'No URL provided' });
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VTT_FETCH_TIMEOUT);

  fetch(url, {
    method: 'GET',
    credentials: 'include',
    signal: controller.signal,
  })
    .then((response) => {
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.text();
    })
    .then((content) => {
      sendResponse({ ok: true, content });
    })
    .catch((e) => {
      clearTimeout(timeoutId);
      const error = e instanceof Error ? e.message : 'Unknown error';
      if (error.includes('aborted')) {
        sendResponse({ ok: false, error: 'Request timeout' });
        return;
      }
      sendResponse({ ok: false, error });
    });
}

async function handlePreloadNext(sender: chrome.runtime.MessageSender, payload: any): Promise<void> {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  const courseId: string | undefined = payload?.courseId;
  const nextLectureId: string | undefined = payload?.nextLectureId;
  if (!courseId || !nextLectureId) return;

  const settings = await loadSettings();
  if (!isEnabled(settings) || !settings.preloadEnabled) return;

  const existing = activePreloadByTab.get(tabId);
  if (existing && existing.courseId === courseId && existing.lectureId === nextLectureId) {
    return;
  }
  if (existing) {
    existing.controller.abort();
    activePreloadByTab.delete(tabId);
  }

  const controller = new AbortController();
  activePreloadByTab.set(tabId, { controller, courseId, lectureId: nextLectureId });

  try {
    await preloadLecture({
      courseId,
      lectureId: nextLectureId,
      courseName: payload?.courseName,
      sectionName: payload?.sectionName,
      lectureName: payload?.nextLectureTitle,
      signal: controller.signal,
    });
  } finally {
    const current = activePreloadByTab.get(tabId);
    if (current?.controller === controller) {
      activePreloadByTab.delete(tabId);
    }
  }
}

function initMessageHandler(): void {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;

  chrome.runtime.onMessage.addListener((message: AnyMessage, sender, sendResponse): void | boolean => {
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') return;

    // Ignore popup-targeted broadcasts
    if (message.meta?.target === 'popup') return;

    if (message.type === 'TRANSLATE_SUBTITLE') {
      handleTranslateSubtitle(sender, message.payload)
        .then(() => sendResponse?.({ ok: true }))
        .catch((error) => sendResponse?.({ ok: false, error: String(error) }));
      return true;
    }

    if (message.type === 'GET_SETTINGS') {
      loadSettings()
        .then((settings) => sendResponse?.({ ok: true, settings }))
        .catch((error) => sendResponse?.({ ok: false, error: String(error) }));
      return true;
    }

    if (message.type === 'PRELOAD_NEXT') {
      handlePreloadNext(sender, message.payload)
        .then(() => sendResponse?.({ ok: true }))
        .catch((error) => sendResponse?.({ ok: false, error: String(error) }));
      return true;
    }

    if (message.type === 'CANCEL_TRANSLATION') {
      handleCancel(message.payload?.taskId);
      sendResponse?.({ ok: true });
      return;
    }

    if (message.type === 'FETCH_VTT') {
      handleFetchVTT(message.payload, sendResponse);
      return true;
    }

    return;
  });
}

initMessageHandler();
