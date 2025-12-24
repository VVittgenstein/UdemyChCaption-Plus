/**
 * Loading Indicator Module Tests
 *
 * Task ID: T-20251223-act-013-build-loading-indicator
 */

import {
  showLoadingIndicator,
  showSuccessIndicator,
  showErrorIndicator,
  hideLoadingIndicator,
  removeLoadingIndicator,
  getIndicatorStatus,
  isIndicatorVisible,
  updateLoadingMessage,
  LoadingIndicator,
  INDICATOR_ID,
  INDICATOR_CLASS,
} from '../loading-indicator';

// ============================================
// Test Setup
// ============================================

beforeEach(() => {
  // Clean up DOM before each test
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  jest.useFakeTimers();
});

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  jest.useRealTimers();
});

// ============================================
// Helper Functions
// ============================================

function createMockVideo(): HTMLVideoElement {
  const container = document.createElement('div');
  container.setAttribute('data-purpose', 'video-player');
  container.style.position = 'relative';

  const video = document.createElement('video');
  video.src = 'https://example.com/video.mp4';
  container.appendChild(video);
  document.body.appendChild(container);

  return video;
}

function getIndicatorElement(): HTMLElement | null {
  // Query by class since indicators no longer have IDs (to avoid duplicate IDs with multiple videos)
  return document.querySelector(`.${INDICATOR_CLASS}`) as HTMLElement | null;
}

function hasClass(element: HTMLElement, className: string): boolean {
  return element.classList.contains(className);
}

// ============================================
// Constants Tests
// ============================================

describe('Constants', () => {
  test('INDICATOR_ID is defined', () => {
    expect(INDICATOR_ID).toBe('udemy-caption-plus-loading-indicator');
  });

  test('INDICATOR_CLASS is defined', () => {
    expect(INDICATOR_CLASS).toBe('ucp-loading-indicator');
  });
});

// ============================================
// showLoadingIndicator Tests
// ============================================

describe('showLoadingIndicator', () => {
  test('creates indicator element in DOM', () => {
    const video = createMockVideo();
    showLoadingIndicator(video);

    const indicator = getIndicatorElement();
    expect(indicator).not.toBeNull();
  });

  test('injects styles into document head', () => {
    const video = createMockVideo();
    showLoadingIndicator(video);

    const styleElement = document.getElementById(`${INDICATOR_ID}-styles`);
    expect(styleElement).not.toBeNull();
    expect(styleElement?.tagName).toBe('STYLE');
  });

  test('displays default loading message', () => {
    const video = createMockVideo();
    showLoadingIndicator(video);

    const indicator = getIndicatorElement();
    expect(indicator?.textContent).toContain('字幕翻译中…');
  });

  test('displays custom message when provided', () => {
    const video = createMockVideo();
    showLoadingIndicator(video, { message: 'Processing...' });

    const indicator = getIndicatorElement();
    expect(indicator?.textContent).toContain('Processing...');
  });

  test('applies loading status class', () => {
    const video = createMockVideo();
    showLoadingIndicator(video);

    const indicator = getIndicatorElement();
    expect(indicator).not.toBeNull();
    expect(hasClass(indicator!, `${INDICATOR_CLASS}--loading`)).toBe(true);
  });

  test('applies position class', () => {
    const video = createMockVideo();
    showLoadingIndicator(video, { position: 'bottom-left' });

    const indicator = getIndicatorElement();
    expect(indicator).not.toBeNull();
    expect(hasClass(indicator!, `${INDICATOR_CLASS}--bottom-left`)).toBe(true);
  });

  test('uses top-right as default position', () => {
    const video = createMockVideo();
    showLoadingIndicator(video);

    const indicator = getIndicatorElement();
    expect(indicator).not.toBeNull();
    expect(hasClass(indicator!, `${INDICATOR_CLASS}--top-right`)).toBe(true);
  });

  test('includes spinner element', () => {
    const video = createMockVideo();
    showLoadingIndicator(video);

    const indicator = getIndicatorElement();
    const spinner = indicator?.querySelector(`.${INDICATOR_CLASS}__spinner`);
    expect(spinner).not.toBeNull();
  });

  test('auto-hides after specified delay', () => {
    const video = createMockVideo();
    showLoadingIndicator(video, { autoHideDelay: 1000 });

    expect(getIndicatorStatus(video)).toBe('loading');

    jest.advanceTimersByTime(1000);

    expect(getIndicatorStatus(video)).toBe('hidden');
  });

  test('reuses existing indicator element', () => {
    const video = createMockVideo();
    showLoadingIndicator(video, { message: 'First' });
    showLoadingIndicator(video, { message: 'Second' });

    // Query by class since indicators no longer have IDs
    const indicators = document.querySelectorAll(`.${INDICATOR_CLASS}`);
    expect(indicators.length).toBe(1);
    expect(indicators[0].textContent).toContain('Second');
  });
});

// ============================================
// showSuccessIndicator Tests
// ============================================

describe('showSuccessIndicator', () => {
  test('displays success status', () => {
    const video = createMockVideo();
    showSuccessIndicator(video);

    const indicator = getIndicatorElement();
    expect(indicator).not.toBeNull();
    expect(hasClass(indicator!, `${INDICATOR_CLASS}--success`)).toBe(true);
  });

  test('displays default success message', () => {
    const video = createMockVideo();
    showSuccessIndicator(video);

    const indicator = getIndicatorElement();
    expect(indicator?.textContent).toContain('翻译完成');
  });

  test('displays custom success message', () => {
    const video = createMockVideo();
    showSuccessIndicator(video, { message: 'Done!' });

    const indicator = getIndicatorElement();
    expect(indicator?.textContent).toContain('Done!');
  });

  test('includes check icon', () => {
    const video = createMockVideo();
    showSuccessIndicator(video);

    const indicator = getIndicatorElement();
    const checkIcon = indicator?.querySelector(`.${INDICATOR_CLASS}__check`);
    expect(checkIcon).not.toBeNull();
  });

  test('auto-hides after default 3 seconds', () => {
    const video = createMockVideo();
    showSuccessIndicator(video);

    expect(getIndicatorStatus(video)).toBe('success');

    jest.advanceTimersByTime(3000);

    expect(getIndicatorStatus(video)).toBe('hidden');
  });

  test('uses custom auto-hide delay', () => {
    const video = createMockVideo();
    showSuccessIndicator(video, { autoHideDelay: 5000 });

    jest.advanceTimersByTime(3000);
    expect(getIndicatorStatus(video)).toBe('success');

    jest.advanceTimersByTime(2000);
    expect(getIndicatorStatus(video)).toBe('hidden');
  });
});

// ============================================
// showErrorIndicator Tests
// ============================================

describe('showErrorIndicator', () => {
  test('displays error status', () => {
    const video = createMockVideo();
    showErrorIndicator(video);

    const indicator = getIndicatorElement();
    expect(indicator).not.toBeNull();
    expect(hasClass(indicator!, `${INDICATOR_CLASS}--error`)).toBe(true);
  });

  test('displays default error message', () => {
    const video = createMockVideo();
    showErrorIndicator(video);

    const indicator = getIndicatorElement();
    expect(indicator?.textContent).toContain('翻译失败');
  });

  test('displays custom error message', () => {
    const video = createMockVideo();
    showErrorIndicator(video, { message: 'Network Error' });

    const indicator = getIndicatorElement();
    expect(indicator?.textContent).toContain('Network Error');
  });

  test('displays error details when provided', () => {
    const video = createMockVideo();
    showErrorIndicator(video, {
      message: 'Error',
      errorDetails: 'Connection timed out',
    });

    const indicator = getIndicatorElement();
    const details = indicator?.querySelector(`.${INDICATOR_CLASS}__details`);
    expect(details?.textContent).toContain('Connection timed out');
  });

  test('includes error icon', () => {
    const video = createMockVideo();
    showErrorIndicator(video);

    const indicator = getIndicatorElement();
    const errorIcon = indicator?.querySelector(`.${INDICATOR_CLASS}__error-icon`);
    expect(errorIcon).not.toBeNull();
  });

  test('shows retry button when onRetry is provided', () => {
    const video = createMockVideo();
    const onRetry = jest.fn();
    showErrorIndicator(video, { onRetry });

    const indicator = getIndicatorElement();
    const retryBtn = indicator?.querySelector(`.${INDICATOR_CLASS}__retry-btn`);
    expect(retryBtn).not.toBeNull();
  });

  test('does not show retry button when onRetry is not provided', () => {
    const video = createMockVideo();
    showErrorIndicator(video);

    const indicator = getIndicatorElement();
    const retryBtn = indicator?.querySelector(`.${INDICATOR_CLASS}__retry-btn`);
    expect(retryBtn).toBeNull();
  });

  test('calls onRetry when retry button is clicked', () => {
    const video = createMockVideo();
    const onRetry = jest.fn();
    showErrorIndicator(video, { onRetry });

    const indicator = getIndicatorElement();
    const retryBtn = indicator?.querySelector(`.${INDICATOR_CLASS}__retry-btn`) as HTMLButtonElement;
    retryBtn?.click();

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('shows dismiss button', () => {
    const video = createMockVideo();
    showErrorIndicator(video);

    const indicator = getIndicatorElement();
    const dismissBtn = indicator?.querySelector(`.${INDICATOR_CLASS}__dismiss-btn`);
    expect(dismissBtn).not.toBeNull();
  });

  test('hides indicator when dismiss button is clicked', () => {
    const video = createMockVideo();
    showErrorIndicator(video);

    const indicator = getIndicatorElement();
    const dismissBtn = indicator?.querySelector(`.${INDICATOR_CLASS}__dismiss-btn`) as HTMLButtonElement;
    dismissBtn?.click();

    expect(hasClass(indicator!, `${INDICATOR_CLASS}--hidden`)).toBe(true);
  });

  test('does not auto-hide by default', () => {
    const video = createMockVideo();
    showErrorIndicator(video);

    jest.advanceTimersByTime(10000);

    expect(getIndicatorStatus(video)).toBe('error');
  });
});

// ============================================
// hideLoadingIndicator Tests
// ============================================

describe('hideLoadingIndicator', () => {
  test('adds hidden class to indicator', () => {
    const video = createMockVideo();
    showLoadingIndicator(video);
    hideLoadingIndicator(video);

    const indicator = getIndicatorElement();
    expect(hasClass(indicator!, `${INDICATOR_CLASS}--hidden`)).toBe(true);
  });

  test('updates status to hidden', () => {
    const video = createMockVideo();
    showLoadingIndicator(video);
    hideLoadingIndicator(video);

    expect(getIndicatorStatus(video)).toBe('hidden');
  });

  test('clears auto-hide timer', () => {
    const video = createMockVideo();
    showLoadingIndicator(video, { autoHideDelay: 5000 });

    hideLoadingIndicator(video);
    jest.advanceTimersByTime(5000);

    // Should already be hidden, not double-hidden
    expect(getIndicatorStatus(video)).toBe('hidden');
  });

  test('handles non-existent indicator gracefully', () => {
    const video = createMockVideo();
    expect(() => hideLoadingIndicator(video)).not.toThrow();
  });
});

// ============================================
// removeLoadingIndicator Tests
// ============================================

describe('removeLoadingIndicator', () => {
  test('removes indicator element from DOM', () => {
    const video = createMockVideo();
    showLoadingIndicator(video);
    removeLoadingIndicator(video);

    const indicator = getIndicatorElement();
    expect(indicator).toBeNull();
  });

  test('clears indicator state', () => {
    const video = createMockVideo();
    showLoadingIndicator(video);
    removeLoadingIndicator(video);

    expect(getIndicatorStatus(video)).toBe('hidden');
  });

  test('handles non-existent indicator gracefully', () => {
    const video = createMockVideo();
    expect(() => removeLoadingIndicator(video)).not.toThrow();
  });
});

// ============================================
// getIndicatorStatus Tests
// ============================================

describe('getIndicatorStatus', () => {
  test('returns hidden when no indicator exists', () => {
    const video = createMockVideo();
    expect(getIndicatorStatus(video)).toBe('hidden');
  });

  test('returns loading when loading indicator is shown', () => {
    const video = createMockVideo();
    showLoadingIndicator(video);
    expect(getIndicatorStatus(video)).toBe('loading');
  });

  test('returns success when success indicator is shown', () => {
    const video = createMockVideo();
    showSuccessIndicator(video);
    expect(getIndicatorStatus(video)).toBe('success');
  });

  test('returns error when error indicator is shown', () => {
    const video = createMockVideo();
    showErrorIndicator(video);
    expect(getIndicatorStatus(video)).toBe('error');
  });
});

// ============================================
// isIndicatorVisible Tests
// ============================================

describe('isIndicatorVisible', () => {
  test('returns false when no indicator exists', () => {
    const video = createMockVideo();
    expect(isIndicatorVisible(video)).toBe(false);
  });

  test('returns true when indicator is shown', () => {
    const video = createMockVideo();
    showLoadingIndicator(video);
    expect(isIndicatorVisible(video)).toBe(true);
  });

  test('returns false when indicator is hidden', () => {
    const video = createMockVideo();
    showLoadingIndicator(video);
    hideLoadingIndicator(video);
    expect(isIndicatorVisible(video)).toBe(false);
  });
});

// ============================================
// updateLoadingMessage Tests
// ============================================

describe('updateLoadingMessage', () => {
  test('updates message text', () => {
    const video = createMockVideo();
    showLoadingIndicator(video, { message: 'Initial' });
    updateLoadingMessage(video, 'Updated');

    const indicator = getIndicatorElement();
    expect(indicator?.textContent).toContain('Updated');
  });

  test('does not update if not in loading state', () => {
    const video = createMockVideo();
    showSuccessIndicator(video, { message: 'Success', autoHideDelay: 0 });
    updateLoadingMessage(video, 'Should not appear');

    const indicator = getIndicatorElement();
    expect(indicator?.textContent).not.toContain('Should not appear');
    expect(indicator?.textContent).toContain('Success');
  });

  test('handles non-existent indicator gracefully', () => {
    const video = createMockVideo();
    expect(() => updateLoadingMessage(video, 'Message')).not.toThrow();
  });
});

// ============================================
// LoadingIndicator Class Tests
// ============================================

describe('LoadingIndicator class', () => {
  test('creates instance with video element', () => {
    const video = createMockVideo();
    const indicator = new LoadingIndicator(video);
    expect(indicator).toBeInstanceOf(LoadingIndicator);
  });

  test('showLoading shows loading indicator', () => {
    const video = createMockVideo();
    const indicator = new LoadingIndicator(video);
    indicator.showLoading();

    expect(indicator.getStatus()).toBe('loading');
  });

  test('showLoading with custom message', () => {
    const video = createMockVideo();
    const indicator = new LoadingIndicator(video);
    indicator.showLoading('Custom loading');

    const element = getIndicatorElement();
    expect(element?.textContent).toContain('Custom loading');
  });

  test('showSuccess shows success indicator', () => {
    const video = createMockVideo();
    const indicator = new LoadingIndicator(video);
    indicator.showSuccess();

    expect(indicator.getStatus()).toBe('success');
  });

  test('showError shows error indicator', () => {
    const video = createMockVideo();
    const indicator = new LoadingIndicator(video);
    indicator.showError();

    expect(indicator.getStatus()).toBe('error');
  });

  test('showError with details and retry', () => {
    const video = createMockVideo();
    const indicator = new LoadingIndicator(video);
    const onRetry = jest.fn();
    indicator.showError('Error occurred', 'Details here', onRetry);

    const element = getIndicatorElement();
    expect(element?.textContent).toContain('Error occurred');
    expect(element?.textContent).toContain('Details here');

    const retryBtn = element?.querySelector(`.${INDICATOR_CLASS}__retry-btn`) as HTMLButtonElement;
    retryBtn?.click();
    expect(onRetry).toHaveBeenCalled();
  });

  test('hide hides the indicator', () => {
    const video = createMockVideo();
    const indicator = new LoadingIndicator(video);
    indicator.showLoading();
    indicator.hide();

    expect(indicator.getStatus()).toBe('hidden');
  });

  test('remove removes the indicator from DOM', () => {
    const video = createMockVideo();
    const indicator = new LoadingIndicator(video);
    indicator.showLoading();
    indicator.remove();

    expect(getIndicatorElement()).toBeNull();
  });

  test('isVisible returns correct value', () => {
    const video = createMockVideo();
    const indicator = new LoadingIndicator(video);

    expect(indicator.isVisible()).toBe(false);

    indicator.showLoading();
    expect(indicator.isVisible()).toBe(true);

    indicator.hide();
    expect(indicator.isVisible()).toBe(false);
  });

  test('updateMessage updates loading message', () => {
    const video = createMockVideo();
    const indicator = new LoadingIndicator(video);
    indicator.showLoading('Initial');
    indicator.updateMessage('Updated');

    const element = getIndicatorElement();
    expect(element?.textContent).toContain('Updated');
  });

  test('respects default position option', () => {
    const video = createMockVideo();
    const indicator = new LoadingIndicator(video, { position: 'center' });
    indicator.showLoading();

    const element = getIndicatorElement();
    expect(hasClass(element!, `${INDICATOR_CLASS}--center`)).toBe(true);
  });
});

// ============================================
// XSS Prevention Tests
// ============================================

describe('XSS Prevention', () => {
  test('escapes HTML in message', () => {
    const video = createMockVideo();
    showLoadingIndicator(video, { message: '<script>alert("xss")</script>' });

    const indicator = getIndicatorElement();
    expect(indicator?.innerHTML).not.toContain('<script>');
    expect(indicator?.textContent).toContain('<script>');
  });

  test('escapes HTML in error details', () => {
    const video = createMockVideo();
    showErrorIndicator(video, {
      message: 'Error',
      errorDetails: '<img src=x onerror="alert(1)">',
    });

    const indicator = getIndicatorElement();
    expect(indicator?.innerHTML).not.toContain('<img');
    expect(indicator?.textContent).toContain('<img');
  });
});

// ============================================
// Multiple Video Elements Tests
// ============================================

describe('Multiple video elements', () => {
  test('manages indicators independently per video', () => {
    const container1 = document.createElement('div');
    container1.setAttribute('data-purpose', 'video-player');
    const video1 = document.createElement('video');
    container1.appendChild(video1);
    document.body.appendChild(container1);

    const container2 = document.createElement('div');
    container2.setAttribute('data-purpose', 'video-player');
    const video2 = document.createElement('video');
    container2.appendChild(video2);
    document.body.appendChild(container2);

    showLoadingIndicator(video1, { message: 'Video 1' });
    showSuccessIndicator(video2, { message: 'Video 2', autoHideDelay: 0 });

    expect(getIndicatorStatus(video1)).toBe('loading');
    expect(getIndicatorStatus(video2)).toBe('success');

    hideLoadingIndicator(video1);

    expect(getIndicatorStatus(video1)).toBe('hidden');
    expect(getIndicatorStatus(video2)).toBe('success');
  });
});

// ============================================
// Position Variants Tests
// ============================================

describe('Position variants', () => {
  const positions: Array<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'> = [
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
    'center',
  ];

  positions.forEach((position) => {
    test(`applies ${position} position class`, () => {
      const video = createMockVideo();
      showLoadingIndicator(video, { position });

      const indicator = getIndicatorElement();
      expect(hasClass(indicator!, `${INDICATOR_CLASS}--${position}`)).toBe(true);
    });
  });
});

// ============================================
// Style Injection Tests
// ============================================

describe('Style injection', () => {
  test('injects styles only once', () => {
    const video = createMockVideo();
    showLoadingIndicator(video);
    showLoadingIndicator(video);
    showSuccessIndicator(video);

    const styleElements = document.querySelectorAll(`#${INDICATOR_ID}-styles`);
    expect(styleElements.length).toBe(1);
  });

  test('styles contain required CSS classes', () => {
    const video = createMockVideo();
    showLoadingIndicator(video);

    const styleElement = document.getElementById(`${INDICATOR_ID}-styles`);
    const css = styleElement?.textContent || '';

    expect(css).toContain(`.${INDICATOR_CLASS}`);
    expect(css).toContain(`.${INDICATOR_CLASS}--loading`);
    expect(css).toContain(`.${INDICATOR_CLASS}--success`);
    expect(css).toContain(`.${INDICATOR_CLASS}--error`);
    expect(css).toContain(`.${INDICATOR_CLASS}--hidden`);
    expect(css).toContain(`.${INDICATOR_CLASS}__spinner`);
    expect(css).toContain('@keyframes ucp-spin');
  });
});
