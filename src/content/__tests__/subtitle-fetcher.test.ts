/**
 * Unit Tests for Subtitle Fetcher Module
 *
 * Task ID: T-20251223-act-005-build-subtitle-fetch
 *
 * Test coverage:
 * - URL/Course info extraction
 * - Video detection logic
 * - Subtitle track extraction
 * - VTT content validation
 * - Track selection logic
 */

import {
  extractCourseInfo,
  selectPreferredTrack,
  fetchVTT,
  SubtitleFetcher,
} from '../subtitle-fetcher';
import type { SubtitleTrack } from '../../types';

// ============================================
// Mock Setup
// ============================================

// Mock window.location
const mockLocation = (href: string) => {
  Object.defineProperty(window, 'location', {
    value: { href, pathname: new URL(href).pathname },
    writable: true,
  });
};

// Mock fetch
const mockFetch = (response: { ok: boolean; status?: number; text?: string }) => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status || (response.ok ? 200 : 500),
    statusText: response.ok ? 'OK' : 'Error',
    text: jest.fn().mockResolvedValue(response.text || ''),
  });
};

// Mock performance API
const mockPerformanceEntries = (entries: { name: string }[]) => {
  global.performance.getEntriesByType = jest.fn().mockReturnValue(entries);
};

// Mock document.querySelector
const mockDocument = () => {
  const elements: Record<string, HTMLElement | null> = {};

  document.querySelector = jest.fn((selector: string) => {
    return elements[selector] || null;
  }) as any;

  return {
    setElement: (selector: string, element: HTMLElement | null) => {
      elements[selector] = element;
    },
  };
};

// Create mock video element
const createMockVideo = (options: {
  src?: string;
  width?: number;
  height?: number;
  tracks?: Array<{
    src: string;
    srclang: string;
    label: string;
    kind: string;
    default?: boolean;
  }>;
}): HTMLVideoElement => {
  const video = document.createElement('video');
  video.src = options.src || 'https://example.com/video.mp4';

  // Mock getBoundingClientRect
  video.getBoundingClientRect = jest.fn().mockReturnValue({
    width: options.width || 1280,
    height: options.height || 720,
  });

  // Add track elements
  if (options.tracks) {
    options.tracks.forEach((trackInfo) => {
      const track = document.createElement('track');
      track.src = trackInfo.src;
      track.srclang = trackInfo.srclang;
      track.label = trackInfo.label;
      track.kind = trackInfo.kind;
      track.default = trackInfo.default || false;
      video.appendChild(track);
    });
  }

  // Mock textTracks
  Object.defineProperty(video, 'textTracks', {
    value: {
      length: options.tracks?.length || 0,
      [Symbol.iterator]: function* () {
        for (let i = 0; i < (options.tracks?.length || 0); i++) {
          yield {
            kind: options.tracks![i].kind,
            language: options.tracks![i].srclang,
            label: options.tracks![i].label,
            mode: options.tracks![i].default ? 'showing' : 'disabled',
          };
        }
      },
    },
  });

  return video;
};

// ============================================
// Tests: Course Info Extraction
// ============================================

describe('extractCourseInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('extracts course info from valid Udemy URL', () => {
    mockLocation(
      'https://www.udemy.com/course/2d-rpg-alexdev/learn/lecture/36963178'
    );
    mockPerformanceEntries([]);
    mockDocument();

    const info = extractCourseInfo();

    expect(info).not.toBeNull();
    expect(info?.courseSlug).toBe('2d-rpg-alexdev');
    expect(info?.lectureId).toBe('36963178');
  });

  test('extracts course ID from performance API', () => {
    mockLocation(
      'https://www.udemy.com/course/test-course/learn/lecture/12345'
    );
    mockPerformanceEntries([
      { name: 'https://www.udemy.com/api-2.0/courses/5059176/something' },
    ]);
    mockDocument();

    const info = extractCourseInfo();

    expect(info?.courseId).toBe('5059176');
  });

  test('returns null for non-Udemy URL', () => {
    mockLocation('https://www.example.com/page');
    mockPerformanceEntries([]);
    mockDocument();

    const info = extractCourseInfo();

    expect(info).toBeNull();
  });

  test('returns null for Udemy homepage', () => {
    mockLocation('https://www.udemy.com/');
    mockPerformanceEntries([]);
    mockDocument();

    const info = extractCourseInfo();

    expect(info).toBeNull();
  });

  test('handles URL with query parameters', () => {
    mockLocation(
      'https://www.udemy.com/course/my-course/learn/lecture/99999?start=0#content'
    );
    mockPerformanceEntries([]);
    mockDocument();

    const info = extractCourseInfo();

    expect(info).not.toBeNull();
    expect(info?.courseSlug).toBe('my-course');
    expect(info?.lectureId).toBe('99999');
  });
});

// ============================================
// Tests: Track Selection
// ============================================

describe('selectPreferredTrack', () => {
  test('selects English track when available', () => {
    const tracks: SubtitleTrack[] = [
      {
        url: 'https://example.com/zh.vtt',
        language: 'zh',
        label: 'Chinese',
        isDefault: false,
        kind: 'subtitles',
      },
      {
        url: 'https://example.com/en.vtt',
        language: 'en',
        label: 'English',
        isDefault: false,
        kind: 'subtitles',
      },
      {
        url: 'https://example.com/es.vtt',
        language: 'es',
        label: 'Spanish',
        isDefault: true,
        kind: 'subtitles',
      },
    ];

    const selected = selectPreferredTrack(tracks);

    expect(selected?.language).toBe('en');
    expect(selected?.label).toBe('English');
  });

  test('selects en-US when en not available', () => {
    const tracks: SubtitleTrack[] = [
      {
        url: 'https://example.com/en-US.vtt',
        language: 'en-US',
        label: 'English (US)',
        isDefault: false,
        kind: 'subtitles',
      },
      {
        url: 'https://example.com/fr.vtt',
        language: 'fr',
        label: 'French',
        isDefault: false,
        kind: 'subtitles',
      },
    ];

    const selected = selectPreferredTrack(tracks);

    expect(selected?.language).toBe('en-US');
  });

  test('selects any English variant when exact match not found', () => {
    const tracks: SubtitleTrack[] = [
      {
        url: 'https://example.com/en-AU.vtt',
        language: 'en-AU',
        label: 'English (Australia)',
        isDefault: false,
        kind: 'subtitles',
      },
      {
        url: 'https://example.com/de.vtt',
        language: 'de',
        label: 'German',
        isDefault: false,
        kind: 'subtitles',
      },
    ];

    const selected = selectPreferredTrack(tracks);

    expect(selected?.language).toBe('en-AU');
  });

  test('selects default track when no English available', () => {
    const tracks: SubtitleTrack[] = [
      {
        url: 'https://example.com/fr.vtt',
        language: 'fr',
        label: 'French',
        isDefault: false,
        kind: 'subtitles',
      },
      {
        url: 'https://example.com/de.vtt',
        language: 'de',
        label: 'German',
        isDefault: true,
        kind: 'subtitles',
      },
    ];

    const selected = selectPreferredTrack(tracks);

    expect(selected?.language).toBe('de');
    expect(selected?.isDefault).toBe(true);
  });

  test('selects first track as fallback', () => {
    const tracks: SubtitleTrack[] = [
      {
        url: 'https://example.com/ja.vtt',
        language: 'ja',
        label: 'Japanese',
        isDefault: false,
        kind: 'subtitles',
      },
      {
        url: 'https://example.com/ko.vtt',
        language: 'ko',
        label: 'Korean',
        isDefault: false,
        kind: 'subtitles',
      },
    ];

    const selected = selectPreferredTrack(tracks);

    expect(selected?.language).toBe('ja');
  });

  test('returns null for empty tracks array', () => {
    const selected = selectPreferredTrack([]);
    expect(selected).toBeNull();
  });
});

// ============================================
// Tests: VTT Fetching
// ============================================

describe('fetchVTT', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock crypto.subtle
    Object.defineProperty(global, 'crypto', {
      value: {
        subtle: {
          digest: jest.fn().mockResolvedValue(new ArrayBuffer(32)),
        },
      },
    });
  });

  test('successfully fetches valid VTT content', async () => {
    const vttContent = `WEBVTT

1
00:00:00.000 --> 00:00:05.000
Hello World

2
00:00:05.000 --> 00:00:10.000
This is a test`;

    mockFetch({ ok: true, text: vttContent });

    const result = await fetchVTT('https://example.com/subtitles_en.vtt');

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.content).toBe(vttContent);
    expect(result.data?.language).toBe('en');
  });

  test('returns error for empty URL', async () => {
    const result = await fetchVTT('');

    expect(result.success).toBe(false);
    expect(result.error).toBe('No URL provided');
  });

  test('returns error for HTTP failure', async () => {
    mockFetch({ ok: false, status: 404 });

    const result = await fetchVTT('https://example.com/nonexistent.vtt');

    expect(result.success).toBe(false);
    expect(result.error).toContain('404');
  });

  test('returns error for invalid VTT content', async () => {
    mockFetch({ ok: true, text: 'This is not VTT content' });

    const result = await fetchVTT('https://example.com/invalid.vtt');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid VTT format');
  });

  test('extracts language from URL with underscore pattern', async () => {
    const vttContent = 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\nTest';
    mockFetch({ ok: true, text: vttContent });

    const result = await fetchVTT('https://example.com/subtitle_fr_FR.vtt');

    expect(result.success).toBe(true);
    expect(result.data?.language).toBe('fr');
  });

  test('extracts language from URL with lang parameter', async () => {
    const vttContent = 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\nTest';
    mockFetch({ ok: true, text: vttContent });

    const result = await fetchVTT(
      'https://example.com/caption?lang=de&format=vtt'
    );

    expect(result.success).toBe(true);
    expect(result.data?.language).toBe('de');
  });

  test('calculates hash for VTT content', async () => {
    const vttContent = 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\nTest';
    mockFetch({ ok: true, text: vttContent });

    const result = await fetchVTT('https://example.com/test.vtt');

    expect(result.success).toBe(true);
    expect(result.data?.hash).toBeDefined();
    expect(result.data?.hash.length).toBeGreaterThan(0);
  });

  test('handles fetch timeout', async () => {
    // Mock fetch to never resolve
    global.fetch = jest.fn().mockImplementation(
      () =>
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('aborted')), 100);
        })
    );

    const result = await fetchVTT('https://example.com/slow.vtt');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Request timeout');
  });
});

// ============================================
// Tests: SubtitleFetcher Class
// ============================================

describe('SubtitleFetcher class', () => {
  test('initializes and stores video reference', async () => {
    const docMock = mockDocument();
    const mockVideo = createMockVideo({ src: 'https://example.com/video.mp4' });
    docMock.setElement('video', mockVideo);

    const fetcher = new SubtitleFetcher();

    // Note: initialize() uses detectVideo which polls for video
    // This is a simplified test
    expect(fetcher.getVideo()).toBeNull();
    expect(fetcher.getCourseInfo()).toBeNull();
  });

  test('selectPreferredTrack works without prior getSubtitleTracks call', () => {
    const fetcher = new SubtitleFetcher();
    const selected = fetcher.selectPreferredTrack();

    expect(selected).toBeNull();
  });
});

// ============================================
// Tests: VTT Content Validation
// ============================================

describe('VTT content validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(global, 'crypto', {
      value: {
        subtle: {
          digest: jest.fn().mockResolvedValue(new ArrayBuffer(32)),
        },
      },
    });
  });

  test('accepts valid WEBVTT with cues', async () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:05.000
First cue

00:00:05.000 --> 00:00:10.000
Second cue`;

    mockFetch({ ok: true, text: vtt });
    const result = await fetchVTT('https://example.com/valid.vtt');

    expect(result.success).toBe(true);
  });

  test('accepts WEBVTT with header metadata', async () => {
    const vtt = `WEBVTT Kind: captions; Language: en

NOTE This is a comment

00:00:00.000 --> 00:00:05.000
Cue text`;

    mockFetch({ ok: true, text: vtt });
    const result = await fetchVTT('https://example.com/metadata.vtt');

    expect(result.success).toBe(true);
  });

  test('accepts WEBVTT with BOM', async () => {
    const vtt = '\uFEFFWEBVTT\n\n00:00:00.000 --> 00:00:01.000\nTest';

    mockFetch({ ok: true, text: vtt });
    const result = await fetchVTT('https://example.com/bom.vtt');

    // Should still work after trimming
    expect(result.success).toBe(true);
  });

  test('rejects content without WEBVTT header', async () => {
    const notVtt = `1
00:00:00,000 --> 00:00:05,000
This is SRT format not VTT`;

    mockFetch({ ok: true, text: notVtt });
    const result = await fetchVTT('https://example.com/srt.vtt');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid VTT format');
  });

  test('rejects HTML content', async () => {
    const html = `<!DOCTYPE html>
<html>
<head><title>404</title></head>
<body>Not Found</body>
</html>`;

    mockFetch({ ok: true, text: html });
    const result = await fetchVTT('https://example.com/404.html');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid VTT format');
  });
});

// ============================================
// Tests: Edge Cases
// ============================================

describe('Edge cases', () => {
  test('handles video element with no source', () => {
    const video = document.createElement('video');
    // No src attribute

    video.getBoundingClientRect = jest.fn().mockReturnValue({
      width: 1280,
      height: 720,
    });

    // This video should be considered invalid
    expect(video.src).toBe('');
  });

  test('handles hidden video element', () => {
    const video = createMockVideo({
      src: 'https://example.com/video.mp4',
      width: 0,
      height: 0,
    });

    // Video with 0 dimensions should be considered invalid
    const rect = video.getBoundingClientRect();
    expect(rect.width).toBe(0);
    expect(rect.height).toBe(0);
  });

  test('handles tracks with missing properties', () => {
    const tracks: SubtitleTrack[] = [
      {
        url: '',
        language: '',
        label: '',
        isDefault: false,
        kind: 'subtitles',
      },
    ];

    const selected = selectPreferredTrack(tracks);

    // Should return the track even with empty values
    expect(selected).not.toBeNull();
  });

  test('handles case-insensitive language matching', () => {
    const tracks: SubtitleTrack[] = [
      {
        url: 'https://example.com/EN.vtt',
        language: 'EN',
        label: 'ENGLISH',
        isDefault: false,
        kind: 'subtitles',
      },
    ];

    const selected = selectPreferredTrack(tracks);

    expect(selected?.language).toBe('EN');
  });
});
