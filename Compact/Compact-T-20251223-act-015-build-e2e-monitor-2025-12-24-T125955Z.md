# Compact: T-20251223-act-015-build-e2e-monitor

> **Subtask:** 建立 E2E 测试（Playwright）监控 Udemy DOM 变化
> **Type:** build
> **Status:** completed (record.json)
> **Timestamp:** 2025-12-24T12:59:55Z

---

## 1. 范围对齐

| 验收标准 | 状态 | 对应产物 |
|---------|------|---------|
| Playwright 测试覆盖字幕抓取和注入核心流程 | ✅ 已实现（contract 级） | `tests/e2e/udemy-subtitle.spec.ts` |
| CI 定期运行测试（每日或每周） | ✅ 已实现（每周） | `.github/workflows/e2e-monitor.yml` |
| DOM 结构变化时测试失败并告警 | ✅ 已实现（Actions job fail） | `.github/workflows/e2e-monitor.yml` + Playwright exit code |
| 测试报告可追溯失败原因 | ✅ 已实现（report + trace） | `playwright.config.ts` + Actions artifact upload |

---

## 2. 已落实事实（基于代码）

### 2.1 新增 E2E 测试（不加载扩展，监控页面契约）

`tests/e2e/udemy-subtitle.spec.ts`：

- Lecture URL：默认从 `record.json:test_config.primary_test_course.test_lecture.url` 读取；可用 `UDEMY_E2E_LECTURE_URL` 覆盖
- Video 识别：按扩展现有选择器契约检查（`video[data-purpose="video-player"]` / `video.vjs-tech` / `.video-js video` / `video`），并验证可用性（有 source 且可见）
- 字幕抓取监控：
  - 优先等待网络响应中疑似 VTT 的 response（URL 含 `.vtt` 或 `caption`）
  - 若未捕获到响应，回退检查页面已有 `video track[src]`
  - 捕获到 response 时校验内容以 `WEBVTT` 开头，并验证页面端可 `fetch(url, { credentials:'include' })` 成功拿到 VTT（模拟扩展 `fetchVTT` 的可行性）
- 注入监控：在页面端构造 Data URI VTT，创建 `<track>` 注入 `<video>`，将对应 `TextTrack.mode` 设为 `showing`，并验证 cues 数量 > 0
- 失败提示：若 Udemy 跳转到登录/授权页，会显式报错并提示配置 `UDEMY_E2E_STORAGE_STATE` 或更换可访问课时

### 2.2 Playwright 配置与本地脚本

`playwright.config.ts`：

- `testDir: ./tests/e2e`；单项目 `chromium`
- 默认 headless；`bypassCSP: true`
- 失败保留：`trace: retain-on-failure` / `screenshot: only-on-failure` / `video: retain-on-failure`
- 登录态：支持通过 `UDEMY_E2E_STORAGE_STATE` 指定 `storageState`（Playwright JSON）
- Reporter：CI 用 `github` + `html(open: never)`；本地用 `list` + `html(open: on-failure)`

`package.json`：

- 新增脚本：`test:e2e` / `test:e2e:ui` / `test:e2e:report`
- 新增 devDependency：`@playwright/test`

`.gitignore`：

- 忽略 `playwright-report/`、`test-results/`、`.udemy-storage-state.json`

### 2.3 CI 定期监控（GitHub Actions）

`.github/workflows/e2e-monitor.yml`：

- 触发：`workflow_dispatch` + `schedule`（每周一 03:00 UTC）
- 执行：
  - `npm ci`
  - `npx playwright install --with-deps chromium`
  - 可选：将 `secrets.UDEMY_E2E_STORAGE_STATE_JSON` 写入 `.udemy-storage-state.json`（仅当该 secret 非空）
  - 运行：`npm run test:e2e -- --project=chromium`
    - 可选 lecture：`vars.UDEMY_E2E_LECTURE_URL`
    - 可选登录态：`UDEMY_E2E_STORAGE_STATE=.udemy-storage-state.json`（同样仅当 secret 非空）
  - 永远上传：`playwright-report` / `test-results`（用于追溯失败原因）

---

## 3. 接口 & 行为变更（对其他模块的影响）

| 变更项 | 影响范围 | 说明 |
|-------|---------|------|
| npm scripts | 开发/CI | 新增 `npm run test:e2e` / `test:e2e:ui` / `test:e2e:report` |
| E2E 环境变量 | CI/本地运行 | `UDEMY_E2E_LECTURE_URL`（覆盖课时）、`UDEMY_E2E_STORAGE_STATE`（登录态 JSON 路径） |
| GitHub Actions | repo 级 | 新增定期 workflow：`.github/workflows/e2e-monitor.yml` |
| 运行时扩展代码 | 无 | 未改动 `src/**` 运行时代码（仅新增监控/测试与 CI 配置） |

---

## 4. 自测说明与结果（已执行）

| 检查项 | 结果 |
|-------|------|
| `npm test` | ✅ 通过（Jest 单测 357/357） |
| `npm run type-check` | ✅ 通过 |
| `npm run test:e2e -- --project=chromium` | ❌ 失败：Udemy 默认课时 URL 重定向到登录页（提示需 `UDEMY_E2E_STORAGE_STATE` 或更换可访问课时） |

---

## 5. 显式限制 / 风险 / TODO 建议

### 显式限制（当前实现边界）

- E2E 依赖 Udemy 可访问课时页面：无登录态时会重定向到 auth 页面，导致测试无法继续执行字幕/VTT/注入步骤
- E2E 目前为“页面契约监控”：未加载/运行本扩展（不覆盖 service worker、消息链路、翻译 API 调用与缓存写入）

### 风险

- Udemy 登录/反自动化策略变化可能导致即使提供 storageState 也无法稳定访问课时页（从而影响监控稳定性）
- 字幕 URL 命中规则为启发式（`.vtt` 或 `caption`），若 Udemy 改为不同命名/封装，可能需要调整
- “告警”当前仅依赖 GitHub Actions 的失败通知（未集成 Slack/Email 等外部告警渠道）

### TODO 建议（不引入新设计，仅列出可选后续动作）

- [ ] 在仓库 Secrets 中维护可用的 `UDEMY_E2E_STORAGE_STATE_JSON`，确保 schedule 任务可持续运行
- [ ] 若希望更贴近功能链路：引入“加载 unpacked extension 并跑真实抓取/注入”的 E2E（需额外维护 MV3 构建产物与权限）
- [ ] 按需将 schedule 调整为每日运行以缩短发现 DOM 变更的时延

---

## 6. record.json 状态

- `record.json` 中 `T-20251223-act-015-build-e2e-monitor` 已更新为 `completed`，并补充 `status_note/artifacts/updated_at/completed_at/owner`。

