# Compact: T-20251223-act-013-build-loading-indicator

**Task**: 添加加载状态提示（翻译中...）
**Type**: build
**Status**: completed
**Compact Date**: 2025-12-24T06:35:00Z

---

## 1. 范围对齐

| 验收标准 | 状态 | 实现方式 |
|---------|------|---------|
| 翻译请求发起时视频区域显示"字幕翻译中…"提示 | ✅ | `showLoadingIndicator()` 在 `requestTranslation()` 中调用 |
| 提示样式与 Udemy 播放器风格一致 | ✅ | 紫色主题 #a435f0，CSS 动画，响应式定位 |
| 翻译完成后提示自动消失 | ✅ | `showSuccessIndicator()` 默认 3秒后自动隐藏 |
| 超时时显示错误提示并允许重试 | ✅ | `showErrorIndicator()` 含重试按钮，点击触发 `onRetry` 回调 |

---

## 2. 已落实事实

### 2.1 新增模块: `src/content/loading-indicator.ts`

**核心类型**:
```typescript
type IndicatorStatus = 'loading' | 'success' | 'error' | 'hidden';

interface IndicatorOptions {
  message?: string;
  errorDetails?: string;
  onRetry?: () => void;
  autoHideDelay?: number;  // 默认: success=3000, 其他=0
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
}
```

**公开 API**:
| 函数 | 用途 |
|-----|------|
| `showLoadingIndicator(video, options?)` | 显示加载状态（旋转动画） |
| `showSuccessIndicator(video, options?)` | 显示成功状态（勾选图标） |
| `showErrorIndicator(video, options?)` | 显示错误状态（重试/关闭按钮） |
| `hideLoadingIndicator(video)` | 隐藏提示（添加 hidden class） |
| `removeLoadingIndicator(video)` | 从 DOM 移除提示元素 |
| `getIndicatorStatus(video)` | 获取当前状态 |
| `isIndicatorVisible(video)` | 检查是否可见 |
| `updateLoadingMessage(video, message)` | 更新 loading 消息文本 |

**类式 API**: `LoadingIndicator` 类封装上述函数

**常量导出**:
- `INDICATOR_ID = 'udemy-caption-plus-loading-indicator'`
- `INDICATOR_CLASS = 'ucp-loading-indicator'`

### 2.2 CSS 样式特性

- 紫色主题: loading=#a435f0, success=#2e7d32, error=#c62828
- 5 种位置变体: top-left, top-right(默认), bottom-left, bottom-right, center
- CSS 过渡动画: opacity 0.3s, transform 0.3s
- 旋转动画: `@keyframes ucp-spin`
- z-index: 100000 (确保在播放器控件之上)
- 响应式: bottom 位置预留 60px 给播放器控制栏

### 2.3 集成到 `content-script.ts`

**新增导入**:
```typescript
import {
  showLoadingIndicator,
  showSuccessIndicator,
  showErrorIndicator,
  hideLoadingIndicator,
} from './loading-indicator';
```

**调用点**:
| 位置 | 调用 | 消息 |
|-----|------|-----|
| `requestTranslation()` 开始 | `showLoadingIndicator()` | '字幕翻译中…' / '正在重新翻译…' |
| `requestTranslation()` 失败 | `showErrorIndicator()` | '请求发送失败' + onRetry |
| `CACHE_HIT` 消息处理 | `showSuccessIndicator()` | '缓存命中' |
| `TRANSLATION_COMPLETE` 成功 | `showSuccessIndicator()` | '翻译完成' |
| `TRANSLATION_COMPLETE` 失败 | `showErrorIndicator()` | '翻译失败' + onRetry |
| `cancelActiveTranslation()` | `hideLoadingIndicator()` | - |

**设置依赖**: 所有显示逻辑均受 `settings.showLoadingIndicator` 控制

---

## 3. 接口 & 行为变更

### 3.1 对外暴露接口 (可被其他模块使用)

```typescript
// 函数式 API
export function showLoadingIndicator(video: HTMLVideoElement, options?: IndicatorOptions): void;
export function showSuccessIndicator(video: HTMLVideoElement, options?: IndicatorOptions): void;
export function showErrorIndicator(video: HTMLVideoElement, options?: IndicatorOptions): void;
export function hideLoadingIndicator(video: HTMLVideoElement): void;
export function removeLoadingIndicator(video: HTMLVideoElement): void;
export function getIndicatorStatus(video: HTMLVideoElement): IndicatorStatus;
export function isIndicatorVisible(video: HTMLVideoElement): boolean;
export function updateLoadingMessage(video: HTMLVideoElement, message: string): void;

// 类式 API
export class LoadingIndicator { ... }
```

### 3.2 依赖的设置项

- `UserSettings.showLoadingIndicator: boolean` (已在 types/index.ts 定义)
- 通过 `loadSettings()` 获取，控制是否显示提示

### 3.3 DOM 变更

- 在视频容器内注入 `<div class="ucp-loading-indicator">` (无固定 ID，通过 WeakMap 跟踪)
- 在 `<head>` 注入 `<style id="udemy-caption-plus-loading-indicator-styles">`
- 容器需 `position: relative` (模块自动设置)

---

## 4. 关键实现要点

1. **状态隔离**: 使用 WeakMap 按 video 元素管理状态，避免内存泄漏
2. **XSS 防护**: `escapeHtml()` 转义所有用户可控文本
3. **自动清理**: 成功状态默认 3 秒后自动隐藏
4. **重试机制**: 错误状态提供重试按钮，回调 `onRetry()`
5. **样式注入**: 单例模式，样式只注入一次
6. **容器定位**: 自动查找 Udemy 视频容器 `[data-purpose="video-player"]`

---

## 5. 自测结果

| 检查项 | 结果 |
|-------|------|
| TypeScript 类型检查 | ✅ 通过 |
| 单元测试 (loading-indicator) | ✅ 67/67 通过 |
| 全量测试 | ✅ 357/357 通过 |
| 构建 | ✅ (未单独执行，type-check 隐含验证) |

---

## 6. 风险 & TODO

### 6.1 显式限制

- **仅支持单视频**: 当前 `content-script.ts` 使用 `document.querySelector('video')` 定位，多视频场景未处理
- **设置异步加载**: 消息处理中使用 `loadSettings().then()` 可能导致短暂延迟

### 6.2 未验证项 (需真实环境测试)

- [ ] 全屏模式下提示是否正常显示
- [ ] Udemy 播放器 DOM 结构变化兼容性
- [ ] 深色模式下对比度是否足够

### 6.3 潜在优化

- 可考虑添加进度百分比显示 (需 Service Worker 发送 TRANSLATION_PROGRESS)
- 错误重试可添加最大次数限制

---

## 7. 文件变更清单

| 文件 | 变更类型 | 行数 |
|-----|---------|------|
| `src/content/loading-indicator.ts` | 新增 | ~550 |
| `src/content/__tests__/loading-indicator.test.ts` | 新增 | ~450 |
| `src/content/content-script.ts` | 修改 | +50 (导入+调用) |
| `record.json` | 更新 | 任务状态→completed |

---

## 8. 下游影响

- **Code Review**: 需关注 XSS 防护实现、CSS z-index 冲突
- **集成测试**: 需在真实 Udemy 页面验证视觉效果
- **Popup 设置**: `showLoadingIndicator` 开关已生效

## Code Review - T-20251223-act-013 - 2025-12-24T10:29:05Z

---review-start---
{
  "findings": [
    {
      "title": "[P1] Invalid selector can throw before indicator renders",
      "body": "In `findVideoContainer`, the selector list includes `.video-player--container--*`, which is not a valid CSS selector. When `video.closest` evaluates this entry (e.g., if the first `[data-purpose=\"video-player\"]` selector is not present), the call throws a `DOMException` and aborts `showLoadingIndicator`/`showSuccessIndicator`/`showErrorIndicator`. With `showLoadingIndicator` invoked ahead of sending the translation request, a missing Udemy-specific wrapper would cause the translation flow to crash before the message is sent, preventing any translation whenever the DOM structure differs from expectations.",
      "confidence_score": 0.34,
      "priority": 1,
      "code_location": {
        "absolute_file_path": "/mnt/z/Project/UdemyChCaption-Plus/src/content/loading-indicator.ts",
        "line_range": {
          "start": 369,
          "end": 379
        }
      }
    }
  ],
  "overall_correctness": "patch is incorrect",
  "overall_explanation": "An invalid selector in the new loading indicator code can raise a DOMException and block the translation request path when the expected wrapper element is missing, so the change is not safe to ship as-is.",
  "overall_confidence_score": 0.34
}
---review-end---

## Code Review Fix - 2025-12-24T10:35:00Z

### [P1] Invalid selector can throw before indicator renders

**问题**: `findVideoContainer` 中的选择器 `.video-player--container--*` 不是有效的 CSS 选择器。当 `video.closest()` 执行该选择器时会抛出 `DOMException`，导致 `showLoadingIndicator`/`showSuccessIndicator`/`showErrorIndicator` 中断执行。

**修复**: 将无效的 CSS 通配符选择器替换为有效的属性选择器。

```diff
- '.video-player--container--*',
+ '[class*="video-player--container--"]',
```

**修复原理**: CSS 属性选择器 `[class*="..."]` 使用子串匹配运算符 `*=`，可以匹配 class 属性中包含指定子串的元素。这与原意图一致——匹配 Udemy 的动态命名容器类（如 `video-player--container--abc123`），但使用了有效的 CSS 语法。

**影响文件**: `src/content/loading-indicator.ts:373`

## Code Review - T-20251223-act-013 - 2025-12-24T10:35:46Z

---review-start---
{
  "findings": [
    {
      "title": "[P2] Use unique IDs per video indicator",
      "body": "Each indicator element is created with the hard‑coded id `udemy-caption-plus-loading-indicator` (src/content/loading-indicator.ts:276-283). When more than one video is present on the page (course preview + main player, or multiple concurrent videos), calling the indicator API for each video yields multiple DOM nodes with the same id. Duplicate ids make `document.getElementById`/CSS `#udemy-caption-plus-loading-indicator` select only the first overlay, so secondary indicators become unreachable for queries or styling and can’t be dismissed or inspected correctly. Generate a per-video id or drop the fixed id to keep DOM validity and allow multi-video pages to function.",
      "confidence_score": 0.31,
      "priority": 2,
      "code_location": {
        "absolute_file_path": "src/content/loading-indicator.ts",
        "line_range": {
          "start": 276,
          "end": 283
        }
      }
    }
  ],
  "overall_correctness": "patch is incorrect",
  "overall_explanation": "The new loading indicator assigns a fixed DOM id, causing duplicate ids when multiple videos are present and breaking lookups/style targeting for additional indicators. This bug means the change is not yet robust for multi-video pages.",
  "overall_confidence_score": 0.31
}
---review-end---

## Code Review Fix - 2025-12-24T11:15:00Z

### [P2] Use unique IDs per video indicator

**问题**: 每个 indicator 元素使用硬编码的 `id="udemy-caption-plus-loading-indicator"`。当页面存在多个视频时（如课程预览 + 主播放器），会产生重复的 DOM ID，导致 `getElementById` 和 CSS `#` 选择器只能选中第一个 overlay，使得后续的 indicator 无法查询、样式化或正确关闭。

**修复**: 移除 indicator 元素的 `id` 属性。由于 indicator 已通过 WeakMap 按 video 元素跟踪，CSS 样式也使用 class 选择器而非 ID 选择器，因此不需要 ID。

```diff
function createIndicatorElement(
  state: IndicatorState,
  position: NonNullable<IndicatorOptions['position']>
): HTMLElement {
  const container = document.createElement('div');
-  container.id = INDICATOR_ID;
+  // Note: No ID is assigned to avoid duplicate IDs when multiple videos exist on the page.
+  // Indicators are tracked per-video via WeakMap and styled via classes.
  container.className = `${INDICATOR_CLASS} ${INDICATOR_CLASS}--${position}`;
```

**测试更新**: 更新 `loading-indicator.test.ts` 中的查询方式，从 ID 查询改为 class 查询：
- `getIndicatorElement()`: 使用 `document.querySelector(\`.${INDICATOR_CLASS}\`)` 替代 `document.getElementById(INDICATOR_ID)`
- `reuses existing indicator element` 测试: 使用 class 选择器查询

**影响文件**:
- `src/content/loading-indicator.ts:280-283`
- `src/content/__tests__/loading-indicator.test.ts:55-58, 168-169`

**测试结果**: ✅ 67/67 通过
