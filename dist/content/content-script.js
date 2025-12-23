/**
 * Content Script Entrypoint
 *
 * Wires popup actions + background translation results to subtitle fetch/inject flow.
 *
 * Focus for Task ID: T-20251223-act-012-build-retranslate
 * - Listen for popup "RETRANSLATE_CURRENT"
 * - Trigger translation with force flag
 * - Handle cache hit / translation complete messages
 */
import { fetchSubtitles } from './subtitle-fetcher';
import { injectTrack } from './track-injector';
import { loadSettings, isEnabled } from '../storage/settings-manager';
const LOG_PREFIX = '[UdemyCaptionPlus][Content]';
function log(...args) {
    // eslint-disable-next-line no-console
    console.log(LOG_PREFIX, ...args);
}
function generateTaskId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
async function requestTranslation(options) {
    const settings = await loadSettings();
    if (!isEnabled(settings)) {
        log('Translation not enabled or not configured');
        return;
    }
    const { videoDetection, vttContent } = await fetchSubtitles();
    if (!videoDetection.found || !videoDetection.video) {
        log('Video not found');
        return;
    }
    if (!videoDetection.courseInfo) {
        log('Course info not available');
        return;
    }
    if (!vttContent) {
        log('No VTT content fetched');
        return;
    }
    const courseInfo = videoDetection.courseInfo;
    const taskId = options.taskId ?? generateTaskId(options.force ? 'retranslate' : 'translate');
    const courseId = courseInfo.courseId || courseInfo.courseSlug || 'unknown-course';
    const lectureId = courseInfo.lectureId || 'unknown-lecture';
    const message = {
        type: 'TRANSLATE_SUBTITLE',
        payload: {
            taskId,
            vttContent: vttContent.content,
            originalHash: vttContent.hash,
            courseId,
            lectureId,
            courseName: courseInfo.courseTitle || '',
            sectionName: courseInfo.sectionTitle || '',
            lectureName: courseInfo.lectureTitle || '',
            provider: settings.provider,
            model: settings.model,
            force: options.force,
        },
    };
    try {
        await chrome.runtime.sendMessage(message);
    }
    catch (error) {
        log('Failed to send translation request:', error);
    }
}
function setupMessageListeners() {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage)
        return;
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (!message || typeof message !== 'object')
            return;
        // Ignore popup-targeted broadcasts
        if (message.meta?.target === 'popup')
            return;
        if (message.type === 'RETRANSLATE_CURRENT') {
            const taskId = message.payload?.taskId;
            requestTranslation({ force: true, taskId })
                .then(() => sendResponse?.({ ok: true }))
                .catch((error) => sendResponse?.({ ok: false, error: String(error) }));
            return true;
        }
        if (message.type === 'CACHE_HIT') {
            const translatedVTT = message.payload?.translatedVTT;
            if (typeof translatedVTT === 'string' && translatedVTT.trim().startsWith('WEBVTT')) {
                const video = document.querySelector('video');
                if (video instanceof HTMLVideoElement) {
                    injectTrack(video, translatedVTT, { activate: true });
                }
            }
            return;
        }
        if (message.type === 'TRANSLATION_COMPLETE') {
            const translatedVTT = message.payload?.translatedVTT;
            if (message.payload?.success === true && typeof translatedVTT === 'string') {
                const video = document.querySelector('video');
                if (video instanceof HTMLVideoElement) {
                    injectTrack(video, translatedVTT, { activate: true });
                }
            }
            else {
                log('Translation failed:', message.payload?.error || 'unknown error');
            }
            return;
        }
        return;
    });
}
async function autoTranslateOnLoad() {
    try {
        const settings = await loadSettings();
        if (!isEnabled(settings) || !settings.autoTranslate)
            return;
        await requestTranslation({ force: false });
    }
    catch (error) {
        log('Auto-translate init failed:', error);
    }
}
function init() {
    setupMessageListeners();
    void autoTranslateOnLoad();
}
init();
//# sourceMappingURL=content-script.js.map