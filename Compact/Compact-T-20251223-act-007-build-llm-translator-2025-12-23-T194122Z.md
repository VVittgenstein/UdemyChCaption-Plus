# Compact: T-20251223-act-007-build-llm-translator

**生成时间**: 2025-12-23T19:41:22Z
**更新时间**: 2025-12-23T19:55:00Z
**状态**: Completed (Refactored + Simplified)

---

## 1. 范围对齐

| 属性 | 值 |
|------|-----|
| Subtask ID | T-20251223-act-007-build-llm-translator |
| 任务描述 | LLM 翻译模块 (重构) |
| 验收标准 | 直接 VTT 翻译、时长分批、多模型支持、超时/重试处理 |
| 依赖 | ACT-004 (架构设计), ACT-006 (WebVTT 解析器) |
| 产出文件 | `src/services/translator.ts`, `src/services/__tests__/translator.test.ts`, `src/storage/settings-manager.ts` |

---

## 2. 已确认事实

### 2.1 核心实现 (translator.ts - 850 行)

| 功能 | 实现状态 | 验证方式 |
|------|---------|---------|
| **新翻译方案** | ✅ 已实现 | 直接 VTT 输入 → LLM → 完整 VTT 输出 |
| **时长分批** | ✅ 已实现 | `splitVTTByDuration()` - 默认 10 分钟/批 |
| **VTT 响应解析** | ✅ 已实现 | `parseTranslatedVTTResponse()` - 清理 markdown、提取 WEBVTT |
| **VTT 验证** | ✅ 已实现 | `validateTranslatedVTT()` - cue 数量 + 时间戳匹配 |
| **重试机制** | ✅ 已实现 | 指数退避, 默认 2 次重试 |
| **固定翻译目标** | ✅ 已实现 | 英文→简体中文，移除语言参数简化接口 |
| **课程上下文** | ✅ 已实现 | `buildSystemPrompt(context?)` 支持课程/章节/讲座信息 |
| **费用估算** | ✅ 已实现 | `estimateTranslationCost()` - 翻译前估算 |
| **双 Provider** | ✅ 已实现 | OpenAI + Gemini API 支持 |

### 2.2 支持模型

```typescript
// OpenAI GPT-5 系列
'gpt-5.2': 0.01,   // $0.01/1K tokens
'gpt-5.1': 0.008,  // $0.008/1K tokens (默认)
'gpt-5-pro': 0.015,
'gpt-5': 0.006,

// Gemini 3.x / 2.5 系列
'gemini-3-pro-preview': 0.005,
'gemini-3-flash-preview': 0.001,
'gemini-2.5-pro': 0.003,
'gemini-2.5-flash': 0.0005,
```

### 2.3 测试覆盖 (60 tests, 全部通过)

| 类别 | 测试数 | 状态 |
|------|--------|------|
| Prompt 构建 | 8 | ✅ |
| 时长分批 splitVTTByDuration | 5 | ✅ |
| 时长计算 getVTTDurationSpan | 2 | ✅ |
| VTT 响应解析 | 6 | ✅ |
| VTT 验证 | 3 | ✅ |
| Token/费用估算 | 11 | ✅ |
| 翻译流程 translateVTT | 12 | ✅ |
| 工具函数 | 2 | ✅ |
| Translator 类 | 8 | ✅ |
| settings-manager 更新 | 3 | ✅ |

---

## 3. 接口 & 行为变更

### 3.1 新增导出接口

```typescript
// 主翻译函数 (新方案)
export async function translateVTT(
  vttContent: string,
  options: TranslationOptions
): Promise<TranslationResult>

// 时长分批
export function splitVTTByDuration(
  vttFile: VTTFile,
  maxDurationMs: number
): VTTFile[]

// VTT 响应解析
export function parseTranslatedVTTResponse(response: string): {
  success: boolean;
  vttFile?: VTTFile;
  error?: string;
}

// VTT 验证
export function validateTranslatedVTT(
  original: VTTFile,
  translated: VTTFile
): ValidationResult

// Prompt 构建 (固定英文→中文翻译)
export function buildSystemPrompt(courseContext?: CourseContext): string

export function buildUserPrompt(vttContent: string): string
```

### 3.2 核心类型

```typescript
interface TranslationOptions {
  provider: 'openai' | 'gemini';
  apiKey: string;
  model: string;
  courseContext?: CourseContext;
  timeout?: number;             // 默认 120000 (2分钟)
  maxRetries?: number;          // 默认 2
  temperature?: number;         // 默认 0.3
  maxBatchDurationMs?: number;  // 默认 600000 (10分钟)
  signal?: AbortSignal;
}

// 注意: 翻译目标已硬编码为 English → Chinese (简体中文)
// 移除了 sourceLanguage 和 targetLanguage 参数

interface TranslationResult {
  success: boolean;
  translatedVTT?: string;
  translatedVTTFile?: VTTFile;
  error?: string;
  errorCode?: string;
  tokensUsed?: number;
  promptTokens?: number;
  completionTokens?: number;
  estimatedCost?: number;
  model?: string;
  cueCount?: number;
  batchCount?: number;
  durationMs?: number;
}
```

### 3.3 settings-manager.ts 变更

```typescript
// 更新 PROVIDER_MODELS (移除旧模型，添加 GPT-5.x / Gemini 2.5/3.x)
// 更新 DEFAULT_SETTINGS.model: 'gpt-5.1'
```

### 3.4 对下游模块的影响

| 模块 | 影响 | 集成要求 |
|------|------|---------|
| ACT-008 字幕注入 | 高 | 使用 `translateVTT()` 翻译字幕 |
| ACT-010 本地缓存 | 中 | 存储 `TranslationResult.translatedVTT` |
| Service Worker | 中 | 处理翻译请求消息 |
| Popup 设置 | 低 | `PROVIDER_MODELS` 已更新 |

---

## 4. 关键实现要点

### 4.1 翻译流程

```
1. parseVTT(vttContent)          → 解析输入 VTT
2. splitVTTByDuration(vttFile)   → 按 10 分钟分批
3. for each batch:
   a. generateVTT(batch)         → 批次 VTT 字符串
   b. buildSystemPrompt/UserPrompt
   c. callLLM()                  → 调用 API
   d. parseTranslatedVTTResponse → 解析 LLM 输出
   e. validateTranslatedVTT      → 验证时间戳匹配
   f. 失败则重试 (最多 2 次)
4. mergeVTTFiles(batches)        → 合并所有批次
5. 返回 TranslationResult
```

### 4.2 VTT 验证规则

1. **Cue 数量匹配**: 原始 VTT 与翻译 VTT cue 数量必须相同
2. **时间戳匹配**: 每个 cue 的 startTime/endTime 必须完全一致
3. 验证失败 → 触发重试

### 4.3 错误码定义

| errorCode | 含义 |
|-----------|------|
| PARSE_ERROR | 输入 VTT 解析失败 |
| EMPTY_CONTENT | VTT 无 cue |
| CANCELLED | 用户取消 |
| BATCH_FAILED | 批次翻译失败 |
| PARSE_RESPONSE_ERROR | LLM 响应解析失败 |
| VALIDATION_ERROR | VTT 验证失败 |
| INVALID_API_KEY | API Key 无效 |

---

## 5. 显式限制 / 风险 / TODO

### 5.1 已知限制

| 限制 | 说明 |
|------|------|
| 无断点续传 | 中断后需重新翻译整个文件 |
| 批次独立翻译 | 跨批次术语一致性依赖 LLM 能力 |
| 模型定价为估算值 | 需根据官方最新价格调整 |

### 5.2 风险

| 风险 | 缓解措施 | 状态 |
|------|---------|------|
| LLM 修改时间戳 | `validateTranslatedVTT()` + 重试 | ✅ 已实现 |
| LLM 输出非 VTT 格式 | `parseTranslatedVTTResponse()` + 重试 | ✅ 已实现 |
| 长视频分批上下文丢失 | 每批独立翻译，依赖 LLM 一致性 | ⚠️ 接受风险 |
| 新模型 API 兼容性 | 需真实 API 测试 | ⚠️ 待验证 |

### 5.3 TODO (下游集成)

- [ ] ACT-008: 字幕注入模块调用 `translateVTT()`
- [ ] ACT-010: 本地缓存存储翻译结果
- [ ] Service Worker: 消息处理集成
- [ ] 真实 API 端到端测试

---

## 6. 验收状态

| 验收标准 | 状态 |
|---------|------|
| 支持 OpenAI / Gemini 双 Provider | ✅ |
| 直接 VTT 翻译 (新方案) | ✅ |
| 时长分批 (10 分钟/批) | ✅ |
| VTT 响应验证 | ✅ |
| 超时处理 (120s) | ✅ |
| 重试机制 (2 次) | ✅ |
| 费用估算 | ✅ |
| 单元测试 (60 tests) | ✅ |

---

## 7. 自测结果

```
Test Suites: 5 passed, 5 total
Tests:       223 passed, 223 total
Time:        5.029 s
```

**translator.test.ts**: 60 tests passed
**settings-manager.test.ts**: 34 tests passed (含模型更新)

---

## 8. 文件变更摘要

| 文件 | 行数 | 变更类型 |
|------|------|---------|
| `src/services/translator.ts` | 850 | 完全重写 |
| `src/services/__tests__/translator.test.ts` | ~600 | 完全重写 |
| `src/storage/settings-manager.ts` | 331 | 更新模型列表 |
| `src/storage/__tests__/settings-manager.test.ts` | 385 | 更新模型引用 |
