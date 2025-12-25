"use strict";
(() => {
  // src/storage/settings-manager.ts
  var DEFAULT_SETTINGS = {
    provider: "openai",
    apiKey: "",
    model: "gpt-5.1",
    openaiBaseUrl: "",
    // Empty = use official https://api.openai.com/v1
    geminiBaseUrl: "",
    // Empty = use official https://generativelanguage.googleapis.com/v1beta
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

  // src/storage/subtitle-cache.ts
  var DB_NAME = "UdemyCaptionCache";
  var DB_VERSION = 1;
  var STORE_NAME = "subtitles";
  var DEFAULT_MAX_ENTRIES = 500;
  var DEFAULT_MAX_SIZE_BYTES = 100 * 1024 * 1024;
  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => {
        reject(new Error(`Failed to open database: ${request.error?.message}`));
      };
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("courseId", "courseId", { unique: false });
          store.createIndex("lectureId", "lectureId", { unique: false });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
          store.createIndex("createdAt", "createdAt", { unique: false });
          store.createIndex("provider", "provider", { unique: false });
          store.createIndex("model", "model", { unique: false });
        }
      };
    });
  }
  function generateCacheKey(courseId, lectureId) {
    return `${courseId}-${lectureId}`;
  }
  function estimateEntrySize(entry) {
    return JSON.stringify(entry).length * 2;
  }
  async function getCache(courseId, lectureId, originalHash) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const key = generateCacheKey(courseId, lectureId);
      const request = store.get(key);
      request.onerror = () => {
        db.close();
        reject(new Error(`Failed to get cache entry: ${request.error?.message}`));
      };
      request.onsuccess = () => {
        db.close();
        const entry = request.result;
        if (!entry) {
          resolve({ hit: false });
          return;
        }
        if (originalHash !== void 0) {
          const hashMatch = entry.originalHash === originalHash;
          resolve({ hit: true, entry, hashMatch });
        } else {
          resolve({ hit: true, entry });
        }
      };
    });
  }
  async function setCache(input, options = {}) {
    const { autoEvict = true } = options;
    const db = await openDatabase();
    const now = Date.now();
    const key = generateCacheKey(input.courseId, input.lectureId);
    const existingEntry = await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onerror = () => reject(new Error("Failed to check existing entry"));
      request.onsuccess = () => resolve(request.result);
    });
    const entry = {
      id: key,
      courseId: input.courseId,
      lectureId: input.lectureId,
      courseName: input.courseName,
      lectureName: input.lectureName,
      originalHash: input.originalHash,
      translatedVTT: input.translatedVTT,
      provider: input.provider,
      model: input.model,
      tokensUsed: input.tokensUsed,
      estimatedCost: input.estimatedCost,
      createdAt: existingEntry?.createdAt ?? now,
      updatedAt: now
    };
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(entry);
      request.onerror = () => {
        db.close();
        reject(new Error(`Failed to set cache entry: ${request.error?.message}`));
      };
      request.onsuccess = () => {
        db.close();
        if (autoEvict) {
          evictIfNeeded(options).catch(console.error);
        }
        resolve(entry);
      };
    });
  }
  async function deleteCache(courseId, lectureId) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const key = generateCacheKey(courseId, lectureId);
      const request = store.delete(key);
      request.onerror = () => {
        db.close();
        reject(new Error(`Failed to delete cache entry: ${request.error?.message}`));
      };
      request.onsuccess = () => {
        db.close();
        resolve(true);
      };
    });
  }
  async function deleteCourseCache(courseId) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("courseId");
      const request = index.openCursor(IDBKeyRange.only(courseId));
      let deletedCount = 0;
      request.onerror = () => {
        db.close();
        reject(new Error(`Failed to delete course cache: ${request.error?.message}`));
      };
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        } else {
          db.close();
          resolve(deletedCount);
        }
      };
    });
  }
  async function clearAllCache() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();
      request.onerror = () => {
        db.close();
        reject(new Error(`Failed to clear cache: ${request.error?.message}`));
      };
      request.onsuccess = () => {
        db.close();
        resolve();
      };
    });
  }
  async function getCourseEntries(courseId) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("courseId");
      const request = index.getAll(IDBKeyRange.only(courseId));
      request.onerror = () => {
        db.close();
        reject(new Error(`Failed to get course entries: ${request.error?.message}`));
      };
      request.onsuccess = () => {
        db.close();
        resolve(request.result);
      };
    });
  }
  async function getAllEntries() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onerror = () => {
        db.close();
        reject(new Error(`Failed to get all entries: ${request.error?.message}`));
      };
      request.onsuccess = () => {
        db.close();
        resolve(request.result);
      };
    });
  }
  async function getCacheCount() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count();
      request.onerror = () => {
        db.close();
        reject(new Error(`Failed to get cache count: ${request.error?.message}`));
      };
      request.onsuccess = () => {
        db.close();
        resolve(request.result);
      };
    });
  }
  async function getCacheStats() {
    const entries = await getAllEntries();
    if (entries.length === 0) {
      return {
        totalEntries: 0,
        totalSizeBytes: 0,
        oldestEntry: null,
        newestEntry: null,
        totalTokensUsed: 0,
        totalEstimatedCost: 0
      };
    }
    let totalSizeBytes = 0;
    let oldestEntry = Infinity;
    let newestEntry = 0;
    let totalTokensUsed = 0;
    let totalEstimatedCost = 0;
    for (const entry of entries) {
      totalSizeBytes += estimateEntrySize(entry);
      oldestEntry = Math.min(oldestEntry, entry.createdAt);
      newestEntry = Math.max(newestEntry, entry.updatedAt);
      totalTokensUsed += entry.tokensUsed;
      totalEstimatedCost += entry.estimatedCost;
    }
    return {
      totalEntries: entries.length,
      totalSizeBytes,
      oldestEntry: oldestEntry === Infinity ? null : oldestEntry,
      newestEntry: newestEntry === 0 ? null : newestEntry,
      totalTokensUsed,
      totalEstimatedCost
    };
  }
  async function evictIfNeeded(options = {}) {
    const { maxEntries = DEFAULT_MAX_ENTRIES, maxSizeBytes = DEFAULT_MAX_SIZE_BYTES } = options;
    const stats = await getCacheStats();
    const needsEntryEviction = stats.totalEntries > maxEntries;
    const needsSizeEviction = stats.totalSizeBytes > maxSizeBytes;
    if (!needsEntryEviction && !needsSizeEviction) {
      return 0;
    }
    const entries = await getAllEntries();
    entries.sort((a, b) => a.updatedAt - b.updatedAt);
    let evictedCount = 0;
    let currentSize = stats.totalSizeBytes;
    let currentCount = stats.totalEntries;
    for (const entry of entries) {
      const countOk = currentCount <= maxEntries;
      const sizeOk = currentSize <= maxSizeBytes;
      if (countOk && sizeOk) break;
      await deleteCache(entry.courseId, entry.lectureId);
      evictedCount++;
      currentCount--;
      currentSize -= estimateEntrySize(entry);
    }
    return evictedCount;
  }
  async function cleanupCache(options = {}) {
    const evictedCount = await evictIfNeeded(options);
    const stats = await getCacheStats();
    return {
      evictedCount,
      remainingEntries: stats.totalEntries,
      remainingSizeBytes: stats.totalSizeBytes
    };
  }
  async function touchCache(courseId, lectureId) {
    const db = await openDatabase();
    const key = generateCacheKey(courseId, lectureId);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(key);
      getRequest.onerror = () => {
        db.close();
        reject(new Error(`Failed to touch cache entry: ${getRequest.error?.message}`));
      };
      getRequest.onsuccess = () => {
        const entry = getRequest.result;
        if (!entry) {
          db.close();
          resolve(false);
          return;
        }
        entry.updatedAt = Date.now();
        const putRequest = store.put(entry);
        putRequest.onerror = () => {
          db.close();
          reject(new Error(`Failed to update cache entry: ${putRequest.error?.message}`));
        };
        putRequest.onsuccess = () => {
          db.close();
          resolve(true);
        };
      };
    });
  }
  var SubtitleCache = class {
    constructor(options = {}) {
      this.options = {
        maxEntries: options.maxEntries ?? DEFAULT_MAX_ENTRIES,
        maxSizeBytes: options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES,
        autoEvict: options.autoEvict ?? true
      };
    }
    /**
     * Get a cached subtitle, optionally validating hash
     */
    async get(courseId, lectureId, originalHash) {
      const result = await getCache(courseId, lectureId, originalHash);
      if (result.hit) {
        await touchCache(courseId, lectureId).catch(() => {
        });
      }
      return result;
    }
    /**
     * Store a translated subtitle
     */
    async set(input) {
      return setCache(input, this.options);
    }
    /**
     * Delete a cached subtitle
     */
    async delete(courseId, lectureId) {
      return deleteCache(courseId, lectureId);
    }
    /**
     * Delete all cached subtitles for a course
     */
    async deleteCourse(courseId) {
      return deleteCourseCache(courseId);
    }
    /**
     * Clear all cached subtitles
     */
    async clear() {
      return clearAllCache();
    }
    /**
     * Get all cached entries for a course
     */
    async getCourseEntries(courseId) {
      return getCourseEntries(courseId);
    }
    /**
     * Get cache statistics
     */
    async getStats() {
      return getCacheStats();
    }
    /**
     * Get total number of cached entries
     */
    async getCount() {
      return getCacheCount();
    }
    /**
     * Check if a subtitle is cached
     */
    async has(courseId, lectureId) {
      const result = await getCache(courseId, lectureId);
      return result.hit;
    }
    /**
     * Check if a subtitle is cached with matching hash
     */
    async hasValid(courseId, lectureId, originalHash) {
      const result = await getCache(courseId, lectureId, originalHash);
      return result.hit && result.hashMatch === true;
    }
    /**
     * Manually trigger cache cleanup
     */
    async cleanup() {
      return cleanupCache(this.options);
    }
    /**
     * Update cache options
     */
    setOptions(options) {
      this.options = { ...this.options, ...options };
    }
  };
  var subtitleCache = new SubtitleCache();

  // src/storage/session-cost.ts
  var STORAGE_KEY2 = "udemy-caption-plus:session-cost";
  var DEFAULT_STATE = {
    totals: {
      totalTokens: 0,
      totalCostUsd: 0,
      updatedAt: 0
    }
  };
  var memoryState = null;
  function hasSessionStorage() {
    return typeof chrome !== "undefined" && !!chrome.storage?.session;
  }
  function loadFromMemory() {
    if (!memoryState) memoryState = structuredClone(DEFAULT_STATE);
    return memoryState;
  }
  function saveToMemory(state) {
    memoryState = state;
  }
  async function loadSessionCostState() {
    if (!hasSessionStorage()) {
      return loadFromMemory();
    }
    return new Promise((resolve) => {
      chrome.storage.session.get({ [STORAGE_KEY2]: DEFAULT_STATE }, (result) => {
        resolve(result[STORAGE_KEY2] ?? structuredClone(DEFAULT_STATE));
      });
    });
  }
  async function saveSessionCostState(state) {
    if (!hasSessionStorage()) {
      saveToMemory(state);
      return;
    }
    return new Promise((resolve, reject) => {
      chrome.storage.session.set({ [STORAGE_KEY2]: state }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }
  async function updateSessionCostState(patch) {
    const current = await loadSessionCostState();
    const next = {
      ...current,
      ...patch,
      totals: {
        ...current.totals,
        ...patch.totals || {}
      }
    };
    await saveSessionCostState(next);
    return next;
  }
  async function addSessionCost(deltaTokens, deltaCostUsd) {
    const current = await loadSessionCostState();
    const now = Date.now();
    const next = {
      ...current,
      totals: {
        totalTokens: current.totals.totalTokens + deltaTokens,
        totalCostUsd: current.totals.totalCostUsd + deltaCostUsd,
        updatedAt: now
      }
    };
    await saveSessionCostState(next);
    return next;
  }

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

  // src/services/version-checker.ts
  async function resolveOriginalHash(params) {
    if (params.originalHash) return params.originalHash;
    if (params.originalVtt !== void 0) return calculateHash(params.originalVtt);
    throw new Error("Either originalHash or originalVtt must be provided");
  }
  async function checkSubtitleVersion(params) {
    const originalHash = await resolveOriginalHash(params);
    const { courseId, lectureId, force = false } = params;
    const cacheResult = await subtitleCache.get(courseId, lectureId, originalHash);
    if (force) {
      return {
        decision: "retranslate",
        reason: "force",
        originalHash,
        cacheHit: cacheResult.hit,
        hashMatch: cacheResult.hashMatch,
        cachedEntry: cacheResult.entry
      };
    }
    if (!cacheResult.hit) {
      return {
        decision: "retranslate",
        reason: "cache_miss",
        originalHash,
        cacheHit: false
      };
    }
    if (cacheResult.hashMatch === false) {
      return {
        decision: "retranslate",
        reason: "hash_changed",
        originalHash,
        cacheHit: true,
        hashMatch: false,
        cachedEntry: cacheResult.entry
      };
    }
    return {
      decision: "use_cache",
      reason: "cache_valid",
      originalHash,
      cacheHit: true,
      hashMatch: true,
      cachedEntry: cacheResult.entry
    };
  }

  // src/utils/webvtt-parser.ts
  var LOG_PREFIX = "[WebVTT Parser]";
  var WEBVTT_SIGNATURE = "WEBVTT";
  var TIMESTAMP_ARROW = "-->";
  var PATTERNS = {
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
    bom: /^\uFEFF/
  };
  var LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };
  var currentLogLevel = "warn";
  function log(level, ...args) {
    if (LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel]) {
      const method = level === "error" ? "error" : level === "warn" ? "warn" : "log";
      console[method](LOG_PREFIX, `[${level.toUpperCase()}]`, ...args);
    }
  }
  function parseTimestamp(timestamp) {
    const trimmed = timestamp.trim();
    const match = trimmed.match(PATTERNS.timestamp);
    if (!match) {
      log("debug", `Invalid timestamp format: "${timestamp}"`);
      return null;
    }
    const [, hoursStr, minutesStr, secondsStr, msStr] = match;
    const hours = hoursStr ? parseInt(hoursStr, 10) : 0;
    const minutes = parseInt(minutesStr, 10);
    const seconds = parseInt(secondsStr, 10);
    const milliseconds = parseInt(msStr, 10);
    if (minutes > 59 || seconds > 59 || milliseconds > 999) {
      log("debug", `Timestamp values out of range: "${timestamp}"`);
      return null;
    }
    return { hours, minutes, seconds, milliseconds };
  }
  function timestampToMs(ts) {
    return ts.hours * 36e5 + ts.minutes * 6e4 + ts.seconds * 1e3 + ts.milliseconds;
  }
  function compareTimestamps(a, b) {
    return timestampToMs(a) - timestampToMs(b);
  }
  function parseVTT(vttString) {
    const warnings = [];
    if (!vttString || typeof vttString !== "string") {
      return {
        success: false,
        error: "Empty or invalid input"
      };
    }
    let content = vttString.replace(PATTERNS.bom, "");
    content = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = content.split("\n");
    const firstLine = lines[0]?.trim() || "";
    if (!firstLine.startsWith(WEBVTT_SIGNATURE)) {
      return {
        success: false,
        error: `Invalid WebVTT file: missing WEBVTT signature (found: "${firstLine.substring(0, 20)}")`
      };
    }
    const headerText = firstLine.substring(WEBVTT_SIGNATURE.length).trim();
    const header = headerText.startsWith("-") || headerText.startsWith(" ") ? headerText.substring(1).trim() : headerText || void 0;
    const result = {
      header,
      cues: [],
      styles: [],
      regions: [],
      notes: []
    };
    let currentIndex = 1;
    let cueCount = 0;
    while (currentIndex < lines.length && lines[currentIndex].trim() === "") {
      currentIndex++;
    }
    while (currentIndex < lines.length) {
      const line = lines[currentIndex].trim();
      if (line === "") {
        currentIndex++;
        continue;
      }
      if (PATTERNS.styleStart.test(line)) {
        const styleResult = parseStyleBlock(lines, currentIndex);
        if (styleResult.style) {
          result.styles.push(styleResult.style);
        }
        currentIndex = styleResult.nextIndex;
        continue;
      }
      if (PATTERNS.regionStart.test(line)) {
        const regionResult = parseRegionBlock(lines, currentIndex);
        if (regionResult.region) {
          result.regions.push(regionResult.region);
        }
        currentIndex = regionResult.nextIndex;
        continue;
      }
      if (PATTERNS.noteStart.test(line)) {
        const noteResult = parseNoteBlock(lines, currentIndex);
        if (noteResult.note) {
          result.notes.push(noteResult.note);
        }
        currentIndex = noteResult.nextIndex;
        continue;
      }
      const cueResult = parseCue(lines, currentIndex);
      if (cueResult.cue) {
        result.cues.push(cueResult.cue);
        cueCount++;
      } else if (cueResult.error) {
        warnings.push(`Line ${currentIndex + 1}: ${cueResult.error}`);
      }
      currentIndex = cueResult.nextIndex;
    }
    if (result.styles.length === 0) delete result.styles;
    if (result.regions.length === 0) delete result.regions;
    if (result.notes.length === 0) delete result.notes;
    log("info", `Parsed ${cueCount} cues from WebVTT file`);
    return {
      success: true,
      data: result,
      warnings: warnings.length > 0 ? warnings : void 0
    };
  }
  function parseStyleBlock(lines, startIndex) {
    let index = startIndex + 1;
    const styleLines = [];
    while (index < lines.length && lines[index].trim() !== "") {
      styleLines.push(lines[index]);
      index++;
    }
    return {
      style: styleLines.length > 0 ? styleLines.join("\n") : null,
      nextIndex: index
    };
  }
  function parseRegionBlock(lines, startIndex) {
    let index = startIndex + 1;
    const regionLines = [];
    let regionId = "";
    while (index < lines.length && lines[index].trim() !== "") {
      const line = lines[index].trim();
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
        settings: regionLines.join("\n")
      },
      nextIndex: index
    };
  }
  function parseNoteBlock(lines, startIndex) {
    const firstLine = lines[startIndex];
    let index = startIndex + 1;
    const noteLines = [];
    const inlineNote = firstLine.substring(4).trim();
    if (inlineNote) {
      noteLines.push(inlineNote);
    }
    while (index < lines.length && lines[index].trim() !== "") {
      noteLines.push(lines[index]);
      index++;
    }
    return {
      note: noteLines.length > 0 ? noteLines.join("\n") : null,
      nextIndex: index
    };
  }
  function parseCue(lines, startIndex) {
    let index = startIndex;
    let cueId;
    const currentLine = lines[index]?.trim() || "";
    if (!currentLine.includes(TIMESTAMP_ARROW)) {
      cueId = currentLine;
      index++;
      if (index >= lines.length) {
        return {
          cue: null,
          error: "Unexpected end of file after cue ID",
          nextIndex: index
        };
      }
    }
    const timingLine = lines[index]?.trim() || "";
    const timingMatch = timingLine.match(PATTERNS.cueTiming);
    if (!timingMatch) {
      while (index < lines.length && lines[index].trim() !== "") {
        index++;
      }
      return {
        cue: null,
        error: `Invalid cue timing: "${timingLine}"`,
        nextIndex: index
      };
    }
    const [, startTimeStr, endTimeStr, settings] = timingMatch;
    const startTime = parseTimestamp(startTimeStr);
    const endTime = parseTimestamp(endTimeStr);
    if (!startTime || !endTime) {
      while (index < lines.length && lines[index].trim() !== "") {
        index++;
      }
      return {
        cue: null,
        error: `Invalid timestamps in: "${timingLine}"`,
        nextIndex: index
      };
    }
    if (compareTimestamps(startTime, endTime) >= 0) {
      log("warn", `Cue start time >= end time: ${startTimeStr} --> ${endTimeStr}`);
    }
    index++;
    const textLines = [];
    while (index < lines.length && lines[index].trim() !== "") {
      textLines.push(lines[index]);
      index++;
    }
    const text = textLines.join("\n");
    if (!text) {
      log("debug", "Empty cue text");
    }
    const cue = {
      startTime,
      endTime,
      text
    };
    if (cueId) {
      cue.id = cueId;
    }
    if (settings) {
      cue.settings = settings;
    }
    return { cue, nextIndex: index };
  }

  // src/utils/webvtt-generator.ts
  var LOG_PREFIX2 = "[WebVTT Generator]";
  var WEBVTT_SIGNATURE2 = "WEBVTT";
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
    let headerLine = WEBVTT_SIGNATURE2;
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
  function mergeVTTFiles(files) {
    if (files.length === 0) {
      return { cues: [] };
    }
    const merged = {
      header: files[0].header,
      cues: [],
      styles: [],
      regions: [],
      notes: []
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
    merged.cues.sort((a, b) => {
      const aMs = a.startTime.hours * 36e5 + a.startTime.minutes * 6e4 + a.startTime.seconds * 1e3 + a.startTime.milliseconds;
      const bMs = b.startTime.hours * 36e5 + b.startTime.minutes * 6e4 + b.startTime.seconds * 1e3 + b.startTime.milliseconds;
      return aMs - bMs;
    });
    if (merged.styles.length === 0) delete merged.styles;
    if (merged.regions.length === 0) delete merged.regions;
    if (merged.notes.length === 0) delete merged.notes;
    return merged;
  }

  // src/utils/cost-estimator.ts
  var DEFAULT_COST_PER_1K_TOKENS_USD = 5e-3;
  var MODEL_COST_PER_1K_TOKENS_USD = {
    // OpenAI GPT-5 series
    "gpt-5.2": 0.01,
    "gpt-5.1": 8e-3,
    "gpt-5-pro": 0.015,
    "gpt-5": 6e-3,
    // Gemini 3.x / 2.5 series
    "gemini-3-pro-preview": 5e-3,
    "gemini-3-flash-preview": 1e-3,
    "gemini-2.5-pro": 3e-3,
    "gemini-2.5-flash": 5e-4
  };
  function getCostPer1kTokensUSD(model) {
    return MODEL_COST_PER_1K_TOKENS_USD[model] ?? DEFAULT_COST_PER_1K_TOKENS_USD;
  }
  function calculateCost(model, tokenCount) {
    const pricePerK = getCostPer1kTokensUSD(model);
    return tokenCount / 1e3 * pricePerK;
  }

  // src/services/openai-client.ts
  var LOG_PREFIX3 = "[OpenAI Client]";
  var OPENAI_DEFAULT_BASE = "https://api.openai.com/v1";
  var DEFAULT_TIMEOUT = 6e4;
  var KEEPALIVE_INTERVAL = 25e3;
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
  var keepaliveTimer = null;
  function startKeepalive() {
    if (keepaliveTimer) return;
    keepaliveTimer = setInterval(() => {
      if (typeof chrome !== "undefined" && chrome.runtime?.getPlatformInfo) {
        chrome.runtime.getPlatformInfo(() => {
          log3("debug", "Keepalive ping");
        });
      }
    }, KEEPALIVE_INTERVAL);
    log3("debug", "Keepalive timer started");
  }
  function stopKeepalive() {
    if (keepaliveTimer) {
      clearInterval(keepaliveTimer);
      keepaliveTimer = null;
      log3("debug", "Keepalive timer stopped");
    }
  }
  async function chatCompletion(options) {
    const {
      apiKey,
      model,
      messages,
      baseUrl,
      maxTokens,
      timeout = DEFAULT_TIMEOUT,
      stream = true,
      signal
    } = options;
    const effectiveBaseUrl = baseUrl?.trim() || OPENAI_DEFAULT_BASE;
    if (!apiKey) {
      return { success: false, error: "API key is required", errorCode: "MISSING_API_KEY" };
    }
    if (!model) {
      return { success: false, error: "Model is required", errorCode: "MISSING_MODEL" };
    }
    if (!messages || messages.length === 0) {
      return { success: false, error: "Messages are required", errorCode: "MISSING_MESSAGES" };
    }
    const requestBody = {
      model,
      messages,
      stream,
      stream_options: stream ? { include_usage: true } : void 0
    };
    if (maxTokens) {
      requestBody.max_tokens = maxTokens;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    if (signal) {
      signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    startKeepalive();
    try {
      log3("info", `Calling OpenAI API with model: ${model}, baseUrl: ${effectiveBaseUrl}`);
      const response = await fetch(`${effectiveBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      if (!response.ok) {
        const errorBody = await response.text();
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        let errorCode = `HTTP_${response.status}`;
        try {
          const errorJson = JSON.parse(errorBody);
          if (errorJson.error?.message) {
            errorMessage = errorJson.error.message;
            errorCode = errorJson.error.code || errorCode;
          }
        } catch {
        }
        log3("error", "API error:", errorMessage);
        if (response.status === 401) {
          errorMessage = "Invalid API key. Please check your OpenAI API key.";
          errorCode = "INVALID_API_KEY";
        } else if (response.status === 429) {
          errorMessage = "Rate limit exceeded. Please try again later.";
          errorCode = "RATE_LIMIT";
        } else if (response.status === 500 || response.status === 503) {
          errorMessage = "OpenAI service is temporarily unavailable. Please try again.";
          errorCode = "SERVICE_UNAVAILABLE";
        }
        return { success: false, error: errorMessage, errorCode };
      }
      if (stream) {
        return await handleStreamingResponse(response, model);
      }
      const data = await response.json();
      return {
        success: true,
        content: data.choices?.[0]?.message?.content || "",
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
        model: data.model,
        finishReason: data.choices?.[0]?.finish_reason
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          log3("warn", "Request aborted or timed out");
          return { success: false, error: "Request timed out or was cancelled", errorCode: "TIMEOUT" };
        }
        log3("error", "Request failed:", error.message);
        return { success: false, error: error.message, errorCode: "NETWORK_ERROR" };
      }
      return { success: false, error: "Unknown error occurred", errorCode: "UNKNOWN_ERROR" };
    } finally {
      clearTimeout(timeoutId);
      stopKeepalive();
    }
  }
  async function handleStreamingResponse(response, requestModel) {
    const reader = response.body?.getReader();
    if (!reader) {
      return { success: false, error: "No response body", errorCode: "NO_RESPONSE_BODY" };
    }
    const decoder = new TextDecoder();
    let content = "";
    let promptTokens;
    let completionTokens;
    let totalTokens;
    let model = requestModel;
    let finishReason;
    try {
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") {
            continue;
          }
          if (trimmed.startsWith("data: ")) {
            const jsonStr = trimmed.slice(6);
            try {
              const chunk = JSON.parse(jsonStr);
              const delta = chunk.choices?.[0]?.delta?.content;
              if (delta) {
                content += delta;
              }
              const reason = chunk.choices?.[0]?.finish_reason;
              if (reason) {
                finishReason = reason;
              }
              if (chunk.usage) {
                promptTokens = chunk.usage.prompt_tokens;
                completionTokens = chunk.usage.completion_tokens;
                totalTokens = chunk.usage.total_tokens;
              }
              if (chunk.model) {
                model = chunk.model;
              }
            } catch (parseError) {
              log3("debug", "Failed to parse chunk:", jsonStr);
            }
          }
        }
      }
      log3("info", `Streaming complete. Received ${content.length} characters`);
      return {
        success: true,
        content,
        promptTokens,
        completionTokens,
        totalTokens,
        model,
        finishReason
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        log3("warn", "Streaming aborted or timed out");
        return { success: false, error: "Request timed out or was cancelled", errorCode: "TIMEOUT" };
      }
      const message = error instanceof Error ? error.message : String(error);
      const normalized = message.toLowerCase();
      if (normalized.includes("network error")) {
        log3("warn", "Streaming network error:", error);
        return {
          success: false,
          error: "Network error while streaming response (check VPN/firewall or blocking extensions)",
          errorCode: "NETWORK_ERROR"
        };
      }
      log3("warn", "Streaming error:", error);
      return {
        success: false,
        error: message || "Streaming failed",
        errorCode: "STREAMING_ERROR"
      };
    } finally {
      reader.releaseLock();
    }
  }
  function estimateTokens(text) {
    const cjkChars = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f]/g)?.length || 0;
    const otherChars = text.length - cjkChars;
    return Math.ceil(cjkChars * 1.5 + otherChars / 4);
  }

  // src/services/gemini-client.ts
  var LOG_PREFIX4 = "[Gemini Client]";
  var GEMINI_DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";
  var DEFAULT_TIMEOUT2 = 6e4;
  var KEEPALIVE_INTERVAL2 = 25e3;
  var LOG_LEVELS4 = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };
  var currentLogLevel4 = "info";
  function log4(level, ...args) {
    if (LOG_LEVELS4[level] >= LOG_LEVELS4[currentLogLevel4]) {
      const method = level === "error" ? "error" : level === "warn" ? "warn" : "log";
      console[method](LOG_PREFIX4, `[${level.toUpperCase()}]`, ...args);
    }
  }
  var keepaliveTimer2 = null;
  function startKeepalive2() {
    if (keepaliveTimer2) return;
    keepaliveTimer2 = setInterval(() => {
      if (typeof chrome !== "undefined" && chrome.runtime?.getPlatformInfo) {
        chrome.runtime.getPlatformInfo(() => {
          log4("debug", "Keepalive ping");
        });
      }
    }, KEEPALIVE_INTERVAL2);
    log4("debug", "Keepalive timer started");
  }
  function stopKeepalive2() {
    if (keepaliveTimer2) {
      clearInterval(keepaliveTimer2);
      keepaliveTimer2 = null;
      log4("debug", "Keepalive timer stopped");
    }
  }
  async function generateContent(options) {
    const {
      apiKey,
      model,
      baseUrl,
      systemInstruction,
      contents,
      maxOutputTokens,
      timeout = DEFAULT_TIMEOUT2,
      stream = true,
      signal
    } = options;
    const effectiveBaseUrl = baseUrl?.trim() || GEMINI_DEFAULT_BASE;
    if (!apiKey) {
      return { success: false, error: "API key is required", errorCode: "MISSING_API_KEY" };
    }
    if (!model) {
      return { success: false, error: "Model is required", errorCode: "MISSING_MODEL" };
    }
    if (!contents || contents.length === 0) {
      return { success: false, error: "Contents are required", errorCode: "MISSING_CONTENTS" };
    }
    const requestBody = {
      contents,
      ...maxOutputTokens && {
        generationConfig: { maxOutputTokens }
      }
    };
    if (systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    if (signal) {
      signal.addEventListener("abort", () => controller.abort());
    }
    startKeepalive2();
    const endpoint = stream ? "streamGenerateContent" : "generateContent";
    const url = `${effectiveBaseUrl}/models/${model}:${endpoint}?key=${apiKey}`;
    try {
      log4("info", `Calling Gemini API with model: ${model}, baseUrl: ${effectiveBaseUrl}`);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorBody = await response.text();
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        let errorCode = `HTTP_${response.status}`;
        try {
          const errorJson = JSON.parse(errorBody);
          if (errorJson.error?.message) {
            errorMessage = errorJson.error.message;
            errorCode = errorJson.error.status || errorCode;
          }
        } catch {
        }
        log4("error", "API error:", errorMessage);
        if (response.status === 400) {
          if (errorMessage.includes("API_KEY_INVALID") || errorMessage.includes("API key not valid")) {
            errorMessage = "Invalid API key. Please check your Gemini API key.";
            errorCode = "INVALID_API_KEY";
          }
        } else if (response.status === 429) {
          errorMessage = "Rate limit exceeded. Please try again later.";
          errorCode = "RATE_LIMIT";
        } else if (response.status === 500 || response.status === 503) {
          errorMessage = "Gemini service is temporarily unavailable. Please try again.";
          errorCode = "SERVICE_UNAVAILABLE";
        }
        return { success: false, error: errorMessage, errorCode };
      }
      if (stream) {
        return await handleStreamingResponse2(response, model);
      }
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return {
        success: true,
        content: text,
        promptTokens: data.usageMetadata?.promptTokenCount,
        completionTokens: data.usageMetadata?.candidatesTokenCount,
        totalTokens: data.usageMetadata?.totalTokenCount,
        model,
        finishReason: data.candidates?.[0]?.finishReason
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          log4("warn", "Request aborted or timed out");
          return { success: false, error: "Request timed out or was cancelled", errorCode: "TIMEOUT" };
        }
        log4("error", "Request failed:", error.message);
        return { success: false, error: error.message, errorCode: "NETWORK_ERROR" };
      }
      return { success: false, error: "Unknown error occurred", errorCode: "UNKNOWN_ERROR" };
    } finally {
      stopKeepalive2();
    }
  }
  async function handleStreamingResponse2(response, requestModel) {
    const reader = response.body?.getReader();
    if (!reader) {
      return { success: false, error: "No response body", errorCode: "NO_RESPONSE_BODY" };
    }
    const decoder = new TextDecoder();
    let content = "";
    let promptTokens;
    let completionTokens;
    let totalTokens;
    let finishReason;
    try {
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const extracted = extractJsonObjects(buffer);
        buffer = extracted.remaining;
        for (const jsonStr of extracted.objects) {
          try {
            const chunk = JSON.parse(jsonStr);
            const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              content += text;
            }
            const reason = chunk.candidates?.[0]?.finishReason;
            if (reason) {
              finishReason = reason;
            }
            if (chunk.usageMetadata) {
              promptTokens = chunk.usageMetadata.promptTokenCount;
              completionTokens = chunk.usageMetadata.candidatesTokenCount;
              totalTokens = chunk.usageMetadata.totalTokenCount;
            }
          } catch (parseError) {
            log4("debug", "Failed to parse chunk:", jsonStr);
          }
        }
      }
      log4("info", `Streaming complete. Received ${content.length} characters`);
      return {
        success: true,
        content,
        promptTokens,
        completionTokens,
        totalTokens,
        model: requestModel,
        finishReason
      };
    } catch (error) {
      log4("error", "Streaming error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Streaming failed",
        errorCode: "STREAMING_ERROR"
      };
    } finally {
      reader.releaseLock();
    }
  }
  function extractJsonObjects(buffer) {
    const objects = [];
    let remaining = buffer;
    const lines = remaining.split("\n");
    remaining = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "[" || trimmed === "]" || trimmed === ",") {
        continue;
      }
      let jsonStr = trimmed;
      if (jsonStr.startsWith(",")) {
        jsonStr = jsonStr.substring(1);
      }
      if (jsonStr.startsWith("[")) {
        jsonStr = jsonStr.substring(1);
      }
      if (jsonStr.endsWith(",")) {
        jsonStr = jsonStr.slice(0, -1);
      }
      if (jsonStr.endsWith("]")) {
        jsonStr = jsonStr.slice(0, -1);
      }
      jsonStr = jsonStr.trim();
      if (jsonStr && jsonStr.startsWith("{") && jsonStr.endsWith("}")) {
        objects.push(jsonStr);
      }
    }
    return { objects, remaining };
  }
  function estimateTokens2(text) {
    const cjkChars = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f]/g)?.length || 0;
    const otherChars = text.length - cjkChars;
    return Math.ceil(cjkChars * 1.5 + otherChars / 4);
  }
  function convertFromOpenAIFormat(messages) {
    let systemInstruction;
    const contents = [];
    for (const msg of messages) {
      if (msg.role === "system") {
        systemInstruction = msg.content;
      } else {
        const role = msg.role === "assistant" ? "model" : "user";
        contents.push({
          role,
          parts: [{ text: msg.content }]
        });
      }
    }
    return { systemInstruction, contents };
  }

  // src/services/translator.ts
  var LOG_PREFIX5 = "[Translator]";
  var DEFAULT_TIMEOUT3 = 12e4;
  var DEFAULT_MAX_RETRIES = 2;
  var DEFAULT_MAX_BATCH_DURATION_MS = 10 * 60 * 1e3;
  var LOG_LEVELS5 = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };
  var currentLogLevel5 = "info";
  function log5(level, ...args) {
    if (LOG_LEVELS5[level] >= LOG_LEVELS5[currentLogLevel5]) {
      const method = level === "error" ? "error" : level === "warn" ? "warn" : "log";
      console[method](LOG_PREFIX5, `[${level.toUpperCase()}]`, ...args);
    }
  }
  function buildSystemPrompt(courseContext) {
    let prompt = `You are an expert subtitle translator. You will receive a WebVTT subtitle file.
Translate all subtitle text from English to Chinese (\u7B80\u4F53\u4E2D\u6587).

CRITICAL RULES - YOU MUST FOLLOW THESE EXACTLY:
1. Output a COMPLETE, VALID WebVTT file
2. Start your output with "WEBVTT" header
3. Keep ALL timestamps EXACTLY as they are - do not modify any timestamp
4. Translate ONLY the text content between timestamps
5. Preserve cue IDs if present (the line before timestamps)
6. Preserve all cue settings (text after the --> timestamp)
7. Do NOT add any explanations, notes, or markdown formatting
8. Do NOT wrap the output in code blocks
9. Keep the same number of cues as the input

For technical terms commonly kept in English (API, HTTP, JavaScript, React, etc.), keep them as-is.
Use natural, fluent Chinese expressions - avoid word-for-word translation.`;
    if (courseContext) {
      const contextParts = [];
      if (courseContext.courseName) {
        contextParts.push(`Course: "${courseContext.courseName}"`);
      }
      if (courseContext.sectionName) {
        contextParts.push(`Section: "${courseContext.sectionName}"`);
      }
      if (courseContext.lectureName) {
        contextParts.push(`Lecture: "${courseContext.lectureName}"`);
      }
      if (courseContext.subject) {
        contextParts.push(`Subject: ${courseContext.subject}`);
      }
      if (contextParts.length > 0) {
        prompt += `

CONTEXT (use this to improve terminology translation):
${contextParts.join("\n")}`;
      }
    }
    return prompt;
  }
  function buildUserPrompt(vttContent) {
    return `Translate this WebVTT file to Chinese (\u7B80\u4F53\u4E2D\u6587). Output ONLY the translated WebVTT file, nothing else:

${vttContent}`;
  }
  function splitVTTByDuration(vttFile, maxDurationMs) {
    if (vttFile.cues.length === 0) {
      return [vttFile];
    }
    const batches = [];
    let currentBatchCues = [];
    let batchStartTime = timestampToMs(vttFile.cues[0].startTime);
    for (const cue of vttFile.cues) {
      const cueEndMs = timestampToMs(cue.endTime);
      if (currentBatchCues.length > 0 && cueEndMs - batchStartTime > maxDurationMs) {
        batches.push({
          header: vttFile.header,
          cues: currentBatchCues
          // Don't include styles/regions/notes in intermediate batches
        });
        currentBatchCues = [];
        batchStartTime = timestampToMs(cue.startTime);
      }
      currentBatchCues.push(cue);
    }
    if (currentBatchCues.length > 0) {
      batches.push({
        header: vttFile.header,
        cues: currentBatchCues,
        styles: vttFile.styles,
        regions: vttFile.regions,
        notes: vttFile.notes
      });
    }
    return batches;
  }
  function getVTTDurationSpan(vttFile) {
    if (vttFile.cues.length === 0) {
      return { startMs: 0, endMs: 0, durationMs: 0 };
    }
    const startMs = timestampToMs(vttFile.cues[0].startTime);
    const endMs = timestampToMs(vttFile.cues[vttFile.cues.length - 1].endTime);
    return {
      startMs,
      endMs,
      durationMs: endMs - startMs
    };
  }
  function parseTranslatedVTTResponse(response) {
    let cleanedResponse = response.trim();
    if (cleanedResponse.startsWith("```")) {
      cleanedResponse = cleanedResponse.replace(/^```(?:vtt|webvtt)?\s*\n?/i, "").replace(/\n?```\s*$/, "");
    }
    if (!cleanedResponse.startsWith("WEBVTT")) {
      const webvttIndex = cleanedResponse.indexOf("WEBVTT");
      if (webvttIndex !== -1) {
        cleanedResponse = cleanedResponse.substring(webvttIndex);
      } else {
        return {
          success: false,
          error: "Response does not contain valid WEBVTT header"
        };
      }
    }
    const parseResult = parseVTT(cleanedResponse);
    if (!parseResult.success || !parseResult.data) {
      return {
        success: false,
        error: parseResult.error || "Failed to parse VTT response"
      };
    }
    return {
      success: true,
      vttFile: parseResult.data
    };
  }
  function validateTranslatedVTT(original, translated) {
    const errors = [];
    if (original.cues.length !== translated.cues.length) {
      errors.push(`Cue count mismatch: expected ${original.cues.length}, got ${translated.cues.length}`);
    }
    const checkCount = Math.min(original.cues.length, translated.cues.length);
    for (let i = 0; i < checkCount; i++) {
      const origCue = original.cues[i];
      const transCue = translated.cues[i];
      const origStartMs = timestampToMs(origCue.startTime);
      const origEndMs = timestampToMs(origCue.endTime);
      const transStartMs = timestampToMs(transCue.startTime);
      const transEndMs = timestampToMs(transCue.endTime);
      if (origStartMs !== transStartMs || origEndMs !== transEndMs) {
        errors.push(`Timestamp mismatch at cue ${i + 1}: expected ${origStartMs}-${origEndMs}, got ${transStartMs}-${transEndMs}`);
        if (errors.length >= 5) {
          errors.push("(more timestamp errors omitted)");
          break;
        }
      }
    }
    return {
      valid: errors.length === 0,
      errors
    };
  }
  async function translateVTT(vttContent, options) {
    const startTime = Date.now();
    const {
      provider,
      apiKey,
      model,
      baseUrl,
      courseContext,
      timeout = DEFAULT_TIMEOUT3,
      maxRetries = DEFAULT_MAX_RETRIES,
      maxBatchDurationMs = DEFAULT_MAX_BATCH_DURATION_MS,
      signal,
      onProgress
    } = options;
    const reportProgress = (progress) => {
      if (!onProgress) return;
      try {
        onProgress(progress);
      } catch (e) {
        log5("warn", "onProgress callback error:", e);
      }
    };
    const parseResult = parseVTT(vttContent);
    if (!parseResult.success || !parseResult.data) {
      return {
        success: false,
        error: parseResult.error || "Failed to parse VTT content",
        errorCode: "PARSE_ERROR"
      };
    }
    const vttFile = parseResult.data;
    const cueCount = vttFile.cues.length;
    if (cueCount === 0) {
      return {
        success: false,
        error: "No subtitle cues found in VTT content",
        errorCode: "EMPTY_CONTENT"
      };
    }
    const batches = splitVTTByDuration(vttFile, maxBatchDurationMs);
    const batchCount = batches.length;
    log5("info", `Translating ${cueCount} cues in ${batchCount} batch(es) using ${provider}/${model}`);
    reportProgress(0);
    const translatedBatches = [];
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    const systemPrompt = buildSystemPrompt(courseContext);
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      if (signal?.aborted) {
        return {
          success: false,
          error: "Translation cancelled",
          errorCode: "CANCELLED"
        };
      }
      const batch = batches[batchIndex];
      const batchVttContent = generateVTT(batch);
      const duration = getVTTDurationSpan(batch);
      log5("info", `Processing batch ${batchIndex + 1}/${batchCount} (${batch.cues.length} cues, ${Math.round(duration.durationMs / 1e3)}s)`);
      const result = await translateBatchWithRetry(
        batch,
        batchVttContent,
        systemPrompt,
        provider,
        apiKey,
        model,
        timeout,
        maxRetries,
        signal,
        baseUrl
      );
      if (!result.success || !result.vttFile) {
        return {
          success: false,
          error: result.error || `Batch ${batchIndex + 1} translation failed`,
          errorCode: result.errorCode || "BATCH_FAILED",
          durationMs: Date.now() - startTime
        };
      }
      translatedBatches.push(result.vttFile);
      totalPromptTokens += result.promptTokens || 0;
      totalCompletionTokens += result.completionTokens || 0;
      const progress = Math.round((batchIndex + 1) / batchCount * 100);
      reportProgress(progress);
    }
    const mergedVTT = mergeVTTFiles(translatedBatches);
    const translatedVTTContent = generateVTT(mergedVTT);
    const tokensUsed = totalPromptTokens + totalCompletionTokens;
    const cost = calculateCost(model, tokensUsed);
    const durationMs = Date.now() - startTime;
    log5("info", `Translation complete in ${durationMs}ms, ${tokensUsed} tokens, $${cost.toFixed(6)}`);
    reportProgress(100);
    return {
      success: true,
      translatedVTT: translatedVTTContent,
      translatedVTTFile: mergedVTT,
      tokensUsed,
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      estimatedCost: cost,
      model,
      cueCount,
      batchCount,
      durationMs
    };
  }
  async function translateBatchWithRetry(originalBatch, batchVttContent, systemPrompt, provider, apiKey, model, timeout, maxRetries, signal, baseUrl) {
    const userPrompt = buildUserPrompt(batchVttContent);
    let lastError;
    let lastErrorCode;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        log5("info", `Retry attempt ${attempt}/${maxRetries}`);
        await new Promise((resolve) => setTimeout(resolve, 1e3 * Math.pow(2, attempt - 1)));
      }
      if (signal?.aborted) {
        return { success: false, error: "Translation cancelled", errorCode: "CANCELLED" };
      }
      const response = await callLLM(
        provider,
        apiKey,
        model,
        systemPrompt,
        userPrompt,
        timeout,
        signal,
        baseUrl
      );
      if (!response.success || !response.content) {
        lastError = response.error;
        lastErrorCode = response.errorCode;
        if (response.errorCode === "INVALID_API_KEY" || response.errorCode === "MISSING_API_KEY") {
          break;
        }
        continue;
      }
      const parseResult = parseTranslatedVTTResponse(response.content);
      if (!parseResult.success || !parseResult.vttFile) {
        lastError = parseResult.error || "Failed to parse LLM response as VTT";
        lastErrorCode = "PARSE_RESPONSE_ERROR";
        log5("warn", `Parse error: ${lastError}`);
        continue;
      }
      const validation = validateTranslatedVTT(originalBatch, parseResult.vttFile);
      if (!validation.valid) {
        lastError = `Validation failed: ${validation.errors.join("; ")}`;
        lastErrorCode = "VALIDATION_ERROR";
        log5("warn", `Validation error: ${lastError}`);
        continue;
      }
      return {
        success: true,
        vttFile: parseResult.vttFile,
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens
      };
    }
    return {
      success: false,
      error: lastError || "Translation failed after retries",
      errorCode: lastErrorCode || "TRANSLATION_FAILED"
    };
  }
  async function callLLM(provider, apiKey, model, systemPrompt, userPrompt, timeout, signal, baseUrl) {
    if (provider === "openai") {
      return chatCompletion({
        apiKey,
        model,
        baseUrl,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        timeout,
        signal
      });
    } else {
      const { systemInstruction, contents } = convertFromOpenAIFormat([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]);
      return generateContent({
        apiKey,
        model,
        baseUrl,
        systemInstruction,
        contents,
        timeout,
        signal
      });
    }
  }
  function estimateTokens3(provider, text) {
    if (provider === "openai") {
      return estimateTokens(text);
    } else {
      return estimateTokens2(text);
    }
  }
  function estimateTranslationCost(vttContent, provider, model) {
    const parseResult = parseVTT(vttContent);
    if (!parseResult.success || !parseResult.data) {
      return {
        cueCount: 0,
        estimatedPromptTokens: 0,
        estimatedOutputTokens: 0,
        estimatedTotalTokens: 0,
        estimatedCost: 0,
        estimatedBatches: 0
      };
    }
    const cueCount = parseResult.data.cues.length;
    const batches = splitVTTByDuration(parseResult.data, DEFAULT_MAX_BATCH_DURATION_MS);
    const systemPrompt = buildSystemPrompt();
    let totalPromptTokens = 0;
    for (const batch of batches) {
      const batchVtt = generateVTT(batch);
      const userPrompt = buildUserPrompt(batchVtt);
      totalPromptTokens += estimateTokens3(provider, systemPrompt + userPrompt);
    }
    const estimatedOutputTokens = Math.ceil(totalPromptTokens * 1.2);
    const estimatedTotalTokens = totalPromptTokens + estimatedOutputTokens;
    const estimatedCost = calculateCost(model, estimatedTotalTokens);
    return {
      cueCount,
      estimatedPromptTokens: totalPromptTokens,
      estimatedOutputTokens,
      estimatedTotalTokens,
      estimatedCost,
      estimatedBatches: batches.length
    };
  }
  var Translator = class {
    constructor(options = {}) {
      this.options = options;
    }
    /**
     * Configure the translator
     */
    configure(options) {
      this.options = { ...this.options, ...options };
    }
    /**
     * Translate VTT content
     */
    async translate(vttContent, overrideOptions) {
      const mergedOptions = { ...this.options, ...overrideOptions };
      if (!mergedOptions.provider) {
        return { success: false, error: "Provider is required", errorCode: "MISSING_PROVIDER" };
      }
      if (!mergedOptions.apiKey) {
        return { success: false, error: "API key is required", errorCode: "MISSING_API_KEY" };
      }
      if (!mergedOptions.model) {
        return { success: false, error: "Model is required", errorCode: "MISSING_MODEL" };
      }
      return translateVTT(vttContent, mergedOptions);
    }
    /**
     * Estimate cost for translation
     */
    estimateCost(vttContent) {
      const provider = this.options.provider || "openai";
      const model = this.options.model || "gpt-5.1";
      return estimateTranslationCost(vttContent, provider, model);
    }
    /**
     * Set course context
     */
    setCourseContext(context) {
      this.options.courseContext = context;
    }
  };
  var translator = new Translator();

  // src/services/preloader.ts
  var LOG_PREFIX6 = "[UdemyCaptionPlus][Preloader]";
  var LANGUAGE_PRIORITY = ["en", "en-US", "en-GB", "en-AU"];
  function log6(...args) {
    console.log(LOG_PREFIX6, ...args);
  }
  function warn(...args) {
    console.warn(LOG_PREFIX6, ...args);
  }
  function isAbortError(error) {
    return error instanceof DOMException && error.name === "AbortError";
  }
  function isNumericId(value) {
    return /^\d+$/.test(value);
  }
  function normalizeLocale(locale) {
    const normalized = locale.trim().replace(/_/g, "-");
    const [language, region, ...rest] = normalized.split("-").filter(Boolean);
    if (!language) return normalized;
    if (!region) return language.toLowerCase();
    const suffix = rest.length > 0 ? `-${rest.join("-")}` : "";
    return `${language.toLowerCase()}-${region.toUpperCase()}${suffix}`;
  }
  function inferLanguageFromUrl(url) {
    const match = url.match(/[_-]([a-z]{2}(?:-[A-Z]{2})?)[_.]/) || url.match(/lang[=_]([a-z]{2}(?:-[A-Z]{2})?)/i) || url.match(/locale[=_]([a-z]{2}(?:[_-][A-Z]{2})?)/i);
    if (!match?.[1]) return "en";
    return normalizeLocale(match[1]);
  }
  function asAbsoluteUrl(url) {
    try {
      return new URL(url).toString();
    } catch {
      return new URL(url, "https://www.udemy.com").toString();
    }
  }
  function dedupeTracks(tracks) {
    const seen = /* @__PURE__ */ new Set();
    const result = [];
    for (const track of tracks) {
      if (!track.url) continue;
      const url = asAbsoluteUrl(track.url);
      if (seen.has(url)) continue;
      seen.add(url);
      result.push({ ...track, url });
    }
    return result;
  }
  function pickPreferredTrack(tracks) {
    if (tracks.length === 0) return null;
    for (const lang of LANGUAGE_PRIORITY) {
      const hit = tracks.find((t) => t.language.toLowerCase() === lang.toLowerCase());
      if (hit) return hit;
    }
    const english = tracks.find((t) => t.language.toLowerCase().startsWith("en"));
    if (english) return english;
    return tracks[0] || null;
  }
  function toStringIfPresent(value) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return null;
  }
  function extractTracksFromCaptionArray(captions) {
    const tracks = [];
    for (const item of captions) {
      if (!item || typeof item !== "object") continue;
      const obj = item;
      const url = toStringIfPresent(obj.url) || toStringIfPresent(obj.download_url) || toStringIfPresent(obj.downloadUrl) || toStringIfPresent(obj.vtt_url) || toStringIfPresent(obj.vttUrl) || toStringIfPresent(obj.file) || null;
      if (!url || !url.includes(".vtt")) continue;
      const languageRaw = toStringIfPresent(obj.language) || toStringIfPresent(obj.locale) || toStringIfPresent(obj.srclang) || toStringIfPresent(obj.language_code) || toStringIfPresent(obj.lang) || null;
      const language = languageRaw ? normalizeLocale(languageRaw) : inferLanguageFromUrl(url);
      const label = toStringIfPresent(obj.label) || language;
      tracks.push({ url, language, label });
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
        if (typeof value === "string" && value.includes(".vtt")) {
          const languageRaw = toStringIfPresent(obj.language) || toStringIfPresent(obj.locale) || toStringIfPresent(obj.srclang) || toStringIfPresent(obj.language_code) || toStringIfPresent(obj.lang) || null;
          const language = languageRaw ? normalizeLocale(languageRaw) : inferLanguageFromUrl(value);
          tracks.push({ url: value, language, label: language });
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
  async function fetchJson(url, signal) {
    const response = await fetch(url, { credentials: "include", signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response.json();
  }
  async function resolveNumericCourseId(courseId, signal) {
    if (isNumericId(courseId)) return courseId;
    try {
      const url = `https://www.udemy.com/api-2.0/courses/${encodeURIComponent(courseId)}/?fields[course]=id`;
      const data = await fetchJson(url, signal);
      const id = toStringIfPresent(data?.id);
      if (id && isNumericId(id)) return id;
    } catch {
    }
    return null;
  }
  async function fetchLectureCaptionTracks(courseId, lectureId, signal) {
    const numericCourseId = await resolveNumericCourseId(courseId, signal);
    const attempts = [];
    if (numericCourseId) {
      attempts.push(async () => {
        const url = `https://www.udemy.com/api-2.0/users/me/subscribed-courses/${numericCourseId}/lectures/${lectureId}/?fields[lecture]=title,asset&fields[asset]=captions`;
        const data = await fetchJson(url, signal);
        const tracks = extractCaptionTracks(data);
        return { lectureTitle: typeof data?.title === "string" ? data.title : void 0, tracks };
      });
    }
    attempts.push(async () => {
      const url = `https://www.udemy.com/api-2.0/lectures/${lectureId}/?fields[lecture]=title,asset&fields[asset]=captions`;
      const data = await fetchJson(url, signal);
      const tracks = extractCaptionTracks(data);
      return { lectureTitle: typeof data?.title === "string" ? data.title : void 0, tracks };
    });
    attempts.push(async () => {
      const url = `https://www.udemy.com/api-2.0/lectures/${lectureId}/captions/`;
      const data = await fetchJson(url, signal);
      const tracks = extractCaptionTracks(data);
      return { lectureTitle: void 0, tracks };
    });
    if (numericCourseId) {
      attempts.push(async () => {
        const url = `https://www.udemy.com/api-2.0/courses/${numericCourseId}/subscriber-curriculum-items/?page_size=1400&fields[lecture]=title,asset&fields[asset]=captions&caching_intent=True`;
        const data = await fetchJson(url, signal);
        const results = Array.isArray(data?.results) ? data.results : [];
        const lecture = results.find((item) => item && item._class === "lecture" && String(item.id) === lectureId);
        const tracks = extractCaptionTracks(lecture);
        return { lectureTitle: typeof lecture?.title === "string" ? lecture.title : void 0, tracks };
      });
    }
    let lastError = null;
    for (const attempt of attempts) {
      try {
        const result = await attempt();
        if (result.tracks.length > 0) return result;
        lastError = new Error("No caption tracks found");
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
  async function fetchVtt(url, signal) {
    const resolved = asAbsoluteUrl(url);
    const response = await fetch(resolved, { credentials: "include", signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch VTT (${response.status})`);
    }
    return response.text();
  }
  async function preloadLecture(request) {
    const { courseId, lectureId, signal } = request;
    try {
      const settings = await loadSettings();
      if (!isEnabled(settings) || !settings.preloadEnabled) {
        return { ok: true, status: "disabled", courseId, lectureId };
      }
      const { lectureTitle, tracks } = await fetchLectureCaptionTracks(courseId, lectureId, signal);
      const selected = pickPreferredTrack(tracks);
      if (!selected) {
        return {
          ok: false,
          status: "error",
          courseId,
          lectureId,
          error: "No subtitle tracks available for preload"
        };
      }
      const originalVtt = await fetchVtt(selected.url, signal);
      if (!originalVtt.trim().startsWith("WEBVTT")) {
        return {
          ok: false,
          status: "error",
          courseId,
          lectureId,
          error: "Fetched subtitle is not a valid WebVTT file"
        };
      }
      const version = await checkSubtitleVersion({
        courseId,
        lectureId,
        originalVtt,
        force: false
      });
      if (version.decision === "use_cache") {
        log6("Cache valid, skip preload:", `${courseId}-${lectureId}`);
        return {
          ok: true,
          status: "cached",
          courseId,
          lectureId,
          originalHash: version.originalHash
        };
      }
      log6("Preloading translation:", `${courseId}-${lectureId}`);
      const baseUrl = settings.provider === "openai" ? settings.openaiBaseUrl : settings.geminiBaseUrl;
      const result = await translateVTT(originalVtt, {
        provider: settings.provider,
        apiKey: settings.apiKey,
        model: settings.model,
        baseUrl: baseUrl || void 0,
        courseContext: {
          courseName: request.courseName,
          sectionName: request.sectionName,
          lectureName: request.lectureName || lectureTitle
        },
        signal
      });
      const actualTokens = typeof result.tokensUsed === "number" ? result.tokensUsed : 0;
      const actualCostUsd = typeof result.estimatedCost === "number" ? result.estimatedCost : 0;
      const now = Date.now();
      const taskId = `preload-${courseId}-${lectureId}-${now}`;
      if (!result.success || !result.translatedVTT) {
        if (actualTokens > 0 || actualCostUsd > 0) {
          await addSessionCost(actualTokens, actualCostUsd);
          await updateSessionCostState({
            lastActual: {
              taskId,
              provider: settings.provider,
              model: settings.model,
              tokensUsed: actualTokens,
              costUsd: actualCostUsd,
              createdAt: now
            }
          });
        }
        return {
          ok: false,
          status: "error",
          courseId,
          lectureId,
          originalHash: version.originalHash,
          provider: settings.provider,
          model: settings.model,
          error: result.error || "Translation failed"
        };
      }
      if (actualTokens > 0 || actualCostUsd > 0) {
        await addSessionCost(actualTokens, actualCostUsd);
        await updateSessionCostState({
          lastActual: {
            taskId,
            provider: settings.provider,
            model: settings.model,
            tokensUsed: actualTokens,
            costUsd: actualCostUsd,
            createdAt: now
          }
        });
      }
      await subtitleCache.set({
        courseId,
        lectureId,
        courseName: request.courseName || "",
        lectureName: request.lectureName || lectureTitle || lectureId,
        originalHash: version.originalHash,
        translatedVTT: result.translatedVTT,
        provider: settings.provider,
        model: settings.model,
        tokensUsed: actualTokens,
        estimatedCost: actualCostUsd
      });
      return {
        ok: true,
        status: "translated",
        courseId,
        lectureId,
        originalHash: version.originalHash,
        provider: settings.provider,
        model: settings.model
      };
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) {
        warn("Preload aborted:", `${courseId}-${lectureId}`);
        return { ok: true, status: "aborted", courseId, lectureId };
      }
      warn("Preload failed:", error);
      return { ok: false, status: "error", courseId, lectureId, error: String(error) };
    }
  }

  // src/background/service-worker.ts
  var activeControllers = /* @__PURE__ */ new Map();
  var activePreloadByTab = /* @__PURE__ */ new Map();
  function sendToTab(tabId, message) {
    if (typeof chrome === "undefined" || !chrome.tabs?.sendMessage) return;
    chrome.tabs.sendMessage(tabId, message).catch(() => {
    });
  }
  function sendToPopup(message) {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return;
    chrome.runtime.sendMessage({ ...message, meta: { ...message.meta || {}, target: "popup" } }).catch(() => {
    });
  }
  function sendProgress(tabId, taskId, progress) {
    const payload = { taskId, progress };
    sendToTab(tabId, { type: "TRANSLATION_PROGRESS", payload, meta: { target: "content" } });
    sendToPopup({ type: "TRANSLATION_PROGRESS", payload });
  }
  function sendCostEstimate(tabId, payload) {
    sendToTab(tabId, { type: "COST_ESTIMATE", payload, meta: { target: "content" } });
    sendToPopup({ type: "COST_ESTIMATE", payload });
  }
  function sendComplete(tabId, payload) {
    sendToTab(tabId, { type: "TRANSLATION_COMPLETE", payload, meta: { target: "content" } });
    sendToPopup({ type: "TRANSLATION_COMPLETE", payload });
  }
  async function handleTranslateSubtitle(sender, payload) {
    const tabId = sender.tab?.id;
    if (!tabId) {
      return;
    }
    const taskId = payload?.taskId || `translate-${Date.now()}`;
    const vttContent = payload?.vttContent;
    const courseId = payload?.courseId;
    const lectureId = payload?.lectureId;
    const force = payload?.force === true;
    if (!vttContent || !courseId || !lectureId) {
      sendComplete(tabId, { taskId, success: false, error: "Missing required fields" });
      return;
    }
    const settings = await loadSettings();
    if (!isEnabled(settings)) {
      sendComplete(tabId, { taskId, success: false, error: "Translation is disabled or not configured" });
      return;
    }
    const provider = payload?.provider || settings.provider;
    const model = payload?.model || settings.model;
    const apiKey = settings.apiKey;
    const originalHash = payload?.originalHash || await calculateHash(vttContent);
    const version = await checkSubtitleVersion({
      courseId,
      lectureId,
      originalHash,
      force
    });
    if (version.decision === "use_cache" && version.cachedEntry?.translatedVTT) {
      sendToTab(tabId, {
        type: "CACHE_HIT",
        payload: { taskId, translatedVTT: version.cachedEntry.translatedVTT },
        meta: { target: "content" }
      });
      sendToPopup({
        type: "CACHE_HIT",
        payload: {
          taskId,
          provider: version.cachedEntry.provider,
          model: version.cachedEntry.model,
          tokensUsed: version.cachedEntry.tokensUsed,
          costUsd: version.cachedEntry.estimatedCost,
          fromCache: true
        }
      });
      return;
    }
    const existing = activeControllers.get(taskId);
    if (existing) {
      existing.abort();
      activeControllers.delete(taskId);
    }
    const controller = new AbortController();
    activeControllers.set(taskId, controller);
    if (settings.showCostEstimate) {
      const estimate = estimateTranslationCost(vttContent, provider, model);
      const estimatePayload = {
        taskId,
        provider,
        model,
        cueCount: estimate.cueCount,
        estimatedPromptTokens: estimate.estimatedPromptTokens,
        estimatedOutputTokens: estimate.estimatedOutputTokens,
        estimatedTotalTokens: estimate.estimatedTotalTokens,
        estimatedCostUsd: estimate.estimatedCost,
        estimatedBatches: estimate.estimatedBatches
      };
      sendCostEstimate(tabId, estimatePayload);
      await updateSessionCostState({
        lastEstimate: {
          taskId,
          provider,
          model,
          cueCount: estimate.cueCount,
          estimatedTotalTokens: estimate.estimatedTotalTokens,
          estimatedCostUsd: estimate.estimatedCost,
          createdAt: Date.now()
        }
      });
    }
    sendProgress(tabId, taskId, 0);
    const baseUrl = provider === "openai" ? settings.openaiBaseUrl : settings.geminiBaseUrl;
    const result = await translateVTT(vttContent, {
      provider,
      apiKey,
      model,
      baseUrl: baseUrl || void 0,
      courseContext: {
        courseName: payload?.courseName,
        sectionName: payload?.sectionName,
        lectureName: payload?.lectureName
      },
      signal: controller.signal,
      onProgress: (progress) => sendProgress(tabId, taskId, progress)
    });
    activeControllers.delete(taskId);
    const actualTokens = typeof result.tokensUsed === "number" ? result.tokensUsed : 0;
    const actualCostUsd = typeof result.estimatedCost === "number" ? result.estimatedCost : 0;
    if (result.success && result.translatedVTT) {
      const sessionState = await addSessionCost(actualTokens, actualCostUsd);
      await updateSessionCostState({
        lastActual: {
          taskId,
          provider,
          model,
          tokensUsed: actualTokens,
          costUsd: actualCostUsd,
          createdAt: Date.now()
        }
      });
      await subtitleCache.set({
        courseId,
        lectureId,
        courseName: payload?.courseName || "",
        lectureName: payload?.lectureName || payload?.lectureId || "",
        originalHash,
        translatedVTT: result.translatedVTT,
        provider,
        model,
        tokensUsed: actualTokens,
        estimatedCost: actualCostUsd
      });
      sendComplete(tabId, {
        taskId,
        success: true,
        translatedVTT: result.translatedVTT,
        provider,
        model,
        tokensUsed: actualTokens,
        estimatedCost: actualCostUsd,
        sessionTotalTokens: sessionState.totals.totalTokens,
        sessionTotalCostUsd: sessionState.totals.totalCostUsd
      });
      return;
    }
    if (actualTokens > 0 || actualCostUsd > 0) {
      const sessionState = await addSessionCost(actualTokens, actualCostUsd);
      await updateSessionCostState({
        lastActual: {
          taskId,
          provider,
          model,
          tokensUsed: actualTokens,
          costUsd: actualCostUsd,
          createdAt: Date.now()
        }
      });
      sendComplete(tabId, {
        taskId,
        success: false,
        error: result.error || "Translation failed",
        provider,
        model,
        tokensUsed: actualTokens,
        estimatedCost: actualCostUsd,
        sessionTotalTokens: sessionState.totals.totalTokens,
        sessionTotalCostUsd: sessionState.totals.totalCostUsd
      });
      return;
    }
    sendComplete(tabId, {
      taskId,
      success: false,
      error: result.error || "Translation failed",
      tokensUsed: 0,
      estimatedCost: 0
    });
  }
  function handleCancel(taskId) {
    if (!taskId) return;
    const controller = activeControllers.get(taskId);
    if (!controller) return;
    controller.abort();
    activeControllers.delete(taskId);
  }
  var VTT_FETCH_TIMEOUT = 1e4;
  function handleFetchVTT(payload, sendResponse) {
    const url = payload?.url;
    if (!url) {
      sendResponse({ ok: false, error: "No URL provided" });
      return;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), VTT_FETCH_TIMEOUT);
    fetch(url, {
      method: "GET",
      credentials: "include",
      signal: controller.signal
    }).then((response) => {
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.text();
    }).then((content) => {
      sendResponse({ ok: true, content });
    }).catch((e) => {
      clearTimeout(timeoutId);
      const error = e instanceof Error ? e.message : "Unknown error";
      if (error.includes("aborted")) {
        sendResponse({ ok: false, error: "Request timeout" });
        return;
      }
      sendResponse({ ok: false, error });
    });
  }
  async function handlePreloadNext(sender, payload) {
    const tabId = sender.tab?.id;
    if (!tabId) return;
    const courseId = payload?.courseId;
    const nextLectureId = payload?.nextLectureId;
    if (!courseId || !nextLectureId) return;
    const settings = await loadSettings();
    if (!isEnabled(settings) || !settings.preloadEnabled) return;
    const existing = activePreloadByTab.get(tabId);
    if (existing && existing.courseId === courseId && existing.lectureId === nextLectureId) {
      return;
    }
    if (existing) {
      existing.controller.abort();
      activePreloadByTab.delete(tabId);
    }
    const controller = new AbortController();
    activePreloadByTab.set(tabId, { controller, courseId, lectureId: nextLectureId });
    try {
      await preloadLecture({
        courseId,
        lectureId: nextLectureId,
        courseName: payload?.courseName,
        sectionName: payload?.sectionName,
        lectureName: payload?.nextLectureTitle,
        signal: controller.signal
      });
    } finally {
      const current = activePreloadByTab.get(tabId);
      if (current?.controller === controller) {
        activePreloadByTab.delete(tabId);
      }
    }
  }
  function initMessageHandler() {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || typeof message !== "object" || typeof message.type !== "string") return;
      if (message.meta?.target === "popup") return;
      if (message.type === "TRANSLATE_SUBTITLE") {
        handleTranslateSubtitle(sender, message.payload).then(() => sendResponse?.({ ok: true })).catch((error) => sendResponse?.({ ok: false, error: String(error) }));
        return true;
      }
      if (message.type === "GET_SETTINGS") {
        loadSettings().then((settings) => sendResponse?.({ ok: true, settings })).catch((error) => sendResponse?.({ ok: false, error: String(error) }));
        return true;
      }
      if (message.type === "PRELOAD_NEXT") {
        handlePreloadNext(sender, message.payload).then(() => sendResponse?.({ ok: true })).catch((error) => sendResponse?.({ ok: false, error: String(error) }));
        return true;
      }
      if (message.type === "CANCEL_TRANSLATION") {
        handleCancel(message.payload?.taskId);
        sendResponse?.({ ok: true });
        return;
      }
      if (message.type === "FETCH_VTT") {
        handleFetchVTT(message.payload, sendResponse);
        return true;
      }
      return;
    });
  }
  initMessageHandler();
})();
//# sourceMappingURL=service-worker.js.map
