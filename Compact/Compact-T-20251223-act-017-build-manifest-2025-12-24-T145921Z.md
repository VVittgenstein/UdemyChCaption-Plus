# Compact: T-20251223-act-017-build-manifest

**生成时间**: 2025-12-24T14:59:42Z  
**任务类型**: build  
**状态**: completed  

---

## 1. 范围对齐

| 字段 | 值 |
|------|-----|
| Subtask ID | T-20251223-act-017-build-manifest |
| 标题 | 创建 manifest.json 扩展配置文件 |
| 优先级 | P0 |
| 依赖 | T-20251223-act-004-design-architecture |
| 产出物 | `dist/manifest.json`, `dist/popup/popup.html`, `dist/popup/popup.css` |

### 验收标准对照

| 验收标准 | 状态 | 验证方式（基于本次输入） |
|---------|------|--------------------------|
| Manifest V3 (`manifest_version: 3`) | ✅ | `dist/manifest.json` |
| 权限：`storage`, `activeTab`, `host_permissions` (udemy.com) | ✅ | `dist/manifest.json` |
| Service Worker 入口：`dist/background/service-worker.js` | ✅ | `dist/manifest.json`（并声明 `type: module`） |
| Content Script：`dist/content/content-script.js`，匹配 Udemy 课程页 | ✅ | `dist/manifest.json`（matches: `*://*.udemy.com/course/*/learn/lecture/*`） |
| Popup：`src/popup/popup.html` | ✅* | Manifest 指向 `popup/popup.html`（本次在 `dist/popup/popup.html` 提供同内容副本） |
| 填写扩展元信息（name/version/description） | ✅ | `dist/manifest.json` |
| 可加载到 Chrome 开发者模式 | ⏳ | 未包含真实浏览器加载验证记录（需人工确认） |

> *注：为满足“从 `dist/` 加载扩展”的装配方式，Popup 资源以 `dist/popup/*` 形式提供。*

---

## 2. 已确认事实（Verified Facts）

- 已新增 `dist/manifest.json`（Manifest V3），包含 `background.service_worker`、`action.default_popup`、`content_scripts`、`permissions`、`host_permissions`、`minimum_chrome_version` 等关键字段。
- Background Service Worker 以 ESM 方式运行（`background.type: "module"`）；同时将 `dist/` 下关键 ESM `import` specifier 统一补齐 `.js` 扩展名，避免浏览器模块解析失败。
- Popup 资源在 `dist/popup/` 下可用（HTML/CSS），与现有 `src/popup/` 对齐为“可装配到 extension root”的形式。
- `record.json` 已更新该任务为 `completed`，并将 `T-20251223-act-019-e2e-validation` 的阻塞项从 ACT-017 调整为 ACT-018（图标）。

---

## 3. 接口 & 行为变更（对下游影响）

| 变更 | 影响范围 | 说明 |
|------|----------|------|
| 扩展装配根目录约定为 `dist/` | 安装/打包流程 | README 指引“加载 `dist` 目录”才能找到 `manifest.json`。后续静态资源（如 icons）需落在 `dist/` 相对路径下。 |
| SW 以 ESM 运行 | Background 依赖加载 | `service-worker.js` 及其依赖需满足浏览器 ESM 解析规则（本次通过补齐 `.js` 后缀满足）。 |
| Content Script URL 匹配收敛为 lecture 页面 | Content 注入范围 | 仅在 `*://*.udemy.com/course/*/learn/lecture/*` 注入 `content-script.js`。 |

---

## 4. 自测说明与结果（来自本次执行）

- `npm run build`：✅ 通过（`tsc`）
- `npm run type-check`：✅ 通过（`tsc --noEmit`）
- JSON 校验：✅ `dist/manifest.json`、`record.json` 可被解析
- 路径校验：✅ manifest 引用的 `background/service-worker.js`、`content/content-script.js`、`popup/popup.html/css/js` 均存在

---

## 5. 显式限制 / 风险 / TODO（未在本次输入中完成）

- ⏳ 未提供“Chrome 开发者模式成功加载”的实际验证记录（任务验收需人工补证）。
- ⚠️ 当前对 `dist/` 的 `.js` import 后缀修正为“产物级补丁”；再次执行 `npm run build` 可能会覆盖这些变更，导致运行期模块解析回归失败（建议后续在构建链路中固化该规则：bundle 或 post-build rewrite，或调整 TS 输出策略）。
- ⚠️ 仍缺少图标与 manifest 引用（ACT-018）；当前 `dist/manifest.json` 未配置 `icons` / `action.default_icon`。

---

## Code Review - T-20251223-act-017 - 2025-12-24T15:04:36Z

---review-start---
{
  "findings": [
    {
      "title": "[P1] Declare web-accessible modules for content-script imports",
      "body": "The MV3 content script at `content/content-script.js` uses ESM imports (`./subtitle-fetcher.js`, `./track-injector.js`, `../storage/settings-manager.js`, etc., see lines 15-20), but the new manifest only lists the entry `content/content-script.js` and omits a `web_accessible_resources` block. In MV3, every module a content script imports must be declared as web-accessible; otherwise Chrome blocks those module fetches at runtime and the content script throws “Failed to load module script” before executing. Add a `web_accessible_resources` entry covering the imported modules (e.g., `content/*.js`, `storage/*.js`, `utils/*.js`) so the content script can load.",
      "confidence_score": 0.36,
      "priority": 1,
      "code_location": {
        "absolute_file_path": "/mnt/z/Project/UdemyChCaption-Plus/dist/manifest.json",
        "line_range": {
          "start": 17,
          "end": 23
        }
      }
    }
  ],
  "overall_correctness": "patch is incorrect",
  "overall_explanation": "The manifest adds the MV3 content script without declaring its imported modules as web-accessible, so Chrome will block those module loads and the content script will fail to run.",
  "overall_confidence_score": 0.36
}
---review-end---
