# Compact: T-20251223-act-009-build-popup-settings

**生成时间**: 2025-12-23T18:19:06Z
**任务类型**: build
**状态**: completed

---

## 1. 范围对齐

| 字段 | 值 |
|------|-----|
| Subtask ID | T-20251223-act-009-build-popup-settings |
| 标题 | 实现 Popup 设置面板（API Key / 模型选择 / 开关） |
| 依赖 | ACT-004 (架构设计) - 已完成 |
| 产出物 | `src/popup/popup.html`, `src/popup/popup.ts`, `src/popup/popup.css`, `src/storage/settings-manager.ts` |

---

## 2. 已确认事实 (Verified Facts)

### 2.1 UI 组件实现

| 组件 | 实现方式 | 状态 |
|------|----------|------|
| 翻译服务选择 | `<select id="provider">` (openai/gemini) | ✅ |
| API Key 输入 | `<input type="password">` + 可见性切换 | ✅ |
| 模型选择 | `<select id="model">` 动态更新 | ✅ |
| 保存并验证按钮 | 带 loading 状态的表单提交 | ✅ |
| 字幕替换主开关 | Toggle Switch (CSS 实现) | ✅ |
| 高级设置 | 4 个 checkbox (autoTranslate, preload, cost, loading) | ✅ |

### 2.2 API 验证逻辑

```typescript
// 验证端点
const API_ENDPOINTS = {
  openai: 'https://api.openai.com/v1/models',      // GET + Bearer token
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models', // GET + ?key=
};

// OpenAI Key 格式校验: 必须以 "sk-" 开头
// 错误状态码处理: 401 (无效), 429 (限流), 其他
```

### 2.3 存储架构

```typescript
// 存储位置
chrome.storage.sync  // 扩展环境
localStorage         // 开发/测试降级

// UserSettings Schema (已在 types/index.ts 定义)
interface UserSettings {
  provider: 'openai' | 'gemini';
  apiKey: string;
  model: string;
  enabled: boolean;
  autoTranslate: boolean;
  preloadEnabled: boolean;
  showCostEstimate: boolean;
  showLoadingIndicator: boolean;
}
```

### 2.4 模型配置 (含费用估算)

| Provider | Model | Cost/1k tokens |
|----------|-------|----------------|
| openai | gpt-4o | $0.005 |
| openai | gpt-4o-mini | $0.00015 |
| openai | gpt-4-turbo | $0.01 |
| openai | gpt-4 | $0.03 |
| openai | gpt-3.5-turbo | $0.0005 |
| gemini | gemini-2.0-flash-exp | $0.0 (免费) |
| gemini | gemini-1.5-pro | $0.00125 |
| gemini | gemini-1.5-flash | $0.000075 |
| gemini | gemini-1.5-flash-8b | $0.0000375 |

### 2.5 设置变更通知

```typescript
// Popup → Content Script 通知机制
async function notifySettingsChanged(settings: UserSettings): Promise<void> {
  const tabs = await chrome.tabs.query({ url: '*://*.udemy.com/*' });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'SETTINGS_UPDATED',
      payload: settings,
    });
  }
}
```

### 2.6 测试覆盖

```
Test Suites: 1 passed (settings-manager.test.ts)
Tests:       34 passed
Categories:
- DEFAULT_SETTINGS 验证 (3 tests)
- PROVIDER_MODELS 验证 (3 tests)
- loadSettings/saveSettings (6 tests)
- 配置工具函数 (9 tests)
- SettingsManager 类 (7 tests)
```

---

## 3. 接口 & 行为变更 (对下游影响)

| 接口 | 影响范围 | 说明 |
|------|----------|------|
| `loadSettings()` | Service Worker, Content Script | 异步加载配置，返回 `UserSettings` |
| `saveSettings(Partial<UserSettings>)` | 全局 | 增量保存，自动合并现有配置 |
| `onSettingsChange(callback)` | Content Script, Service Worker | 订阅配置变更，返回 unsubscribe 函数 |
| `isEnabled(settings)` | 翻译模块 | 判断是否启用且配置完整 |
| `estimateCost(settings, tokens)` | ACT-016 费用估算 | 根据模型计算费用 |
| `SettingsManager` class | Service Worker | 带缓存的 OOP 接口，需调用 `init()` |
| `SETTINGS_UPDATED` message | Content Script | Popup 发送，Content Script 需监听 |

---

## 4. 显式限制 / 风险 / TODO

### 限制

- [x] API Key 验证仅检查连通性，不验证配额或权限
- [x] 模型列表硬编码，API 新增模型需手动更新

### 风险

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| API Key 存储安全 | 中 | 使用 chrome.storage.sync (扩展私有) |
| OpenAI Key 格式变化 | 低 | 仅做 "sk-" 前缀校验，其他格式直接尝试验证 |
| Gemini 2.0 Flash 免费额度变化 | 低 | 费用显示为 $0，用户需自行确认 |

### TODO (下游任务)

- [ ] **manifest.json**: 需添加 `"action": { "default_popup": "popup/popup.html" }`
- [ ] **Content Script**: 需实现 `SETTINGS_UPDATED` 消息监听
- [ ] **Service Worker**: 使用 `SettingsManager.init()` 初始化配置

---

## 5. 验收标准核对

| 验收条件 | 状态 | 证据 |
|---------|------|------|
| UI 支持选择翻译服务（OpenAI / Gemini） | ✅ | popup.html L37-40 |
| UI 支持输入 API Key（密码类型输入框） | ✅ | popup.html L45-58, popup.ts L396-417 |
| UI 支持选择模型名称（下拉选择） | ✅ | popup.ts L287-292 动态更新 |
| UI 包含"保存并验证"按钮 | ✅ | popup.html L74-82 |
| 验证按钮调用 API 测试连通性 | ✅ | popup.ts L169-257 |
| UI 包含"字幕替换"主开关 | ✅ | popup.html L17-25 |
| 配置可保存/读取（chrome.storage.sync） | ✅ | settings-manager.ts L73-121 |
| 开关切换后 1 秒内生效 | ✅ | popup.ts L422-433 立即保存并通知 |

---

## 6. 解除的阻塞

此任务完成后，以下任务可使用配置模块:
- **ACT-007**: LLM 翻译模块 - 读取 provider/model/apiKey
- **ACT-010**: 本地缓存模块 - 与 settings-manager 同层，可并行
- **ACT-016**: 费用估算 - 使用 `estimateCost()` 函数

---

## 7. 快速参考

```
Popup 核心 API:
┌────────────────────────────────────────────────────────────────┐
│ loadSettings()           → Promise<UserSettings>              │
│ saveSettings(partial)    → Promise<void>                      │
│ onSettingsChange(cb)     → unsubscribe function               │
│ isEnabled(settings)      → boolean (enabled && configured)    │
│ estimateCost(settings,n) → cost in USD                        │
│ SETTINGS_UPDATED message → { type, payload: UserSettings }    │
└────────────────────────────────────────────────────────────────┘

默认配置:
┌────────────────────────────────────────────────────────────────┐
│ provider: 'openai', model: 'gpt-4o', enabled: true            │
│ autoTranslate: true, preloadEnabled: true                     │
│ showCostEstimate: true, showLoadingIndicator: true            │
└────────────────────────────────────────────────────────────────┘
```
