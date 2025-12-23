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
import { checkSubtitleVersion } from '../services/version-checker';
import { translateVTT } from '../services/translator';
import { calculateHash } from '../utils/hash';
const activeControllers = new Map();
function sendToTab(tabId, message) {
    if (typeof chrome === 'undefined' || !chrome.tabs?.sendMessage)
        return;
    chrome.tabs.sendMessage(tabId, message).catch(() => { });
}
function sendToPopup(message) {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage)
        return;
    chrome.runtime.sendMessage({ ...message, meta: { ...(message.meta || {}), target: 'popup' } }).catch(() => { });
}
function sendProgress(tabId, taskId, progress) {
    const payload = { taskId, progress };
    sendToTab(tabId, { type: 'TRANSLATION_PROGRESS', payload, meta: { target: 'content' } });
    sendToPopup({ type: 'TRANSLATION_PROGRESS', payload });
}
function sendComplete(tabId, payload) {
    sendToTab(tabId, { type: 'TRANSLATION_COMPLETE', payload, meta: { target: 'content' } });
    sendToPopup({ type: 'TRANSLATION_COMPLETE', payload });
}
async function handleTranslateSubtitle(sender, payload) {
    const tabId = sender.tab?.id;
    if (!tabId) {
        return;
    }
    const taskId = payload?.taskId || `translate-${Date.now()}`;
    const vttContent = payload?.vttContent;
    const courseId = payload?.courseId;
    const lectureId = payload?.lectureId;
    const force = payload?.force === true;
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
    const originalHash = payload?.originalHash || (await calculateHash(vttContent));
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
        sendToPopup({ type: 'CACHE_HIT', payload: { taskId } });
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
    if (result.success && result.translatedVTT) {
        await subtitleCache.set({
            courseId,
            lectureId,
            courseName: payload?.courseName || '',
            lectureName: payload?.lectureName || payload?.lectureId || '',
            originalHash,
            translatedVTT: result.translatedVTT,
            provider,
            model,
            tokensUsed: result.tokensUsed ?? 0,
            estimatedCost: result.estimatedCost ?? 0,
        });
        sendComplete(tabId, {
            taskId,
            success: true,
            translatedVTT: result.translatedVTT,
            tokensUsed: result.tokensUsed ?? 0,
            estimatedCost: result.estimatedCost ?? 0,
        });
        return;
    }
    sendComplete(tabId, {
        taskId,
        success: false,
        error: result.error || 'Translation failed',
        tokensUsed: result.tokensUsed ?? 0,
        estimatedCost: result.estimatedCost ?? 0,
    });
}
function handleCancel(taskId) {
    if (!taskId)
        return;
    const controller = activeControllers.get(taskId);
    if (!controller)
        return;
    controller.abort();
    activeControllers.delete(taskId);
}
function initMessageHandler() {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage)
        return;
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!message || typeof message !== 'object' || typeof message.type !== 'string')
            return;
        // Ignore popup-targeted broadcasts
        if (message.meta?.target === 'popup')
            return;
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
        if (message.type === 'CANCEL_TRANSLATION') {
            handleCancel(message.payload?.taskId);
            sendResponse?.({ ok: true });
            return;
        }
        return;
    });
}
initMessageHandler();
//# sourceMappingURL=service-worker.js.map