/**
 * Content Script Entrypoint
 *
 * Wires popup actions + background translation results to subtitle fetch/inject flow.
 *
 * Focus for Task ID: T-20251223-act-012-build-retranslate
 * - Listen for popup "RETRANSLATE_CURRENT"
 * - Trigger translation with force flag
 * - Handle cache hit / translation complete messages
 *
 * Updated for Task ID: T-20251223-act-013-build-loading-indicator
 * - Show loading indicator during translation
 * - Show success/error indicators on completion
 */
import { fetchSubtitles } from './subtitle-fetcher.js';
import { injectTrack } from './track-injector.js';
import { extractCourseInfo } from './subtitle-fetcher.js';
import { detectNextLecture } from './next-lecture-detector.js';
import { loadSettings, isEnabled } from '../storage/settings-manager.js';
import { showLoadingIndicator, showSuccessIndicator, showErrorIndicator, hideLoadingIndicator, } from './loading-indicator.js';
const LOG_PREFIX = '[UdemyCaptionPlus][Content]';
function log(...args) {
    // eslint-disable-next-line no-console
    console.log(LOG_PREFIX, ...args);
}
function generateTaskId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
let activeTranslationTaskId = null;
let lastPreloadKey = null;
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
    activeTranslationTaskId = taskId;
    // Show loading indicator if enabled
    if (settings.showLoadingIndicator) {
        showLoadingIndicator(videoDetection.video, {
            message: options.force ? '正在重新翻译…' : '字幕翻译中…',
        });
    }
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
        // Show error indicator
        if (settings.showLoadingIndicator) {
            showErrorIndicator(videoDetection.video, {
                message: '请求发送失败',
                errorDetails: String(error),
                onRetry: () => requestTranslation(options),
            });
        }
    }
}
async function requestPreloadNextLecture() {
    const settings = await loadSettings();
    if (!isEnabled(settings) || !settings.preloadEnabled)
        return;
    const courseInfo = extractCourseInfo();
    if (!courseInfo)
        return;
    const courseId = courseInfo.courseId || courseInfo.courseSlug || 'unknown-course';
    const currentLectureId = courseInfo.lectureId;
    const result = await detectNextLecture({
        courseId,
        courseSlug: courseInfo.courseSlug,
        currentLectureId,
    });
    if (!result.nextLectureId)
        return;
    const preloadKey = `${courseId}-${result.nextLectureId}`;
    if (preloadKey === lastPreloadKey)
        return;
    lastPreloadKey = preloadKey;
    const message = {
        type: 'PRELOAD_NEXT',
        payload: {
            courseId,
            nextLectureId: result.nextLectureId,
            nextLectureTitle: result.nextLectureTitle || '',
            courseName: courseInfo.courseTitle || '',
            sectionName: courseInfo.sectionTitle || '',
        },
    };
    try {
        await chrome.runtime.sendMessage(message);
    }
    catch (error) {
        log('Failed to send preload request:', error);
    }
}
async function cancelActiveTranslation() {
    if (!activeTranslationTaskId)
        return;
    const taskId = activeTranslationTaskId;
    activeTranslationTaskId = null;
    // Hide loading indicator when cancelling
    const video = document.querySelector('video');
    if (video instanceof HTMLVideoElement) {
        hideLoadingIndicator(video);
    }
    try {
        await chrome.runtime.sendMessage({ type: 'CANCEL_TRANSLATION', payload: { taskId } });
    }
    catch {
        // ignore
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
            if (message.payload?.taskId && message.payload.taskId === activeTranslationTaskId) {
                activeTranslationTaskId = null;
            }
            const translatedVTT = message.payload?.translatedVTT;
            if (typeof translatedVTT === 'string' && translatedVTT.trim().startsWith('WEBVTT')) {
                const video = document.querySelector('video');
                if (video instanceof HTMLVideoElement) {
                    injectTrack(video, translatedVTT, { activate: true });
                    // Show success indicator (cache hit)
                    loadSettings().then((settings) => {
                        if (settings.showLoadingIndicator) {
                            showSuccessIndicator(video, { message: '缓存命中' });
                        }
                    });
                }
            }
            return;
        }
        if (message.type === 'TRANSLATION_COMPLETE') {
            if (message.payload?.taskId && message.payload.taskId === activeTranslationTaskId) {
                activeTranslationTaskId = null;
            }
            const translatedVTT = message.payload?.translatedVTT;
            const video = document.querySelector('video');
            if (message.payload?.success === true && typeof translatedVTT === 'string') {
                if (video instanceof HTMLVideoElement) {
                    injectTrack(video, translatedVTT, { activate: true });
                    // Show success indicator
                    loadSettings().then((settings) => {
                        if (settings.showLoadingIndicator) {
                            showSuccessIndicator(video, { message: '翻译完成' });
                        }
                    });
                }
            }
            else {
                const errorMsg = message.payload?.error || 'unknown error';
                log('Translation failed:', errorMsg);
                // Show error indicator with retry
                if (video instanceof HTMLVideoElement) {
                    loadSettings().then((settings) => {
                        if (settings.showLoadingIndicator) {
                            showErrorIndicator(video, {
                                message: '翻译失败',
                                errorDetails: String(errorMsg),
                                onRetry: () => requestTranslation({ force: true }),
                            });
                        }
                    });
                }
            }
            return;
        }
        return;
    });
}
async function autoTranslateIfEnabled() {
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
function getLectureIdFromUrl() {
    return window.location.pathname.match(/\/learn\/lecture\/(\d+)/)?.[1] ?? null;
}
function watchLectureNavigation() {
    let lastLectureId = getLectureIdFromUrl();
    setInterval(() => {
        const currentLectureId = getLectureIdFromUrl();
        if (!currentLectureId || currentLectureId === lastLectureId)
            return;
        lastLectureId = currentLectureId;
        lastPreloadKey = null;
        cancelActiveTranslation()
            .then(() => autoTranslateIfEnabled())
            .then(() => requestPreloadNextLecture())
            .catch((error) => log('Lecture navigation handler failed:', error));
    }, 1000);
}
function init() {
    setupMessageListeners();
    watchLectureNavigation();
    void autoTranslateIfEnabled();
    void requestPreloadNextLecture();
}
init();
//# sourceMappingURL=content-script.js.map
