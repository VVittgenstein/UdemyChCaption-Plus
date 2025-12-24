import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

function readDefaultLectureUrlFromRecord(): string | null {
  try {
    const recordPath = path.join(process.cwd(), 'record.json');
    const record = JSON.parse(fs.readFileSync(recordPath, 'utf-8')) as any;
    return record?.test_config?.primary_test_course?.test_lecture?.url ?? null;
  } catch {
    return null;
  }
}

const DEFAULT_LECTURE_URL =
  readDefaultLectureUrlFromRecord() ??
  'https://www.udemy.com/course/2d-rpg-alexdev/learn/lecture/36963178#content';

const LECTURE_URL = process.env.UDEMY_E2E_LECTURE_URL || DEFAULT_LECTURE_URL;

function isLikelyVttUrl(url: string): boolean {
  return url.includes('.vtt') || url.toLowerCase().includes('caption');
}

async function maybeClick(page: import('@playwright/test').Page, options: {
  role?: Parameters<import('@playwright/test').Page['getByRole']>[0];
  name?: RegExp;
  selector?: string;
}): Promise<boolean> {
  try {
    if (options.selector) {
      const locator = page.locator(options.selector).first();
      if (await locator.count()) {
        await locator.click({ timeout: 1500 });
        return true;
      }
      return false;
    }
    if (options.role && options.name) {
      const locator = page.getByRole(options.role as any, { name: options.name }).first();
      if (await locator.count()) {
        await locator.click({ timeout: 1500 });
        return true;
      }
    }
  } catch {
    // ignore
  }
  return false;
}

async function dismissCommonOverlays(page: import('@playwright/test').Page): Promise<void> {
  // Cookie banners / consent
  await maybeClick(page, { role: 'button', name: /accept/i });
  await maybeClick(page, { role: 'button', name: /agree/i });
  await maybeClick(page, { role: 'button', name: /同意|接受|允许/i });

  // Generic close buttons (modals)
  await maybeClick(page, { role: 'button', name: /close/i });
  await maybeClick(page, { selector: 'button[aria-label="Close"]' });
  await maybeClick(page, { selector: '[data-purpose="close-modal"]' });
}

test.describe('Udemy DOM monitor (subtitles + track injection)', () => {
  test('detects video, observes subtitle VTT, and can inject a track', async ({ page }) => {
    await test.step('Open lecture page', async () => {
      await page.goto(LECTURE_URL, { waitUntil: 'domcontentloaded' });
      await dismissCommonOverlays(page);

      const currentUrl = page.url();
      const lectureUrlPattern = /\/course\/[^/]+\/learn\/lecture\/\d+/;
      if (!lectureUrlPattern.test(currentUrl)) {
        if (/\/join\/|passwordless-auth|\/user\/login/i.test(currentUrl)) {
          throw new Error(
            [
              'Udemy redirected to an auth page (lecture requires login).',
              `Current URL: ${currentUrl}`,
              'Provide a logged-in Playwright storage state via `UDEMY_E2E_STORAGE_STATE`, or override `UDEMY_E2E_LECTURE_URL` to a lecture that is accessible without login.',
            ].join('\n')
          );
        }
        throw new Error(
          [
            'Unexpected navigation after opening lecture URL.',
            `Expected: ${lectureUrlPattern}`,
            `Actual: ${currentUrl}`,
          ].join('\n')
        );
      }
    });

    await test.step('Find a valid <video> element (extension selector contract)', async () => {
      const found = await page.waitForFunction(() => {
        const selectors = [
          'video[data-purpose="video-player"]',
          'video.vjs-tech',
          '.video-js video',
          'video',
        ];
        const isValid = (video: HTMLVideoElement) => {
          if (!video.src && !video.querySelector('source')) return false;
          const rect = video.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        for (const selector of selectors) {
          const video = document.querySelector<HTMLVideoElement>(selector);
          if (video && isValid(video)) return selector;
        }
        return null;
      }, null, { timeout: 45_000 });

      const selector = await found.jsonValue();
      expect(selector, 'Expected to find a usable <video> element').toBeTruthy();
    });

    await test.step('Trigger/observe a subtitle VTT response (DOM/network contract)', async () => {
      const vttResponsePromise = page
        .waitForResponse((res) => isLikelyVttUrl(res.url()) && res.ok(), { timeout: 45_000 })
        .catch(() => null);

      // Best-effort: attempt to start playback, which commonly triggers caption fetch.
      await page.locator('video').first().click({ timeout: 10_000 }).catch(() => {});
      await dismissCommonOverlays(page);

      const response = await vttResponsePromise;

      // If no network VTT observed, fall back to checking existing <track> src values.
      if (!response) {
        const trackSrcs = await page.evaluate(() =>
          Array.from(document.querySelectorAll('video track'))
            .map((t) => (t instanceof HTMLTrackElement ? t.src : ''))
            .filter(Boolean)
        );
        expect(trackSrcs.length, 'Expected at least one existing <track src> for captions/subtitles').toBeGreaterThan(0);
        return;
      }

      const body = await response.text();
      expect(body.replace(/^\uFEFF/, '').trimStart().startsWith('WEBVTT')).toBe(true);

      // If we can see a VTT, we should also be able to fetch it from the page origin with credentials.
      const canFetchFromPage = await page.evaluate(async (url) => {
        try {
          const res = await fetch(url, { method: 'GET', credentials: 'include' });
          const text = await res.text();
          return res.ok && text.replace(/^\uFEFF/, '').trimStart().startsWith('WEBVTT');
        } catch {
          return false;
        }
      }, response.url());
      expect(canFetchFromPage).toBe(true);
    });

    await test.step('Inject a Data-URI <track> and activate it', async () => {
      const injected = await page.evaluate(async () => {
        const video = document.querySelector('video');
        if (!(video instanceof HTMLVideoElement)) {
          return { ok: false, error: 'video-not-found' as const };
        }

        const label = 'E2E Monitor (Injected)';
        const language = 'zh-CN';
        const vtt = `WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nE2E monitor cue\n`;
        const dataUri = `data:text/vtt;charset=utf-8,${encodeURIComponent(vtt)}`;

        // Remove any prior injected track with same label (idempotent in CI re-runs).
        for (const track of Array.from(video.querySelectorAll('track'))) {
          if (track instanceof HTMLTrackElement && track.label === label && track.srclang === language) {
            track.remove();
          }
        }

        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = label;
        track.srclang = language;
        track.src = dataUri;
        track.default = true;
        track.setAttribute('data-udemy-caption-plus-e2e', 'true');

        const loaded = new Promise<'load' | 'timeout'>((resolve) => {
          const timer = window.setTimeout(() => resolve('timeout'), 5000);
          track.addEventListener(
            'load',
            () => {
              window.clearTimeout(timer);
              resolve('load');
            },
            { once: true }
          );
          track.addEventListener(
            'error',
            () => {
              window.clearTimeout(timer);
              resolve('timeout');
            },
            { once: true }
          );
        });

        video.appendChild(track);
        const loadResult = await loaded;

        const textTrack = Array.from(video.textTracks).find(
          (tt) => tt.label === label && tt.language === language
        );
        if (!textTrack) return { ok: false, error: 'texttrack-not-found' as const, loadResult };

        textTrack.mode = 'showing';

        const waitForCues = async () => {
          const start = Date.now();
          while (Date.now() - start < 5000) {
            const cueCount = textTrack.cues ? textTrack.cues.length : 0;
            if (cueCount > 0) return cueCount;
            await new Promise((r) => setTimeout(r, 100));
          }
          return textTrack.cues ? textTrack.cues.length : 0;
        };

        const cueCount = await waitForCues();
        return { ok: true, loadResult, mode: textTrack.mode, cueCount };
      });

      expect(injected.ok, injected.ok ? undefined : `Track injection failed: ${'error' in injected ? injected.error : 'unknown'}`).toBe(true);
      if (injected.ok) {
        expect(injected.mode).toBe('showing');
        expect(injected.cueCount).toBeGreaterThan(0);
      }
    });
  });
});
