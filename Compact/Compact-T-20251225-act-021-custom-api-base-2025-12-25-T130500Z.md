# Compact: T-20251225-act-021-custom-api-base

**Task**: 支持自定义 API Base URL
**Type**: feature
**Status**: completed
**Generated**: 2025-12-25T13:05:00Z

---

## 1. 已确认事实 (Verified Facts)

### 1.1 类型定义变更
- `UserSettings` 接口新增两个必填字段：
  - `openaiBaseUrl: string` - 自定义 OpenAI 兼容端点
  - `geminiBaseUrl: string` - 自定义 Gemini 兼容端点
- 空字符串 `''` 表示使用官方默认端点

### 1.2 默认值配置
- `DEFAULT_SETTINGS` 新增：
  ```typescript
  openaiBaseUrl: '',  // 默认 https://api.openai.com/v1
  geminiBaseUrl: '',  // 默认 https://generativelanguage.googleapis.com/v1beta
  ```

### 1.3 API 客户端改造
- **openai-client.ts**:
  - 常量重命名：`OPENAI_API_BASE` → `OPENAI_DEFAULT_BASE`
  - `OpenAIRequestOptions.baseUrl?: string` 新增可选参数
  - `chatCompletion()` 使用 `effectiveBaseUrl = baseUrl?.trim() || OPENAI_DEFAULT_BASE`
  - `validateApiKey(apiKey, baseUrl?)` 签名变更，支持自定义端点验证

- **gemini-client.ts**:
  - 常量重命名：`GEMINI_API_BASE` → `GEMINI_DEFAULT_BASE`
  - `GeminiRequestOptions.baseUrl?: string` 新增可选参数
  - `generateContent()` 使用 `effectiveBaseUrl = baseUrl?.trim() || GEMINI_DEFAULT_BASE`
  - `validateApiKey(apiKey, baseUrl?)` 签名变更

### 1.4 翻译服务改造
- **translator.ts**:
  - `TranslationOptions.baseUrl?: string` 新增可选参数
  - `callLLM()` 签名新增 `baseUrl` 参数，传递给底层客户端
  - `translateBatchWithRetry()` 签名新增 `baseUrl` 参数
  - `translateVTT()` 从 options 解构 baseUrl 并逐层传递

### 1.5 Popup UI 改造
- **popup.html**:
  - 新增可折叠区域 `#toggle-api-advanced` + `#api-advanced-content`
  - 包含 `#openaiBaseUrl` 和 `#geminiBaseUrl` 输入框
  - Placeholder 显示官方默认值

- **popup.css**:
  - 新增 `.collapsible-section`, `.collapsible-toggle`, `.collapsible-content` 等样式
  - 支持展开/收起动画（箭头旋转）

- **popup.ts**:
  - `DOMElements` 接口新增 4 个元素引用
  - `validateApiKey(provider, apiKey, customBaseUrl?)` 签名变更
  - 自定义端点时跳过 `sk-` 前缀格式检查
  - `validateOpenAIKey/validateGeminiKey` 接受 baseUrl 参数
  - 错误提示区分官方/自定义端点场景
  - `populateForm()` / `getFormValues()` 处理新字段
  - `handleApiAdvancedToggle()` 处理折叠展开

---

## 2. 接口 & 行为变更 (Interface Changes)

| 模块 | 变更类型 | 影响范围 |
|------|---------|---------|
| `UserSettings` | 新增 2 个必填字段 | 所有读取设置的模块需兼容 |
| `OpenAIRequestOptions` | 新增可选 `baseUrl` | API 调用方可传递自定义端点 |
| `GeminiRequestOptions` | 新增可选 `baseUrl` | API 调用方可传递自定义端点 |
| `TranslationOptions` | 新增可选 `baseUrl` | 翻译调用方可传递自定义端点 |
| `validateApiKey()` | 签名变更 (3 参数) | popup.ts 已适配 |

### 向后兼容性
- 新字段有默认值 `''`，现有用户设置自动兼容
- API 客户端 `baseUrl` 为可选参数，不影响现有调用

---

## 3. 关键实现要点 (Key Implementation Points)

1. **URL 解析逻辑**：`effectiveBaseUrl = baseUrl?.trim() || DEFAULT_BASE`
2. **格式检查跳过**：`hasCustomUrl && !apiKey.startsWith('sk-')` 不报错
3. **错误提示优化**：自定义端点网络错误提示 "无法连接到自定义端点，请检查 URL 是否正确"
4. **UI 折叠状态**：通过 `.hidden` class 和 `.expanded` class 控制

---

## 4. 自测验证 (Verification)

| 验证项 | 状态 |
|--------|------|
| `npm run build` | PASS |
| 类型检查通过 | PASS (构建成功) |
| 输出文件生成 | PASS (dist/) |

---

## 5. 风险 & TODO (Risks & TODOs)

### 显式限制
- URL 输入框为 `type="url"`，但未做严格格式校验（依赖浏览器原生校验）
- 未对自定义端点做超时或重试策略调整

### 未完成项
- [ ] 端到端测试：实际使用 ohmygpt 等第三方服务验证
- [ ] URL 尾部斜杠处理：用户可能输入 `https://api.ohmygpt.com/v1/` 带尾部斜杠
- [x] ~~Code Review P1: translateVTT 调用缺失 baseUrl 参数~~ (已修复)

### 潜在风险
- 第三方服务的 `/models` 端点响应格式可能与官方不同，验证可能误报

---

## 6. 文件变更清单 (Changed Files)

| 文件路径 | 变更类型 |
|---------|---------|
| `src/types/index.ts` | 类型新增 |
| `src/storage/settings-manager.ts` | 默认值新增 |
| `src/services/openai-client.ts` | 接口扩展 |
| `src/services/gemini-client.ts` | 接口扩展 |
| `src/services/translator.ts` | 参数透传 |
| `src/popup/popup.html` | UI 新增 |
| `src/popup/popup.css` | 样式新增 |
| `src/popup/popup.ts` | 逻辑新增 |
| `src/background/service-worker.ts` | baseUrl 参数传递 (P1 修复) |
| `src/services/preloader.ts` | baseUrl 参数传递 (P1 修复) |
| `record.json` | 任务记录 |

---

## 7. 依赖关系 (Dependencies)

- **上游依赖**: T-20251223-act-020-chrome-store-prep (已完成)
- **下游影响**: 无（新增功能，不破坏现有流程）

## Code Review - T-20251225-act-021-custom-api-base - 2025-12-25T20:49:19Z

---review-start---
{
  "findings": [
    {
      "title": "[P1] Custom API base URLs are never used",
      "body": "The new settings/UI for `openaiBaseUrl`/`geminiBaseUrl` and the updated clients support custom endpoints, but the translation entry point still calls `translateVTT` without passing any `baseUrl`. Users who configure a proxy or self-hosted endpoint will still hit the default OpenAI/Gemini URLs, so custom endpoints cannot work (also affects preloading, which calls the same helper). Pass the provider-specific base URL from settings into `translateVTT`.",
      "confidence_score": 0.42,
      "priority": 1,
      "code_location": {
        "absolute_file_path": "/mnt/z/Project/UdemyChCaption-Plus/dist/background/service-worker.js",
        "line_range": {
          "start": 2483,
          "end": 2493
        }
      }
    }
  ],
  "overall_correctness": "patch is incorrect",
  "overall_explanation": "Custom API endpoint support is not wired through the translation path, so the primary new feature does not work when users configure custom base URLs.",
  "overall_confidence_score": 0.42
}
---review-end---

## Code Review Fix - 2025-12-25T20:55:00Z

### [P1] Custom API base URLs are never used - FIXED

**问题**: `translateVTT` 调用时未传递 `baseUrl` 参数，导致自定义端点配置无法生效。

**修复方案**: 在两处调用 `translateVTT` 的地方添加 `baseUrl` 参数传递：

1. **service-worker.ts** (line 149-155):
   ```typescript
   const baseUrl = provider === 'openai' ? settings.openaiBaseUrl : settings.geminiBaseUrl;

   const result = await translateVTT(vttContent, {
     provider,
     apiKey,
     model,
     baseUrl: baseUrl || undefined,
     // ...
   });
   ```

2. **preloader.ts** (line 365-371):
   ```typescript
   const baseUrl = settings.provider === 'openai' ? settings.openaiBaseUrl : settings.geminiBaseUrl;

   const result = await translateVTT(originalVtt, {
     provider: settings.provider,
     apiKey: settings.apiKey,
     model: settings.model,
     baseUrl: baseUrl || undefined,
     // ...
   });
   ```

**验证**: TypeScript 编译通过（仅有不相关的 popup.ts 未使用变量警告）

| 文件 | 变更类型 |
|-----|---------|
| `src/background/service-worker.ts` | 添加 baseUrl 参数 |
| `src/services/preloader.ts` | 添加 baseUrl 参数 |
