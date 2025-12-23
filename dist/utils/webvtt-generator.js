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
// ============================================
// Constants
// ============================================
/** Logger prefix */
const LOG_PREFIX = '[WebVTT Generator]';
/** WebVTT file signature */
const WEBVTT_SIGNATURE = 'WEBVTT';
/** Default generator options */
const DEFAULT_OPTIONS = {
    includeCueIds: true,
    includeStyles: true,
    includeRegions: true,
    includeNotes: true,
    useShortTimestamp: false,
};
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
let currentLogLevel = 'warn';
function log(level, ...args) {
    if (LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel]) {
        const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
        console[method](LOG_PREFIX, `[${level.toUpperCase()}]`, ...args);
    }
}
/**
 * Set the logging level for the generator
 */
export function setLogLevel(level) {
    currentLogLevel = level;
}
// ============================================
// Timestamp Formatting
// ============================================
/**
 * Format a VTTTimestamp to string
 *
 * @param timestamp - Timestamp object to format
 * @param useShort - Use short format (MM:SS.mmm) when hours is 0
 * @returns Formatted timestamp string
 */
export function formatTimestamp(timestamp, useShort = false) {
    const { hours, minutes, seconds, milliseconds } = timestamp;
    const mm = minutes.toString().padStart(2, '0');
    const ss = seconds.toString().padStart(2, '0');
    const ms = milliseconds.toString().padStart(3, '0');
    if (useShort && hours === 0) {
        return `${mm}:${ss}.${ms}`;
    }
    const hh = hours.toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}.${ms}`;
}
/**
 * Create a VTTTimestamp from individual components
 */
export function createTimestamp(hours, minutes, seconds, milliseconds) {
    return { hours, minutes, seconds, milliseconds };
}
/**
 * Create a VTTTimestamp from total milliseconds
 */
export function timestampFromMs(totalMs) {
    const hours = Math.floor(totalMs / 3600000);
    totalMs %= 3600000;
    const minutes = Math.floor(totalMs / 60000);
    totalMs %= 60000;
    const seconds = Math.floor(totalMs / 1000);
    const milliseconds = totalMs % 1000;
    return { hours, minutes, seconds, milliseconds };
}
// ============================================
// Cue Generation
// ============================================
/**
 * Generate a single cue block
 *
 * @param cue - Cue object to generate
 * @param options - Generator options
 * @returns Cue block string
 */
export function generateCue(cue, options = DEFAULT_OPTIONS) {
    const lines = [];
    // Add cue ID if present and option enabled
    if (cue.id && options.includeCueIds !== false) {
        lines.push(cue.id);
    }
    // Format timing line
    const startTime = formatTimestamp(cue.startTime, options.useShortTimestamp);
    const endTime = formatTimestamp(cue.endTime, options.useShortTimestamp);
    let timingLine = `${startTime} --> ${endTime}`;
    // Add cue settings if present
    if (cue.settings) {
        timingLine += ` ${cue.settings}`;
    }
    lines.push(timingLine);
    // Add cue text
    if (cue.text) {
        lines.push(cue.text);
    }
    return lines.join('\n');
}
/**
 * Create a new VTTCue object
 */
export function createCue(startTime, endTime, text, id, settings) {
    const cue = {
        startTime,
        endTime,
        text,
    };
    if (id) {
        cue.id = id;
    }
    if (settings) {
        cue.settings = settings;
    }
    return cue;
}
// ============================================
// Main Generator
// ============================================
/**
 * Generate a complete WebVTT file string from structured data
 *
 * @param vttFile - Parsed VTT file structure
 * @param options - Generator options
 * @returns WebVTT file content string
 */
export function generateVTT(vttFile, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const lines = [];
    // Generate header line
    let headerLine = WEBVTT_SIGNATURE;
    if (vttFile.header) {
        headerLine += ` ${vttFile.header}`;
    }
    lines.push(headerLine);
    lines.push(''); // Empty line after header
    // Generate style blocks
    if (opts.includeStyles && vttFile.styles && vttFile.styles.length > 0) {
        for (const style of vttFile.styles) {
            lines.push('STYLE');
            lines.push(style);
            lines.push('');
        }
    }
    // Generate region blocks
    if (opts.includeRegions && vttFile.regions && vttFile.regions.length > 0) {
        for (const region of vttFile.regions) {
            lines.push('REGION');
            lines.push(region.settings);
            lines.push('');
        }
    }
    // Generate notes (if option enabled)
    if (opts.includeNotes && vttFile.notes && vttFile.notes.length > 0) {
        for (const note of vttFile.notes) {
            lines.push(`NOTE ${note}`);
            lines.push('');
        }
    }
    // Generate cues
    for (let i = 0; i < vttFile.cues.length; i++) {
        const cue = vttFile.cues[i];
        lines.push(generateCue(cue, opts));
        // Add empty line between cues (but not after the last one)
        if (i < vttFile.cues.length - 1) {
            lines.push('');
        }
    }
    log('info', `Generated WebVTT with ${vttFile.cues.length} cues`);
    return lines.join('\n');
}
/**
 * Generate a minimal WebVTT file from an array of cues
 *
 * @param cues - Array of cues
 * @param header - Optional header text
 * @returns WebVTT file content string
 */
export function generateFromCues(cues, header) {
    const vttFile = {
        header,
        cues,
    };
    return generateVTT(vttFile);
}
/**
 * Generate a WebVTT data URI for use in <track> elements
 *
 * @param vttFile - VTT file structure or string content
 * @returns Data URI string
 */
export function generateDataUri(vttFile) {
    const content = typeof vttFile === 'string' ? vttFile : generateVTT(vttFile);
    // Encode as base64
    const base64 = typeof btoa === 'function'
        ? btoa(unescape(encodeURIComponent(content)))
        : Buffer.from(content, 'utf-8').toString('base64');
    return `data:text/vtt;base64,${base64}`;
}
/**
 * Generate a Blob URL for use in <track> elements
 * Note: This function only works in browser environments
 *
 * @param vttFile - VTT file structure or string content
 * @returns Blob URL string
 */
export function generateBlobUrl(vttFile) {
    if (typeof Blob === 'undefined' || typeof URL === 'undefined') {
        throw new Error('Blob URLs are not supported in this environment');
    }
    const content = typeof vttFile === 'string' ? vttFile : generateVTT(vttFile);
    const blob = new Blob([content], { type: 'text/vtt' });
    return URL.createObjectURL(blob);
}
// ============================================
// Helper Functions
// ============================================
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
export function replaceCueTexts(original, newTexts) {
    if (newTexts.length !== original.cues.length) {
        log('warn', `Text count (${newTexts.length}) doesn't match cue count (${original.cues.length})`);
    }
    const newCues = original.cues.map((cue, index) => ({
        ...cue,
        text: index < newTexts.length ? newTexts[index] : cue.text,
    }));
    return {
        ...original,
        cues: newCues,
    };
}
/**
 * Merge multiple VTT files into one
 *
 * @param files - Array of VTT files to merge
 * @returns Merged VTT file
 */
export function mergeVTTFiles(files) {
    if (files.length === 0) {
        return { cues: [] };
    }
    const merged = {
        header: files[0].header,
        cues: [],
        styles: [],
        regions: [],
        notes: [],
    };
    for (const file of files) {
        merged.cues.push(...file.cues);
        if (file.styles) {
            merged.styles.push(...file.styles);
        }
        if (file.regions) {
            merged.regions.push(...file.regions);
        }
        if (file.notes) {
            merged.notes.push(...file.notes);
        }
    }
    // Sort cues by start time
    merged.cues.sort((a, b) => {
        const aMs = a.startTime.hours * 3600000 +
            a.startTime.minutes * 60000 +
            a.startTime.seconds * 1000 +
            a.startTime.milliseconds;
        const bMs = b.startTime.hours * 3600000 +
            b.startTime.minutes * 60000 +
            b.startTime.seconds * 1000 +
            b.startTime.milliseconds;
        return aMs - bMs;
    });
    // Clean up empty arrays
    if (merged.styles.length === 0)
        delete merged.styles;
    if (merged.regions.length === 0)
        delete merged.regions;
    if (merged.notes.length === 0)
        delete merged.notes;
    return merged;
}
/**
 * Extract all cue texts as an array
 *
 * @param vttFile - VTT file
 * @returns Array of cue text strings
 */
export function extractCueTexts(vttFile) {
    return vttFile.cues.map((cue) => cue.text);
}
/**
 * Validate that a VTTFile structure is well-formed
 *
 * @param vttFile - VTT file to validate
 * @returns Validation result with any errors
 */
export function validateVTTFile(vttFile) {
    const errors = [];
    if (!vttFile) {
        return { valid: false, errors: ['VTT file is null or undefined'] };
    }
    if (!Array.isArray(vttFile.cues)) {
        return { valid: false, errors: ['VTT file has no cues array'] };
    }
    for (let i = 0; i < vttFile.cues.length; i++) {
        const cue = vttFile.cues[i];
        const cuePrefix = `Cue ${i + 1}${cue.id ? ` (${cue.id})` : ''}`;
        if (!cue.startTime || !cue.endTime) {
            errors.push(`${cuePrefix}: missing start or end time`);
            continue;
        }
        // Validate timestamp components
        const { startTime, endTime } = cue;
        if (startTime.hours < 0 ||
            startTime.minutes < 0 ||
            startTime.minutes > 59 ||
            startTime.seconds < 0 ||
            startTime.seconds > 59 ||
            startTime.milliseconds < 0 ||
            startTime.milliseconds > 999) {
            errors.push(`${cuePrefix}: invalid start timestamp`);
        }
        if (endTime.hours < 0 ||
            endTime.minutes < 0 ||
            endTime.minutes > 59 ||
            endTime.seconds < 0 ||
            endTime.seconds > 59 ||
            endTime.milliseconds < 0 ||
            endTime.milliseconds > 999) {
            errors.push(`${cuePrefix}: invalid end timestamp`);
        }
        // Check that start time is before end time
        const startMs = startTime.hours * 3600000 +
            startTime.minutes * 60000 +
            startTime.seconds * 1000 +
            startTime.milliseconds;
        const endMs = endTime.hours * 3600000 +
            endTime.minutes * 60000 +
            endTime.seconds * 1000 +
            endTime.milliseconds;
        if (startMs >= endMs) {
            errors.push(`${cuePrefix}: start time >= end time`);
        }
    }
    return {
        valid: errors.length === 0,
        errors,
    };
}
// ============================================
// Exports
// ============================================
export default {
    generateVTT,
    generateCue,
    generateFromCues,
    generateDataUri,
    generateBlobUrl,
    formatTimestamp,
    createTimestamp,
    timestampFromMs,
    createCue,
    replaceCueTexts,
    mergeVTTFiles,
    extractCueTexts,
    validateVTTFile,
    setLogLevel,
};
//# sourceMappingURL=webvtt-generator.js.map