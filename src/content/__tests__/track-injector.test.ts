/**
 * Track Injector Module Tests
 *
 * Task ID: T-20251223-act-008-build-track-injector
 */

import {
  injectTrack,
  injectTrackBlob,
  injectTrackCues,
  activateTrack,
  deactivateTrack,
  setTrackMode,
  removeTrack,
  removeAllTracks,
  updateTrackContent,
  getInjectedTracks,
  hasInjectedTracks,
  getActiveInjectedTrack,
  findTrackByLabel,
  setLogLevel,
  TrackInjector,
  DEFAULT_LABEL,
  DEFAULT_LANGUAGE,
  INJECTED_TRACK_ATTR,
  TRACK_INJECTED_EVENT,
  TRACK_ACTIVATED_EVENT,
} from '../track-injector';

// ============================================
// Test Setup
// ============================================

// Mock URL.createObjectURL and revokeObjectURL
const mockObjectURLs = new Map<string, Blob>();
let objectURLCounter = 0;

beforeAll(() => {
  // Suppress logs during tests
  setLogLevel('error');

  // Mock URL.createObjectURL
  global.URL.createObjectURL = jest.fn((blob: Blob) => {
    const url = `blob:mock-url-${++objectURLCounter}`;
    mockObjectURLs.set(url, blob);
    return url;
  });

  // Mock URL.revokeObjectURL
  global.URL.revokeObjectURL = jest.fn((url: string) => {
    mockObjectURLs.delete(url);
  });

  // Mock VTTCue (not available in jsdom)
  if (typeof VTTCue === 'undefined') {
    (global as unknown as Record<string, unknown>).VTTCue = class MockVTTCue {
      startTime: number;
      endTime: number;
      text: string;

      constructor(startTime: number, endTime: number, text: string) {
        this.startTime = startTime;
        this.endTime = endTime;
        this.text = text;
      }
    };
  }
});

afterEach(() => {
  // Clean up DOM
  document.body.innerHTML = '';
  mockObjectURLs.clear();
  objectURLCounter = 0;
});

// ============================================
// Helper Functions
// ============================================

function createMockVideo(): HTMLVideoElement {
  const video = document.createElement('video');
  video.src = 'https://example.com/video.mp4';

  // Mock textTracks
  const textTracks: TextTrack[] = [];
  let textTracksLength = 0;

  // Create a mock TextTrackList
  const mockTextTrackList = {
    get length() {
      return textTracksLength;
    },
    [Symbol.iterator]: function* () {
      for (let i = 0; i < textTracksLength; i++) {
        yield textTracks[i];
      }
    },
    item(index: number) {
      return textTracks[index] || null;
    },
    getTrackById(_id: string) {
      return textTracks.find((t) => (t as TextTrack & { id: string }).id === _id) || null;
    },
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(() => true),
    onchange: null,
    onaddtrack: null,
    onremovetrack: null,
  };

  // Make it array-like
  for (let i = 0; i < 10; i++) {
    Object.defineProperty(mockTextTrackList, i, {
      get() {
        return textTracks[i];
      },
      configurable: true,
    });
  }

  Object.defineProperty(video, 'textTracks', {
    value: mockTextTrackList,
    writable: false,
  });

  // Mock appendChild to also update textTracks
  const originalAppendChild = video.appendChild.bind(video);
  video.appendChild = function <T extends Node>(node: T): T {
    const result = originalAppendChild(node);

    // If a track element is added, add it to textTracks mock
    if (node instanceof HTMLTrackElement) {
      const trackElement = node as HTMLTrackElement;
      const mockTextTrack = {
        kind: trackElement.kind,
        label: trackElement.label,
        language: trackElement.srclang,
        mode: 'disabled' as TextTrackMode,
        cues: null,
        activeCues: null,
        addCue: jest.fn(),
        removeCue: jest.fn(),
        oncuechange: null,
        id: '',
        inBandMetadataTrackDispatchType: '',
      } as unknown as TextTrack;
      textTracks.push(mockTextTrack);
      textTracksLength++;

      // Set up the track property on the HTMLTrackElement
      Object.defineProperty(trackElement, 'track', {
        value: mockTextTrack,
        writable: false,
        configurable: true,
      });

      // Simulate the track loading asynchronously
      setTimeout(() => {
        trackElement.dispatchEvent(new Event('load'));
      }, 0);
    }

    return result;
  };

  // Mock addTextTrack
  video.addTextTrack = jest.fn((kind: TextTrackKind, label?: string, language?: string) => {
    const mockTextTrack = {
      kind,
      label: label || '',
      language: language || '',
      mode: 'disabled' as TextTrackMode,
      cues: null,
      activeCues: null,
      addCue: jest.fn(),
      removeCue: jest.fn(),
      oncuechange: null,
      id: '',
      inBandMetadataTrackDispatchType: '',
    } as unknown as TextTrack;
    textTracks.push(mockTextTrack);
    textTracksLength++;
    return mockTextTrack;
  });

  document.body.appendChild(video);
  return video;
}

const sampleVTT = `WEBVTT

1
00:00:00.000 --> 00:00:03.000
Hello world

2
00:00:03.000 --> 00:00:06.000
This is a test`;

// ============================================
// Constants Tests
// ============================================

describe('Constants', () => {
  test('DEFAULT_LABEL is Chinese optimized label', () => {
    expect(DEFAULT_LABEL).toBe('中文（优化）');
  });

  test('DEFAULT_LANGUAGE is zh-CN', () => {
    expect(DEFAULT_LANGUAGE).toBe('zh-CN');
  });

  test('INJECTED_TRACK_ATTR is defined', () => {
    expect(INJECTED_TRACK_ATTR).toBe('data-udemy-caption-plus');
  });

  test('Events are defined', () => {
    expect(TRACK_INJECTED_EVENT).toBe('udemycaptionplus:trackinjected');
    expect(TRACK_ACTIVATED_EVENT).toBe('udemycaptionplus:trackactivated');
  });
});

// ============================================
// injectTrack Tests
// ============================================

describe('injectTrack', () => {
  test('injects track with default options', () => {
    const video = createMockVideo();
    const result = injectTrack(video, sampleVTT);

    expect(result.success).toBe(true);
    expect(result.method).toBe('data-uri');
    expect(result.track).toBeDefined();
    expect(result.track?.label).toBe(DEFAULT_LABEL);
    expect(result.track?.srclang).toBe(DEFAULT_LANGUAGE);
    expect(result.track?.kind).toBe('subtitles');
  });

  test('injects track with custom options', () => {
    const video = createMockVideo();
    const result = injectTrack(video, sampleVTT, {
      label: 'Custom Label',
      language: 'en',
      kind: 'captions',
    });

    expect(result.success).toBe(true);
    expect(result.track?.label).toBe('Custom Label');
    expect(result.track?.srclang).toBe('en');
    expect(result.track?.kind).toBe('captions');
  });

  test('sets data-uri as src', () => {
    const video = createMockVideo();
    const result = injectTrack(video, sampleVTT);

    expect(result.track?.src).toMatch(/^data:text\/vtt;base64,/);
  });

  test('adds custom attribute to track element', () => {
    const video = createMockVideo();
    const result = injectTrack(video, sampleVTT);

    expect(result.track?.getAttribute(INJECTED_TRACK_ATTR)).toBe('true');
  });

  test('dispatches TRACK_INJECTED_EVENT', () => {
    const video = createMockVideo();
    const eventHandler = jest.fn();
    video.addEventListener(TRACK_INJECTED_EVENT, eventHandler);

    injectTrack(video, sampleVTT);

    expect(eventHandler).toHaveBeenCalled();
    const event = eventHandler.mock.calls[0][0] as CustomEvent;
    expect(event.detail.label).toBe(DEFAULT_LABEL);
    expect(event.detail.language).toBe(DEFAULT_LANGUAGE);
  });

  test('returns error for invalid video element', () => {
    const result = injectTrack(null as unknown as HTMLVideoElement, sampleVTT);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid video element');
  });

  test('updates existing track with same label', () => {
    const video = createMockVideo();

    // Inject first track
    injectTrack(video, sampleVTT, { label: 'Test' });
    expect(getInjectedTracks(video).length).toBe(1);

    // Inject second track with same label
    const result = injectTrack(video, sampleVTT, { label: 'Test' });
    expect(result.success).toBe(true);

    // Should still have only one track
    expect(getInjectedTracks(video).length).toBe(1);
  });

  test('accepts VTTFile object as content', () => {
    const video = createMockVideo();
    const vttFile = {
      cues: [
        {
          startTime: { hours: 0, minutes: 0, seconds: 0, milliseconds: 0 },
          endTime: { hours: 0, minutes: 0, seconds: 3, milliseconds: 0 },
          text: 'Hello',
        },
      ],
    };

    const result = injectTrack(video, vttFile);
    expect(result.success).toBe(true);
    expect(result.track?.src).toMatch(/^data:text\/vtt;base64,/);
  });
});

// ============================================
// injectTrackBlob Tests
// ============================================

describe('injectTrackBlob', () => {
  test('injects track using Blob URL', () => {
    const video = createMockVideo();
    const result = injectTrackBlob(video, sampleVTT);

    expect(result.success).toBe(true);
    expect(result.method).toBe('blob-url');
    expect(result.track?.src).toMatch(/^blob:mock-url-/);
  });

  test('stores blob URL in data attribute for cleanup', () => {
    const video = createMockVideo();
    const result = injectTrackBlob(video, sampleVTT);

    expect(result.track?.getAttribute('data-blob-url')).toMatch(/^blob:mock-url-/);
  });

  test('returns error for invalid video element', () => {
    const result = injectTrackBlob(null as unknown as HTMLVideoElement, sampleVTT);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid video element');
  });
});

// ============================================
// injectTrackCues Tests
// ============================================

describe('injectTrackCues', () => {
  test('injects track using TextTrack API', () => {
    const video = createMockVideo();
    const cues = [
      { startTime: 0, endTime: 3, text: 'Hello' },
      { startTime: 3, endTime: 6, text: 'World' },
    ];

    const result = injectTrackCues(video, cues);

    expect(result.success).toBe(true);
    expect(result.method).toBe('text-track-api');
    expect(result.track).toBeDefined();
    // Track element should be added to DOM
    const trackElement = video.querySelector('track');
    expect(trackElement).not.toBeNull();
    expect(trackElement?.getAttribute('data-injection-method')).toBe('text-track-api');
  });

  test('adds cues to text track after load event', (done) => {
    const video = createMockVideo();
    const cues = [
      { startTime: 0, endTime: 3, text: 'Hello' },
    ];

    const result = injectTrackCues(video, cues);

    // Cues are added asynchronously after the load event
    setTimeout(() => {
      const textTrack = result.track?.track;
      expect(textTrack?.addCue).toHaveBeenCalled();
      done();
    }, 10);
  });

  test('registers track in injectedTracks', () => {
    const video = createMockVideo();
    const cues = [
      { startTime: 0, endTime: 3, text: 'Hello' },
    ];

    injectTrackCues(video, cues);

    // Track should be registered
    expect(hasInjectedTracks(video)).toBe(true);
    expect(getInjectedTracks(video)).toHaveLength(1);
  });

  test('dispatches TRACK_INJECTED_EVENT', () => {
    const video = createMockVideo();
    const cues = [{ startTime: 0, endTime: 3, text: 'Hello' }];
    const eventHandler = jest.fn();
    video.addEventListener(TRACK_INJECTED_EVENT, eventHandler);

    injectTrackCues(video, cues);

    expect(eventHandler).toHaveBeenCalled();
  });

  test('returns error for invalid video element', () => {
    const result = injectTrackCues(null as unknown as HTMLVideoElement, []);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid video element');
  });
});

// ============================================
// Track Activation Tests
// ============================================

describe('activateTrack', () => {
  test('activates track by setting mode to showing', (done) => {
    const video = createMockVideo();
    const result = injectTrack(video, sampleVTT, { activate: false });

    expect(result.track).toBeDefined();
    if (!result.track) return done();

    // Activate after a small delay
    setTimeout(() => {
      activateTrack(video, result.track!);

      const textTrack = video.textTracks[0];
      expect(textTrack.mode).toBe('showing');
      done();
    }, 10);
  });

  test('deactivates other tracks when exclusive is true', (done) => {
    const video = createMockVideo();

    // Inject two tracks
    const result1 = injectTrack(video, sampleVTT, { label: 'Track 1', activate: false });
    const result2 = injectTrack(video, sampleVTT, { label: 'Track 2', activate: false });

    setTimeout(() => {
      // Manually activate first track
      if (result1.track) {
        video.textTracks[0].mode = 'showing';
      }

      // Now activate second track exclusively
      if (result2.track) {
        activateTrack(video, result2.track, true);
      }

      // First track should be disabled
      expect(video.textTracks[0].mode).toBe('disabled');
      done();
    }, 10);
  });
});

describe('deactivateTrack', () => {
  test('deactivates track by setting mode to disabled', (done) => {
    const video = createMockVideo();
    const result = injectTrack(video, sampleVTT);

    setTimeout(() => {
      if (result.track) {
        deactivateTrack(video, result.track);
        expect(video.textTracks[0].mode).toBe('disabled');
      }
      done();
    }, 10);
  });
});

describe('setTrackMode', () => {
  test('sets track mode to hidden', (done) => {
    const video = createMockVideo();
    const result = injectTrack(video, sampleVTT);

    setTimeout(() => {
      if (result.track) {
        setTrackMode(video, result.track, 'hidden');
        expect(video.textTracks[0].mode).toBe('hidden');
      }
      done();
    }, 10);
  });
});

// ============================================
// Track Removal Tests
// ============================================

describe('removeTrack', () => {
  test('removes track from DOM', () => {
    const video = createMockVideo();
    const result = injectTrack(video, sampleVTT);

    expect(video.querySelectorAll('track').length).toBe(1);

    if (result.track) {
      removeTrack(video, result.track);
    }

    expect(video.querySelectorAll('track').length).toBe(0);
    expect(getInjectedTracks(video).length).toBe(0);
  });

  test('revokes blob URL on removal', () => {
    const video = createMockVideo();
    const result = injectTrackBlob(video, sampleVTT);

    const blobUrl = result.track?.getAttribute('data-blob-url');
    expect(mockObjectURLs.has(blobUrl!)).toBe(true);

    if (result.track) {
      removeTrack(video, result.track);
    }

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(blobUrl);
  });
});

describe('removeAllTracks', () => {
  test('removes all injected tracks', () => {
    const video = createMockVideo();

    injectTrack(video, sampleVTT, { label: 'Track 1', activate: false });
    injectTrack(video, sampleVTT, { label: 'Track 2', activate: false });
    injectTrack(video, sampleVTT, { label: 'Track 3', activate: false });

    expect(getInjectedTracks(video).length).toBe(3);

    removeAllTracks(video);

    expect(getInjectedTracks(video).length).toBe(0);
    expect(video.querySelectorAll('track').length).toBe(0);
  });
});

// ============================================
// updateTrackContent Tests
// ============================================

describe('updateTrackContent', () => {
  test('updates track content', () => {
    const video = createMockVideo();
    injectTrack(video, sampleVTT, { label: 'Test Track', activate: false });

    const newVTT = 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:05.000\nUpdated content';
    const result = updateTrackContent(video, 'Test Track', newVTT);

    expect(result).toBe(true);
    expect(getInjectedTracks(video).length).toBe(1);
  });

  test('returns false for non-existent track', () => {
    const video = createMockVideo();
    const result = updateTrackContent(video, 'NonExistent', sampleVTT);

    expect(result).toBe(false);
  });
});

// ============================================
// Query Functions Tests
// ============================================

describe('getInjectedTracks', () => {
  test('returns empty array for video without tracks', () => {
    const video = createMockVideo();
    expect(getInjectedTracks(video)).toEqual([]);
  });

  test('returns all injected tracks', () => {
    const video = createMockVideo();

    injectTrack(video, sampleVTT, { label: 'Track 1', activate: false });
    injectTrack(video, sampleVTT, { label: 'Track 2', activate: false });

    const tracks = getInjectedTracks(video);
    expect(tracks.length).toBe(2);
    expect(tracks[0].label).toBe('Track 1');
    expect(tracks[1].label).toBe('Track 2');
  });
});

describe('hasInjectedTracks', () => {
  test('returns false for video without tracks', () => {
    const video = createMockVideo();
    expect(hasInjectedTracks(video)).toBe(false);
  });

  test('returns true for video with tracks', () => {
    const video = createMockVideo();
    injectTrack(video, sampleVTT, { activate: false });
    expect(hasInjectedTracks(video)).toBe(true);
  });
});

describe('getActiveInjectedTrack', () => {
  test('returns null when no track is active', () => {
    const video = createMockVideo();
    injectTrack(video, sampleVTT, { activate: false });
    expect(getActiveInjectedTrack(video)).toBeNull();
  });
});

describe('findTrackByLabel', () => {
  test('finds track by label', () => {
    const video = createMockVideo();
    injectTrack(video, sampleVTT, { label: 'My Track', activate: false });

    const trackInfo = findTrackByLabel(video, 'My Track');
    expect(trackInfo).not.toBeNull();
    expect(trackInfo?.label).toBe('My Track');
  });

  test('returns null for non-existent label', () => {
    const video = createMockVideo();
    expect(findTrackByLabel(video, 'NonExistent')).toBeNull();
  });
});

// ============================================
// TrackInjector Class Tests
// ============================================

describe('TrackInjector class', () => {
  test('creates instance with video', () => {
    const video = createMockVideo();
    const injector = new TrackInjector(video);

    expect(injector.getVideo()).toBe(video);
  });

  test('inject() uses default options', () => {
    const video = createMockVideo();
    const injector = new TrackInjector(video);

    const result = injector.inject(sampleVTT);

    expect(result.success).toBe(true);
    expect(result.track?.label).toBe(DEFAULT_LABEL);
  });

  test('inject() with custom default options', () => {
    const video = createMockVideo();
    const injector = new TrackInjector(video, {
      label: 'Custom Default',
      language: 'ja',
    });

    const result = injector.inject(sampleVTT);

    expect(result.track?.label).toBe('Custom Default');
    expect(result.track?.srclang).toBe('ja');
  });

  test('getTracks() returns injected tracks', () => {
    const video = createMockVideo();
    const injector = new TrackInjector(video);

    injector.inject(sampleVTT, { label: 'Track 1', activate: false });
    injector.inject(sampleVTT, { label: 'Track 2', activate: false });

    expect(injector.getTracks().length).toBe(2);
  });

  test('hasTracks() returns correct value', () => {
    const video = createMockVideo();
    const injector = new TrackInjector(video);

    expect(injector.hasTracks()).toBe(false);

    injector.inject(sampleVTT, { activate: false });

    expect(injector.hasTracks()).toBe(true);
  });

  test('remove() removes track by label', () => {
    const video = createMockVideo();
    const injector = new TrackInjector(video);

    injector.inject(sampleVTT, { label: 'ToRemove', activate: false });
    expect(injector.hasTracks()).toBe(true);

    injector.remove('ToRemove');
    expect(injector.hasTracks()).toBe(false);
  });

  test('removeAll() removes all tracks', () => {
    const video = createMockVideo();
    const injector = new TrackInjector(video);

    injector.inject(sampleVTT, { label: 'Track 1', activate: false });
    injector.inject(sampleVTT, { label: 'Track 2', activate: false });

    injector.removeAll();

    expect(injector.getTracks().length).toBe(0);
  });

  test('update() updates track content', () => {
    const video = createMockVideo();
    const injector = new TrackInjector(video);

    injector.inject(sampleVTT, { label: 'Updatable', activate: false });

    const newVTT = 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:05.000\nNew';
    const result = injector.update('Updatable', newVTT);

    expect(result).toBe(true);
  });

  test('activateByLabel() activates track', () => {
    const video = createMockVideo();
    const injector = new TrackInjector(video);

    injector.inject(sampleVTT, { label: 'Activatable', activate: false });

    const result = injector.activateByLabel('Activatable');
    expect(result).toBe(true);
  });

  test('deactivateByLabel() deactivates track', () => {
    const video = createMockVideo();
    const injector = new TrackInjector(video);

    injector.inject(sampleVTT, { label: 'Deactivatable', activate: false });

    const result = injector.deactivateByLabel('Deactivatable');
    expect(result).toBe(true);
  });

  test('injectBlob() uses blob URL method', () => {
    const video = createMockVideo();
    const injector = new TrackInjector(video);

    const result = injector.injectBlob(sampleVTT);

    expect(result.success).toBe(true);
    expect(result.method).toBe('blob-url');
  });

  test('injectCues() uses TextTrack API method', () => {
    const video = createMockVideo();
    const injector = new TrackInjector(video);

    const result = injector.injectCues([{ startTime: 0, endTime: 3, text: 'Test' }]);

    expect(result.success).toBe(true);
    expect(result.method).toBe('text-track-api');
  });
});

// ============================================
// Edge Cases Tests
// ============================================

describe('Edge Cases', () => {
  test('handles empty VTT content', () => {
    const video = createMockVideo();
    const result = injectTrack(video, 'WEBVTT\n\n');

    expect(result.success).toBe(true);
  });

  test('handles very long VTT content', () => {
    const video = createMockVideo();
    let longVTT = 'WEBVTT\n\n';

    for (let i = 0; i < 1000; i++) {
      const start = i * 3;
      const end = start + 3;
      longVTT += `${i + 1}\n`;
      longVTT += `00:${Math.floor(start / 60).toString().padStart(2, '0')}:${(start % 60).toString().padStart(2, '0')}.000 --> `;
      longVTT += `00:${Math.floor(end / 60).toString().padStart(2, '0')}:${(end % 60).toString().padStart(2, '0')}.000\n`;
      longVTT += `Cue number ${i + 1}\n\n`;
    }

    const result = injectTrack(video, longVTT);
    expect(result.success).toBe(true);
  });

  test('handles Unicode content in VTT', () => {
    const video = createMockVideo();
    const unicodeVTT = `WEBVTT

1
00:00:00.000 --> 00:00:03.000
你好世界 🌍 こんにちは

2
00:00:03.000 --> 00:00:06.000
مرحبا بالعالم`;

    const result = injectTrack(video, unicodeVTT);
    expect(result.success).toBe(true);
  });

  test('handles special characters in label', () => {
    const video = createMockVideo();
    const result = injectTrack(video, sampleVTT, {
      label: '中文（优化）- v2.0 "beta"',
    });

    expect(result.success).toBe(true);
    expect(result.track?.label).toBe('中文（优化）- v2.0 "beta"');
  });
});

// ============================================
// Integration Tests
// ============================================

describe('Integration', () => {
  test('full workflow: inject, activate, update, remove', (done) => {
    const video = createMockVideo();

    // 1. Inject track
    const injectResult = injectTrack(video, sampleVTT, {
      label: 'Test Track',
      activate: false,
    });
    expect(injectResult.success).toBe(true);
    expect(hasInjectedTracks(video)).toBe(true);

    // 2. Activate track
    setTimeout(() => {
      activateTrack(video, injectResult.track!);
      expect(video.textTracks[0].mode).toBe('showing');

      // 3. Update track
      const updateResult = updateTrackContent(video, 'Test Track', sampleVTT);
      expect(updateResult).toBe(true);

      // 4. Remove track
      removeAllTracks(video);
      expect(hasInjectedTracks(video)).toBe(false);

      done();
    }, 10);
  });

  test('multiple videos can have independent tracks', () => {
    const video1 = createMockVideo();
    const video2 = createMockVideo();

    injectTrack(video1, sampleVTT, { label: 'Video 1 Track', activate: false });
    injectTrack(video2, sampleVTT, { label: 'Video 2 Track', activate: false });

    expect(getInjectedTracks(video1).length).toBe(1);
    expect(getInjectedTracks(video2).length).toBe(1);
    expect(getInjectedTracks(video1)[0].label).toBe('Video 1 Track');
    expect(getInjectedTracks(video2)[0].label).toBe('Video 2 Track');

    removeAllTracks(video1);

    expect(getInjectedTracks(video1).length).toBe(0);
    expect(getInjectedTracks(video2).length).toBe(1);
  });
});
