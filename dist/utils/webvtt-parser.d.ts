/**
 * WebVTT Parser Module
 *
 * Parses WebVTT (Web Video Text Tracks) files into structured data.
 * Supports standard WebVTT format including cue IDs, timestamps, text content,
 * style blocks, regions, and notes.
 *
 * Task ID: T-20251223-act-006-build-webvtt-parser
 *
 * Acceptance Criteria:
 * - [x] 解析器可正确解析标准 WebVTT 文件（含 cue ID、时间戳、文本）
 * - [x] 边界情况处理（空文件、格式错误等）
 *
 * @see https://www.w3.org/TR/webvtt1/
 */
import type { VTTTimestamp, VTTCue, VTTFile, VTTParseResult } from '../types';
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
/**
 * Set the logging level for the parser
 */
export declare function setLogLevel(level: LogLevel): void;
/**
 * Parse a WebVTT timestamp string into a VTTTimestamp object
 *
 * @param timestamp - Timestamp string in format HH:MM:SS.mmm or MM:SS.mmm
 * @returns Parsed timestamp or null if invalid
 */
export declare function parseTimestamp(timestamp: string): VTTTimestamp | null;
/**
 * Convert a VTTTimestamp to total milliseconds
 */
export declare function timestampToMs(ts: VTTTimestamp): number;
/**
 * Convert milliseconds to a VTTTimestamp
 */
export declare function msToTimestamp(ms: number): VTTTimestamp;
/**
 * Compare two timestamps
 * @returns negative if a < b, positive if a > b, 0 if equal
 */
export declare function compareTimestamps(a: VTTTimestamp, b: VTTTimestamp): number;
/**
 * Parse a WebVTT file string into structured data
 *
 * @param vttString - Raw WebVTT file content
 * @returns Parse result containing the parsed file or error
 */
export declare function parseVTT(vttString: string): VTTParseResult;
/**
 * Check if a string is valid WebVTT content
 */
export declare function isValidVTT(content: string): boolean;
/**
 * Extract plain text from a cue (removing VTT formatting tags)
 *
 * @param text - Cue text potentially containing VTT tags
 * @returns Plain text without tags
 */
export declare function stripVTTTags(text: string): string;
/**
 * Get the total duration of a VTT file based on the last cue's end time
 */
export declare function getVTTDuration(vttFile: VTTFile): number;
/**
 * Get cue at a specific time
 *
 * @param vttFile - Parsed VTT file
 * @param timeMs - Time in milliseconds
 * @returns Cue(s) active at the specified time
 */
export declare function getCuesAtTime(vttFile: VTTFile, timeMs: number): VTTCue[];
declare const _default: {
    parseVTT: typeof parseVTT;
    parseTimestamp: typeof parseTimestamp;
    timestampToMs: typeof timestampToMs;
    msToTimestamp: typeof msToTimestamp;
    compareTimestamps: typeof compareTimestamps;
    isValidVTT: typeof isValidVTT;
    stripVTTTags: typeof stripVTTTags;
    getVTTDuration: typeof getVTTDuration;
    getCuesAtTime: typeof getCuesAtTime;
    setLogLevel: typeof setLogLevel;
};
export default _default;
//# sourceMappingURL=webvtt-parser.d.ts.map