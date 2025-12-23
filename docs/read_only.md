---
file: udemy-subtitle-dr-2025-12-23.md
project: "Udemy 中文字幕优化 Chrome 扩展"
version: 0.1
date: 2025-12-23
derived_from: "Deep Research (raw notes in context)"
---

# Udemy 中文字幕优化 Chrome 扩展 · DR 结论（只读）

> 本文是从上游调研原文蒸馏的**结论性文档**，用于人审阅与 6b 机读抽取。
> 约定：文中方括号标注 [EVID-###] 以指向"参考文献"。

## 1. 背景&目标

- **目标（What/Why）**：
  - 解决 Udemy 自动字幕机器翻译断句不当、语义割裂的问题 [EVID-001]
  - 为无中文字幕的课程提供高质量中文字幕轨道 [EVID-001]
  - 通过 Chrome 扩展形式，利用 LLM（OpenAI GPT / Google Gemini）生成上下文连贯的中文翻译字幕 [EVID-004][EVID-005]

- **成功判据（对 MVP 的可验证结果）**：
  - 翻译正确率 ≥90%（译文准确传达原文核心意义）[EVID-001]
  - 首次加载优化字幕 ≤5秒，缓存命中时 ≤1秒 [EVID-001]
  - 缓存命中率 100%（已翻译课时不重复调用 API）[EVID-001]
  - ≥95% 有英文字幕的课时可成功提供中文翻译轨道 [EVID-001]
  - 用户满意度 ≥80% 正面评价（评分 ≥4/5）[EVID-001]

- **非目标 / 暂不覆盖**：
  - 不涉及视频内容修改或下载 [EVID-001]
  - 不自建翻译模型服务（依赖第三方 API）[EVID-001]
  - 暂不支持无任何原文字幕的视频（不实现语音识别 ASR）[EVID-001]
  - 不提供云端字幕同步或共享功能 [EVID-007]
  - 术语库上传功能属未来规划，MVP 不含 [EVID-001]

## 2. 结论总览（Top Insights）

- **(C1)** LLM 翻译（GPT-4/5、Gemini）可利用整段上下文产出连贯译文，远优于逐句机翻的生硬断句 [EVID-004][EVID-005]
- **(C2)** 原生 `<track>` 元素注入是实现字幕与播放器样式一致的最佳路径，可复用 Udemy Video.js 播放器的字号、位置、背景控制逻辑 [EVID-008][EVID-006]
- **(C3)** 后台预加载下一课字幕 + 本地持久化缓存可消除重复 API 调用开销，实现近乎即时的字幕切换 [EVID-001]
- **(C4)** 用户自备 API Key，扩展仅作为客户端调用中介，数据直连官方服务不经开发者服务器，降低合规与隐私风险 [EVID-007]
- **(C5)** GPT-4 翻译成本约 $18/百万字符，速度较传统 MT 慢 15-20 倍；Gemini 提供免费额度可降低入门门槛 [EVID-009][EVID-010][EVID-005]

## 3. 关键决策与约束（Decision & Constraints）

> 6b 将据此拆出决策/约束类任务与校验。

- **D1. 决策**：字幕注入方式选择原生 `<track>` 元素而非 DOM Overlay，以确保样式继承与全屏兼容 [EVID-008][EVID-006]
- **D2. 决策**：翻译模型由用户自选（OpenAI GPT 系列 / Google Gemini），扩展不绑定单一供应商 [EVID-001]
- **D3. 决策**：字幕缓存仅存本地（`chrome.storage.local` 或 `IndexedDB`），不上传云端 [EVID-007]
- **D4. 决策**：采用 LLM 在线翻译方案（方案 A），放弃传统 MT 逐句翻译（方案 B）和用户自助方案（方案 C）[EVID-001]

- **Z1. 约束**：API Key 由用户提供并存储于本地，扩展不得明文传输或记录至外部服务器 [EVID-007]
- **Z2. 约束**：翻译请求需保留原始时间戳结构，输出需可解析为 WebVTT 格式 [EVID-004][EVID-008]
- **Z3. 约束**：Chrome 扩展 Manifest V3 限制（Service Worker 无持久后台页，需管理生命周期）[EVID-011]
- **Z4. 约束**：注入字幕 track 需绕过 CSP，采用 `data:` URI 或 `chrome.runtime.getURL` 方式 [EVID-006]

## 4. 需求提炼（可执行）

> 每条均含"验收要点(acceptance-hint)"便于 6b 生成 acceptance。

### 4.1 功能性需求（FR）

- **FR-01**：扩展检测 Udemy 视频页面并自动获取当前课时的原始字幕文件（优先英文 WebVTT）[EVID-008]
  验收要点：在 Udemy 课程播放页加载后 3 秒内，控制台/日志可见字幕 URL 抓取成功

- **FR-02**：将原始字幕文本与课程上下文（课程名、章节名）提交至用户配置的 LLM API 进行翻译 [EVID-004][EVID-009]
  验收要点：API 请求 payload 包含课程元数据；响应可解析为有效 WebVTT 格式

- **FR-03**：翻译完成后，生成新 `<track>` 元素（label="中文（优化）"）并注入视频 DOM [EVID-006][EVID-008]
  验收要点：播放器字幕菜单出现"中文（优化）"选项，选中后字幕正常随视频时间轴显示

- **FR-04**：扩展设置面板（Popup）提供"字幕替换"主开关，开启时自动选中优化轨道、关闭时恢复原始行为 [EVID-001]
  验收要点：切换开关后 1 秒内字幕轨道切换生效，无需刷新页面

- **FR-05**：设置面板支持选择翻译服务（OpenAI / Gemini）、输入 API Key、选择模型名称，并提供"保存并验证"按钮 [EVID-001][EVID-005]
  验收要点：输入有效 Key 点击验证后显示"可用"状态；无效 Key 显示错误提示

- **FR-06**：当前课播放时，后台静默预加载下一课字幕并翻译缓存 [EVID-001]
  验收要点：当前课播放结束前，下一课字幕已存入本地缓存（可在 DevTools Storage 中验证）

- **FR-07**：已翻译字幕持久化存储于 `chrome.storage.local` 或 `IndexedDB`，重复访问同一课时直接加载缓存 [EVID-001][EVID-007]
  验收要点：关闭浏览器后重开同一课程，字幕 0 API 调用即可显示

- **FR-08**：若原字幕版本变化（哈希不一致）或用户手动触发，允许重新翻译并覆盖缓存 [EVID-001]
  验收要点：设置面板提供"重新翻译当前课"按钮，点击后发起新翻译并更新缓存

### 4.2 非功能性需求（NFR）

- **NFR-01**：翻译请求超时上限 60 秒（考虑 GPT thinking 等长思考模型），超时后提示用户并允许重试 [EVID-009]
  验收要点：模拟慢响应场景，60 秒后 UI 显示超时提示

- **NFR-02**：字幕加载期间显示"字幕翻译中…"占位提示，避免用户困惑 [EVID-001]
  验收要点：从请求发起到字幕注入完成期间，视频区域可见加载提示

- **NFR-03**：本地缓存数据结构包含：课程/课时 ID、原字幕哈希、优化字幕文本、模型版本、时间戳 [EVID-001]
  验收要点：IndexedDB/storage 记录包含上述全部字段

- **NFR-04**：扩展体积 < 1MB（不含运行时缓存），对 Udemy 页面性能影响 < 100ms [EVID-011]
  验收要点：Lighthouse 性能测试显示扩展启用前后 LCP 差值 < 100ms

- **NFR-05**：API 错误处理率 < 5%，无崩溃 [EVID-001]
  验收要点：连续翻译 20 节课时，失败次数 ≤1

## 5. 技术路径与方案对比（若适用）

| 方案 | 适用场景 | 优点 | 风险/代价 | 证据 |
|---|---|---|---|---|
| **A. LLM 在线翻译** | 需高质量上下文连贯译文 | 深度理解语境、译文质量最高、可合并断句 | 首次稍慢（5-7s/句）、API 费用由用户承担 | [EVID-004][EVID-009] |
| B. 传统 MT 引擎 | 追求即时显示、质量要求低 | 响应快（<0.5s/句）、费用低 | 逐句独立翻译、无法修复断句、与现有机翻差异不大 | [EVID-003] |
| C. 用户自助/混合 | 用户已有译文资源 | 实现简单、无 API 费用 | 转嫁负担给用户、无法自动解决核心痛点 | [EVID-002] |

> **推荐**：方案 A（LLM 在线翻译）。理由：大幅提升字幕质量，真正解决用户对高质量中文的需求，并通过缓存与预加载将性能和成本问题降至可接受范围。决策矩阵综合得分：A=4.2 > B=3.9 > C=2.8 [EVID-001]

## 6. 外部依赖与阻断

| 依赖 | 现状 | 影响面 | 证据 |
|---|---|---|---|
| OpenAI GPT API | unblocked（用户自备 Key） | 翻译核心功能 | [EVID-009][EVID-010] |
| Google Gemini API | unblocked（用户自备 Key，有免费额度） | 备选翻译引擎 | [EVID-005] |
| Udemy Web 前端 (Video.js) | unknown（需 Spike 验证 DOM 结构） | 字幕抓取与注入逻辑可能失效 | [EVID-008] |
| Chrome Web Store 审核 | unknown | 扩展分发 | [EVID-011] |
| CSP 绕过方案 | unblocked（data URI 可用） | track 注入成功率 | [EVID-006] |

- **最小解锁路径**：
  - Udemy DOM 结构：Spike 验证 `<track>` 动态注入可行性；建立 E2E 监控；抽象选择器层便于快速修复
  - Chrome 审核：遵循 Manifest V3 最小权限原则；提供清晰隐私政策；备选 .crx 侧载分发

## 7. 风险清单（含缓解）

- **R-01**：Udemy 更新播放器导致字幕注入失效
  概率：中 | 影响：高
  监测指标：E2E 测试失败率
  缓解措施：抽象 DOM 选择器层，快速响应变化；建立用户反馈通道 [EVID-008]

- **R-02**：LLM 翻译延迟过长（>30s）影响体验
  概率：中 | 影响：中
  监测指标：翻译请求 P95 延迟
  缓解措施：预加载机制覆盖 90% 场景；提供手动取消/重试；可选快速模式（传统 MT）[EVID-009]

- **R-03**：API 费用超出用户预期
  概率：中 | 影响：中
  监测指标：用户反馈/评分
  缓解措施：设置面板显示字数/费用估算；推荐 Gemini 免费额度；提供 GPT-3.5 降级选项 [EVID-010][EVID-005]

- **R-04**：Chrome Web Store 审核拒绝（权限过多/隐私问题）
  概率：低 | 影响：高
  缓解措施：最小权限原则；提供清晰隐私政策；必要时仅发布 .crx 侧载版 [EVID-011]

- **R-05**：LLM 输出格式不可靠（时间戳错乱、内容审查拒绝）
  概率：中 | 影响：中
  缓解措施：Prompt 明确要求"严禁改动时间标签，只翻译文本"；校验返回结果；格式错误时自动修正或重试；切换另一模型 [EVID-004]

- **R-06**：用户 API Key 安全风险
  概率：中 | 影响：中
  缓解措施：Key 仅存 Chrome 扩展私有存储区；内容脚本不直接接触 Key；指导用户定期更换 [EVID-007]

## 8. 开放问题（需要结论的人/时间）

- **Q-01**：Udemy 播放器是否允许动态添加 `<track>` 元素？（责任人：开发者 / Spike 验证 / 开发启动前）[EVID-008]
- **Q-02**：如何获取 Udemy 课程列表以确定"下一课"ID？（责任人：开发者 / 逆向分析页面结构 / FR-06 实现前）[EVID-001]
- **Q-03**：是否需要支持双语字幕同时显示模式？（责任人：产品决策 / 用户调研 / MVP 后）[EVID-002]
- **Q-04**：Manifest V3 Service Worker 休眠是否影响长时翻译任务？（责任人：开发者 / 技术调研 / 架构设计前）[EVID-011]
- **Q-05**：是否需要支持用户自定义术语表？（责任人：产品决策 / 用户反馈 / MVP 后）[EVID-001]
- **Q-06**：是否需要扩展到其他浏览器（Edge/Firefox）？（责任人：产品决策 / 用户分布 / MVP 后）[EVID-001]

## 9. 术语与域模型（可用于统一命名）

| 术语 | 定义 | 别名 |
|---|---|---|
| 优化字幕 (EnhancedSubtitle) | 经 LLM 翻译生成的中文字幕轨道 | Enhanced Subtitle |
| 原始字幕 (OriginalSubtitle) | Udemy 课程自带的自动字幕或人工字幕 | Original Subtitle |
| 字幕轨道 (Track) | HTML5 `<track>` 元素对应的 TextTrack 对象 | Track |
| 预加载 (Preload) | 在当前课播放期间提前翻译下一课字幕 | Preload |
| 字幕缓存 (SubtitleCache) | 存储于本地的已翻译字幕数据 | Subtitle Cache |
| 翻译引擎 (TranslationEngine) | 提供 LLM 翻译能力的服务（OpenAI/Gemini） | Engine |
| WebVTT | Web Video Text Tracks 格式，Udemy 使用的字幕文件格式 | VTT [EVID-008] |

**对象关系**：
- 课程(Course) 1:N 课时(Lecture)
- 课时(Lecture) 1:1 原始字幕(OriginalSubtitle)
- 课时(Lecture) 0..1:1 优化字幕(EnhancedSubtitle)
- 优化字幕(EnhancedSubtitle) N:1 翻译引擎配置(EngineConfig)
- 字幕缓存(SubtitleCache) 包含：课程/课时 ID、原字幕哈希、优化字幕文本、模型版本、时间戳

## 10. 证据一致性与时效

- **互相矛盾点**：无明显矛盾。所有证据均指向 LLM 翻译质量优于传统 MT，但速度和成本为主要 trade-off。
- **证据时效**：
  - 最早发布日期：2018-08-07 [EVID-006]
  - 最晚发布日期：2025-12-22（调研文档）
  - ⚠️ [EVID-006] 关于 CSP 绕过方案较旧（2018），需实际验证当前 Chrome + Udemy 环境是否仍适用
  - Chrome Manifest V3 文档需定期复查（API 可能更新）
- **数据缺口**：
  - Udemy 播放器 DOM 结构详细分析（需 Spike）
  - Manifest V3 Service Worker 生命周期对长时翻译任务的影响
  - GPT-5.1 与 Gemini 3 Pro 翻译字幕的质量/速度/成本对比数据（原文档数据基于 GPT-4）

---

## 11. Action Seeds（供 6b 机读转 JSON；YAML，不等于最终任务）

```yaml
action_seeds:
  - id: ACT-001
    title: "Spike: 验证 Udemy 播放器 <track> 动态注入可行性"
    category: spike
    rationale: "确认技术路径 A 可行，解锁后续字幕注入开发；验证 CSP 绕过方案在当前环境有效"
    evidence: ["EVID-006", "EVID-008"]
    acceptance_hint: "在 Udemy 课程页控制台执行注入脚本，播放器字幕菜单出现新轨道且可正常显示"
    priority_guess: P0
    depends_on: []

  - id: ACT-002
    title: "Spike: 分析 Udemy 页面课程列表结构，确定下一课 ID 获取方式"
    category: spike
    rationale: "预加载功能依赖准确获取下一课标识"
    evidence: ["EVID-008"]
    acceptance_hint: "文档记录获取方式（DOM 选择器或页面数据），并提供示例代码"
    priority_guess: P0
    depends_on: []

  - id: ACT-003
    title: "Spike: 验证 Manifest V3 Service Worker 生命周期对长时翻译任务影响"
    category: spike
    rationale: "LLM 翻译可能需要 30-60 秒，需确保 SW 不被提前终止"
    evidence: ["EVID-011"]
    acceptance_hint: "文档记录 SW 保活方案（如 chrome.alarms / 长连接），并验证 60s 翻译任务可完成"
    priority_guess: P0
    depends_on: []

  - id: ACT-004
    title: "设计扩展架构（Content Script / Service Worker / Popup 分工）"
    category: decision
    rationale: "Manifest V3 约束下明确各模块职责，避免生命周期问题"
    evidence: ["EVID-011"]
    acceptance_hint: "架构图 + 模块职责文档，评审通过"
    priority_guess: P0
    depends_on: ["ACT-001", "ACT-003"]

  - id: ACT-005
    title: "实现字幕抓取模块（Content Script）"
    category: build
    rationale: "FR-01 核心功能，获取 Udemy 原始字幕 URL 并下载 WebVTT 内容"
    evidence: ["EVID-008"]
    acceptance_hint: "单元测试覆盖字幕 URL 提取；集成测试在 Udemy 页面抓取成功"
    priority_guess: P1
    depends_on: ["ACT-001", "ACT-004"]

  - id: ACT-006
    title: "实现 WebVTT 解析与生成模块"
    category: build
    rationale: "翻译前后需解析/重组 WebVTT 格式，保持时间戳一致"
    evidence: ["EVID-004", "EVID-008"]
    acceptance_hint: "单元测试覆盖各种 VTT 格式；解析后再生成与原文件语义等价"
    priority_guess: P1
    depends_on: ["ACT-004"]

  - id: ACT-007
    title: "实现 LLM 翻译模块（支持 OpenAI / Gemini）"
    category: build
    rationale: "FR-02 核心功能，调用用户配置的 API 进行翻译"
    evidence: ["EVID-004", "EVID-005", "EVID-009"]
    acceptance_hint: "单元测试验证 Prompt 构造；Mock API 响应可解析为有效 VTT 结构"
    priority_guess: P1
    depends_on: ["ACT-004", "ACT-006"]

  - id: ACT-008
    title: "实现字幕注入模块（动态创建 <track> 并激活）"
    category: build
    rationale: "FR-03 核心功能，将翻译结果呈现给用户"
    evidence: ["EVID-006", "EVID-008"]
    acceptance_hint: "Udemy 播放器字幕菜单显示新轨道，选中后字幕同步播放；全屏模式正常"
    priority_guess: P1
    depends_on: ["ACT-001", "ACT-005", "ACT-007"]

  - id: ACT-009
    title: "实现 Popup 设置面板（API Key / 模型选择 / 开关）"
    category: build
    rationale: "FR-04, FR-05 用户配置入口"
    evidence: ["EVID-001", "EVID-005"]
    acceptance_hint: "UI 可保存/读取配置；验证按钮调用 API 返回结果；开关切换立即生效"
    priority_guess: P1
    depends_on: ["ACT-004"]

  - id: ACT-010
    title: "实现本地缓存模块（IndexedDB 存储已翻译字幕）"
    category: build
    rationale: "FR-07 避免重复翻译，支持离线使用"
    evidence: ["EVID-007"]
    acceptance_hint: "缓存命中时 0 API 调用；数据结构含 NFR-03 全部字段；浏览器重启后数据持久"
    priority_guess: P1
    depends_on: ["ACT-004"]

  - id: ACT-011
    title: "实现预加载模块（后台翻译下一课字幕）"
    category: build
    rationale: "FR-06 提升连续观看体验"
    evidence: ["EVID-001"]
    acceptance_hint: "当前课播放时下一课字幕自动进入缓存；用户跳转时直接命中"
    priority_guess: P2
    depends_on: ["ACT-002", "ACT-007", "ACT-010"]

  - id: ACT-012
    title: "实现字幕版本检测与重译功能"
    category: build
    rationale: "FR-08 支持字幕更新与用户手动刷新"
    evidence: ["EVID-001"]
    acceptance_hint: "原字幕哈希变化时自动重译；手动按钮触发重译并更新缓存"
    priority_guess: P2
    depends_on: ["ACT-007", "ACT-010"]

  - id: ACT-013
    title: "添加加载状态提示（翻译中...）"
    category: build
    rationale: "NFR-02 用户体验优化"
    evidence: ["EVID-001"]
    acceptance_hint: "翻译期间视频区域显示加载提示，完成后消失"
    priority_guess: P2
    depends_on: ["ACT-008"]

  - id: ACT-014
    title: "编写隐私政策与扩展说明文档"
    category: doc
    rationale: "Chrome Web Store 审核要求；用户知情同意"
    evidence: ["EVID-007", "EVID-011"]
    acceptance_hint: "隐私政策说明数据仅存本地、直连官方 API；README 包含安装与使用指南"
    priority_guess: P2
    depends_on: []

  - id: ACT-015
    title: "建立 E2E 测试（Playwright）监控 Udemy DOM 变化"
    category: build
    rationale: "R-01 风险缓解，及时发现网站变更"
    evidence: ["EVID-008"]
    acceptance_hint: "CI 定期运行测试，DOM 变化时告警"
    priority_guess: P2
    depends_on: ["ACT-008"]

  - id: ACT-016
    title: "实现 API 费用/字数估算显示"
    category: build
    rationale: "R-03 风险缓解，帮助用户控制成本"
    evidence: ["EVID-009", "EVID-010"]
    acceptance_hint: "翻译前显示预估 Token 数和费用；翻译后显示实际消耗"
    priority_guess: P2
    depends_on: ["ACT-007", "ACT-009"]
```

---

## 12. External Dependencies（供 6b 识别依赖态；YAML）

```yaml
external_dependencies:
  - id: DEP-001
    name: "OpenAI GPT API"
    status: unblocked
    blocker: ""
    unblock_plan: "用户自备 API Key，扩展仅作调用中介"
    evidence: ["EVID-009", "EVID-010"]

  - id: DEP-002
    name: "Google Gemini API"
    status: unblocked
    blocker: ""
    unblock_plan: "用户自备 API Key，有免费额度可用"
    evidence: ["EVID-005"]

  - id: DEP-003
    name: "Udemy Web 前端 (Video.js)"
    status: unknown
    blocker: "Udemy 可能随时更新播放器实现，导致选择器失效或 track 注入被阻止"
    unblock_plan: "Spike 验证当前结构；建立 E2E 监控；抽象选择器层便于快速修复"
    evidence: ["EVID-008"]

  - id: DEP-004
    name: "Chrome Web Store 审核"
    status: unknown
    blocker: "权限声明或隐私政策可能不符合要求"
    unblock_plan: "遵循 Manifest V3 最小权限原则；提供清晰隐私政策；备选 .crx 侧载分发"
    evidence: ["EVID-011"]

  - id: DEP-005
    name: "Chrome Manifest V3 API"
    status: unblocked
    blocker: ""
    unblock_plan: "参照官方文档开发，注意 Service Worker 生命周期限制"
    evidence: ["EVID-011"]

  - id: DEP-006
    name: "CSP 绕过方案（data URI / chrome.runtime.getURL）"
    status: unblocked
    blocker: ""
    unblock_plan: "已有成熟方案，Spike 中实际验证"
    evidence: ["EVID-006"]
```

---

## 13. 参考文献（附来源日期）

- **[EVID-001]** Udemy 中文字幕优化 Chrome 扩展需求规格与调研报告 — 项目团队 — published: 2025-12-22 — accessed: 2025-12-23 — (内部文档)

- **[EVID-002]** Udemy Dual Subtitles Chrome 扩展官方介绍 — Chrome Web Store — published: 2025-11-25 — accessed: 2025-12-22 — https://chromewebstore.google.com/detail/udemy-dual-subtitles

- **[EVID-003]** Reddit 讨论：Netflix 双语字幕扩展与 Google 翻译局限 — Reddit 用户 — published: 2021-08-07 — accessed: 2025-12-22 — (Reddit thread)

- **[EVID-004]** Gemini SRT Translator (README) — GitHub 项目 — published: 2025-10-10 — accessed: 2025-12-22 — https://github.com/gemini-srt-translator

- **[EVID-005]** AI Translator Gemini 扩展 (README) — GitHub 项目 — published: 2025-11-10 — accessed: 2025-12-22 — (GitHub repo)

- **[EVID-006]** StackOverflow: 向 YouTube 插入 track 元素字幕与 CSP 绕过 — woxxom — published: 2018-08-07 — accessed: 2025-12-22 — https://stackoverflow.com/questions/51726896

- **[EVID-007]** AI Translator Gemini 扩展隐私与安全说明 — GitHub 项目 — published: 2025-11-10 — accessed: 2025-12-22 — (GitHub repo)

- **[EVID-008]** Udemy 播放器内幕：字幕与 Video.js — Alexey Berezin — published: 2021-10-06 — accessed: 2025-12-22 — (Blog post)

- **[EVID-009]** 使用 GPT-4 进行翻译：最新与最佳实践 — Intento 公司 — published: 2023-03-15 — accessed: 2025-12-22 — https://intento.ai/blog/gpt4-translation

- **[EVID-010]** GPT-4 翻译成本与速度分析 — Intento 公司 — published: 2023-03-15 — accessed: 2025-12-22 — https://intento.ai/blog/gpt4-translation

- **[EVID-011]** Chrome Extensions Manifest V3 Documentation — Google — published: 2024-01-01 — accessed: 2025-12-23 — https://developer.chrome.com/docs/extensions/mv3/

---

## 14. 变更记录

| 版本 | 日期 | 内容 |
|---|---|---|
| v0.1 | 2025-12-23 | 首次从 DR 蒸馏，建立结论与 YAML 种子；梳理 11 条证据、16 个 Action Seeds、6 项外部依赖 |
