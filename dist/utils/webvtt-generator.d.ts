/**
 * WebVTT Generator Module
 *
 * Generates WebVTT (Web Video Text Tracks) files from structured data.
 * Produces valid WebVTT output that can be used directly in browsers.
 *
 * Task ID: T-20251223-act-006-build-webvtt-parser
 *
 * Acceptance Criteria:
 * - [x] 生成器可将解析结果还原为有效 WebVTT 字符串
 * - [x] 解析后再生成的文件与原文件语义等价
 *
 * @see https://www.w3.org/TR/webvtt1/
 */
import type { VTTTimestamp, VTTCue, VTTFile, VTTGeneratorOptions } from '../types';
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
/**
 * Set the logging level for the generator
 */
export declare function setLogLevel(level: LogLevel): void;
/**
 * Format a VTTTimestamp to string
 *
 * @param timestamp - Timestamp object to format
 * @param useShort - Use short format (MM:SS.mmm) when hours is 0
 * @returns Formatted timestamp string
 */
export declare function formatTimestamp(timestamp: VTTTimestamp, useShort?: boolean): string;
/**
 * Create a VTTTimestamp from individual components
 */
export declare function createTimestamp(hours: number, minutes: number, seconds: number, milliseconds: number): VTTTimestamp;
/**
 * Create a VTTTimestamp from total milliseconds
 */
export declare function timestampFromMs(totalMs: number): VTTTimestamp;
/**
 * Generate a single cue block
 *
 * @param cue - Cue object to generate
 * @param options - Generator options
 * @returns Cue block string
 */
export declare function generateCue(cue: VTTCue, options?: VTTGeneratorOptions): string;
/**
 * Create a new VTTCue object
 */
export declare function createCue(startTime: VTTTimestamp, endTime: VTTTimestamp, text: string, id?: string, settings?: string): VTTCue;
/**
 * Generate a complete WebVTT file string from structured data
 *
 * @param vttFile - Parsed VTT file structure
 * @param options - Generator options
 * @returns WebVTT file content string
 */
export declare function generateVTT(vttFile: VTTFile, options?: VTTGeneratorOptions): string;
/**
 * Generate a minimal WebVTT file from an array of cues
 *
 * @param cues - Array of cues
 * @param header - Optional header text
 * @returns WebVTT file content string
 */
export declare function generateFromCues(cues: VTTCue[], header?: string): string;
/**
 * Generate a WebVTT data URI for use in <track> elements
 *
 * @param vttFile - VTT file structure or string content
 * @returns Data URI string
 */
export declare function generateDataUri(vttFile: VTTFile | string): string;
/**
 * Generate a Blob URL for use in <track> elements
 * Note: This function only works in browser environments
 *
 * @param vttFile - VTT file structure or string content
 * @returns Blob URL string
 */
export declare function generateBlobUrl(vttFile: VTTFile | string): string;
/**
 * Clone a VTTFile with replaced cue texts
 *
 * This is useful for translation: keep all timing and structure,
 * but replace the text content of cues.
 *
 * @param original - Original VTT file
 * @param newTexts - Array of new text content (must match cue count)
 * @returns New VTTFile with replaced texts
 */
export declare function replaceCueTexts(original: VTTFile, newTexts: string[]): VTTFile;
/**
 * Merge multiple VTT files into one
 *
 * @param files - Array of VTT files to merge
 * @returns Merged VTT file
 */
export declare function mergeVTTFiles(files: VTTFile[]): VTTFile;
/**
 * Extract all cue texts as an array
 *
 * @param vttFile - VTT file
 * @returns Array of cue text strings
 */
export declare function extractCueTexts(vttFile: VTTFile): string[];
/**
 * Validate that a VTTFile structure is well-formed
 *
 * @param vttFile - VTT file to validate
 * @returns Validation result with any errors
 */
export declare function validateVTTFile(vttFile: VTTFile): {
    valid: boolean;
    errors: string[];
};
declare const _default: {
    generateVTT: typeof generateVTT;
    generateCue: typeof generateCue;
    generateFromCues: typeof generateFromCues;
    generateDataUri: typeof generateDataUri;
    generateBlobUrl: typeof generateBlobUrl;
    formatTimestamp: typeof formatTimestamp;
    createTimestamp: typeof createTimestamp;
    timestampFromMs: typeof timestampFromMs;
    createCue: typeof createCue;
    replaceCueTexts: typeof replaceCueTexts;
    mergeVTTFiles: typeof mergeVTTFiles;
    extractCueTexts: typeof extractCueTexts;
    validateVTTFile: typeof validateVTTFile;
    setLogLevel: typeof setLogLevel;
};
export default _default;
//# sourceMappingURL=webvtt-generator.d.ts.map