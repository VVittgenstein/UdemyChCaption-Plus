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
// ============================================
// Constants
// ============================================
/** Logger prefix */
const LOG_PREFIX = '[WebVTT Parser]';
/** WebVTT file signature */
const WEBVTT_SIGNATURE = 'WEBVTT';
/** Timestamp arrow separator */
const TIMESTAMP_ARROW = '-->';
/**
 * Regex patterns for parsing
 */
const PATTERNS = {
    /**
     * Timestamp pattern: HH:MM:SS.mmm or MM:SS.mmm
     * Groups: hours (optional), minutes, seconds, milliseconds
     */
    timestamp: /^(?:(\d{1,2}):)?(\d{2}):(\d{2})\.(\d{3})$/,
    /**
     * Cue timing line pattern: START --> END [settings]
     * Groups: startTime, endTime, settings (optional)
     */
    cueTiming: /^([\d:.]+)\s*-->\s*([\d:.]+)(?:\s+(.+))?$/,
    /**
     * Style block start
     */
    styleStart: /^STYLE\s*$/,
    /**
     * Region block start
     */
    regionStart: /^REGION\s*$/,
    /**
     * Note block start
     */
    noteStart: /^NOTE\b/,
    /**
     * BOM character
     */
    bom: /^\uFEFF/,
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
 * Set the logging level for the parser
 */
export function setLogLevel(level) {
    currentLogLevel = level;
}
// ============================================
// Timestamp Parsing
// ============================================
/**
 * Parse a WebVTT timestamp string into a VTTTimestamp object
 *
 * @param timestamp - Timestamp string in format HH:MM:SS.mmm or MM:SS.mmm
 * @returns Parsed timestamp or null if invalid
 */
export function parseTimestamp(timestamp) {
    const trimmed = timestamp.trim();
    const match = trimmed.match(PATTERNS.timestamp);
    if (!match) {
        log('debug', `Invalid timestamp format: "${timestamp}"`);
        return null;
    }
    const [, hoursStr, minutesStr, secondsStr, msStr] = match;
    const hours = hoursStr ? parseInt(hoursStr, 10) : 0;
    const minutes = parseInt(minutesStr, 10);
    const seconds = parseInt(secondsStr, 10);
    const milliseconds = parseInt(msStr, 10);
    // Validate ranges
    if (minutes > 59 || seconds > 59 || milliseconds > 999) {
        log('debug', `Timestamp values out of range: "${timestamp}"`);
        return null;
    }
    return { hours, minutes, seconds, milliseconds };
}
/**
 * Convert a VTTTimestamp to total milliseconds
 */
export function timestampToMs(ts) {
    return (ts.hours * 3600000 +
        ts.minutes * 60000 +
        ts.seconds * 1000 +
        ts.milliseconds);
}
/**
 * Convert milliseconds to a VTTTimestamp
 */
export function msToTimestamp(ms) {
    const hours = Math.floor(ms / 3600000);
    ms %= 3600000;
    const minutes = Math.floor(ms / 60000);
    ms %= 60000;
    const seconds = Math.floor(ms / 1000);
    const milliseconds = ms % 1000;
    return { hours, minutes, seconds, milliseconds };
}
/**
 * Compare two timestamps
 * @returns negative if a < b, positive if a > b, 0 if equal
 */
export function compareTimestamps(a, b) {
    return timestampToMs(a) - timestampToMs(b);
}
// ============================================
// Main Parser
// ============================================
/**
 * Parse a WebVTT file string into structured data
 *
 * @param vttString - Raw WebVTT file content
 * @returns Parse result containing the parsed file or error
 */
export function parseVTT(vttString) {
    const warnings = [];
    // Handle empty input
    if (!vttString || typeof vttString !== 'string') {
        return {
            success: false,
            error: 'Empty or invalid input',
        };
    }
    // Strip BOM if present
    let content = vttString.replace(PATTERNS.bom, '');
    // Normalize line endings to \n
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Split into lines
    const lines = content.split('\n');
    // Check for WEBVTT signature
    const firstLine = lines[0]?.trim() || '';
    if (!firstLine.startsWith(WEBVTT_SIGNATURE)) {
        return {
            success: false,
            error: `Invalid WebVTT file: missing WEBVTT signature (found: "${firstLine.substring(0, 20)}")`,
        };
    }
    // Extract header (text after WEBVTT on first line)
    const headerText = firstLine.substring(WEBVTT_SIGNATURE.length).trim();
    const header = headerText.startsWith('-') || headerText.startsWith(' ')
        ? headerText.substring(1).trim()
        : headerText || undefined;
    // Parse the rest of the file
    const result = {
        header,
        cues: [],
        styles: [],
        regions: [],
        notes: [],
    };
    let currentIndex = 1;
    let cueCount = 0;
    // Skip empty lines after header
    while (currentIndex < lines.length && lines[currentIndex].trim() === '') {
        currentIndex++;
    }
    // Parse blocks
    while (currentIndex < lines.length) {
        const line = lines[currentIndex].trim();
        // Skip empty lines
        if (line === '') {
            currentIndex++;
            continue;
        }
        // Check for STYLE block
        if (PATTERNS.styleStart.test(line)) {
            const styleResult = parseStyleBlock(lines, currentIndex);
            if (styleResult.style) {
                result.styles.push(styleResult.style);
            }
            currentIndex = styleResult.nextIndex;
            continue;
        }
        // Check for REGION block
        if (PATTERNS.regionStart.test(line)) {
            const regionResult = parseRegionBlock(lines, currentIndex);
            if (regionResult.region) {
                result.regions.push(regionResult.region);
            }
            currentIndex = regionResult.nextIndex;
            continue;
        }
        // Check for NOTE block
        if (PATTERNS.noteStart.test(line)) {
            const noteResult = parseNoteBlock(lines, currentIndex);
            if (noteResult.note) {
                result.notes.push(noteResult.note);
            }
            currentIndex = noteResult.nextIndex;
            continue;
        }
        // Try to parse as a cue
        const cueResult = parseCue(lines, currentIndex);
        if (cueResult.cue) {
            result.cues.push(cueResult.cue);
            cueCount++;
        }
        else if (cueResult.error) {
            warnings.push(`Line ${currentIndex + 1}: ${cueResult.error}`);
        }
        currentIndex = cueResult.nextIndex;
    }
    // Clean up empty arrays
    if (result.styles.length === 0)
        delete result.styles;
    if (result.regions.length === 0)
        delete result.regions;
    if (result.notes.length === 0)
        delete result.notes;
    log('info', `Parsed ${cueCount} cues from WebVTT file`);
    return {
        success: true,
        data: result,
        warnings: warnings.length > 0 ? warnings : undefined,
    };
}
/**
 * Parse a style block
 */
function parseStyleBlock(lines, startIndex) {
    let index = startIndex + 1;
    const styleLines = [];
    // Collect lines until empty line or end of file
    while (index < lines.length && lines[index].trim() !== '') {
        styleLines.push(lines[index]);
        index++;
    }
    return {
        style: styleLines.length > 0 ? styleLines.join('\n') : null,
        nextIndex: index,
    };
}
/**
 * Parse a region block
 */
function parseRegionBlock(lines, startIndex) {
    let index = startIndex + 1;
    const regionLines = [];
    let regionId = '';
    // Collect lines until empty line or end of file
    while (index < lines.length && lines[index].trim() !== '') {
        const line = lines[index].trim();
        // Extract region ID (WebVTT uses colon-separated key:value pairs)
        // Region settings can be space-separated on a line, e.g., "id:region1 width:50%"
        const idMatch = line.match(/(?:^|\s)id:([^\s]+)/);
        if (idMatch) {
            regionId = idMatch[1];
        }
        regionLines.push(line);
        index++;
    }
    if (!regionId) {
        return { region: null, nextIndex: index };
    }
    return {
        region: {
            id: regionId,
            settings: regionLines.join('\n'),
        },
        nextIndex: index,
    };
}
/**
 * Parse a note block
 */
function parseNoteBlock(lines, startIndex) {
    const firstLine = lines[startIndex];
    let index = startIndex + 1;
    const noteLines = [];
    // Check if note content is on the same line as NOTE
    const inlineNote = firstLine.substring(4).trim();
    if (inlineNote) {
        noteLines.push(inlineNote);
    }
    // Collect additional lines until empty line
    while (index < lines.length && lines[index].trim() !== '') {
        noteLines.push(lines[index]);
        index++;
    }
    return {
        note: noteLines.length > 0 ? noteLines.join('\n') : null,
        nextIndex: index,
    };
}
/**
 * Parse a cue block
 */
function parseCue(lines, startIndex) {
    let index = startIndex;
    let cueId;
    const currentLine = lines[index]?.trim() || '';
    // Check if this line is a cue ID (doesn't contain -->)
    if (!currentLine.includes(TIMESTAMP_ARROW)) {
        // This might be a cue ID
        cueId = currentLine;
        index++;
        // Skip if we've run out of lines
        if (index >= lines.length) {
            return {
                cue: null,
                error: 'Unexpected end of file after cue ID',
                nextIndex: index,
            };
        }
    }
    // Parse timing line
    const timingLine = lines[index]?.trim() || '';
    const timingMatch = timingLine.match(PATTERNS.cueTiming);
    if (!timingMatch) {
        // Not a valid cue timing line, skip this block
        // Find next empty line
        while (index < lines.length && lines[index].trim() !== '') {
            index++;
        }
        return {
            cue: null,
            error: `Invalid cue timing: "${timingLine}"`,
            nextIndex: index,
        };
    }
    const [, startTimeStr, endTimeStr, settings] = timingMatch;
    const startTime = parseTimestamp(startTimeStr);
    const endTime = parseTimestamp(endTimeStr);
    if (!startTime || !endTime) {
        // Find next empty line
        while (index < lines.length && lines[index].trim() !== '') {
            index++;
        }
        return {
            cue: null,
            error: `Invalid timestamps in: "${timingLine}"`,
            nextIndex: index,
        };
    }
    // Validate that start time is before end time
    if (compareTimestamps(startTime, endTime) >= 0) {
        log('warn', `Cue start time >= end time: ${startTimeStr} --> ${endTimeStr}`);
        // Continue parsing but log warning
    }
    index++;
    // Parse cue text (may be multiple lines)
    const textLines = [];
    while (index < lines.length && lines[index].trim() !== '') {
        textLines.push(lines[index]);
        index++;
    }
    const text = textLines.join('\n');
    if (!text) {
        log('debug', 'Empty cue text');
    }
    const cue = {
        startTime,
        endTime,
        text,
    };
    if (cueId) {
        cue.id = cueId;
    }
    if (settings) {
        cue.settings = settings;
    }
    return { cue, nextIndex: index };
}
// ============================================
// Utility Functions
// ============================================
/**
 * Check if a string is valid WebVTT content
 */
export function isValidVTT(content) {
    if (!content || typeof content !== 'string') {
        return false;
    }
    const stripped = content.replace(PATTERNS.bom, '').trim();
    return stripped.startsWith(WEBVTT_SIGNATURE);
}
/**
 * Extract plain text from a cue (removing VTT formatting tags)
 *
 * @param text - Cue text potentially containing VTT tags
 * @returns Plain text without tags
 */
export function stripVTTTags(text) {
    // Remove VTT tags like <v Name>, <c.class>, <b>, <i>, <u>, <ruby>, <rt>, <lang>
    // Also handles <00:00:00.000> timestamp tags
    return text
        .replace(/<\/?[^>]+>/g, '') // Remove all tags
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lrm;/g, '\u200E')
        .replace(/&rlm;/g, '\u200F');
}
/**
 * Get the total duration of a VTT file based on the last cue's end time
 */
export function getVTTDuration(vttFile) {
    if (vttFile.cues.length === 0) {
        return 0;
    }
    let maxEndTime = 0;
    for (const cue of vttFile.cues) {
        const endMs = timestampToMs(cue.endTime);
        if (endMs > maxEndTime) {
            maxEndTime = endMs;
        }
    }
    return maxEndTime;
}
/**
 * Get cue at a specific time
 *
 * @param vttFile - Parsed VTT file
 * @param timeMs - Time in milliseconds
 * @returns Cue(s) active at the specified time
 */
export function getCuesAtTime(vttFile, timeMs) {
    return vttFile.cues.filter((cue) => {
        const start = timestampToMs(cue.startTime);
        const end = timestampToMs(cue.endTime);
        return timeMs >= start && timeMs < end;
    });
}
// ============================================
// Exports
// ============================================
export default {
    parseVTT,
    parseTimestamp,
    timestampToMs,
    msToTimestamp,
    compareTimestamps,
    isValidVTT,
    stripVTTTags,
    getVTTDuration,
    getCuesAtTime,
    setLogLevel,
};
//# sourceMappingURL=webvtt-parser.js.map