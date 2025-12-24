"use strict";
(() => {
  // src/utils/hash.ts
  async function calculateHash(content) {
    try {
      if (typeof crypto === "undefined" || !crypto.subtle?.digest) {
        throw new Error("crypto.subtle not available");
      }
      const encoder = new TextEncoder();
      const data = encoder.encode(content);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      return simpleHash(content);
    }
  }
  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, "0");
  }

  // src/content/subtitle-fetcher.ts
  var LOG_PREFIX = "[SubtitleFetcher]";
  var VIDEO_DETECTION_TIMEOUT = 3e3;
  var VIDEO_DETECTION_POLL_INTERVAL = 100;
  var LANGUAGE_PRIORITY = ["en", "en-US", "en-GB", "en-AU"];
  var LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };
  var currentLogLevel = "info";
  function log(level, ...args) {
    if (LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel]) {
      const method = level === "error" ? "error" : level === "warn" ? "warn" : "log";
      console[method](LOG_PREFIX, `[${level.toUpperCase()}]`, ...args);
    }
  }
  function extractCourseInfo() {
    const url = window.location.href;
    const match = url.match(/\/course\/([^\/]+)\/learn\/lecture\/(\d+)/);
    if (!match) {
      log("debug", "URL does not match Udemy course page pattern:", url);
      return null;
    }
    const courseSlug = match[1];
    const lectureId = match[2];
    const courseId = getCourseIdFromPage();
    const info = {
      courseId: courseId || "",
      courseSlug,
      lectureId,
      courseTitle: getCourseTitle(),
      sectionTitle: getSectionTitle(),
      lectureTitle: getLectureTitle()
    };
    log("info", "Extracted course info:", info);
    return info;
  }
  function getCourseIdFromPage() {
    try {
      if (typeof UD !== "undefined" && UD?.config?.brand?.course?.id) {
        return String(UD.config.brand.course.id);
      }
    } catch (e) {
    }
    try {
      const apiCalls = performance.getEntriesByType("resource");
      for (const call of apiCalls) {
        const match = call.name.match(/api-2\.0\/courses\/(\d+)/);
        if (match) {
          return match[1];
        }
      }
    } catch (e) {
    }
    const courseElement = document.querySelector("[data-course-id]");
    if (courseElement) {
      return courseElement.getAttribute("data-course-id") || "";
    }
    return "";
  }
  function getCourseTitle() {
    const selectors = [
      '[data-purpose="course-header-title"]',
      ".udlite-heading-xl",
      'h1[class*="course-title"]',
      "title"
    ];
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element?.textContent) {
        const text = element.textContent.trim();
        return text.replace(/\s*\|\s*Udemy\s*$/i, "");
      }
    }
    return void 0;
  }
  function getSectionTitle() {
    const sectionElement = document.querySelector(
      '[data-purpose="section-heading"][aria-expanded="true"]'
    );
    return sectionElement?.textContent?.trim();
  }
  function getLectureTitle() {
    const lectureElement = document.querySelector(
      '[data-purpose="curriculum-item-link"][aria-current="true"]'
    );
    return lectureElement?.textContent?.trim();
  }
  async function detectVideo() {
    log("info", "Starting video detection...");
    const startTime = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        const video = findVideoElement();
        const elapsed = Date.now() - startTime;
        if (video) {
          log("info", `Video element found in ${elapsed}ms`);
          resolve({
            found: true,
            video,
            courseInfo: extractCourseInfo(),
            timestamp: Date.now()
          });
          return;
        }
        if (elapsed >= VIDEO_DETECTION_TIMEOUT) {
          log("warn", `Video detection timeout after ${elapsed}ms`);
          resolve({
            found: false,
            video: null,
            courseInfo: extractCourseInfo(),
            timestamp: Date.now()
          });
          return;
        }
        setTimeout(check, VIDEO_DETECTION_POLL_INTERVAL);
      };
      check();
    });
  }
  function findVideoElement() {
    const selectors = [
      'video[data-purpose="video-player"]',
      "video.vjs-tech",
      ".video-js video",
      "video"
    ];
    for (const selector of selectors) {
      const video = document.querySelector(selector);
      if (video && isValidVideoElement(video)) {
        log("debug", `Found video with selector: ${selector}`);
        return video;
      }
    }
    return null;
  }
  function isValidVideoElement(video) {
    if (!video.src && !video.querySelector("source")) {
      return false;
    }
    const rect = video.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return false;
    }
    return true;
  }
  async function getSubtitleTracks(video, courseInfo) {
    log("info", "Extracting subtitle tracks...");
    const result = {
      success: false,
      tracks: [],
      method: "none"
    };
    const trackElements = getTracksFromElements(video);
    if (trackElements.length > 0) {
      result.tracks = trackElements;
      result.method = "track-element";
      result.success = true;
      log("info", `Found ${trackElements.length} tracks from <track> elements`);
      return result;
    }
    const textTracks = getTracksFromTextTrackAPI(video);
    if (textTracks.length > 0) {
      const tracksWithUrls = textTracks.filter((t) => t.url);
      if (tracksWithUrls.length > 0) {
        result.tracks = textTracks;
        result.method = "videojs-api";
        result.success = true;
        log("info", `Found ${textTracks.length} tracks from TextTrack API`);
        return result;
      }
      log("debug", `TextTrack API found ${textTracks.length} tracks but none have URLs, trying network intercept`);
    }
    if (courseInfo?.lectureId) {
      const apiTracks = await getTracksFromCaptionsAPI(courseInfo);
      if (apiTracks.length > 0) {
        result.tracks = apiTracks;
        result.method = "udemy-api";
        result.success = true;
        log("info", `Found ${apiTracks.length} tracks from Udemy captions API`);
        return result;
      }
    }
    const networkTracks = await getTracksFromNetworkIntercept();
    if (networkTracks.length > 0) {
      result.tracks = networkTracks;
      result.method = "network-intercept";
      result.success = true;
      log("info", `Found ${networkTracks.length} tracks from network intercept`);
      return result;
    }
    log("warn", "No subtitle tracks found");
    result.error = "No subtitle tracks available";
    return result;
  }
  function getTracksFromElements(video) {
    const tracks = [];
    const trackElements = video.querySelectorAll("track");
    trackElements.forEach((track) => {
      if (track.src && (track.kind === "subtitles" || track.kind === "captions")) {
        tracks.push({
          url: track.src,
          language: track.srclang || "unknown",
          label: track.label || track.srclang || "Unknown",
          isDefault: track.default,
          kind: track.kind
        });
      }
    });
    return tracks;
  }
  function getTracksFromTextTrackAPI(video) {
    const tracks = [];
    const textTracks = video.textTracks;
    if (!textTracks || textTracks.length === 0) {
      return tracks;
    }
    for (let i = 0; i < textTracks.length; i++) {
      const track = textTracks[i];
      if (track.kind === "subtitles" || track.kind === "captions") {
        tracks.push({
          url: "",
          // URL not directly available from TextTrack API
          language: track.language || "unknown",
          label: track.label || track.language || "Unknown",
          isDefault: track.mode === "showing",
          kind: track.kind
        });
      }
    }
    return tracks;
  }
  function isLikelyThumbnailSpriteVttUrl(url) {
    const path = url.pathname.toLowerCase();
    if (path.includes("thumb-sprites")) return true;
    if (path.includes("thumb_sprites")) return true;
    if (path.includes("storyboard")) return true;
    if (path.includes("thumbnail")) return true;
    return false;
  }
  function normalizeLocale(locale) {
    const normalized = locale.trim().replace(/_/g, "-");
    const [language, region, ...rest] = normalized.split("-").filter(Boolean);
    if (!language) return normalized;
    if (!region) return language.toLowerCase();
    const suffix = rest.length > 0 ? `-${rest.join("-")}` : "";
    return `${language.toLowerCase()}-${region.toUpperCase()}${suffix}`;
  }
  function toStringIfPresent(value) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return null;
  }
  function inferLanguageFromUrl(url) {
    const match = url.match(/[_-]([a-z]{2}(?:-[A-Z]{2})?)[_.]/) || url.match(/lang[=_]([a-z]{2}(?:-[A-Z]{2})?)/i) || url.match(/locale[=_]([a-z]{2}(?:[_-][A-Z]{2})?)/i);
    if (!match?.[1]) return "unknown";
    return normalizeLocale(match[1]);
  }
  function asAbsoluteUrl(raw) {
    try {
      return new URL(raw).toString();
    } catch {
      return new URL(raw, "https://www.udemy.com").toString();
    }
  }
  function dedupeTracks(tracks) {
    const seen = /* @__PURE__ */ new Set();
    const result = [];
    for (const track of tracks) {
      if (!track.url) continue;
      const normalized = asAbsoluteUrl(track.url);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      result.push({ ...track, url: normalized });
    }
    return result;
  }
  function extractTracksFromCaptionArray(items) {
    const tracks = [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const obj = item;
      const url = toStringIfPresent(obj.url) || toStringIfPresent(obj.download_url) || toStringIfPresent(obj.downloadUrl) || toStringIfPresent(obj.vtt_url) || toStringIfPresent(obj.vttUrl) || toStringIfPresent(obj.file) || null;
      if (!url) continue;
      const parsed = tryParseUrl(url);
      if (parsed && isLikelyThumbnailSpriteVttUrl(parsed)) continue;
      if (parsed && !looksLikeVttResource(parsed)) continue;
      if (!parsed && !url.includes(".vtt")) continue;
      const languageRaw = toStringIfPresent(obj.language) || toStringIfPresent(obj.locale) || toStringIfPresent(obj.srclang) || toStringIfPresent(obj.language_code) || toStringIfPresent(obj.lang) || null;
      const language = languageRaw ? normalizeLocale(languageRaw) : inferLanguageFromUrl(url);
      const label = toStringIfPresent(obj.label) || toStringIfPresent(obj.display_title) || toStringIfPresent(obj.title) || (language.toLowerCase().startsWith("en") ? "English" : language || "Unknown");
      const isDefault = typeof obj.is_default === "boolean" && obj.is_default || typeof obj.default === "boolean" && obj.default || language.toLowerCase() === "en";
      tracks.push({ url, language, label, isDefault, kind: "subtitles" });
    }
    return tracks;
  }
  function collectVttUrlsRecursively(data, maxNodes = 2e3) {
    const tracks = [];
    const visited = /* @__PURE__ */ new Set();
    const queue = [data];
    let visitedCount = 0;
    while (queue.length > 0 && visitedCount < maxNodes) {
      const node = queue.shift();
      if (!node || typeof node !== "object") continue;
      if (visited.has(node)) continue;
      visited.add(node);
      visitedCount++;
      if (Array.isArray(node)) {
        for (const item of node) queue.push(item);
        continue;
      }
      const obj = node;
      const keys = Object.keys(obj);
      for (const key of keys) {
        const value = obj[key];
        if (typeof value === "string") {
          const parsed = tryParseUrl(value);
          if (!parsed) continue;
          if (isLikelyThumbnailSpriteVttUrl(parsed)) continue;
          if (!looksLikeVttResource(parsed)) continue;
          const languageRaw = toStringIfPresent(obj.language) || toStringIfPresent(obj.locale) || toStringIfPresent(obj.srclang) || toStringIfPresent(obj.language_code) || toStringIfPresent(obj.lang) || null;
          const language = languageRaw ? normalizeLocale(languageRaw) : inferLanguageFromUrl(value);
          const label = language.toLowerCase().startsWith("en") ? "English" : language || "Unknown";
          tracks.push({ url: value, language, label, isDefault: language.toLowerCase() === "en", kind: "subtitles" });
        } else if (value && typeof value === "object") {
          queue.push(value);
        }
      }
    }
    return tracks;
  }
  function extractCaptionTracks(data) {
    const tracks = [];
    const root = data;
    const arrays = [];
    if (Array.isArray(root?.asset?.captions)) arrays.push(root.asset.captions);
    if (Array.isArray(root?.asset?.caption_tracks)) arrays.push(root.asset.caption_tracks);
    if (Array.isArray(root?.captions)) arrays.push(root.captions);
    if (Array.isArray(root?.results)) arrays.push(root.results);
    for (const arr of arrays) tracks.push(...extractTracksFromCaptionArray(arr));
    tracks.push(...collectVttUrlsRecursively(data));
    return dedupeTracks(tracks);
  }
  async function fetchJson(url) {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response.json();
  }
  async function getTracksFromCaptionsAPI(courseInfo) {
    const lectureId = courseInfo.lectureId;
    if (!lectureId) return [];
    const attempts = [
      `https://www.udemy.com/api-2.0/lectures/${encodeURIComponent(lectureId)}/captions/`,
      `https://www.udemy.com/api-2.0/lectures/${encodeURIComponent(lectureId)}/?fields[lecture]=asset&fields[asset]=captions`
    ];
    if (courseInfo.courseId && /^\d+$/.test(courseInfo.courseId)) {
      attempts.unshift(
        `https://www.udemy.com/api-2.0/users/me/subscribed-courses/${encodeURIComponent(courseInfo.courseId)}/lectures/${encodeURIComponent(lectureId)}/?fields[lecture]=asset&fields[asset]=captions`
      );
    }
    let lastError = null;
    for (const url of attempts) {
      try {
        const data = await fetchJson(url);
        const tracks = extractCaptionTracks(data);
        if (tracks.length > 0) return tracks;
        lastError = new Error("No caption tracks found");
      } catch (error) {
        lastError = error;
      }
    }
    log("debug", "Captions API lookup failed:", lastError);
    return [];
  }
  async function getTracksFromNetworkIntercept() {
    const tracks = [];
    try {
      const entries = performance.getEntriesByType("resource");
      for (const entry of entries) {
        const parsed = tryParseUrl(entry.name);
        if (!parsed) continue;
        if (isLikelyThumbnailSpriteVttUrl(parsed)) continue;
        if (!looksLikeVttResource(parsed)) continue;
        const langMatch = entry.name.match(/[_-]([a-z]{2}(?:-[A-Z]{2})?)[_.]/) || entry.name.match(/lang[=_]([a-z]{2}(?:-[A-Z]{2})?)/i) || entry.name.match(/locale[=_]([a-z]{2}(?:[_-][A-Z]{2})?)/i);
        const language = langMatch ? langMatch[1].replace(/_/g, "-") : "unknown";
        tracks.push({
          url: entry.name,
          language,
          label: language.toLowerCase().startsWith("en") ? "English" : language === "unknown" ? "Unknown" : language,
          isDefault: language.toLowerCase() === "en",
          kind: "subtitles"
        });
      }
      const uniqueTracks = tracks.filter(
        (track, index, self) => index === self.findIndex((t) => t.url === track.url)
      );
      return uniqueTracks;
    } catch (e) {
      log("debug", "Network intercept failed:", e);
      return [];
    }
  }
  function tryParseUrl(raw) {
    try {
      return new URL(raw);
    } catch {
      try {
        return new URL(raw, "https://www.udemy.com");
      } catch {
        return null;
      }
    }
  }
  function looksLikeVttResource(url) {
    const pathname = url.pathname.toLowerCase();
    if (pathname.includes(".vtt")) return true;
    const keys = ["format", "type", "fmt", "ext", "extension", "mime"];
    for (const key of keys) {
      const value = url.searchParams.get(key);
      if (!value) continue;
      const normalized = value.toLowerCase();
      if (normalized === "vtt" || normalized === "text/vtt" || normalized === "webvtt") return true;
    }
    return false;
  }
  function isLikelyThumbnailSpriteVttContent(content) {
    const sample = content.replace(/^\uFEFF/, "").slice(0, 2e4).toLowerCase();
    const xywhHits = sample.match(/#xywh=/g)?.length ?? 0;
    if (xywhHits === 0) return false;
    if (xywhHits >= 3) return true;
    return sample.includes("thumb-sprites") || sample.includes("thumb_sprites") || sample.includes("storyboard") || sample.includes("thumbnail");
  }
  function selectPreferredTrack(tracks) {
    if (tracks.length === 0) {
      return null;
    }
    for (const lang of LANGUAGE_PRIORITY) {
      const track = tracks.find(
        (t) => t.language.toLowerCase() === lang.toLowerCase()
      );
      if (track) {
        log("info", `Selected track: ${track.label} (${track.language})`);
        return track;
      }
    }
    const englishTrack = tracks.find(
      (t) => t.language.toLowerCase().startsWith("en")
    );
    if (englishTrack) {
      log("info", `Selected English track: ${englishTrack.label}`);
      return englishTrack;
    }
    const defaultTrack = tracks.find((t) => t.isDefault);
    if (defaultTrack) {
      log("info", `Selected default track: ${defaultTrack.label}`);
      return defaultTrack;
    }
    log("info", `Selected first available track: ${tracks[0].label}`);
    return tracks[0];
  }
  async function fetchVTT(url) {
    log("info", `Fetching VTT from: ${url}`);
    if (!url) {
      return {
        success: false,
        error: "No URL provided"
      };
    }
    try {
      let content;
      if (typeof chrome !== "undefined" && !!chrome.runtime?.sendMessage) {
        const response = await chrome.runtime.sendMessage({
          type: "FETCH_VTT",
          payload: { url }
        });
        if (!response?.ok) {
          const errorMsg = response?.error || "Failed to fetch VTT";
          log("error", `VTT fetch failed: ${errorMsg}`);
          return {
            success: false,
            error: errorMsg
          };
        }
        content = response.content;
      } else {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1e4);
        try {
          const response = await fetch(url, { credentials: "include", signal: controller.signal });
          if (!response.ok) {
            return {
              success: false,
              error: `HTTP ${response.status}: ${response.statusText}`
            };
          }
          content = await response.text();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const isTimeout = message.toLowerCase().includes("aborted");
          return {
            success: false,
            error: isTimeout ? "Request timeout" : message
          };
        } finally {
          clearTimeout(timeoutId);
        }
      }
      if (!isValidVTT(content)) {
        log("error", "Invalid VTT content received");
        return {
          success: false,
          error: "Invalid VTT format"
        };
      }
      const langMatch = url.match(/[_-]([a-z]{2}(?:-[A-Z]{2})?)[_.]/) || url.match(/lang[=_]([a-z]{2}(?:-[A-Z]{2})?)/i);
      const language = langMatch ? langMatch[1] : "unknown";
      const hash = await calculateHash(content);
      log("info", `VTT fetched successfully: ${content.length} bytes, hash: ${hash.substring(0, 8)}...`);
      return {
        success: true,
        data: {
          content,
          url,
          language,
          hash
        }
      };
    } catch (e) {
      const error = e instanceof Error ? e.message : "Unknown error";
      log("error", `VTT fetch error: ${error}`);
      return {
        success: false,
        error
      };
    }
  }
  function isValidVTT(content) {
    const stripped = content.replace(/^\uFEFF/, "").trim();
    return stripped.startsWith("WEBVTT");
  }
  async function fetchSubtitles() {
    log("info", "=== Starting subtitle fetch process ===");
    const videoDetection = await detectVideo();
    if (!videoDetection.found || !videoDetection.video) {
      log("warn", "Video not found, aborting subtitle fetch");
      return {
        videoDetection,
        subtitleResult: {
          success: false,
          tracks: [],
          method: "none",
          error: "Video element not found"
        },
        vttContent: null,
        selectedTrack: null
      };
    }
    const subtitleResult = await getSubtitleTracks(videoDetection.video, videoDetection.courseInfo);
    if (!subtitleResult.success || subtitleResult.tracks.length === 0) {
      log("warn", "No subtitle tracks found");
      return {
        videoDetection,
        subtitleResult,
        vttContent: null,
        selectedTrack: null
      };
    }
    const candidateTracks = subtitleResult.tracks.filter((track) => track.url);
    const preferredTrack = selectPreferredTrack(candidateTracks);
    if (!preferredTrack || !preferredTrack.url) {
      log("warn", "No suitable track selected or track has no URL");
      return {
        videoDetection,
        subtitleResult,
        vttContent: null,
        selectedTrack: preferredTrack
      };
    }
    const orderedTracks = [
      preferredTrack,
      ...candidateTracks.filter((track) => track.url !== preferredTrack.url)
    ];
    let selectedTrack = null;
    let vttContent = null;
    for (const track of orderedTracks) {
      const vttResult = await fetchVTT(track.url);
      if (vttResult.success && vttResult.data) {
        if (isLikelyThumbnailSpriteVttContent(vttResult.data.content)) {
          log("warn", `Detected thumbnail sprite VTT, skipping track: ${track.label} (${track.language})`);
          continue;
        }
        selectedTrack = track;
        vttContent = vttResult.data;
        break;
      }
      log(
        "warn",
        `Failed to fetch VTT for track ${track.label} (${track.language}): ${vttResult.error || "unknown error"}`
      );
    }
    log("info", "=== Subtitle fetch process complete ===");
    return {
      videoDetection,
      subtitleResult,
      vttContent,
      selectedTrack
    };
  }

  // src/utils/webvtt-generator.ts
  var LOG_PREFIX2 = "[WebVTT Generator]";
  var WEBVTT_SIGNATURE = "WEBVTT";
  var DEFAULT_OPTIONS = {
    includeCueIds: true,
    includeStyles: true,
    includeRegions: true,
    includeNotes: true,
    useShortTimestamp: false
  };
  var LOG_LEVELS2 = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };
  var currentLogLevel2 = "warn";
  function log2(level, ...args) {
    if (LOG_LEVELS2[level] >= LOG_LEVELS2[currentLogLevel2]) {
      const method = level === "error" ? "error" : level === "warn" ? "warn" : "log";
      console[method](LOG_PREFIX2, `[${level.toUpperCase()}]`, ...args);
    }
  }
  function formatTimestamp(timestamp, useShort = false) {
    const { hours, minutes, seconds, milliseconds } = timestamp;
    const mm = minutes.toString().padStart(2, "0");
    const ss = seconds.toString().padStart(2, "0");
    const ms = milliseconds.toString().padStart(3, "0");
    if (useShort && hours === 0) {
      return `${mm}:${ss}.${ms}`;
    }
    const hh = hours.toString().padStart(2, "0");
    return `${hh}:${mm}:${ss}.${ms}`;
  }
  function generateCue(cue, options = DEFAULT_OPTIONS) {
    const lines = [];
    if (cue.id && options.includeCueIds !== false) {
      lines.push(cue.id);
    }
    const startTime = formatTimestamp(cue.startTime, options.useShortTimestamp);
    const endTime = formatTimestamp(cue.endTime, options.useShortTimestamp);
    let timingLine = `${startTime} --> ${endTime}`;
    if (cue.settings) {
      timingLine += ` ${cue.settings}`;
    }
    lines.push(timingLine);
    if (cue.text) {
      lines.push(cue.text);
    }
    return lines.join("\n");
  }
  function generateVTT(vttFile, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const lines = [];
    let headerLine = WEBVTT_SIGNATURE;
    if (vttFile.header) {
      headerLine += ` ${vttFile.header}`;
    }
    lines.push(headerLine);
    lines.push("");
    if (opts.includeStyles && vttFile.styles && vttFile.styles.length > 0) {
      for (const style of vttFile.styles) {
        lines.push("STYLE");
        lines.push(style);
        lines.push("");
      }
    }
    if (opts.includeRegions && vttFile.regions && vttFile.regions.length > 0) {
      for (const region of vttFile.regions) {
        lines.push("REGION");
        lines.push(region.settings);
        lines.push("");
      }
    }
    if (opts.includeNotes && vttFile.notes && vttFile.notes.length > 0) {
      for (const note of vttFile.notes) {
        lines.push(`NOTE ${note}`);
        lines.push("");
      }
    }
    for (let i = 0; i < vttFile.cues.length; i++) {
      const cue = vttFile.cues[i];
      lines.push(generateCue(cue, opts));
      if (i < vttFile.cues.length - 1) {
        lines.push("");
      }
    }
    log2("info", `Generated WebVTT with ${vttFile.cues.length} cues`);
    return lines.join("\n");
  }
  function generateDataUri(vttFile) {
    const content = typeof vttFile === "string" ? vttFile : generateVTT(vttFile);
    const base64 = typeof btoa === "function" ? btoa(unescape(encodeURIComponent(content))) : Buffer.from(content, "utf-8").toString("base64");
    return `data:text/vtt;base64,${base64}`;
  }

  // src/content/track-injector.ts
  var LOG_PREFIX3 = "[TrackInjector]";
  var DEFAULT_LABEL = "\u4E2D\u6587\uFF08\u4F18\u5316\uFF09";
  var DEFAULT_LANGUAGE = "zh-CN";
  var INJECTED_TRACK_ATTR = "data-udemy-caption-plus";
  var TRACK_INJECTED_EVENT = "udemycaptionplus:trackinjected";
  var TRACK_ACTIVATED_EVENT = "udemycaptionplus:trackactivated";
  var LOG_LEVELS3 = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };
  var currentLogLevel3 = "info";
  function log3(level, ...args) {
    if (LOG_LEVELS3[level] >= LOG_LEVELS3[currentLogLevel3]) {
      const method = level === "error" ? "error" : level === "warn" ? "warn" : "log";
      console[method](LOG_PREFIX3, `[${level.toUpperCase()}]`, ...args);
    }
  }
  var injectedTracks = /* @__PURE__ */ new WeakMap();
  var cleanupHandlers = /* @__PURE__ */ new WeakMap();
  function getInjectedTracks(video) {
    return injectedTracks.get(video) || [];
  }
  function registerTrack(video, trackInfo) {
    const tracks = injectedTracks.get(video) || [];
    tracks.push(trackInfo);
    injectedTracks.set(video, tracks);
  }
  function unregisterTrack(video, trackElement) {
    const tracks = injectedTracks.get(video) || [];
    const index = tracks.findIndex((t) => t.element === trackElement);
    if (index !== -1) {
      tracks.splice(index, 1);
      injectedTracks.set(video, tracks);
    }
  }
  function injectTrack(video, vttContent, options = {}) {
    const {
      label = DEFAULT_LABEL,
      language = DEFAULT_LANGUAGE,
      kind = "subtitles",
      activate = true,
      exclusive = true
    } = options;
    log3("info", `Injecting track: "${label}" (${language})`);
    if (!video || !(video instanceof HTMLVideoElement)) {
      log3("error", "Invalid video element");
      return {
        success: false,
        error: "Invalid video element",
        method: "data-uri"
      };
    }
    const existingTracks = getInjectedTracks(video);
    const existingTrack = existingTracks.find((t) => t.label === label);
    if (existingTrack) {
      log3("info", `Track "${label}" already exists, updating...`);
      removeTrack(video, existingTrack.element);
    }
    try {
      const dataUri = generateDataUri(vttContent);
      const track = document.createElement("track");
      track.kind = kind;
      track.label = label;
      track.srclang = language;
      track.src = dataUri;
      track.setAttribute(INJECTED_TRACK_ATTR, "true");
      video.appendChild(track);
      track.addEventListener("load", () => {
        log3("debug", `Track "${label}" loaded successfully`);
      }, { once: true });
      track.addEventListener("error", (e) => {
        log3("error", `Track "${label}" failed to load:`, e);
      }, { once: true });
      const trackInfo = {
        element: track,
        label,
        language,
        kind,
        src: dataUri,
        isActive: false,
        exclusive,
        injectedAt: Date.now()
      };
      registerTrack(video, trackInfo);
      setupCleanup(video);
      if (activate) {
        setTimeout(() => {
          activateTrack(video, track, exclusive);
          trackInfo.isActive = true;
        }, 0);
      }
      video.dispatchEvent(new CustomEvent(TRACK_INJECTED_EVENT, {
        detail: { track, label, language }
      }));
      log3("info", `Track "${label}" injected successfully`);
      return {
        success: true,
        track,
        method: "data-uri"
      };
    } catch (e) {
      const error = e instanceof Error ? e.message : "Unknown error";
      log3("error", `Track injection failed: ${error}`);
      return {
        success: false,
        error,
        method: "data-uri"
      };
    }
  }
  function activateTrack(video, track, exclusive = true) {
    log3("debug", `Activating track: "${track.label}"`);
    const textTracks = video.textTracks;
    if (exclusive) {
      const allTracks = getInjectedTracks(video);
      for (let i = 0; i < textTracks.length; i++) {
        const tt = textTracks[i];
        if (tt.label !== track.label && tt.mode === "showing") {
          tt.mode = "disabled";
          log3("debug", `Deactivated track: "${tt.label}"`);
          const disabledTrackInfo = allTracks.find(
            (t) => t.element.track === tt || t.label === tt.label && t.language === tt.language
          );
          if (disabledTrackInfo) {
            disabledTrackInfo.isActive = false;
          }
        }
      }
    }
    for (let i = 0; i < textTracks.length; i++) {
      const tt = textTracks[i];
      if (tt.label === track.label && tt.language === track.srclang) {
        tt.mode = "showing";
        log3("info", `Track "${track.label}" activated`);
        const tracks = getInjectedTracks(video);
        const trackInfo = tracks.find((t) => t.element === track);
        if (trackInfo) {
          trackInfo.isActive = true;
        }
        video.dispatchEvent(new CustomEvent(TRACK_ACTIVATED_EVENT, {
          detail: { track, label: track.label }
        }));
        notifyVideoJsTrackChange(video);
        break;
      }
    }
  }
  function deactivateTrack(video, track) {
    log3("debug", `Deactivating track: "${track.label}"`);
    const textTracks = video.textTracks;
    for (let i = 0; i < textTracks.length; i++) {
      const tt = textTracks[i];
      if (tt.label === track.label && tt.language === track.srclang) {
        tt.mode = "disabled";
        log3("info", `Track "${track.label}" deactivated`);
        const tracks = getInjectedTracks(video);
        const trackInfo = tracks.find((t) => t.element === track);
        if (trackInfo) {
          trackInfo.isActive = false;
        }
        break;
      }
    }
  }
  function notifyVideoJsTrackChange(video) {
    try {
      const event = new Event("change", { bubbles: true });
      video.textTracks.dispatchEvent(event);
      video.dispatchEvent(new Event("texttrackchange", { bubbles: true }));
      log3("debug", "Video.js track change notification dispatched");
    } catch (e) {
      log3("debug", "Failed to notify Video.js:", e);
    }
  }
  function removeTrack(video, track) {
    log3("info", `Removing track: "${track.label}"`);
    deactivateTrack(video, track);
    const blobUrl = track.getAttribute("data-blob-url");
    if (blobUrl) {
      try {
        URL.revokeObjectURL(blobUrl);
        log3("debug", "Blob URL revoked");
      } catch (e) {
        log3("debug", "Failed to revoke Blob URL:", e);
      }
    }
    track.remove();
    unregisterTrack(video, track);
    log3("info", `Track "${track.label}" removed`);
  }
  function removeAllTracks(video) {
    log3("info", "Removing all injected tracks");
    const tracks = [...getInjectedTracks(video)];
    const count = tracks.length;
    for (const trackInfo of tracks) {
      removeTrack(video, trackInfo.element);
    }
    log3("info", `Removed ${count} tracks`);
  }
  function setupCleanup(video) {
    if (cleanupHandlers.has(video)) {
      return;
    }
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.removedNodes) {
          if (node === video || node instanceof Element && node.contains(video)) {
            log3("debug", "Video element removed from DOM, cleaning up tracks");
            removeAllTracks(video);
            observer.disconnect();
            cleanupHandlers.delete(video);
          }
        }
      }
    });
    const parent = video.parentElement;
    if (parent) {
      observer.observe(parent, { childList: true, subtree: true });
    }
    const cleanup = () => {
      observer.disconnect();
      removeAllTracks(video);
    };
    cleanupHandlers.set(video, cleanup);
  }

  // src/content/next-lecture-detector.ts
  var LOG_PREFIX4 = "[UdemyCaptionPlus][NextLecture]";
  function log4(...args) {
    console.log(LOG_PREFIX4, ...args);
  }
  function warn(...args) {
    console.warn(LOG_PREFIX4, ...args);
  }
  function isNumericId(value) {
    return /^\d+$/.test(value);
  }
  function toCourseIdString(id) {
    if (typeof id === "number" && Number.isFinite(id)) return String(id);
    if (typeof id === "string" && id.trim() !== "") return id.trim();
    return null;
  }
  function getNumericCourseIdFromPage() {
    try {
      const ud = window.UD;
      const candidates = [
        ud?.config?.course?.id,
        ud?.config?.brand?.course?.id,
        ud?.course?.id,
        ud?.courseTakingData?.courseId,
        ud?.config?.lecture?.courseId
      ];
      for (const candidate of candidates) {
        const id = toCourseIdString(candidate);
        if (id && isNumericId(id)) return id;
      }
    } catch {
    }
    try {
      const entries = performance.getEntriesByType("resource");
      for (const entry of entries) {
        const url = entry?.name;
        if (typeof url !== "string") continue;
        const match = url.match(/api-2\.0\/courses\/(\d+)/) || url.match(/subscribed-courses\/(\d+)/);
        if (match?.[1]) return match[1];
      }
    } catch {
    }
    const courseElement = document.querySelector("[data-course-id]");
    const courseId = courseElement?.getAttribute("data-course-id") || "";
    if (courseId && isNumericId(courseId)) return courseId;
    return null;
  }
  async function resolveNumericCourseId(params) {
    if (isNumericId(params.courseId)) return params.courseId;
    const fromPage = getNumericCourseIdFromPage();
    if (fromPage) return fromPage;
    try {
      const url = `https://www.udemy.com/api-2.0/courses/${encodeURIComponent(params.courseSlug)}/?fields[course]=id`;
      const response = await fetch(url, { credentials: "include", signal: params.signal });
      if (!response.ok) return null;
      const data = await response.json();
      const id = toCourseIdString(data?.id);
      if (id && isNumericId(id)) return id;
    } catch {
    }
    return null;
  }
  function getNextLectureIdFromUD() {
    try {
      const ud = window.UD;
      const candidates = [
        () => ud?.lecture?.nextLecture?.id,
        () => ud?.lectureInfo?.next?.id,
        () => ud?.courseTakingData?.nextLecture?.id,
        () => ud?.config?.lecture?.next?.id,
        () => ud?.videoPlayer?.nextLecture?.id,
        () => ud?.data?.nextLectureId
      ];
      for (const fn of candidates) {
        const raw = fn();
        const id = toCourseIdString(raw);
        if (id && isNumericId(id)) {
          const title = toCourseIdString(ud?.lecture?.nextLecture?.title) || void 0;
          return { id, title };
        }
      }
    } catch {
    }
    return null;
  }
  async function fetchCurriculumNextLecture(params) {
    const numericCourseId = await resolveNumericCourseId(params);
    if (!numericCourseId) {
      return {
        nextLectureId: null,
        isLastLecture: false,
        method: "none",
        error: "Unable to resolve numeric courseId for curriculum API"
      };
    }
    const apiUrl = `https://www.udemy.com/api-2.0/courses/${numericCourseId}/subscriber-curriculum-items/?page_size=1400&fields[lecture]=title,object_index,is_published,sort_order&fields[chapter]=title,object_index&fields[quiz]=title,object_index&fields[practice]=title,object_index&caching_intent=True`;
    try {
      const response = await fetch(apiUrl, { credentials: "include", signal: params.signal });
      if (!response.ok) {
        return {
          nextLectureId: null,
          isLastLecture: false,
          method: "none",
          error: `Curriculum API request failed: ${response.status}`
        };
      }
      const data = await response.json();
      const items = Array.isArray(data?.results) ? data.results : [];
      const lectures = items.filter((item) => item && item._class === "lecture" && item.is_published !== false).filter((item) => typeof item.id === "number").slice().sort((a, b) => {
        const aIdx = typeof a.object_index === "number" ? a.object_index : typeof a.sort_order === "number" ? a.sort_order : 0;
        const bIdx = typeof b.object_index === "number" ? b.object_index : typeof b.sort_order === "number" ? b.sort_order : 0;
        return aIdx - bIdx;
      });
      const currentIndex = lectures.findIndex((l) => String(l.id) === params.currentLectureId);
      if (currentIndex < 0) {
        return {
          nextLectureId: null,
          isLastLecture: false,
          method: "none",
          error: "Current lecture not found in curriculum"
        };
      }
      if (currentIndex >= lectures.length - 1) {
        return {
          nextLectureId: null,
          isLastLecture: true,
          method: "curriculum-api"
        };
      }
      const next = lectures[currentIndex + 1];
      return {
        nextLectureId: String(next.id),
        nextLectureTitle: typeof next.title === "string" ? next.title : void 0,
        isLastLecture: false,
        method: "curriculum-api"
      };
    } catch (error) {
      return {
        nextLectureId: null,
        isLastLecture: false,
        method: "none",
        error: String(error)
      };
    }
  }
  async function detectNextLecture(params) {
    const viaApi = await fetchCurriculumNextLecture(params);
    if (viaApi.method === "curriculum-api" && (viaApi.nextLectureId || viaApi.isLastLecture)) {
      log4("Resolved via curriculum API:", viaApi.nextLectureId || "(last lecture)");
      return viaApi;
    }
    const udNext = getNextLectureIdFromUD();
    if (udNext) {
      log4("Resolved via UD fallback:", udNext.id);
      return {
        nextLectureId: udNext.id,
        nextLectureTitle: udNext.title,
        isLastLecture: false,
        method: "ud-fallback"
      };
    }
    if (viaApi.error) warn("Failed to resolve via API:", viaApi.error);
    return {
      nextLectureId: null,
      isLastLecture: false,
      method: "none",
      error: viaApi.error
    };
  }

  // src/storage/settings-manager.ts
  var DEFAULT_SETTINGS = {
    provider: "openai",
    apiKey: "",
    model: "gpt-5.1",
    enabled: true,
    autoTranslate: true,
    preloadEnabled: true,
    showCostEstimate: true,
    showLoadingIndicator: true
  };
  var STORAGE_KEY = "udemy-caption-settings";
  function isChromeExtension() {
    return typeof chrome !== "undefined" && !!chrome.storage?.sync;
  }
  async function loadSettings() {
    return new Promise((resolve) => {
      if (isChromeExtension()) {
        chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
          resolve(result);
        });
      } else {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          try {
            resolve({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
          } catch {
            resolve(DEFAULT_SETTINGS);
          }
        } else {
          resolve(DEFAULT_SETTINGS);
        }
      }
    });
  }
  async function saveSettings(settings) {
    return new Promise((resolve, reject) => {
      if (isChromeExtension()) {
        chrome.storage.sync.set(settings, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      } else {
        try {
          const current = localStorage.getItem(STORAGE_KEY);
          const merged = { ...current ? JSON.parse(current) : DEFAULT_SETTINGS, ...settings };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          resolve();
        } catch (error) {
          reject(error);
        }
      }
    });
  }
  var changeListeners = /* @__PURE__ */ new Set();
  function onSettingsChange(callback) {
    changeListeners.add(callback);
    if (isChromeExtension() && changeListeners.size === 1) {
      chrome.storage.onChanged.addListener(handleStorageChange);
    }
    return () => {
      changeListeners.delete(callback);
      if (isChromeExtension() && changeListeners.size === 0) {
        chrome.storage.onChanged.removeListener(handleStorageChange);
      }
    };
  }
  function handleStorageChange(changes, areaName) {
    if (areaName !== "sync") return;
    const oldSettings = {};
    const newSettings = {};
    for (const key of Object.keys(changes)) {
      if (key in DEFAULT_SETTINGS) {
        oldSettings[key] = changes[key].oldValue;
        newSettings[key] = changes[key].newValue;
      }
    }
    loadSettings().then((currentSettings) => {
      const previousSettings = { ...currentSettings };
      for (const key of Object.keys(oldSettings)) {
        if (oldSettings[key] !== void 0) {
          previousSettings[key] = oldSettings[key];
        }
      }
      for (const listener of changeListeners) {
        try {
          listener(currentSettings, previousSettings);
        } catch (error) {
          console.error("[SettingsManager] Error in change listener:", error);
        }
      }
    });
  }
  function isConfigured(settings) {
    return !!settings.apiKey && !!settings.model && !!settings.provider;
  }
  function isEnabled(settings) {
    return settings.enabled && isConfigured(settings);
  }
  var SettingsManager = class {
    constructor() {
      this.cachedSettings = null;
      this.unsubscribe = null;
    }
    /**
     * Initialize the settings manager
     */
    async init() {
      this.cachedSettings = await loadSettings();
      this.unsubscribe = onSettingsChange((newSettings) => {
        this.cachedSettings = newSettings;
      });
      return this.cachedSettings;
    }
    /**
     * Get current settings (from cache if available)
     */
    async getSettings() {
      if (this.cachedSettings) {
        return this.cachedSettings;
      }
      return loadSettings();
    }
    /**
     * Update settings
     */
    async updateSettings(settings) {
      await saveSettings(settings);
      if (this.cachedSettings) {
        this.cachedSettings = { ...this.cachedSettings, ...settings };
      }
    }
    /**
     * Check if translation is enabled
     */
    isEnabled() {
      if (!this.cachedSettings) return false;
      return isEnabled(this.cachedSettings);
    }
    /**
     * Check if settings are configured
     */
    isConfigured() {
      if (!this.cachedSettings) return false;
      return isConfigured(this.cachedSettings);
    }
    /**
     * Cleanup
     */
    destroy() {
      if (this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = null;
      }
      this.cachedSettings = null;
    }
  };
  var settingsManager = new SettingsManager();

  // src/content/loading-indicator.ts
  var INDICATOR_ID = "udemy-caption-plus-loading-indicator";
  var INDICATOR_CLASS = "ucp-loading-indicator";
  var INDICATOR_STYLES = `
.${INDICATOR_CLASS} {
  position: absolute;
  z-index: 100000;
  padding: 10px 16px;
  border-radius: 6px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: opacity 0.3s ease, transform 0.3s ease;
  pointer-events: auto;
  max-width: 320px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.${INDICATOR_CLASS}--hidden {
  opacity: 0;
  pointer-events: none;
  transform: translateY(-10px);
}

/* Position variants */
.${INDICATOR_CLASS}--top-left {
  top: 12px;
  left: 12px;
}

.${INDICATOR_CLASS}--top-right {
  top: 12px;
  right: 12px;
}

.${INDICATOR_CLASS}--bottom-left {
  bottom: 60px;
  left: 12px;
}

.${INDICATOR_CLASS}--bottom-right {
  bottom: 60px;
  right: 12px;
}

.${INDICATOR_CLASS}--center {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.${INDICATOR_CLASS}--center.${INDICATOR_CLASS}--hidden {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.95);
}

/* Status variants */
.${INDICATOR_CLASS}--loading {
  background: rgba(164, 53, 240, 0.95);
  color: #fff;
}

.${INDICATOR_CLASS}--success {
  background: rgba(46, 125, 50, 0.95);
  color: #fff;
}

.${INDICATOR_CLASS}--error {
  background: rgba(198, 40, 40, 0.95);
  color: #fff;
  flex-direction: column;
  align-items: flex-start;
}

/* Spinner animation */
.${INDICATOR_CLASS}__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: ucp-spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes ucp-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Check icon for success */
.${INDICATOR_CLASS}__check {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.${INDICATOR_CLASS}__check::after {
  content: "";
  width: 4px;
  height: 8px;
  border: solid #2e7d32;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
  margin-top: -2px;
}

/* Error icon */
.${INDICATOR_CLASS}__error-icon {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.${INDICATOR_CLASS}__error-icon::after {
  content: "!";
  color: #c62828;
  font-size: 12px;
  font-weight: bold;
}

/* Message text */
.${INDICATOR_CLASS}__message {
  flex: 1;
}

/* Error details */
.${INDICATOR_CLASS}__details {
  font-size: 11px;
  opacity: 0.85;
  margin-top: 4px;
  word-break: break-word;
}

/* Error actions row */
.${INDICATOR_CLASS}__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  width: 100%;
}

/* Retry button */
.${INDICATOR_CLASS}__retry-btn {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.${INDICATOR_CLASS}__retry-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.${INDICATOR_CLASS}__retry-btn:active {
  transform: scale(0.98);
}

/* Dismiss button */
.${INDICATOR_CLASS}__dismiss-btn {
  padding: 6px 12px;
  font-size: 12px;
  background: transparent;
  color: rgba(255, 255, 255, 0.8);
  border: none;
  cursor: pointer;
  transition: color 0.2s;
}

.${INDICATOR_CLASS}__dismiss-btn:hover {
  color: #fff;
}
`;
  var indicatorStates = /* @__PURE__ */ new WeakMap();
  var indicatorElements = /* @__PURE__ */ new WeakMap();
  var autoHideTimers = /* @__PURE__ */ new WeakMap();
  var styleElement = null;
  function ensureStylesInjected() {
    if (styleElement && document.head.contains(styleElement)) {
      return;
    }
    styleElement = document.createElement("style");
    styleElement.id = `${INDICATOR_ID}-styles`;
    styleElement.textContent = INDICATOR_STYLES;
    document.head.appendChild(styleElement);
  }
  function createIndicatorElement(state, position) {
    const container = document.createElement("div");
    container.className = `${INDICATOR_CLASS} ${INDICATOR_CLASS}--${position}`;
    updateIndicatorDOM(container, state);
    return container;
  }
  function updateIndicatorDOM(container, state) {
    const { status, message, errorDetails, onRetry } = state;
    container.classList.remove(
      `${INDICATOR_CLASS}--loading`,
      `${INDICATOR_CLASS}--success`,
      `${INDICATOR_CLASS}--error`,
      `${INDICATOR_CLASS}--hidden`
    );
    if (status === "hidden") {
      container.classList.add(`${INDICATOR_CLASS}--hidden`);
      return;
    }
    container.classList.add(`${INDICATOR_CLASS}--${status}`);
    let html = "";
    if (status === "loading") {
      html = `
      <div class="${INDICATOR_CLASS}__spinner"></div>
      <span class="${INDICATOR_CLASS}__message">${escapeHtml(message)}</span>
    `;
    } else if (status === "success") {
      html = `
      <div class="${INDICATOR_CLASS}__check"></div>
      <span class="${INDICATOR_CLASS}__message">${escapeHtml(message)}</span>
    `;
    } else if (status === "error") {
      html = `
      <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
        <div class="${INDICATOR_CLASS}__error-icon"></div>
        <span class="${INDICATOR_CLASS}__message">${escapeHtml(message)}</span>
      </div>
      ${errorDetails ? `<div class="${INDICATOR_CLASS}__details">${escapeHtml(errorDetails)}</div>` : ""}
      <div class="${INDICATOR_CLASS}__actions">
        ${onRetry ? `<button class="${INDICATOR_CLASS}__retry-btn" type="button">\u91CD\u8BD5</button>` : ""}
        <button class="${INDICATOR_CLASS}__dismiss-btn" type="button">\u5173\u95ED</button>
      </div>
    `;
    }
    container.innerHTML = html;
    if (status === "error") {
      const retryBtn = container.querySelector(`.${INDICATOR_CLASS}__retry-btn`);
      const dismissBtn = container.querySelector(`.${INDICATOR_CLASS}__dismiss-btn`);
      if (retryBtn && onRetry) {
        retryBtn.addEventListener("click", () => {
          onRetry();
        });
      }
      if (dismissBtn) {
        dismissBtn.addEventListener("click", () => {
          container.classList.add(`${INDICATOR_CLASS}--hidden`);
        });
      }
    }
  }
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
  function findVideoContainer(video) {
    const selectors = [
      '[data-purpose="video-player"]',
      '[class*="video-player--container--"]',
      ".vjs-tech",
      ".video-js"
    ];
    for (const selector of selectors) {
      const container = video.closest(selector);
      if (container instanceof HTMLElement) {
        return container;
      }
    }
    return video.parentElement || document.body;
  }
  function showLoadingIndicator(video, options = {}) {
    const {
      message = "\u5B57\u5E55\u7FFB\u8BD1\u4E2D\u2026",
      position = "top-right",
      autoHideDelay = 0
    } = options;
    ensureStylesInjected();
    const state = {
      status: "loading",
      message
    };
    indicatorStates.set(video, state);
    const existingTimer = autoHideTimers.get(video);
    if (existingTimer) {
      clearTimeout(existingTimer);
      autoHideTimers.delete(video);
    }
    let indicator = indicatorElements.get(video);
    const container = findVideoContainer(video);
    if (!indicator || !container.contains(indicator)) {
      indicator = createIndicatorElement(state, position);
      indicatorElements.set(video, indicator);
      const containerStyle = window.getComputedStyle(container);
      if (containerStyle.position === "static") {
        container.style.position = "relative";
      }
      container.appendChild(indicator);
      void indicator.offsetHeight;
    } else {
      indicator.className = `${INDICATOR_CLASS} ${INDICATOR_CLASS}--${position}`;
      updateIndicatorDOM(indicator, state);
    }
    if (autoHideDelay > 0) {
      const timer = setTimeout(() => {
        hideLoadingIndicator(video);
      }, autoHideDelay);
      autoHideTimers.set(video, timer);
    }
  }
  function showSuccessIndicator(video, options = {}) {
    const {
      message = "\u7FFB\u8BD1\u5B8C\u6210",
      position = "top-right",
      autoHideDelay = 3e3
    } = options;
    ensureStylesInjected();
    const state = {
      status: "success",
      message
    };
    indicatorStates.set(video, state);
    const existingTimer = autoHideTimers.get(video);
    if (existingTimer) {
      clearTimeout(existingTimer);
      autoHideTimers.delete(video);
    }
    let indicator = indicatorElements.get(video);
    const container = findVideoContainer(video);
    if (!indicator || !container.contains(indicator)) {
      indicator = createIndicatorElement(state, position);
      indicatorElements.set(video, indicator);
      const containerStyle = window.getComputedStyle(container);
      if (containerStyle.position === "static") {
        container.style.position = "relative";
      }
      container.appendChild(indicator);
      void indicator.offsetHeight;
    } else {
      indicator.className = `${INDICATOR_CLASS} ${INDICATOR_CLASS}--${position}`;
      updateIndicatorDOM(indicator, state);
    }
    if (autoHideDelay > 0) {
      const timer = setTimeout(() => {
        hideLoadingIndicator(video);
      }, autoHideDelay);
      autoHideTimers.set(video, timer);
    }
  }
  function showErrorIndicator(video, options = {}) {
    const {
      message = "\u7FFB\u8BD1\u5931\u8D25",
      errorDetails,
      onRetry,
      position = "top-right",
      autoHideDelay = 0
    } = options;
    ensureStylesInjected();
    const state = {
      status: "error",
      message,
      errorDetails,
      onRetry
    };
    indicatorStates.set(video, state);
    const existingTimer = autoHideTimers.get(video);
    if (existingTimer) {
      clearTimeout(existingTimer);
      autoHideTimers.delete(video);
    }
    let indicator = indicatorElements.get(video);
    const container = findVideoContainer(video);
    if (!indicator || !container.contains(indicator)) {
      indicator = createIndicatorElement(state, position);
      indicatorElements.set(video, indicator);
      const containerStyle = window.getComputedStyle(container);
      if (containerStyle.position === "static") {
        container.style.position = "relative";
      }
      container.appendChild(indicator);
      void indicator.offsetHeight;
    } else {
      indicator.className = `${INDICATOR_CLASS} ${INDICATOR_CLASS}--${position}`;
      updateIndicatorDOM(indicator, state);
    }
    if (autoHideDelay > 0) {
      const timer = setTimeout(() => {
        hideLoadingIndicator(video);
      }, autoHideDelay);
      autoHideTimers.set(video, timer);
    }
  }
  function hideLoadingIndicator(video) {
    const indicator = indicatorElements.get(video);
    if (!indicator) return;
    const timer = autoHideTimers.get(video);
    if (timer) {
      clearTimeout(timer);
      autoHideTimers.delete(video);
    }
    indicator.classList.add(`${INDICATOR_CLASS}--hidden`);
    const state = indicatorStates.get(video);
    if (state) {
      state.status = "hidden";
    }
  }

  // src/content/content-script.ts
  var LOG_PREFIX5 = "[UdemyCaptionPlus][Content]";
  function log5(...args) {
    console.log(LOG_PREFIX5, ...args);
  }
  function generateTaskId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
  var activeTranslationTaskId = null;
  var lastPreloadKey = null;
  async function requestTranslation(options) {
    const settings = await loadSettings();
    if (!isEnabled(settings)) {
      log5("Translation not enabled or not configured");
      return;
    }
    const { videoDetection, vttContent } = await fetchSubtitles();
    if (!videoDetection.found || !videoDetection.video) {
      log5("Video not found");
      return;
    }
    if (!videoDetection.courseInfo) {
      log5("Course info not available");
      return;
    }
    if (!vttContent) {
      log5("No VTT content fetched");
      return;
    }
    const courseInfo = videoDetection.courseInfo;
    const taskId = options.taskId ?? generateTaskId(options.force ? "retranslate" : "translate");
    const courseId = courseInfo.courseId || courseInfo.courseSlug || "unknown-course";
    const lectureId = courseInfo.lectureId || "unknown-lecture";
    activeTranslationTaskId = taskId;
    if (settings.showLoadingIndicator) {
      showLoadingIndicator(videoDetection.video, {
        message: options.force ? "\u6B63\u5728\u91CD\u65B0\u7FFB\u8BD1\u2026" : "\u5B57\u5E55\u7FFB\u8BD1\u4E2D\u2026"
      });
    }
    const message = {
      type: "TRANSLATE_SUBTITLE",
      payload: {
        taskId,
        vttContent: vttContent.content,
        originalHash: vttContent.hash,
        courseId,
        lectureId,
        courseName: courseInfo.courseTitle || "",
        sectionName: courseInfo.sectionTitle || "",
        lectureName: courseInfo.lectureTitle || "",
        provider: settings.provider,
        model: settings.model,
        force: options.force
      }
    };
    try {
      await chrome.runtime.sendMessage(message);
    } catch (error) {
      log5("Failed to send translation request:", error);
      if (settings.showLoadingIndicator) {
        showErrorIndicator(videoDetection.video, {
          message: "\u8BF7\u6C42\u53D1\u9001\u5931\u8D25",
          errorDetails: String(error),
          onRetry: () => requestTranslation(options)
        });
      }
    }
  }
  async function requestPreloadNextLecture() {
    const settings = await loadSettings();
    if (!isEnabled(settings) || !settings.preloadEnabled) return;
    const courseInfo = extractCourseInfo();
    if (!courseInfo) return;
    const courseId = courseInfo.courseId || courseInfo.courseSlug || "unknown-course";
    const currentLectureId = courseInfo.lectureId;
    const result = await detectNextLecture({
      courseId,
      courseSlug: courseInfo.courseSlug,
      currentLectureId
    });
    if (!result.nextLectureId) return;
    const preloadKey = `${courseId}-${result.nextLectureId}`;
    if (preloadKey === lastPreloadKey) return;
    lastPreloadKey = preloadKey;
    const message = {
      type: "PRELOAD_NEXT",
      payload: {
        courseId,
        nextLectureId: result.nextLectureId,
        nextLectureTitle: result.nextLectureTitle || "",
        courseName: courseInfo.courseTitle || "",
        sectionName: courseInfo.sectionTitle || ""
      }
    };
    try {
      await chrome.runtime.sendMessage(message);
    } catch (error) {
      log5("Failed to send preload request:", error);
    }
  }
  async function cancelActiveTranslation() {
    if (!activeTranslationTaskId) return;
    const taskId = activeTranslationTaskId;
    activeTranslationTaskId = null;
    const video = document.querySelector("video");
    if (video instanceof HTMLVideoElement) {
      hideLoadingIndicator(video);
    }
    try {
      await chrome.runtime.sendMessage({ type: "CANCEL_TRANSLATION", payload: { taskId } });
    } catch {
    }
  }
  function setupMessageListeners() {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message !== "object") return;
      if (message.meta?.target === "popup") return;
      if (message.type === "RETRANSLATE_CURRENT") {
        const taskId = message.payload?.taskId;
        requestTranslation({ force: true, taskId }).then(() => sendResponse?.({ ok: true })).catch((error) => sendResponse?.({ ok: false, error: String(error) }));
        return true;
      }
      if (message.type === "CACHE_HIT") {
        if (message.payload?.taskId && message.payload.taskId === activeTranslationTaskId) {
          activeTranslationTaskId = null;
        }
        const translatedVTT = message.payload?.translatedVTT;
        if (typeof translatedVTT === "string" && translatedVTT.trim().startsWith("WEBVTT")) {
          const video = document.querySelector("video");
          if (video instanceof HTMLVideoElement) {
            injectTrack(video, translatedVTT, { activate: true });
            loadSettings().then((settings) => {
              if (settings.showLoadingIndicator) {
                showSuccessIndicator(video, { message: "\u7F13\u5B58\u547D\u4E2D" });
              }
            });
          }
        }
        return;
      }
      if (message.type === "TRANSLATION_COMPLETE") {
        if (message.payload?.taskId && message.payload.taskId === activeTranslationTaskId) {
          activeTranslationTaskId = null;
        }
        const translatedVTT = message.payload?.translatedVTT;
        const video = document.querySelector("video");
        if (message.payload?.success === true && typeof translatedVTT === "string") {
          if (video instanceof HTMLVideoElement) {
            injectTrack(video, translatedVTT, { activate: true });
            loadSettings().then((settings) => {
              if (settings.showLoadingIndicator) {
                showSuccessIndicator(video, { message: "\u7FFB\u8BD1\u5B8C\u6210" });
              }
            });
          }
        } else {
          const errorMsg = message.payload?.error || "unknown error";
          log5("Translation failed:", errorMsg);
          if (video instanceof HTMLVideoElement) {
            loadSettings().then((settings) => {
              if (settings.showLoadingIndicator) {
                showErrorIndicator(video, {
                  message: "\u7FFB\u8BD1\u5931\u8D25",
                  errorDetails: String(errorMsg),
                  onRetry: () => requestTranslation({ force: true })
                });
              }
            });
          }
        }
        return;
      }
      return;
    });
  }
  async function autoTranslateIfEnabled() {
    try {
      const settings = await loadSettings();
      if (!isEnabled(settings) || !settings.autoTranslate) return;
      await requestTranslation({ force: false });
    } catch (error) {
      log5("Auto-translate init failed:", error);
    }
  }
  function getLectureIdFromUrl() {
    return window.location.pathname.match(/\/learn\/lecture\/(\d+)/)?.[1] ?? null;
  }
  function watchLectureNavigation() {
    let lastLectureId = getLectureIdFromUrl();
    setInterval(() => {
      const currentLectureId = getLectureIdFromUrl();
      if (!currentLectureId || currentLectureId === lastLectureId) return;
      lastLectureId = currentLectureId;
      lastPreloadKey = null;
      cancelActiveTranslation().then(() => autoTranslateIfEnabled()).then(() => requestPreloadNextLecture()).catch((error) => log5("Lecture navigation handler failed:", error));
    }, 1e3);
  }
  function init() {
    setupMessageListeners();
    watchLectureNavigation();
    void autoTranslateIfEnabled();
    void requestPreloadNextLecture();
  }
  init();
})();
//# sourceMappingURL=content-script.js.map
