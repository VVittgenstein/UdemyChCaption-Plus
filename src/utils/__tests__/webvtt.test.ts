/**
 * WebVTT Parser and Generator Tests
 *
 * Task ID: T-20251223-act-006-build-webvtt-parser
 *
 * Test Coverage:
 * - [x] 解析器可正确解析标准 WebVTT 文件（含 cue ID、时间戳、文本）
 * - [x] 生成器可将解析结果还原为有效 WebVTT 字符串
 * - [x] 单元测试覆盖各种 VTT 格式（多行文本、样式标签等）
 * - [x] 解析后再生成的文件与原文件语义等价
 * - [x] 边界情况处理（空文件、格式错误等）
 */

import {
  parseVTT,
  parseTimestamp,
  timestampToMs,
  msToTimestamp,
  compareTimestamps,
  isValidVTT,
  stripVTTTags,
  getVTTDuration,
  getCuesAtTime,
} from '../webvtt-parser';

import {
  generateVTT,
  generateCue,
  generateFromCues,
  generateDataUri,
  formatTimestamp,
  createTimestamp,
  timestampFromMs,
  createCue,
  replaceCueTexts,
  mergeVTTFiles,
  extractCueTexts,
  validateVTTFile,
} from '../webvtt-generator';

import type { VTTFile, VTTCue, VTTTimestamp } from '../../types';

// ============================================
// Test Data
// ============================================

const SIMPLE_VTT = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
Hello, world!

2
00:00:05.000 --> 00:00:08.000
This is a test.`;

const VTT_WITH_HEADER = `WEBVTT - Test File

00:00:00.000 --> 00:00:02.000
First cue without ID`;

const VTT_WITH_STYLES = `WEBVTT

STYLE
::cue {
  color: yellow;
}

1
00:00:01.000 --> 00:00:04.000
Styled text`;

const VTT_WITH_MULTILINE = `WEBVTT

1
00:00:01.000 --> 00:00:05.000
Line one
Line two
Line three`;

const VTT_WITH_TAGS = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
<v Speaker>Hello</v>, <b>world</b>!`;

const VTT_WITH_SETTINGS = `WEBVTT

1
00:00:01.000 --> 00:00:04.000 position:50% align:center
Centered text`;

const VTT_WITH_BOM = '\uFEFFWEBVTT\n\n00:00:00.000 --> 00:00:01.000\nBOM test';

const VTT_SHORT_TIMESTAMPS = `WEBVTT

00:01.000 --> 00:05.000
Short format`;

const VTT_WITH_NOTE = `WEBVTT

NOTE This is a comment

1
00:00:01.000 --> 00:00:04.000
After note`;

const INVALID_VTT_NO_SIGNATURE = `This is not a VTT file

00:00:01.000 --> 00:00:04.000
Text`;

const INVALID_VTT_BAD_TIMESTAMP = `WEBVTT

1
00:00:01.000 --> invalid
Bad timestamp`;

// ============================================
// Parser Tests
// ============================================

describe('WebVTT Parser', () => {
  describe('parseVTT', () => {
    test('parses simple VTT file', () => {
      const result = parseVTT(SIMPLE_VTT);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.cues).toHaveLength(2);

      const cue1 = result.data!.cues[0];
      expect(cue1.id).toBe('1');
      expect(cue1.text).toBe('Hello, world!');
      expect(cue1.startTime).toEqual({ hours: 0, minutes: 0, seconds: 1, milliseconds: 0 });
      expect(cue1.endTime).toEqual({ hours: 0, minutes: 0, seconds: 4, milliseconds: 0 });

      const cue2 = result.data!.cues[1];
      expect(cue2.id).toBe('2');
      expect(cue2.text).toBe('This is a test.');
    });

    test('parses VTT with header', () => {
      const result = parseVTT(VTT_WITH_HEADER);

      expect(result.success).toBe(true);
      expect(result.data!.header).toBe('Test File');
      expect(result.data!.cues).toHaveLength(1);
      expect(result.data!.cues[0].id).toBeUndefined();
    });

    test('parses VTT with style blocks', () => {
      const result = parseVTT(VTT_WITH_STYLES);

      expect(result.success).toBe(true);
      expect(result.data!.styles).toBeDefined();
      expect(result.data!.styles).toHaveLength(1);
      expect(result.data!.styles![0]).toContain('color: yellow');
    });

    test('parses VTT with multiline cue text', () => {
      const result = parseVTT(VTT_WITH_MULTILINE);

      expect(result.success).toBe(true);
      expect(result.data!.cues[0].text).toBe('Line one\nLine two\nLine three');
    });

    test('parses VTT with cue settings', () => {
      const result = parseVTT(VTT_WITH_SETTINGS);

      expect(result.success).toBe(true);
      expect(result.data!.cues[0].settings).toBe('position:50% align:center');
    });

    test('handles BOM prefix', () => {
      const result = parseVTT(VTT_WITH_BOM);

      expect(result.success).toBe(true);
      expect(result.data!.cues).toHaveLength(1);
    });

    test('parses short timestamp format', () => {
      const result = parseVTT(VTT_SHORT_TIMESTAMPS);

      expect(result.success).toBe(true);
      expect(result.data!.cues[0].startTime).toEqual({
        hours: 0,
        minutes: 0,
        seconds: 1,
        milliseconds: 0,
      });
    });

    test('parses VTT with NOTE blocks', () => {
      const result = parseVTT(VTT_WITH_NOTE);

      expect(result.success).toBe(true);
      expect(result.data!.notes).toBeDefined();
      expect(result.data!.notes).toHaveLength(1);
      expect(result.data!.notes![0]).toBe('This is a comment');
    });

    test('fails on missing WEBVTT signature', () => {
      const result = parseVTT(INVALID_VTT_NO_SIGNATURE);

      expect(result.success).toBe(false);
      expect(result.error).toContain('missing WEBVTT signature');
    });

    test('handles invalid timestamps gracefully', () => {
      const result = parseVTT(INVALID_VTT_BAD_TIMESTAMP);

      expect(result.success).toBe(true);
      expect(result.data!.cues).toHaveLength(0);
      expect(result.warnings).toBeDefined();
    });

    test('returns error for empty input', () => {
      const result = parseVTT('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Empty or invalid input');
    });

    test('returns error for null input', () => {
      const result = parseVTT(null as unknown as string);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Empty or invalid input');
    });
  });

  describe('parseTimestamp', () => {
    test('parses HH:MM:SS.mmm format', () => {
      const result = parseTimestamp('01:23:45.678');

      expect(result).toEqual({
        hours: 1,
        minutes: 23,
        seconds: 45,
        milliseconds: 678,
      });
    });

    test('parses MM:SS.mmm format', () => {
      const result = parseTimestamp('23:45.678');

      expect(result).toEqual({
        hours: 0,
        minutes: 23,
        seconds: 45,
        milliseconds: 678,
      });
    });

    test('returns null for invalid format', () => {
      expect(parseTimestamp('invalid')).toBeNull();
      expect(parseTimestamp('1:2:3.4')).toBeNull();
      expect(parseTimestamp('')).toBeNull();
    });

    test('returns null for out of range values', () => {
      expect(parseTimestamp('00:60:00.000')).toBeNull(); // minutes > 59
      expect(parseTimestamp('00:00:60.000')).toBeNull(); // seconds > 59
    });
  });

  describe('timestampToMs / msToTimestamp', () => {
    test('converts timestamp to milliseconds', () => {
      const ts: VTTTimestamp = { hours: 1, minutes: 30, seconds: 45, milliseconds: 500 };
      expect(timestampToMs(ts)).toBe(5445500);
    });

    test('converts milliseconds to timestamp', () => {
      const result = msToTimestamp(5445500);
      expect(result).toEqual({ hours: 1, minutes: 30, seconds: 45, milliseconds: 500 });
    });

    test('round-trips correctly', () => {
      const original: VTTTimestamp = { hours: 2, minutes: 15, seconds: 30, milliseconds: 250 };
      const ms = timestampToMs(original);
      const converted = msToTimestamp(ms);
      expect(converted).toEqual(original);
    });
  });

  describe('compareTimestamps', () => {
    test('returns negative when a < b', () => {
      const a: VTTTimestamp = { hours: 0, minutes: 0, seconds: 1, milliseconds: 0 };
      const b: VTTTimestamp = { hours: 0, minutes: 0, seconds: 2, milliseconds: 0 };
      expect(compareTimestamps(a, b)).toBeLessThan(0);
    });

    test('returns positive when a > b', () => {
      const a: VTTTimestamp = { hours: 0, minutes: 0, seconds: 2, milliseconds: 0 };
      const b: VTTTimestamp = { hours: 0, minutes: 0, seconds: 1, milliseconds: 0 };
      expect(compareTimestamps(a, b)).toBeGreaterThan(0);
    });

    test('returns 0 when equal', () => {
      const a: VTTTimestamp = { hours: 0, minutes: 0, seconds: 1, milliseconds: 500 };
      const b: VTTTimestamp = { hours: 0, minutes: 0, seconds: 1, milliseconds: 500 };
      expect(compareTimestamps(a, b)).toBe(0);
    });
  });

  describe('isValidVTT', () => {
    test('returns true for valid VTT', () => {
      expect(isValidVTT(SIMPLE_VTT)).toBe(true);
      expect(isValidVTT(VTT_WITH_BOM)).toBe(true);
    });

    test('returns false for invalid VTT', () => {
      expect(isValidVTT(INVALID_VTT_NO_SIGNATURE)).toBe(false);
      expect(isValidVTT('')).toBe(false);
      expect(isValidVTT(null as unknown as string)).toBe(false);
    });
  });

  describe('stripVTTTags', () => {
    test('removes voice tags', () => {
      expect(stripVTTTags('<v Speaker>Hello</v>')).toBe('Hello');
    });

    test('removes style tags', () => {
      expect(stripVTTTags('<b>bold</b> and <i>italic</i>')).toBe('bold and italic');
    });

    test('handles HTML entities', () => {
      expect(stripVTTTags('&lt;tag&gt; &amp; text')).toBe('<tag> & text');
    });

    test('returns plain text unchanged', () => {
      expect(stripVTTTags('plain text')).toBe('plain text');
    });
  });

  describe('getVTTDuration', () => {
    test('returns duration based on last cue', () => {
      const result = parseVTT(SIMPLE_VTT);
      expect(getVTTDuration(result.data!)).toBe(8000); // 8 seconds
    });

    test('returns 0 for empty file', () => {
      expect(getVTTDuration({ cues: [] })).toBe(0);
    });
  });

  describe('getCuesAtTime', () => {
    test('returns cues active at specified time', () => {
      const result = parseVTT(SIMPLE_VTT);
      const cues = getCuesAtTime(result.data!, 2000);

      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('Hello, world!');
    });

    test('returns empty array when no cue is active', () => {
      const result = parseVTT(SIMPLE_VTT);
      const cues = getCuesAtTime(result.data!, 4500); // Between cues

      expect(cues).toHaveLength(0);
    });
  });
});

// ============================================
// Generator Tests
// ============================================

describe('WebVTT Generator', () => {
  describe('generateVTT', () => {
    test('generates valid VTT from parsed data', () => {
      const parsed = parseVTT(SIMPLE_VTT);
      const generated = generateVTT(parsed.data!);

      expect(generated).toContain('WEBVTT');
      expect(generated).toContain('00:00:01.000 --> 00:00:04.000');
      expect(generated).toContain('Hello, world!');
    });

    test('includes header when present', () => {
      const parsed = parseVTT(VTT_WITH_HEADER);
      const generated = generateVTT(parsed.data!);

      expect(generated).toContain('WEBVTT Test File');
    });

    test('includes styles when present', () => {
      const parsed = parseVTT(VTT_WITH_STYLES);
      const generated = generateVTT(parsed.data!);

      expect(generated).toContain('STYLE');
      expect(generated).toContain('color: yellow');
    });

    test('preserves multiline cue text', () => {
      const parsed = parseVTT(VTT_WITH_MULTILINE);
      const generated = generateVTT(parsed.data!);

      expect(generated).toContain('Line one\nLine two\nLine three');
    });

    test('preserves cue settings', () => {
      const parsed = parseVTT(VTT_WITH_SETTINGS);
      const generated = generateVTT(parsed.data!);

      expect(generated).toContain('position:50% align:center');
    });

    test('respects generator options', () => {
      const parsed = parseVTT(SIMPLE_VTT);
      const generated = generateVTT(parsed.data!, { includeCueIds: false });

      expect(generated).not.toContain('\n1\n');
      expect(generated).not.toContain('\n2\n');
    });
  });

  describe('formatTimestamp', () => {
    test('formats with hours', () => {
      const ts: VTTTimestamp = { hours: 1, minutes: 23, seconds: 45, milliseconds: 678 };
      expect(formatTimestamp(ts)).toBe('01:23:45.678');
    });

    test('formats short when hours is 0 and useShort is true', () => {
      const ts: VTTTimestamp = { hours: 0, minutes: 23, seconds: 45, milliseconds: 678 };
      expect(formatTimestamp(ts, true)).toBe('23:45.678');
    });

    test('formats with hours when useShort is false', () => {
      const ts: VTTTimestamp = { hours: 0, minutes: 23, seconds: 45, milliseconds: 678 };
      expect(formatTimestamp(ts, false)).toBe('00:23:45.678');
    });
  });

  describe('createTimestamp / timestampFromMs', () => {
    test('creates timestamp from components', () => {
      const ts = createTimestamp(1, 30, 45, 500);
      expect(ts).toEqual({ hours: 1, minutes: 30, seconds: 45, milliseconds: 500 });
    });

    test('creates timestamp from milliseconds', () => {
      const ts = timestampFromMs(5445500);
      expect(ts).toEqual({ hours: 1, minutes: 30, seconds: 45, milliseconds: 500 });
    });
  });

  describe('createCue', () => {
    test('creates cue with required fields', () => {
      const start: VTTTimestamp = { hours: 0, minutes: 0, seconds: 1, milliseconds: 0 };
      const end: VTTTimestamp = { hours: 0, minutes: 0, seconds: 4, milliseconds: 0 };
      const cue = createCue(start, end, 'Test text');

      expect(cue.startTime).toEqual(start);
      expect(cue.endTime).toEqual(end);
      expect(cue.text).toBe('Test text');
      expect(cue.id).toBeUndefined();
    });

    test('creates cue with optional fields', () => {
      const start: VTTTimestamp = { hours: 0, minutes: 0, seconds: 1, milliseconds: 0 };
      const end: VTTTimestamp = { hours: 0, minutes: 0, seconds: 4, milliseconds: 0 };
      const cue = createCue(start, end, 'Test text', 'cue-1', 'align:center');

      expect(cue.id).toBe('cue-1');
      expect(cue.settings).toBe('align:center');
    });
  });

  describe('generateCue', () => {
    test('generates cue with ID', () => {
      const cue: VTTCue = {
        id: '1',
        startTime: { hours: 0, minutes: 0, seconds: 1, milliseconds: 0 },
        endTime: { hours: 0, minutes: 0, seconds: 4, milliseconds: 0 },
        text: 'Test',
      };
      const result = generateCue(cue);

      expect(result).toContain('1\n');
      expect(result).toContain('00:00:01.000 --> 00:00:04.000');
    });

    test('generates cue without ID when option disabled', () => {
      const cue: VTTCue = {
        id: '1',
        startTime: { hours: 0, minutes: 0, seconds: 1, milliseconds: 0 },
        endTime: { hours: 0, minutes: 0, seconds: 4, milliseconds: 0 },
        text: 'Test',
      };
      const result = generateCue(cue, { includeCueIds: false });

      expect(result).not.toContain('1\n');
    });
  });

  describe('generateFromCues', () => {
    test('generates VTT from cue array', () => {
      const cues: VTTCue[] = [
        {
          startTime: { hours: 0, minutes: 0, seconds: 1, milliseconds: 0 },
          endTime: { hours: 0, minutes: 0, seconds: 4, milliseconds: 0 },
          text: 'First cue',
        },
        {
          startTime: { hours: 0, minutes: 0, seconds: 5, milliseconds: 0 },
          endTime: { hours: 0, minutes: 0, seconds: 8, milliseconds: 0 },
          text: 'Second cue',
        },
      ];

      const result = generateFromCues(cues);

      expect(result).toContain('WEBVTT');
      expect(result).toContain('First cue');
      expect(result).toContain('Second cue');
    });
  });

  describe('generateDataUri', () => {
    test('generates valid data URI', () => {
      const vtt: VTTFile = {
        cues: [
          {
            startTime: { hours: 0, minutes: 0, seconds: 1, milliseconds: 0 },
            endTime: { hours: 0, minutes: 0, seconds: 4, milliseconds: 0 },
            text: 'Test',
          },
        ],
      };

      const uri = generateDataUri(vtt);

      expect(uri).toMatch(/^data:text\/vtt;base64,/);
    });

    test('accepts string input', () => {
      const uri = generateDataUri('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nTest');

      expect(uri).toMatch(/^data:text\/vtt;base64,/);
    });
  });

  describe('replaceCueTexts', () => {
    test('replaces cue texts while preserving structure', () => {
      const parsed = parseVTT(SIMPLE_VTT);
      const newTexts = ['你好，世界！', '这是一个测试。'];
      const replaced = replaceCueTexts(parsed.data!, newTexts);

      expect(replaced.cues[0].text).toBe('你好，世界！');
      expect(replaced.cues[1].text).toBe('这是一个测试。');
      // Timestamps should be preserved
      expect(replaced.cues[0].startTime).toEqual(parsed.data!.cues[0].startTime);
    });
  });

  describe('mergeVTTFiles', () => {
    test('merges multiple VTT files', () => {
      const vtt1: VTTFile = {
        cues: [
          {
            startTime: { hours: 0, minutes: 0, seconds: 1, milliseconds: 0 },
            endTime: { hours: 0, minutes: 0, seconds: 4, milliseconds: 0 },
            text: 'First',
          },
        ],
      };
      const vtt2: VTTFile = {
        cues: [
          {
            startTime: { hours: 0, minutes: 0, seconds: 5, milliseconds: 0 },
            endTime: { hours: 0, minutes: 0, seconds: 8, milliseconds: 0 },
            text: 'Second',
          },
        ],
      };

      const merged = mergeVTTFiles([vtt1, vtt2]);

      expect(merged.cues).toHaveLength(2);
    });

    test('sorts cues by start time', () => {
      const vtt1: VTTFile = {
        cues: [
          {
            startTime: { hours: 0, minutes: 0, seconds: 5, milliseconds: 0 },
            endTime: { hours: 0, minutes: 0, seconds: 8, milliseconds: 0 },
            text: 'Later',
          },
        ],
      };
      const vtt2: VTTFile = {
        cues: [
          {
            startTime: { hours: 0, minutes: 0, seconds: 1, milliseconds: 0 },
            endTime: { hours: 0, minutes: 0, seconds: 4, milliseconds: 0 },
            text: 'Earlier',
          },
        ],
      };

      const merged = mergeVTTFiles([vtt1, vtt2]);

      expect(merged.cues[0].text).toBe('Earlier');
      expect(merged.cues[1].text).toBe('Later');
    });
  });

  describe('extractCueTexts', () => {
    test('extracts all cue texts as array', () => {
      const parsed = parseVTT(SIMPLE_VTT);
      const texts = extractCueTexts(parsed.data!);

      expect(texts).toEqual(['Hello, world!', 'This is a test.']);
    });
  });

  describe('validateVTTFile', () => {
    test('validates well-formed VTT file', () => {
      const parsed = parseVTT(SIMPLE_VTT);
      const result = validateVTTFile(parsed.data!);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('catches invalid timestamps', () => {
      const vtt: VTTFile = {
        cues: [
          {
            startTime: { hours: 0, minutes: 60, seconds: 0, milliseconds: 0 },
            endTime: { hours: 0, minutes: 0, seconds: 4, milliseconds: 0 },
            text: 'Invalid',
          },
        ],
      };

      const result = validateVTTFile(vtt);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('catches start time >= end time', () => {
      const vtt: VTTFile = {
        cues: [
          {
            startTime: { hours: 0, minutes: 0, seconds: 5, milliseconds: 0 },
            endTime: { hours: 0, minutes: 0, seconds: 4, milliseconds: 0 },
            text: 'Invalid',
          },
        ],
      };

      const result = validateVTTFile(vtt);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('start time >= end time'))).toBe(true);
    });
  });
});

// ============================================
// Round-Trip Tests
// ============================================

describe('Parse-Generate Round-Trip', () => {
  test('simple VTT round-trips correctly', () => {
    const parsed1 = parseVTT(SIMPLE_VTT);
    const generated = generateVTT(parsed1.data!);
    const parsed2 = parseVTT(generated);

    expect(parsed2.success).toBe(true);
    expect(parsed2.data!.cues.length).toBe(parsed1.data!.cues.length);

    for (let i = 0; i < parsed1.data!.cues.length; i++) {
      expect(parsed2.data!.cues[i].text).toBe(parsed1.data!.cues[i].text);
      expect(parsed2.data!.cues[i].startTime).toEqual(parsed1.data!.cues[i].startTime);
      expect(parsed2.data!.cues[i].endTime).toEqual(parsed1.data!.cues[i].endTime);
    }
  });

  test('VTT with styles round-trips correctly', () => {
    const parsed1 = parseVTT(VTT_WITH_STYLES);
    const generated = generateVTT(parsed1.data!);
    const parsed2 = parseVTT(generated);

    expect(parsed2.success).toBe(true);
    expect(parsed2.data!.styles).toBeDefined();
    expect(parsed2.data!.styles![0]).toContain('color: yellow');
  });

  test('VTT with multiline cues round-trips correctly', () => {
    const parsed1 = parseVTT(VTT_WITH_MULTILINE);
    const generated = generateVTT(parsed1.data!);
    const parsed2 = parseVTT(generated);

    expect(parsed2.success).toBe(true);
    expect(parsed2.data!.cues[0].text).toBe('Line one\nLine two\nLine three');
  });

  test('VTT with settings round-trips correctly', () => {
    const parsed1 = parseVTT(VTT_WITH_SETTINGS);
    const generated = generateVTT(parsed1.data!);
    const parsed2 = parseVTT(generated);

    expect(parsed2.success).toBe(true);
    expect(parsed2.data!.cues[0].settings).toBe('position:50% align:center');
  });
});
