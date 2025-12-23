# Compact: T-20251223-act-012-build-retranslate

**Generated**: 2025-12-23T22:44:20Z  
**Task**: 实现字幕版本检测与重译功能 (FR-08)  
**Status**: completed  
**Owner**: codex-cli  

---

## 1. 范围对齐

| 维度 | 内容 |
|------|------|
| Subtask ID | T-20251223-act-012-build-retranslate |
| 标题 | 实现字幕版本检测与重译功能 |
| Summary | 支持字幕更新与用户手动刷新：当原字幕版本变化或用户主动触发时重新翻译，并更新缓存 |
| 依赖 | T-20251223-act-007-build-llm-translator；T-20251223-act-010-build-local-cache |
| 验收标准 | 检测原字幕哈希变化；原字幕更新触发重译并更新缓存；Popup 提供“重新翻译当前课”按钮；点击后覆盖缓存；重译过程显示进度提示 |
| 产出文件 | `src/services/version-checker.ts`，`src/background/service-worker.ts`，`src/content/content-script.ts`，`src/popup/popup.*`，`src/utils/hash.ts`，`src/types/index.ts` |

---

## 2. 已确认事实（代码 + 自测覆盖）

### 2.1 字幕版本检测与重译决策

- 已实现 `checkSubtitleVersion()`：基于 `originalHash` 与 IndexedDB 缓存条目 `originalHash` 对比，输出 `use_cache` / `retranslate` 决策与原因（`cache_valid/cache_miss/hash_changed/force`）。(src/services/version-checker.ts)
- 支持 `force: true` 强制重译（即使 hashMatch 为 true 也会走重译分支）。(src/services/version-checker.ts)

### 2.2 重译触发链路（Popup → Content Script → Service Worker）

- Popup：新增“重新翻译当前课”按钮，向当前激活 Udemy Tab 发送 `{ type: 'RETRANSLATE_CURRENT', payload: { taskId } }`。重译期间禁用按钮并更新状态提示。(src/popup/popup.html, src/popup/popup.ts, src/popup/popup.css)
- Content Script：收到 `RETRANSLATE_CURRENT` 后抓取字幕（含 hash），向后台发送 `TRANSLATE_SUBTITLE`，并在收到 `CACHE_HIT/TRANSLATION_COMPLETE` 时注入中文轨道。 (src/content/content-script.ts)
- Service Worker：收到 `TRANSLATE_SUBTITLE` 后先走版本校验；缓存有效则直接回 `CACHE_HIT`，否则调用 `translateVTT()` 并将结果写入 `subtitleCache`（覆盖旧缓存）。(src/background/service-worker.ts)

### 2.3 进度提示

- `translateVTT()` 新增 `onProgress(progress: number)`，按 batch 完成度回调（0→100）。(src/services/translator.ts)
- Service Worker 将 `TRANSLATION_PROGRESS/TRANSLATION_COMPLETE` 同时广播到 Tab（Content Script）与 Popup（用于 UI 展示）。(src/background/service-worker.ts, src/popup/popup.ts)

### 2.4 Hash 计算复用

- 新增通用 `calculateHash()`（优先 SHA-256，缺失 `crypto.subtle` 时 fallback 到 simpleHash），并在字幕抓取模块复用，确保 cache 校验用同一套 hash 逻辑。(src/utils/hash.ts, src/content/subtitle-fetcher.ts)

### 2.5 自测结果

- `npm test`：7 suites / 282 tests 通过 ✅
- `npm run type-check`：通过 ✅
- 新增测试：5 个（version-checker 4 个 + translator progress 1 个）(src/services/__tests__/version-checker.test.ts, src/services/__tests__/translator.test.ts)

---

## 3. 接口 & 行为变更（对下游影响）

### 3.1 新增公共 API

```ts
// src/services/version-checker.ts
checkSubtitleVersion(params: VersionCheckParams): Promise<VersionCheckResult>

// src/utils/hash.ts
calculateHash(content: string): Promise<string>

// src/services/translator.ts
TranslationOptions.onProgress?: (progress: number) => void
```

### 3.2 消息协议字段扩展（types）

- `TranslateRequest` 新增可选字段：`originalHash?: string`, `lectureName?: string`, `force?: boolean` (src/types/index.ts)
- `TranslateResult` 新增：`taskId?: string` (src/types/index.ts)
- `MessageToContent.CACHE_HIT` payload 新增：`taskId?: string` (src/types/index.ts)

---

## 4. 关键实现要点（事实快照）

- 版本校验发生在后台翻译入口：`checkSubtitleVersion()` 决定 cache hit 直返或进入重译；重译成功后通过 `subtitleCache.set(...)` 覆盖旧缓存。(src/background/service-worker.ts)
- 进度粒度以 batch 为单位：单批字幕场景下进度主要表现为 0→100（无 token-level 细粒度进度）。(src/services/translator.ts)

---

## 5. 显式限制 / 风险 / 未完成 TODO（仅陈述已知边界）

- 仅在触发翻译请求时进行 hash 校验；不存在“后台持续监听字幕版本变化并自动触发重译”的常驻监听机制（字幕变化需下一次翻译触发才会生效）。
- Extension 入口点已新增为 `src/content/content-script.ts` 与 `src/background/service-worker.ts`，但仓库未包含 manifest 侧的声明/装配细节（需在 Manifest V3 中声明 content scripts 与 service worker 才能在浏览器中运行）。

