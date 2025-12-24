/**
 * Loading Indicator Module
 *
 * Displays translation status overlay on video player.
 * Follows Udemy's visual style with purple accent (#a435f0).
 *
 * Task ID: T-20251223-act-013-build-loading-indicator
 */
export type IndicatorStatus = 'loading' | 'success' | 'error' | 'hidden';
export interface IndicatorOptions {
    /** Status message to display */
    message?: string;
    /** Error details for error status */
    errorDetails?: string;
    /** Retry callback for error status */
    onRetry?: () => void;
    /** Auto-hide delay in ms (default: 3000 for success, 0 for others) */
    autoHideDelay?: number;
    /** Position relative to video (default: 'top-right') */
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
}
declare const INDICATOR_ID = "udemy-caption-plus-loading-indicator";
declare const INDICATOR_CLASS = "ucp-loading-indicator";
/**
 * Shows the loading indicator on a video element
 *
 * @param video - The video element to attach the indicator to
 * @param options - Display options
 */
export declare function showLoadingIndicator(video: HTMLVideoElement, options?: IndicatorOptions): void;
/**
 * Shows a success message on the indicator
 *
 * @param video - The video element
 * @param options - Display options
 */
export declare function showSuccessIndicator(video: HTMLVideoElement, options?: IndicatorOptions): void;
/**
 * Shows an error message on the indicator with optional retry button
 *
 * @param video - The video element
 * @param options - Display options including error details and retry callback
 */
export declare function showErrorIndicator(video: HTMLVideoElement, options?: IndicatorOptions): void;
/**
 * Hides the loading indicator for a video element
 *
 * @param video - The video element
 */
export declare function hideLoadingIndicator(video: HTMLVideoElement): void;
/**
 * Removes the loading indicator element from DOM
 *
 * @param video - The video element
 */
export declare function removeLoadingIndicator(video: HTMLVideoElement): void;
/**
 * Gets the current indicator status for a video
 *
 * @param video - The video element
 * @returns Current status or 'hidden' if no indicator exists
 */
export declare function getIndicatorStatus(video: HTMLVideoElement): IndicatorStatus;
/**
 * Checks if an indicator is currently visible
 *
 * @param video - The video element
 * @returns True if indicator is visible (not hidden)
 */
export declare function isIndicatorVisible(video: HTMLVideoElement): boolean;
/**
 * Updates the loading message while keeping the loading state
 *
 * @param video - The video element
 * @param message - New message to display
 */
export declare function updateLoadingMessage(video: HTMLVideoElement, message: string): void;
/**
 * Class-based wrapper for managing loading indicators
 */
export declare class LoadingIndicator {
    private video;
    private defaultPosition;
    constructor(video: HTMLVideoElement, options?: {
        position?: IndicatorOptions['position'];
    });
    /**
     * Shows loading state
     */
    showLoading(message?: string): void;
    /**
     * Shows success state with auto-hide
     */
    showSuccess(message?: string, autoHideDelay?: number): void;
    /**
     * Shows error state with optional retry
     */
    showError(message?: string, errorDetails?: string, onRetry?: () => void): void;
    /**
     * Hides the indicator
     */
    hide(): void;
    /**
     * Removes the indicator from DOM
     */
    remove(): void;
    /**
     * Gets current status
     */
    getStatus(): IndicatorStatus;
    /**
     * Checks if visible
     */
    isVisible(): boolean;
    /**
     * Updates loading message
     */
    updateMessage(message: string): void;
}
export { INDICATOR_ID, INDICATOR_CLASS, };
//# sourceMappingURL=loading-indicator.d.ts.map