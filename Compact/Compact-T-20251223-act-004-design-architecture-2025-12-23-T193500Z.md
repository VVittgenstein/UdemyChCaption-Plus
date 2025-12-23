# Compact: T-20251223-act-004-design-architecture

**生成时间**: 2025-12-23T19:35:00Z
**任务类型**: design
**状态**: completed

---

## 1. 范围对齐

| 字段 | 值 |
|------|-----|
| Subtask ID | T-20251223-act-004-design-architecture |
| 标题 | 设计扩展架构（Content Script / Service Worker / Popup 分工） |
| 依赖 | ACT-001 (Track注入), ACT-003 (SW生命周期) - 均已完成 |
| 产出物 | `architecture.md` |

---

## 2. 已确认事实 (Verified Facts)

### 2.1 架构分层

```
四层架构已定义：
├── Layer 1: Udemy 网页 (Video.js 播放器)
├── Layer 2: Content Script (6 模块)
├── Layer 3: Service Worker (8 模块)
└── Layer 4: Storage (sync + IndexedDB)
```

### 2.2 模块职责 (14 模块已定义接口)

**Content Script 模块**:
| 模块 | 文件 | 职责 |
|------|------|------|
| VideoDetector | `video-detector.ts` | 检测视频元素，监听 SPA 导航 |
| SubtitleFetcher | `subtitle-fetcher.ts` | 抓取原始字幕 URL，下载 VTT |
| TrackInjector | `track-injector.ts` | 创建 `<track>` 元素，注入翻译字幕 |
| NextLectureDetector | `next-lecture-detector.ts` | 调用 Curriculum API 获取下一课 |
| LoadingIndicator | `loading-indicator.ts` | 显示翻译状态 UI |
| MessageBridge | `message-bridge.ts` | 与 Service Worker 通信 |

**Service Worker 模块**:
| 模块 | 文件 | 职责 |
|------|------|------|
| MessageHandler | `message-handler.ts` | 消息路由 |
| Translator | `translator.ts` | 翻译业务逻辑，Prompt 管理 |
| OpenAIClient | `openai-client.ts` | OpenAI API 流式调用 |
| GeminiClient | `gemini-client.ts` | Gemini API 流式调用 |
| Preloader | `preloader.ts` | 后台预加载下一课字幕 |
| KeepAliveManager | `keep-alive-manager.ts` | SW 保活 (25s interval) |
| SettingsManager | `settings-manager.ts` | 配置读写 |
| SubtitleCache | `subtitle-cache.ts` | IndexedDB 缓存操作 |

### 2.3 技术决策 (已锁定)

| 决策点 | 方案 | 验证来源 |
|--------|------|----------|
| 字幕注入方式 | **Data URI** (`data:text/vtt;base64,...`) | ACT-001 实测 |
| LLM API 调用 | **流式 API** + `stream: true` | ACT-003 分析 |
| SW 保活机制 | `setInterval` 25s + `chrome.runtime.getPlatformInfo()` | ACT-003 验证 |
| 下一课 ID 获取 | **Curriculum API** `/api-2.0/courses/{id}/subscriber-curriculum-items/` | ACT-002 验证 |
| 最低 Chrome 版本 | **110+** | ACT-003 要求 |

### 2.4 消息协议 (已定义)

```typescript
// Content Script → Service Worker
type MessageToBackground =
  | { type: 'TRANSLATE_SUBTITLE'; payload: TranslateRequest }
  | { type: 'CHECK_CACHE'; payload: { courseId, lectureId } }
  | { type: 'PRELOAD_NEXT'; payload: { courseId, nextLectureId } }
  | { type: 'GET_SETTINGS' }
  | { type: 'CANCEL_TRANSLATION'; payload: { taskId } };

// Service Worker → Content Script
type MessageToContent =
  | { type: 'TRANSLATION_COMPLETE'; payload: TranslateResult }
  | { type: 'TRANSLATION_PROGRESS'; payload: { taskId, progress } }
  | { type: 'CACHE_HIT'; payload: { translatedVTT } }
  | { type: 'CACHE_MISS' }
  | { type: 'SETTINGS'; payload: UserSettings };
```

### 2.5 存储 Schema (已定义)

**chrome.storage.sync (UserSettings)**:
- `provider`: 'openai' | 'gemini'
- `apiKey`: string (加密)
- `model`: string
- `enabled`: boolean
- `autoTranslate`: boolean
- `preloadEnabled`: boolean

**IndexedDB (SubtitleCacheEntry)**:
- 主键: `${courseId}-${lectureId}`
- `originalHash`: 原字幕哈希
- `translatedVTT`: 翻译后 VTT
- `provider`, `model`, `tokensUsed`, `estimatedCost`
- `createdAt`, `updatedAt`

### 2.6 目录结构 (已定义)

```
src/
├── background/          # Service Worker
├── content/             # Content Script
├── popup/               # Popup UI
├── storage/             # 存储层
├── utils/               # 工具函数
└── types/               # 类型定义
```

---

## 3. 接口 & 行为变更 (对下游影响)

| 接口 | 影响范围 | 说明 |
|------|----------|------|
| `TrackInjector.inject()` | ACT-008 | 必须使用 Data URI 方式，参数 `method: 'dataURI'` |
| `Translator.translate()` | ACT-007 | 必须实现流式调用，配合 KeepAliveManager |
| `KeepAliveManager` | ACT-007 | 翻译任务前 `start()`，结束后 `stop()` |
| `NextLectureDetector` | ACT-011 | 使用 Curriculum API 而非 DOM 解析 |
| `manifest.json` | 全局 | 需声明 `"minimum_chrome_version": "110"` |

---

## 4. 显式限制 / 风险 / TODO

### 限制
- [x] 验收条件"评审通过"已通过人工评审确认

### 风险
- **Udemy 前端更新**: 可能改变 DOM 结构或 API，需 E2E 监控
- **API Key 安全**: 依赖 chrome.storage.sync 的扩展私有性

### 待下游确认
- Prompt 模板具体内容 → ACT-007 实现时定义
- VTT 解析/生成细节 → ACT-006 实现时定义

---

## 5. 验收标准核对

| 验收条件 | 状态 | 证据 |
|---------|------|------|
| 产出架构图（CS/SW/Popup/Storage 交互） | ✅ | architecture.md §2.1 |
| 模块职责文档明确各组件边界 | ✅ | architecture.md §3 |
| API 调用流程图（从字幕抓取到注入） | ✅ | architecture.md §4.1 |
| 评审通过，团队理解一致 | ✅ | 人工评审完成，已修改多次 |

---

## 6. 解除的阻塞

此任务完成后，以下任务可开始 (Layer 3 并行):
- **ACT-005**: 字幕抓取模块
- **ACT-006**: WebVTT 解析模块
- **ACT-009**: Popup 设置面板
- **ACT-010**: 本地缓存模块

---

## 7. 快速参考

```
架构核心决策速查：
┌────────────────────────────────────────────────┐
│ 字幕注入 = Data URI (base64 VTT)              │
│ LLM 调用 = 流式 API + 25s 保活心跳            │
│ 下一课   = Curriculum API (非 DOM)            │
│ Chrome   >= 110                                │
└────────────────────────────────────────────────┘
```
