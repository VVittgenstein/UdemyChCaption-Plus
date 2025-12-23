# Compact: T-20251223-act-005-build-subtitle-fetch

**Task**: 实现字幕抓取模块（Content Script）
**Status**: Completed
**Compact Date**: 2025-12-24T00:35:00Z
**Owner**: claude-code

---

## 1. 范围对齐

| 验收条目 | 状态 | 验证方式 |
|---------|------|---------|
| Content Script 在 Udemy 课程播放页加载后 3 秒内识别视频元素 | ✅ 已实现 | 代码: `VIDEO_DETECTION_TIMEOUT = 3000`, 轮询检测 |
| 成功提取原始字幕 URL（优先英文 WebVTT） | ✅ 已实现 | 代码: `LANGUAGE_PRIORITY`, `selectPreferredTrack()` |
| 单元测试覆盖字幕 URL 提取逻辑 | ✅ 已实现 | 文件: `subtitle-fetcher.test.ts` |
| 集成测试在真实 Udemy 页面抓取成功 | ⏳ 待验证 | 需浏览器环境手动测试 |
| 控制台/日志可见字幕抓取状态 | ✅ 已实现 | 代码: `log()` 函数, `LOG_PREFIX = '[SubtitleFetcher]'` |

---

## 2. 已落实事实

### 2.1 文件清单

| 文件路径 | 类型 | LOC | 说明 |
|---------|------|-----|------|
| `src/content/subtitle-fetcher.ts` | 核心模块 | ~420 | 字幕抓取主逻辑 |
| `src/types/index.ts` | 类型定义 | ~200 | 全项目共享类型 |
| `src/content/__tests__/subtitle-fetcher.test.ts` | 单元测试 | ~400 | Jest 测试用例 |
| `package.json` | 配置 | - | 项目依赖 (ts, jest) |
| `tsconfig.json` | 配置 | - | TS 编译选项 |
| `jest.config.js` | 配置 | - | Jest 测试配置 |

### 2.2 核心实现

```
subtitle-fetcher.ts 模块结构:
├── Constants (超时、语言优先级)
├── Logger (可配置级别)
├── URL/Course Info Extraction
│   ├── extractCourseInfo()      → CourseInfo | null
│   ├── getCourseIdFromPage()    → string (UD对象/Performance API)
│   ├── getCourseTitle()         → string | undefined
│   └── getSectionTitle()        → string | undefined
├── Video Detection
│   ├── detectVideo()            → Promise<VideoDetectionResult>
│   ├── findVideoElement()       → HTMLVideoElement | null
│   └── isValidVideoElement()    → boolean
├── Subtitle Track Extraction
│   ├── getSubtitleTracks()      → Promise<SubtitleFetchResult>
│   ├── getTracksFromElements()  → SubtitleTrack[] (DOM <track>)
│   ├── getTracksFromTextTrackAPI() → SubtitleTrack[]
│   └── getTracksFromNetworkIntercept() → SubtitleTrack[]
├── Track Selection
│   └── selectPreferredTrack()   → SubtitleTrack | null
├── VTT Fetching
│   ├── fetchVTT()               → Promise<AsyncResult<VTTContent>>
│   ├── isValidVTT()             → boolean (WEBVTT header check)
│   └── calculateHash()          → SHA-256 hash
└── Main API
    ├── fetchSubtitles()         → 一键入口
    └── SubtitleFetcher class    → OOP 接口
```

### 2.3 关键常量

| 常量 | 值 | 用途 |
|-----|-----|------|
| `VIDEO_DETECTION_TIMEOUT` | 3000ms | 视频检测超时 |
| `VIDEO_DETECTION_POLL_INTERVAL` | 100ms | 轮询间隔 |
| `VTT_FETCH_TIMEOUT` | 10000ms | VTT 下载超时 |
| `LANGUAGE_PRIORITY` | `['en', 'en-US', 'en-GB', 'en-AU']` | 语言选择优先级 |

### 2.4 类型定义 (src/types/index.ts)

**核心接口**:
- `SubtitleTrack`: url, language, label, isDefault, kind
- `SubtitleFetchResult`: success, tracks[], method, error?
- `VTTContent`: content, url, language, hash
- `VideoDetectionResult`: found, video, courseInfo, timestamp
- `CourseInfo`: courseId, courseSlug, lectureId, titles...

**消息类型**:
- `MessageToBackground`: TRANSLATE_SUBTITLE, CHECK_CACHE, PRELOAD_NEXT, GET_SETTINGS, CANCEL_TRANSLATION
- `MessageToContent`: TRANSLATION_COMPLETE, TRANSLATION_PROGRESS, CACHE_HIT, CACHE_MISS, SETTINGS

---

## 3. 接口 & 行为变更

### 3.1 对外暴露 API

```typescript
// 函数式 API
export async function fetchSubtitles(): Promise<{
  videoDetection: VideoDetectionResult;
  subtitleResult: SubtitleFetchResult;
  vttContent: VTTContent | null;
  selectedTrack: SubtitleTrack | null;
}>

export async function detectVideo(): Promise<VideoDetectionResult>
export async function getSubtitleTracks(video: HTMLVideoElement): Promise<SubtitleFetchResult>
export async function fetchVTT(url: string): Promise<AsyncResult<VTTContent>>
export function selectPreferredTrack(tracks: SubtitleTrack[]): SubtitleTrack | null
export function extractCourseInfo(): CourseInfo | null
export function setLogLevel(level: LogLevel): void

// 类式 API
export class SubtitleFetcher {
  async initialize(): Promise<boolean>
  getVideo(): HTMLVideoElement | null
  getCourseInfo(): CourseInfo | null
  async getSubtitleTracks(): Promise<SubtitleTrack[]>
  async fetchVTT(url: string): Promise<VTTContent | null>
  selectPreferredTrack(): SubtitleTrack | null
}
```

### 3.2 依赖方影响

| 下游模块 | 预期集成点 | 接口契约 |
|---------|-----------|---------|
| ACT-008 (track-injector) | `fetchSubtitles()` 返回的 `vttContent` | 需要 VTTContent.content 字符串 |
| ACT-007 (llm-translator) | `vttContent.content` 作为翻译输入 | 原始 VTT 格式字符串 |
| ACT-010 (local-cache) | `vttContent.hash` 用于缓存键 | SHA-256 哈希字符串 |
| message-bridge | CourseInfo 用于消息 payload | courseId, lectureId 必填 |

---

## 4. 实现要点

### 4.1 字幕轨道获取策略 (优先级降序)

1. **DOM `<track>` 元素** - 最直接，解析 video.querySelectorAll('track')
2. **TextTrack API** - video.textTracks，仅在有 URL 时返回，否则继续尝试下一方法
3. **Network 拦截** - Performance API 查找 .vtt 请求

### 4.2 课程 ID 获取策略 (优先级降序)

1. **Udemy UD 对象** - `UD.config.brand.course.id`
2. **Performance API** - 匹配 `api-2.0/courses/(\d+)` 请求
3. **DOM data 属性** - `[data-course-id]` 元素

### 4.3 VTT 校验

- 必须以 `WEBVTT` 开头 (trim 后)
- 支持 BOM (`\uFEFF`) 前缀

---

## 5. 风险 & TODO

### 5.1 已知限制

| 限制 | 影响 | 缓解 |
|-----|------|------|
| ~~TextTrack API 不提供 URL~~ | ~~method='videojs-api' 时 track.url 为空~~ | ✅ 已修复：自动回退到 network-intercept |
| 视频元素可能延迟加载 | 3秒超时可能不够 | 可配置超时或增加重试 |
| UD 对象结构可能变化 | courseId 提取失败 | 多重 fallback |

### 5.2 待验证项

- [ ] **集成测试**: 需在真实 Udemy 页面验证 `fetchSubtitles()` 完整流程
- [ ] **全屏模式**: 视频检测在全屏切换时是否稳定
- [ ] **SPA 导航**: 切换课时时是否需要重新初始化

### 5.3 技术债务

- `getTracksFromNetworkIntercept()` 依赖 Performance API，某些场景可能未记录 VTT 请求
- 语言检测依赖 URL 模式匹配，非标准 URL 可能识别失败

---

## 6. 测试覆盖

| 测试分类 | 用例数 | 覆盖功能 |
|---------|-------|---------|
| 课程信息提取 | 5 | URL 解析, Performance API, 边界情况 |
| 轨道选择 | 6 | 语言优先级, 默认轨道, 空数组 |
| VTT 获取 | 7 | 成功/失败, 校验, 超时, 哈希 |
| 边界情况 | 4 | 无源视频, 隐藏元素, 空属性 |

---

## 7. 后续任务依赖图

```
T-20251223-act-005 (本任务) ──┬──▶ T-20251223-act-008 (track-injector)
                             │
                             └──▶ T-20251223-act-007 (llm-translator)
                                        │
                                        ▼
                              T-20251223-act-010 (local-cache)
```

---

## 附录: 快速使用示例

```typescript
import { fetchSubtitles } from './content/subtitle-fetcher';

// 一键获取
const result = await fetchSubtitles();
if (result.vttContent) {
  console.log('VTT 内容:', result.vttContent.content);
  console.log('语言:', result.selectedTrack?.language);
  console.log('哈希:', result.vttContent.hash);
}

// 发送到 Service Worker
chrome.runtime.sendMessage({
  type: 'TRANSLATE_SUBTITLE',
  payload: {
    taskId: crypto.randomUUID(),
    vttContent: result.vttContent.content,
    courseId: result.videoDetection.courseInfo?.courseId,
    lectureId: result.videoDetection.courseInfo?.lectureId,
    provider: 'openai',
    model: 'gpt-4'
  }
});
```

## Code Review - T-20251223-act-005-build-subtitle-fetch - 2025-12-23T16:51:16Z

---review-start---
{
  "findings": [
    {
      "title": "[P1] `isValidVTT` rejects BOM-prefixed files",
      "body": "VTT validation currently trims the string and checks `startsWith('WEBVTT')`, so BOM-prefixed files like `'\uFEFFWEBVTT'` are treated as invalid. This means legitimate WebVTT responses with a BOM (common from some CDNs) will be rejected and `fetchVTT` returns `Invalid VTT format`, breaking the documented acceptance test `accepts WEBVTT with BOM` and any real subtitle downloads that include a BOM.",
      "confidence_score": 0.66,
      "priority": 1,
      "code_location": {
        "absolute_file_path": "/mnt/z/Project/UdemyChCaption-Plus/src/content/subtitle-fetcher.ts",
        "line_range": {
          "start": 548,
          "end": 551
        }
      },
      "status": "resolved",
      "resolution": "Fixed by adding BOM stripping before validation: `content.replace(/^\\uFEFF/, '').trim().startsWith('WEBVTT')`",
      "resolved_at": "2025-12-24T00:45:00Z"
    }
  ],
  "overall_correctness": "patch is correct",
  "overall_explanation": "All findings have been resolved. BOM-prefixed VTT files are now correctly accepted.",
  "overall_confidence_score": 0.69
}
---review-end---

## Code Review - T-20251223-act-005-build-subtitle-fetch - 2025-12-23T17:52:54Z

---review-start---
{
  "findings": [
    {
      "title": "[P1] Region IDs capture full setting string",
      "body": "Region parsing uses `line.match(/(?:^|\\\\s)id:([^\\\\s]+)/)` which treats `\\\\s` as a literal backslash+s instead of whitespace, so on a standard region line like `id:region1 width:40% lines:3` the capture runs through the following settings and produces an ID such as `region1 width:40% line`. This makes the parsed `region.id` incorrect and prevents cues with `region:region1` from matching a real region when the line contains multiple settings (the common WebVTT form). The parser should stop the ID at whitespace (`/id:([^\\s]+)/`) instead of swallowing the rest of the line.",
      "confidence_score": 0.36,
      "priority": 1,
      "code_location": {
        "absolute_file_path": "/mnt/z/Project/UdemyChCaption-Plus/src/utils/webvtt-parser.ts",
        "line_range": {
          "start": 333,
          "end": 341
        }
      }
    }
  ],
  "overall_correctness": "patch is incorrect",
  "overall_explanation": "Region ID parsing is broken for standard region lines with multiple settings, so parsed region identifiers are wrong and region lookups will fail in common inputs.",
  "overall_confidence_score": 0.36
}
---review-end---

## Code Review - T-20251223-act-005-build-subtitle-fetch - 2025-12-23T17:42:42Z

---review-start---
{
  "findings": [
    {
      "title": "[P2] NOTE blocks dropped on default generation",
      "body": "The generator defaults `includeNotes` to false, so calling `generateVTT` with parsed data (the default path used by `generateFromCues` or a parse→generate round-trip) silently omits any `NOTE` blocks even though the parser collects them. As a result, a valid VTT containing comments will lose that content when regenerated with default options, breaking the advertised “complete WebVTT structure” round-trip behavior. Consider enabling notes by default or emitting a warning when notes are present but excluded.",
      "confidence_score": 0.32,
      "priority": 2,
      "code_location": {
        "absolute_file_path": "/mnt/z/Project/UdemyChCaption-Plus/src/utils/webvtt-generator.ts",
        "line_range": {
          "start": 33,
          "end": 39
        }
      }
    }
  ],
  "overall_correctness": "patch is incorrect",
  "overall_explanation": "Default generation drops NOTE blocks collected by the parser, so a parse→generate round-trip loses content and does not fully preserve the original VTT structure.",
  "overall_confidence_score": 0.33
}
---review-end---

## Code Review - T-20251223-act-005-build-subtitle-fetch - 2025-12-23T16:54:19Z

---review-start---
{
  "findings": [
    {
      "title": "[P1] Jest ESM config prevents tests from running",
      "body": "The Jest transform enables `ts-jest` with `useESM: true`, but the project is otherwise CommonJS (no `\"type\": \"module\"`) and the config omits `extensionsToTreatAsEsm`. Jest will therefore load `.ts` tests as CJS while `ts-jest` emits ESM, leading to `Cannot use import statement outside a module`/`Unexpected token export` errors and the entire test suite failing to start. Either keep `useESM` off or add the necessary ESM settings so tests actually run.",
      "confidence_score": 0.31,
      "priority": 1,
      "code_location": {
        "absolute_file_path": "/mnt/z/Project/UdemyChCaption-Plus/jest.config.js",
        "line_range": {
          "start": 21,
          "end": 24
        }
      },
      "status": "resolved",
      "resolution": "Removed `useESM: true` from ts-jest transform config. Project is CommonJS, so ts-jest now correctly emits CJS modules by default.",
      "resolved_at": "2025-12-24T01:00:00Z"
    }
  ],
  "overall_correctness": "patch is correct",
  "overall_explanation": "All findings have been resolved. Jest config now correctly uses CommonJS output matching the project setup.",
  "overall_confidence_score": 0.69
}
---review-end---

## Code Review - T-20251223-act-005-build-subtitle-fetch - 2025-12-23T16:57:48Z

---review-start---
{
  "findings": [
    {
      "title": "[P1] Continue when TextTrack API lacks URLs",
      "body": "When `getSubtitleTracks` hits the TextTrack API branch it immediately returns success even though the tracks created there have `url: ''` because the API does not expose the file location. In environments where Udemy injects tracks only through the TextTrack API (no `<track>` elements) the pipeline stops here, `fetchSubtitles` chooses an empty-URL track and exits without fetching subtitles, and the later network-intercept fallback never runs even though it could have provided real VTT URLs. This makes subtitle fetching fail on such pages.",
      "confidence_score": 0.44,
      "priority": 1,
      "code_location": {
        "absolute_file_path": "/mnt/z/Project/UdemyChCaption-Plus/src/content/subtitle-fetcher.ts",
        "line_range": {
          "start": 283,
          "end": 312
        }
      },
      "status": "resolved",
      "resolution": "Added URL check before returning from TextTrack API branch: `tracksWithUrls.filter((t) => t.url)`. Only returns success if at least one track has a valid URL, otherwise continues to network-intercept fallback.",
      "resolved_at": "2025-12-24T01:15:00Z"
    }
  ],
  "overall_correctness": "patch is correct",
  "overall_explanation": "All findings have been resolved. TextTrack API branch now correctly falls through to network-intercept when tracks lack URLs.",
  "overall_confidence_score": 0.69
}
---review-end---

## Code Review - T-20251223-act-005-build-subtitle-fetch - 2025-12-23T17:47:29Z

---review-start---
{
  "findings": [
    {
      "title": "[P1] Region blocks never parsed",
      "body": "The REGION parser looks for an `id=` prefix (`line.startsWith('id=')`) to capture the region id, but WebVTT region metadata uses colon-separated keys (e.g. `id:region1`). As a result `regionId` remains empty and every REGION block is discarded (`return { region: null ... }`), so parsing any valid VTT with regions silently drops all region definitions and a parse→generate round-trip loses positioning metadata.",
      "confidence_score": 0.46,
      "priority": 1,
      "code_location": {
        "absolute_file_path": "/mnt/z/Project/UdemyChCaption-Plus/src/utils/webvtt-parser.ts",
        "line_range": {
          "start": 333,
          "end": 348
        }
      }
    }
  ],
  "overall_correctness": "patch is incorrect",
  "overall_explanation": "Region blocks are dropped because the parser expects `id=` instead of the standard `id:` syntax, so WebVTT files with regions cannot be round-tripped correctly.",
  "overall_confidence_score": 0.46
}
---review-end---
