# UdemyChCaption-Plus 架构设计文档

**文档版本**: 1.0
**创建日期**: 2025-12-23
**Task ID**: T-20251223-act-004-design-architecture
**状态**: Final

---

## 1. 概述

### 1.1 项目目标

UdemyChCaption-Plus 是一个 Chrome 扩展，为 Udemy 视频提供 LLM 驱动的高质量中文字幕替换功能。

### 1.2 架构目标

- **模块化**: 清晰的职责划分，便于维护和测试
- **可靠性**: 处理 MV3 Service Worker 生命周期限制
- **性能**: 通过预加载和缓存优化用户体验
- **可扩展**: 支持多种 LLM 提供商

### 1.3 技术约束 (来自 Spike 验证)

| 约束 | 来源 | 解决方案 |
|------|------|---------|
| MV3 Service Worker 30秒超时 | ACT-003 | 流式 API + Chrome API 保活 |
| CSP 限制字幕加载 | ACT-001 | Data URI 编码 VTT |
| Udemy 使用 React SPA | ACT-002 | Curriculum API 获取课程数据 |
| 最低 Chrome 版本 | ACT-003 | Chrome 110+ |

---

## 2. 整体架构

### 2.1 架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Udemy 网页                                  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                        Video.js 播放器                             │  │
│  │  ┌─────────────┐   ┌─────────────┐   ┌─────────────────────────┐  │  │
│  │  │   <video>   │   │   <track>   │   │   字幕显示区 (::cue)    │  │  │
│  │  │             │◄──│  (注入的)   │──▶│                         │  │  │
│  │  └─────────────┘   └─────────────┘   └─────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                    ▲                                     │
│                                    │ DOM 操作                            │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                      Content Script                                │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │  │
│  │  │ VideoDetector│  │TrackInjector │  │ LoadingIndicator         │ │  │
│  │  │ 视频检测     │  │字幕注入       │  │ 状态提示                 │ │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘ │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │  │
│  │  │SubtitleFetcher│ │NextLectureDetector│ │ MessageBridge         │ │  │
│  │  │ 字幕抓取     │  │下一课检测     │  │ 消息桥接                 │ │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    chrome.runtime.sendMessage / connect
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Service Worker (Background)                      │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                        Core Services                              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐│   │
│  │  │ Translator   │  │ Preloader    │  │ MessageHandler           ││   │
│  │  │ LLM翻译服务  │  │ 预加载管理   │  │ 消息路由                 ││   │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘│   │
│  └──────────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                       API Clients                                 │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐│   │
│  │  │ OpenAIClient │  │ GeminiClient │  │ KeepAliveManager         ││   │
│  │  │ OpenAI API   │  │ Gemini API   │  │ SW 保活                  ││   │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘│   │
│  └──────────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                       Utilities                                   │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐│   │
│  │  │ WebVTTParser │  │ WebVTTGenerator│ │ CostEstimator           ││   │
│  │  │ VTT 解析     │  │ VTT 生成     │  │ 费用估算                 ││   │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘│   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                         chrome.storage API
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              Storage Layer                               │
│  ┌──────────────────────────────┐  ┌──────────────────────────────────┐ │
│  │   chrome.storage.sync        │  │       IndexedDB                   │ │
│  │   (用户配置)                 │  │   (字幕缓存)                      │ │
│  │  ┌────────────────────────┐  │  │  ┌────────────────────────────┐  │ │
│  │  │ - API Key (加密)       │  │  │  │ - 课程/课时 ID             │  │ │
│  │  │ - 翻译服务提供商       │  │  │  │ - 原字幕哈希               │  │ │
│  │  │ - 模型选择             │  │  │  │ - 翻译后字幕 (VTT)         │  │ │
│  │  │ - 字幕开关             │  │  │  │ - 模型版本                 │  │ │
│  │  │ - UI 偏好              │  │  │  │ - 时间戳                   │  │ │
│  │  └────────────────────────┘  │  │  └────────────────────────────┘  │ │
│  └──────────────────────────────┘  └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │ chrome.runtime.sendMessage
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                              Popup UI                                    │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────────────────────┐│   │
│  │  │ API Key    │  │ 模型选择   │  │ 主开关                       ││   │
│  │  │ 配置       │  │            │  │                              ││   │
│  │  └────────────┘  └────────────┘  └──────────────────────────────┘│   │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────────────────────┐│   │
│  │  │ 翻译状态   │  │ 费用统计   │  │ 重新翻译                     ││   │
│  │  │ 显示       │  │            │  │                              ││   │
│  │  └────────────┘  └────────────┘  └──────────────────────────────┘│   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 组件通信图

```
                              ┌─────────────┐
                              │   Popup     │
                              │   (UI)      │
                              └──────┬──────┘
                                     │
            ┌────────────────────────┼────────────────────────┐
            │     Settings CRUD      │      Translation       │
            │     (sync storage)     │      Status Query      │
            ▼                        ▼                        ▼
┌───────────────────┐    ┌───────────────────┐    ┌───────────────────┐
│   Storage.sync    │    │  Service Worker   │    │   IndexedDB       │
│   (Settings)      │◄───│   (Background)    │───▶│   (Cache)         │
└───────────────────┘    └─────────┬─────────┘    └───────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
     ┌────────────────┐   ┌────────────────┐   ┌────────────────┐
     │  OpenAI API    │   │  Gemini API    │   │  Udemy API     │
     │  (Translation) │   │  (Translation) │   │  (Curriculum)  │
     └────────────────┘   └────────────────┘   └────────────────┘
                                   ▲
                                   │
                         ┌─────────┴─────────┐
                         │  Content Script   │
                         │  (Udemy Page)     │
                         └───────────────────┘
```

---

## 3. 模块职责定义

### 3.1 Content Script 模块

运行在 Udemy 页面上下文中，负责与 DOM 交互。

| 模块 | 文件 | 职责 | 输入 | 输出 |
|------|------|------|------|------|
| **VideoDetector** | `video-detector.ts` | 检测视频元素，监听 SPA 导航 | DOM MutationObserver | video 元素引用 |
| **SubtitleFetcher** | `subtitle-fetcher.ts` | 抓取原始字幕 URL，下载 VTT | video 元素 | VTT 文本内容 |
| **TrackInjector** | `track-injector.ts` | 创建 `<track>` 元素，注入翻译字幕 | VTT 文本 | 注入成功/失败 |
| **NextLectureDetector** | `next-lecture-detector.ts` | 调用 Curriculum API 获取下一课信息 | 当前 URL | 下一课 ID/URL |
| **LoadingIndicator** | `loading-indicator.ts` | 显示翻译状态 UI | 状态事件 | UI 元素 |
| **MessageBridge** | `message-bridge.ts` | 与 Service Worker 通信 | 业务消息 | 响应消息 |

#### 3.1.1 VideoDetector

```typescript
interface VideoDetector {
  // 启动监听
  start(): void;
  // 停止监听
  stop(): void;
  // 事件: 检测到视频
  onVideoFound: (video: HTMLVideoElement) => void;
  // 事件: SPA 页面切换
  onPageChange: (url: string) => void;
}
```

#### 3.1.2 SubtitleFetcher

```typescript
interface SubtitleFetcher {
  // 获取字幕 URL 列表
  getSubtitleTracks(video: HTMLVideoElement): Promise<SubtitleTrack[]>;
  // 下载 VTT 内容
  fetchVTT(url: string): Promise<string>;
}

interface SubtitleTrack {
  url: string;
  language: string;
  label: string;
  isDefault: boolean;
}
```

#### 3.1.3 TrackInjector

```typescript
interface TrackInjector {
  // 注入翻译字幕
  inject(video: HTMLVideoElement, vttContent: string, options: InjectOptions): Promise<boolean>;
  // 移除已注入的字幕
  remove(video: HTMLVideoElement): void;
  // 激活翻译字幕轨道
  activate(video: HTMLVideoElement): void;
}

interface InjectOptions {
  label: string;       // 显示名称，如 "中文（优化）"
  language: string;    // 语言代码，如 "zh-CN"
  method: 'dataURI' | 'blobURL' | 'addTextTrack';
}
```

### 3.2 Service Worker 模块

运行在扩展后台，负责 API 调用和业务逻辑。

| 模块 | 文件 | 职责 | 依赖 |
|------|------|------|------|
| **MessageHandler** | `message-handler.ts` | 接收/路由消息，协调模块 | 所有服务模块 |
| **Translator** | `translator.ts` | 翻译业务逻辑，Prompt 管理 | API Clients, WebVTT 工具 |
| **OpenAIClient** | `openai-client.ts` | OpenAI API 调用 (流式) | KeepAliveManager |
| **GeminiClient** | `gemini-client.ts` | Gemini API 调用 (流式) | KeepAliveManager |
| **Preloader** | `preloader.ts` | 后台预加载下一课字幕 | Translator, Cache |
| **KeepAliveManager** | `keep-alive-manager.ts` | Service Worker 保活 | chrome.runtime API |
| **SettingsManager** | `settings-manager.ts` | 配置读写 | chrome.storage.sync |
| **SubtitleCache** | `subtitle-cache.ts` | IndexedDB 缓存操作 | IndexedDB |

#### 3.2.1 Translator

```typescript
interface Translator {
  // 翻译字幕
  translate(request: TranslateRequest): Promise<TranslateResult>;
  // 取消翻译
  cancel(taskId: string): void;
  // 获取翻译状态
  getStatus(taskId: string): TranslationStatus;
}

interface TranslateRequest {
  taskId: string;
  vttContent: string;
  courseId: string;
  lectureId: string;
  courseName?: string;
  sectionName?: string;
  provider: 'openai' | 'gemini';
  model: string;
}

interface TranslateResult {
  success: boolean;
  translatedVTT?: string;
  error?: string;
  tokensUsed?: number;
  estimatedCost?: number;
}
```

#### 3.2.2 KeepAliveManager

```typescript
interface KeepAliveManager {
  // 开始保活 (翻译任务开始时)
  start(): void;
  // 停止保活 (翻译任务结束时)
  stop(): void;
  // 当前是否在保活状态
  isActive(): boolean;
}

// 实现原理
class KeepAliveManagerImpl implements KeepAliveManager {
  private intervalId: number | null = null;
  private readonly INTERVAL_MS = 25000; // 25秒，小于30秒超时

  start() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      chrome.runtime.getPlatformInfo(); // 重置 SW 超时计时器
    }, this.INTERVAL_MS);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  isActive() {
    return this.intervalId !== null;
  }
}
```

#### 3.2.3 API Client (流式)

```typescript
interface LLMClient {
  // 流式翻译
  translateStream(
    prompt: string,
    onChunk: (chunk: string) => void,
    onComplete: (fullText: string) => void,
    onError: (error: Error) => void
  ): AbortController;
}
```

### 3.3 Storage 模块

| 存储 | 类型 | 用途 | 数据 |
|------|------|------|------|
| **chrome.storage.sync** | 同步存储 | 用户配置 | API Key, 模型, 开关 |
| **IndexedDB** | 本地数据库 | 字幕缓存 | 翻译结果, 元数据 |

#### 3.3.1 Settings Schema

```typescript
interface UserSettings {
  // 翻译服务配置
  provider: 'openai' | 'gemini';
  apiKey: string;  // 加密存储
  model: string;

  // 功能开关
  enabled: boolean;           // 字幕替换主开关
  autoTranslate: boolean;     // 自动翻译
  preloadEnabled: boolean;    // 预加载开关

  // UI 偏好
  showCostEstimate: boolean;  // 显示费用估算
  showLoadingIndicator: boolean;
}
```

#### 3.3.2 Cache Schema (IndexedDB)

```typescript
interface SubtitleCacheEntry {
  // 主键: `${courseId}-${lectureId}`
  id: string;

  // 课程信息
  courseId: string;
  lectureId: string;
  courseName: string;
  lectureName: string;

  // 字幕数据
  originalHash: string;      // 原字幕内容哈希 (用于检测更新)
  translatedVTT: string;     // 翻译后的 VTT 内容

  // 翻译元数据
  provider: string;          // 翻译服务
  model: string;             // 使用的模型
  tokensUsed: number;
  estimatedCost: number;

  // 时间戳
  createdAt: number;
  updatedAt: number;
}
```

### 3.4 Popup 模块

| 组件 | 职责 |
|------|------|
| **SettingsPanel** | API Key 输入、模型选择、开关控制 |
| **StatusDisplay** | 当前翻译状态、进度显示 |
| **CostDisplay** | 费用估算、累计统计 |
| **ActionButtons** | 保存验证、重新翻译 |

---

## 4. 核心流程

### 4.1 字幕翻译主流程

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           字幕翻译主流程                                      │
└──────────────────────────────────────────────────────────────────────────────┘

用户打开 Udemy 课程页面
        │
        ▼
┌───────────────────┐
│  VideoDetector    │
│  检测视频元素     │
└─────────┬─────────┘
          │ 检测到 <video>
          ▼
┌───────────────────┐
│  SubtitleFetcher  │
│  抓取原字幕 URL   │
└─────────┬─────────┘
          │ 获取到 VTT URL
          ▼
┌───────────────────┐    缓存命中    ┌───────────────────┐
│  检查本地缓存     │───────────────▶│  TrackInjector    │
│  (IndexedDB)      │                │  注入缓存字幕     │
└─────────┬─────────┘                └───────────────────┘
          │ 缓存未命中
          ▼
┌───────────────────┐
│  LoadingIndicator │
│  显示"翻译中..."  │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  MessageBridge    │
│  发送翻译请求     │──────────────────────┐
└───────────────────┘                      │
                                           ▼
                              ┌───────────────────────────┐
                              │     Service Worker        │
                              │  ┌─────────────────────┐  │
                              │  │   MessageHandler    │  │
                              │  │   接收翻译请求      │  │
                              │  └──────────┬──────────┘  │
                              │             │             │
                              │             ▼             │
                              │  ┌─────────────────────┐  │
                              │  │  KeepAliveManager   │  │
                              │  │  启动 SW 保活       │  │
                              │  └──────────┬──────────┘  │
                              │             │             │
                              │             ▼             │
                              │  ┌─────────────────────┐  │
                              │  │    Translator       │  │
                              │  │  ┌───────────────┐  │  │
                              │  │  │ 构建 Prompt   │  │  │
                              │  │  │ (含课程元数据)│  │  │
                              │  │  └───────┬───────┘  │  │
                              │  │          │          │  │
                              │  │          ▼          │  │
                              │  │  ┌───────────────┐  │  │
                              │  │  │ 调用 LLM API  │  │  │
                              │  │  │ (流式响应)    │  │  │
                              │  │  └───────┬───────┘  │  │
                              │  │          │          │  │
                              │  │          ▼          │  │
                              │  │  ┌───────────────┐  │  │
                              │  │  │ 解析响应      │  │  │
                              │  │  │ 生成 VTT      │  │  │
                              │  │  └───────────────┘  │  │
                              │  └──────────┬──────────┘  │
                              │             │             │
                              │             ▼             │
                              │  ┌─────────────────────┐  │
                              │  │   SubtitleCache     │  │
                              │  │   保存到 IndexedDB  │  │
                              │  └──────────┬──────────┘  │
                              │             │             │
                              │             ▼             │
                              │  ┌─────────────────────┐  │
                              │  │  KeepAliveManager   │  │
                              │  │  停止 SW 保活       │  │
                              │  └─────────────────────┘  │
                              └─────────────┬─────────────┘
                                            │
          ┌─────────────────────────────────┘
          │ 返回翻译结果
          ▼
┌───────────────────┐
│  LoadingIndicator │
│  隐藏加载提示     │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  TrackInjector    │
│  注入翻译字幕     │
│  (Data URI 方式)  │
└─────────┬─────────┘
          │
          ▼
    用户可选择并查看翻译字幕
```

### 4.2 预加载流程

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           预加载流程                                          │
└──────────────────────────────────────────────────────────────────────────────┘

当前课字幕加载完成
        │
        ▼
┌───────────────────────┐
│  NextLectureDetector  │
│  调用 Curriculum API  │
│  获取下一课 ID        │
└──────────┬────────────┘
           │ 有下一课
           ▼
┌───────────────────────┐
│  MessageBridge        │
│  发送预加载请求       │──────────────────────┐
└───────────────────────┘                      │
                                               ▼
                                  ┌───────────────────────────┐
                                  │     Service Worker        │
                                  │  ┌─────────────────────┐  │
                                  │  │     Preloader       │  │
                                  │  │  1. 获取下一课字幕  │  │
                                  │  │  2. 后台静默翻译    │  │
                                  │  │  3. 存入缓存        │  │
                                  │  └─────────────────────┘  │
                                  └───────────────────────────┘
                                               │
                                               ▼
                                      缓存下一课翻译结果
                                               │
                                               ▼
                              用户切换到下一课时直接命中缓存
```

### 4.3 消息协议

```typescript
// Content Script → Service Worker

type MessageToBackground =
  | { type: 'TRANSLATE_SUBTITLE'; payload: TranslateRequest }
  | { type: 'CHECK_CACHE'; payload: { courseId: string; lectureId: string } }
  | { type: 'PRELOAD_NEXT'; payload: { courseId: string; nextLectureId: string } }
  | { type: 'GET_SETTINGS' }
  | { type: 'CANCEL_TRANSLATION'; payload: { taskId: string } };

// Service Worker → Content Script

type MessageToContent =
  | { type: 'TRANSLATION_COMPLETE'; payload: TranslateResult }
  | { type: 'TRANSLATION_PROGRESS'; payload: { taskId: string; progress: number } }
  | { type: 'CACHE_HIT'; payload: { translatedVTT: string } }
  | { type: 'CACHE_MISS' }
  | { type: 'SETTINGS'; payload: UserSettings };

// Popup → Service Worker

type MessageToPopup =
  | { type: 'GET_STATUS' }
  | { type: 'SAVE_SETTINGS'; payload: UserSettings }
  | { type: 'VALIDATE_API_KEY'; payload: { provider: string; apiKey: string } }
  | { type: 'RETRANSLATE_CURRENT' };
```

---

## 5. 技术决策

### 5.1 字幕注入方式

**决策**: 使用 Data URI 方式

**来源**: Spike ACT-001

**理由**:
- 实测验证通过，无 CSP 拦截
- 不依赖外部资源
- 实现简单可靠

**实现**:
```typescript
function createDataURI(vttContent: string): string {
  const encoded = btoa(unescape(encodeURIComponent(vttContent)));
  return `data:text/vtt;base64,${encoded}`;
}
```

### 5.2 LLM API 调用方式

**决策**: 使用流式 API (Streaming) + Chrome API 保活

**来源**: Spike ACT-003

**理由**:
- 流式响应避免 30 秒 fetch 超时
- Chrome API 调用重置 SW 不活动计时器
- 支持实时进度显示

**实现**:
```typescript
async function translateWithStreaming(text: string, config: Config) {
  keepAliveManager.start();

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { /* ... */ },
      body: JSON.stringify({ /* ... */, stream: true })
    });

    const reader = response.body!.getReader();
    let result = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // 解析 SSE 数据并累积结果
      result += parseSSEChunk(value);
    }

    return result;
  } finally {
    keepAliveManager.stop();
  }
}
```

### 5.3 下一课 ID 获取方式

**决策**: 使用 Curriculum API

**来源**: Spike ACT-002

**理由**:
- Udemy 使用 React SPA，传统 DOM 方式不可靠
- API 返回完整课程结构
- 支持跨章节场景

**API 端点**:
```
GET https://www.udemy.com/api-2.0/courses/{courseId}/subscriber-curriculum-items/
```

### 5.4 最低 Chrome 版本

**决策**: Chrome 110+

**来源**: Spike ACT-003

**理由**:
- Chrome 110+ 支持 extension API 调用重置 SW 计时器
- 覆盖绝大多数用户
- 低于此版本可能遇到 SW 超时问题

**配置**:
```json
// manifest.json
{
  "minimum_chrome_version": "110"
}
```

---

## 6. 目录结构

```
src/
├── manifest.json              # 扩展配置
├── background/
│   ├── index.ts               # SW 入口
│   ├── message-handler.ts     # 消息路由
│   ├── translator.ts          # 翻译业务逻辑
│   ├── preloader.ts           # 预加载管理
│   ├── keep-alive-manager.ts  # SW 保活
│   └── clients/
│       ├── openai-client.ts   # OpenAI API
│       └── gemini-client.ts   # Gemini API
├── content/
│   ├── index.ts               # Content Script 入口
│   ├── video-detector.ts      # 视频检测
│   ├── subtitle-fetcher.ts    # 字幕抓取
│   ├── track-injector.ts      # 字幕注入
│   ├── next-lecture-detector.ts # 下一课检测
│   ├── loading-indicator.ts   # 加载状态 UI
│   └── message-bridge.ts      # 消息桥接
├── popup/
│   ├── popup.html
│   ├── popup.ts
│   └── popup.css
├── storage/
│   ├── settings-manager.ts    # 配置管理
│   └── subtitle-cache.ts      # 字幕缓存
├── utils/
│   ├── webvtt-parser.ts       # VTT 解析
│   ├── webvtt-generator.ts    # VTT 生成
│   ├── cost-estimator.ts      # 费用估算
│   └── hash.ts                # 哈希工具
└── types/
    └── index.ts               # 类型定义
```

---

## 7. 安全考虑

### 7.1 API Key 存储

- 使用 `chrome.storage.sync` 存储（扩展私有）
- Content Script 不直接接触 API Key
- 所有 API 调用在 Service Worker 中进行

### 7.2 数据隐私

- 字幕缓存仅存本地 (IndexedDB)
- 不上传任何用户数据到第三方服务器
- API 调用直连官方服务 (OpenAI/Google)

### 7.3 CSP 绕过

- 仅使用 Data URI 注入字幕内容
- 不注入可执行脚本
- 不修改页面原有功能

---

## 8. 验收标准对照

| 验收条件 | 文档位置 | 状态 |
|---------|---------|------|
| 架构图（CS/SW/Popup/Storage 交互） | 第 2.1 节 | ✅ |
| 模块职责文档明确各组件边界 | 第 3 节 | ✅ |
| API 调用流程图（从字幕抓取到注入） | 第 4.1 节 | ✅ |
| 评审通过 | 人工评审完成 | ✅ |

---

## 9. 后续步骤

1. ~~**评审**: 请团队/用户评审架构设计~~ ✅ 评审已完成
2. **实现顺序**:
   - Layer 3: 基础模块并行开发 (ACT-005, ACT-006, ACT-009, ACT-010)
   - Layer 4: LLM 翻译模块 (ACT-007)
   - Layer 5: 字幕注入 + 重译功能 (ACT-008, ACT-012)
   - Layer 6: 预加载 + E2E 测试 (ACT-011, ACT-015)

---

## 附录 A: 相关文档

- [spike-report-track-inject.md](./spike-report-track-inject.md) - Track 注入验证
- [spike-report-sw-lifecycle.md](./spike-report-sw-lifecycle.md) - MV3 生命周期验证
- [spike-report-next-lecture.md](./spike-report-next-lecture.md) - 下一课 ID 获取验证
- [record.json](./record.json) - 任务追踪

## 附录 B: 参考资料

- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [OpenAI Streaming API](https://platform.openai.com/docs/api-reference/streaming)
- [Video.js Text Tracks](https://videojs.com/guides/text-tracks/)
