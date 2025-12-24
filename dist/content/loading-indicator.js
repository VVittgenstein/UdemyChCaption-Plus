/**
 * Loading Indicator Module
 *
 * Displays translation status overlay on video player.
 * Follows Udemy's visual style with purple accent (#a435f0).
 *
 * Task ID: T-20251223-act-013-build-loading-indicator
 */
// ============================================
// Constants
// ============================================
const INDICATOR_ID = 'udemy-caption-plus-loading-indicator';
const INDICATOR_CLASS = 'ucp-loading-indicator';
/** CSS for the loading indicator - matches Udemy's style */
const INDICATOR_STYLES = `
.${INDICATOR_CLASS} {
  position: absolute;
  z-index: 100000;
  padding: 10px 16px;
  border-radius: 6px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: opacity 0.3s ease, transform 0.3s ease;
  pointer-events: auto;
  max-width: 320px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.${INDICATOR_CLASS}--hidden {
  opacity: 0;
  pointer-events: none;
  transform: translateY(-10px);
}

/* Position variants */
.${INDICATOR_CLASS}--top-left {
  top: 12px;
  left: 12px;
}

.${INDICATOR_CLASS}--top-right {
  top: 12px;
  right: 12px;
}

.${INDICATOR_CLASS}--bottom-left {
  bottom: 60px;
  left: 12px;
}

.${INDICATOR_CLASS}--bottom-right {
  bottom: 60px;
  right: 12px;
}

.${INDICATOR_CLASS}--center {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.${INDICATOR_CLASS}--center.${INDICATOR_CLASS}--hidden {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.95);
}

/* Status variants */
.${INDICATOR_CLASS}--loading {
  background: rgba(164, 53, 240, 0.95);
  color: #fff;
}

.${INDICATOR_CLASS}--success {
  background: rgba(46, 125, 50, 0.95);
  color: #fff;
}

.${INDICATOR_CLASS}--error {
  background: rgba(198, 40, 40, 0.95);
  color: #fff;
  flex-direction: column;
  align-items: flex-start;
}

/* Spinner animation */
.${INDICATOR_CLASS}__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: ucp-spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes ucp-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Check icon for success */
.${INDICATOR_CLASS}__check {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.${INDICATOR_CLASS}__check::after {
  content: "";
  width: 4px;
  height: 8px;
  border: solid #2e7d32;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
  margin-top: -2px;
}

/* Error icon */
.${INDICATOR_CLASS}__error-icon {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.${INDICATOR_CLASS}__error-icon::after {
  content: "!";
  color: #c62828;
  font-size: 12px;
  font-weight: bold;
}

/* Message text */
.${INDICATOR_CLASS}__message {
  flex: 1;
}

/* Error details */
.${INDICATOR_CLASS}__details {
  font-size: 11px;
  opacity: 0.85;
  margin-top: 4px;
  word-break: break-word;
}

/* Error actions row */
.${INDICATOR_CLASS}__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  width: 100%;
}

/* Retry button */
.${INDICATOR_CLASS}__retry-btn {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.${INDICATOR_CLASS}__retry-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.${INDICATOR_CLASS}__retry-btn:active {
  transform: scale(0.98);
}

/* Dismiss button */
.${INDICATOR_CLASS}__dismiss-btn {
  padding: 6px 12px;
  font-size: 12px;
  background: transparent;
  color: rgba(255, 255, 255, 0.8);
  border: none;
  cursor: pointer;
  transition: color 0.2s;
}

.${INDICATOR_CLASS}__dismiss-btn:hover {
  color: #fff;
}
`;
// ============================================
// State Management
// ============================================
/** WeakMap to track indicator state per video element */
const indicatorStates = new WeakMap();
/** WeakMap to track indicator elements per video element */
const indicatorElements = new WeakMap();
/** WeakMap to track auto-hide timers */
const autoHideTimers = new WeakMap();
/** Style element reference */
let styleElement = null;
// ============================================
// Style Injection
// ============================================
/**
 * Injects CSS styles for the loading indicator into the document
 */
function ensureStylesInjected() {
    if (styleElement && document.head.contains(styleElement)) {
        return;
    }
    styleElement = document.createElement('style');
    styleElement.id = `${INDICATOR_ID}-styles`;
    styleElement.textContent = INDICATOR_STYLES;
    document.head.appendChild(styleElement);
}
// ============================================
// DOM Helpers
// ============================================
/**
 * Creates the indicator DOM element
 */
function createIndicatorElement(state, position) {
    const container = document.createElement('div');
    // Note: No ID is assigned to avoid duplicate IDs when multiple videos exist on the page.
    // Indicators are tracked per-video via WeakMap and styled via classes.
    container.className = `${INDICATOR_CLASS} ${INDICATOR_CLASS}--${position}`;
    updateIndicatorDOM(container, state);
    return container;
}
/**
 * Updates the indicator DOM based on current state
 */
function updateIndicatorDOM(container, state) {
    const { status, message, errorDetails, onRetry } = state;
    // Update status class
    container.classList.remove(`${INDICATOR_CLASS}--loading`, `${INDICATOR_CLASS}--success`, `${INDICATOR_CLASS}--error`, `${INDICATOR_CLASS}--hidden`);
    if (status === 'hidden') {
        container.classList.add(`${INDICATOR_CLASS}--hidden`);
        return;
    }
    container.classList.add(`${INDICATOR_CLASS}--${status}`);
    // Build content based on status
    let html = '';
    if (status === 'loading') {
        html = `
      <div class="${INDICATOR_CLASS}__spinner"></div>
      <span class="${INDICATOR_CLASS}__message">${escapeHtml(message)}</span>
    `;
    }
    else if (status === 'success') {
        html = `
      <div class="${INDICATOR_CLASS}__check"></div>
      <span class="${INDICATOR_CLASS}__message">${escapeHtml(message)}</span>
    `;
    }
    else if (status === 'error') {
        html = `
      <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
        <div class="${INDICATOR_CLASS}__error-icon"></div>
        <span class="${INDICATOR_CLASS}__message">${escapeHtml(message)}</span>
      </div>
      ${errorDetails ? `<div class="${INDICATOR_CLASS}__details">${escapeHtml(errorDetails)}</div>` : ''}
      <div class="${INDICATOR_CLASS}__actions">
        ${onRetry ? `<button class="${INDICATOR_CLASS}__retry-btn" type="button">重试</button>` : ''}
        <button class="${INDICATOR_CLASS}__dismiss-btn" type="button">关闭</button>
      </div>
    `;
    }
    container.innerHTML = html;
    // Attach event listeners
    if (status === 'error') {
        const retryBtn = container.querySelector(`.${INDICATOR_CLASS}__retry-btn`);
        const dismissBtn = container.querySelector(`.${INDICATOR_CLASS}__dismiss-btn`);
        if (retryBtn && onRetry) {
            retryBtn.addEventListener('click', () => {
                onRetry();
            });
        }
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => {
                container.classList.add(`${INDICATOR_CLASS}--hidden`);
            });
        }
    }
}
/**
 * Escapes HTML special characters to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
/**
 * Finds the video container element for positioning
 */
function findVideoContainer(video) {
    // Try common Udemy video container selectors
    const selectors = [
        '[data-purpose="video-player"]',
        '[class*="video-player--container--"]',
        '.vjs-tech',
        '.video-js',
    ];
    for (const selector of selectors) {
        const container = video.closest(selector);
        if (container instanceof HTMLElement) {
            return container;
        }
    }
    // Fallback to video's parent
    return video.parentElement || document.body;
}
// ============================================
// Public API
// ============================================
/**
 * Shows the loading indicator on a video element
 *
 * @param video - The video element to attach the indicator to
 * @param options - Display options
 */
export function showLoadingIndicator(video, options = {}) {
    const { message = '字幕翻译中…', position = 'top-right', autoHideDelay = 0, } = options;
    ensureStylesInjected();
    const state = {
        status: 'loading',
        message,
    };
    indicatorStates.set(video, state);
    // Clear any existing auto-hide timer
    const existingTimer = autoHideTimers.get(video);
    if (existingTimer) {
        clearTimeout(existingTimer);
        autoHideTimers.delete(video);
    }
    // Get or create indicator element
    let indicator = indicatorElements.get(video);
    const container = findVideoContainer(video);
    if (!indicator || !container.contains(indicator)) {
        indicator = createIndicatorElement(state, position);
        indicatorElements.set(video, indicator);
        // Ensure container has relative positioning for absolute child
        const containerStyle = window.getComputedStyle(container);
        if (containerStyle.position === 'static') {
            container.style.position = 'relative';
        }
        container.appendChild(indicator);
        // Trigger reflow for animation
        void indicator.offsetHeight;
    }
    else {
        // Update position class
        indicator.className = `${INDICATOR_CLASS} ${INDICATOR_CLASS}--${position}`;
        updateIndicatorDOM(indicator, state);
    }
    // Set up auto-hide if specified
    if (autoHideDelay > 0) {
        const timer = setTimeout(() => {
            hideLoadingIndicator(video);
        }, autoHideDelay);
        autoHideTimers.set(video, timer);
    }
}
/**
 * Shows a success message on the indicator
 *
 * @param video - The video element
 * @param options - Display options
 */
export function showSuccessIndicator(video, options = {}) {
    const { message = '翻译完成', position = 'top-right', autoHideDelay = 3000, } = options;
    ensureStylesInjected();
    const state = {
        status: 'success',
        message,
    };
    indicatorStates.set(video, state);
    // Clear any existing auto-hide timer
    const existingTimer = autoHideTimers.get(video);
    if (existingTimer) {
        clearTimeout(existingTimer);
        autoHideTimers.delete(video);
    }
    // Get or create indicator element
    let indicator = indicatorElements.get(video);
    const container = findVideoContainer(video);
    if (!indicator || !container.contains(indicator)) {
        indicator = createIndicatorElement(state, position);
        indicatorElements.set(video, indicator);
        const containerStyle = window.getComputedStyle(container);
        if (containerStyle.position === 'static') {
            container.style.position = 'relative';
        }
        container.appendChild(indicator);
        void indicator.offsetHeight;
    }
    else {
        indicator.className = `${INDICATOR_CLASS} ${INDICATOR_CLASS}--${position}`;
        updateIndicatorDOM(indicator, state);
    }
    // Set up auto-hide
    if (autoHideDelay > 0) {
        const timer = setTimeout(() => {
            hideLoadingIndicator(video);
        }, autoHideDelay);
        autoHideTimers.set(video, timer);
    }
}
/**
 * Shows an error message on the indicator with optional retry button
 *
 * @param video - The video element
 * @param options - Display options including error details and retry callback
 */
export function showErrorIndicator(video, options = {}) {
    const { message = '翻译失败', errorDetails, onRetry, position = 'top-right', autoHideDelay = 0, } = options;
    ensureStylesInjected();
    const state = {
        status: 'error',
        message,
        errorDetails,
        onRetry,
    };
    indicatorStates.set(video, state);
    // Clear any existing auto-hide timer
    const existingTimer = autoHideTimers.get(video);
    if (existingTimer) {
        clearTimeout(existingTimer);
        autoHideTimers.delete(video);
    }
    // Get or create indicator element
    let indicator = indicatorElements.get(video);
    const container = findVideoContainer(video);
    if (!indicator || !container.contains(indicator)) {
        indicator = createIndicatorElement(state, position);
        indicatorElements.set(video, indicator);
        const containerStyle = window.getComputedStyle(container);
        if (containerStyle.position === 'static') {
            container.style.position = 'relative';
        }
        container.appendChild(indicator);
        void indicator.offsetHeight;
    }
    else {
        indicator.className = `${INDICATOR_CLASS} ${INDICATOR_CLASS}--${position}`;
        updateIndicatorDOM(indicator, state);
    }
    // Set up auto-hide if specified (usually 0 for errors to require user action)
    if (autoHideDelay > 0) {
        const timer = setTimeout(() => {
            hideLoadingIndicator(video);
        }, autoHideDelay);
        autoHideTimers.set(video, timer);
    }
}
/**
 * Hides the loading indicator for a video element
 *
 * @param video - The video element
 */
export function hideLoadingIndicator(video) {
    const indicator = indicatorElements.get(video);
    if (!indicator)
        return;
    // Clear any auto-hide timer
    const timer = autoHideTimers.get(video);
    if (timer) {
        clearTimeout(timer);
        autoHideTimers.delete(video);
    }
    // Animate out
    indicator.classList.add(`${INDICATOR_CLASS}--hidden`);
    // Update state
    const state = indicatorStates.get(video);
    if (state) {
        state.status = 'hidden';
    }
}
/**
 * Removes the loading indicator element from DOM
 *
 * @param video - The video element
 */
export function removeLoadingIndicator(video) {
    const indicator = indicatorElements.get(video);
    if (indicator) {
        indicator.remove();
        indicatorElements.delete(video);
    }
    indicatorStates.delete(video);
    const timer = autoHideTimers.get(video);
    if (timer) {
        clearTimeout(timer);
        autoHideTimers.delete(video);
    }
}
/**
 * Gets the current indicator status for a video
 *
 * @param video - The video element
 * @returns Current status or 'hidden' if no indicator exists
 */
export function getIndicatorStatus(video) {
    const state = indicatorStates.get(video);
    return state?.status ?? 'hidden';
}
/**
 * Checks if an indicator is currently visible
 *
 * @param video - The video element
 * @returns True if indicator is visible (not hidden)
 */
export function isIndicatorVisible(video) {
    const status = getIndicatorStatus(video);
    return status !== 'hidden';
}
/**
 * Updates the loading message while keeping the loading state
 *
 * @param video - The video element
 * @param message - New message to display
 */
export function updateLoadingMessage(video, message) {
    const state = indicatorStates.get(video);
    if (!state || state.status !== 'loading')
        return;
    state.message = message;
    const indicator = indicatorElements.get(video);
    if (indicator) {
        updateIndicatorDOM(indicator, state);
    }
}
// ============================================
// Class-based API
// ============================================
/**
 * Class-based wrapper for managing loading indicators
 */
export class LoadingIndicator {
    constructor(video, options = {}) {
        this.video = video;
        this.defaultPosition = options.position ?? 'top-right';
    }
    /**
     * Shows loading state
     */
    showLoading(message) {
        showLoadingIndicator(this.video, {
            message,
            position: this.defaultPosition,
        });
    }
    /**
     * Shows success state with auto-hide
     */
    showSuccess(message, autoHideDelay) {
        showSuccessIndicator(this.video, {
            message,
            position: this.defaultPosition,
            autoHideDelay,
        });
    }
    /**
     * Shows error state with optional retry
     */
    showError(message, errorDetails, onRetry) {
        showErrorIndicator(this.video, {
            message,
            errorDetails,
            onRetry,
            position: this.defaultPosition,
        });
    }
    /**
     * Hides the indicator
     */
    hide() {
        hideLoadingIndicator(this.video);
    }
    /**
     * Removes the indicator from DOM
     */
    remove() {
        removeLoadingIndicator(this.video);
    }
    /**
     * Gets current status
     */
    getStatus() {
        return getIndicatorStatus(this.video);
    }
    /**
     * Checks if visible
     */
    isVisible() {
        return isIndicatorVisible(this.video);
    }
    /**
     * Updates loading message
     */
    updateMessage(message) {
        updateLoadingMessage(this.video, message);
    }
}
// ============================================
// Exports
// ============================================
export { INDICATOR_ID, INDICATOR_CLASS, };
//# sourceMappingURL=loading-indicator.js.map