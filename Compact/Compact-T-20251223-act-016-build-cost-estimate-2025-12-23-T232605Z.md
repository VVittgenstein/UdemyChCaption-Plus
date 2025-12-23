# Compact: T-20251223-act-016-build-cost-estimate

**Generated**: 2025-12-23T23:26:05Z  
**Task**: 实现 API 费用/字数估算显示  
**Status**: completed  
**Owner**: codex-cli  

---

## 1. 范围对齐

| 维度 | 内容 |
|------|------|
| Subtask ID | T-20251223-act-016-build-cost-estimate |
| 标题 | 实现 API 费用/字数估算显示 |
| Summary | R-03 风险缓解：翻译前显示预估 Token/费用；翻译后显示实际消耗并统计会话累计 |
| 依赖 | T-20251223-act-007-build-llm-translator；T-20251223-act-009-build-popup-settings |
| 验收标准 | 翻译前预估 Token 数；翻译前预估费用；翻译后实际 Token/费用；累计显示本次会话总费用 |
| 产出文件 | `src/utils/cost-estimator.ts`，`src/storage/session-cost.ts`，`src/background/service-worker.ts`，`src/popup/popup.*`，`src/types/index.ts` |

---

## 2. 已确认事实（代码 + 自测覆盖）

### 2.1 翻译前：预估 tokens/费用

- Service Worker 在发起翻译前（且 `settings.showCostEstimate === true`）调用 `estimateTranslationCost(vttContent, provider, model)` 计算：
  - cue 数、prompt/output/total token 估算、费用估算（USD）、预估批次数（按 10 分钟 batch 切分）。
  - 通过消息 `{ type: 'COST_ESTIMATE', payload: ... }` 同时广播给 Content Script 与 Popup。
- 预估结果会写入会话状态 `lastEstimate`（`chrome.storage.session`，fallback 内存），用于 Popup 打开后仍可回显。

### 2.2 翻译后：实际 tokens/费用 + 会话累计

- 翻译完成后，Service Worker 取 `translateVTT()` 返回的 `tokensUsed` / `estimatedCost` 作为“本次实际消耗”（缺失则按 0 处理）。
- 会话累计通过 `addSessionCost(deltaTokens, deltaCostUsd)` 更新 `totals.totalTokens` / `totals.totalCostUsd`，并写入 `lastActual`。
- `TRANSLATION_COMPLETE` payload 增加 `provider/model` 以及 `sessionTotalTokens/sessionTotalCostUsd`，用于 Popup 实时刷新“会话累计”。
- 缓存命中时（无需调用 LLM），Popup 会收到带历史 `tokensUsed/costUsd` 的 `CACHE_HIT` 消息用于展示“本次”（不增加会话累计）。

### 2.3 Popup：CostDisplay 展示与开关控制

- Popup 新增费用展示区块（“预估 / 本次 / 会话累计”三行），由 `showCostEstimate` 控制显隐。
- Popup 监听 `COST_ESTIMATE`、`CACHE_HIT`、`TRANSLATION_COMPLETE` 消息，更新展示内容（含 token 与 USD 格式化）。
- Popup 启动时若 `showCostEstimate` 开启，会读取 `chrome.storage.session` 的会话状态并渲染（支持“后打开”回显）。

### 2.4 模型列表一致性修正

- Popup 的模型选项更新为与当前翻译模块/SettingsManager一致的模型集合（OpenAI: `gpt-5.*`；Gemini: `gemini-3-*`/`gemini-2.5-*`），默认模型改为 `gpt-5.1`。

### 2.5 自测结果

- `npm test`：8 suites / 285 tests 通过 ✅（新增 `src/utils/__tests__/cost-estimator.test.ts`）
- `npm run type-check`：通过 ✅
- `npm run build`：通过 ✅（dist 输出同步更新）

---

## 3. 接口 & 行为变更（对下游影响）

### 3.1 新增消息类型：`COST_ESTIMATE`

- Background → Popup/Content：
  - `{ type: 'COST_ESTIMATE', payload: { taskId, provider, model, cueCount, estimatedPromptTokens, estimatedOutputTokens, estimatedTotalTokens, estimatedCostUsd, estimatedBatches } }`

### 3.2 扩展 `TRANSLATION_COMPLETE` payload

- `TranslateResult` 新增可选字段：
  - `provider?: 'openai' | 'gemini'`
  - `model?: string`
  - `sessionTotalTokens?: number`
  - `sessionTotalCostUsd?: number`

### 3.3 Popup 行为变更（配置层面）

- 模型下拉列表与默认值发生变化：默认从 `gpt-4o` → `gpt-5.1`；旧配置如保存了不在列表中的模型，Popup 下拉可能无法选中该值，需要用户重新选择。

---

## 4. 关键实现要点（事实快照）

- 定价与费用计算集中到 `src/utils/cost-estimator.ts`（按“每 1K tokens USD”简化口径；未知模型走默认值）。
- 会话统计采用 `chrome.storage.session`，key 为 `udemy-caption-plus:session-cost`；同时保留内存/本地存储 fallback（用于非扩展环境测试）。
- 估算逻辑沿用翻译模块内部的 VTT 解析/切分策略（按 10 分钟 batch 切分，逐 batch 估算 prompt tokens，output tokens 以 `prompt*1.2` 粗估）。

---

## 5. 显式限制 / 风险 / 未完成 TODO（仅陈述已知边界）

- 费用/Token 估算为启发式：与真实计费可能存在偏差（未区分 input/output 不同单价；未知模型使用默认单价）。
- 若上游 API 未返回 usage，`tokensUsed/estimatedCost` 可能为 0，从而影响“本次实际消耗”的准确性。
- 当前未提供“清空会话累计”的 UI（不在本 Subtask 验收范围内）。

