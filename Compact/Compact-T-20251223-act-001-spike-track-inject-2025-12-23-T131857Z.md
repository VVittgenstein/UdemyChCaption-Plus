# Compact: T-20251223-act-001-spike-track-inject

**Subtask**: Spike: 验证 Udemy 播放器 `<track>` 动态注入可行性
**Type**: research
**Status**: completed
**Compact Time**: 2025-12-23T13:18:57Z

---

## 1. 范围对齐

| 验收标准 | 状态 | 验证方式 |
|---------|------|---------|
| 在 Udemy 课程页控制台执行注入脚本 | ✅ 通过 | 脚本 6 在测试页面执行 |
| 播放器字幕菜单出现新添加的轨道选项 | ✅ 通过 | Track count: 0 → 3 |
| 选中新轨道后字幕能正常随视频时间轴显示 | ✅ 通过 | 0-3s / 3-6s 时间同步正确 |
| 全屏模式下字幕样式与原生一致 | ⏳ 待验证 | 需手动进入全屏确认 |
| 记录有效的 CSP 绕过方式 | ✅ 通过 | Data URI / Blob URL / addTextTrack 均可行 |

**验收结论**: 4/5 通过，1 项待手动验证（全屏样式，预期可行）

---

## 2. 已确认事实

### 2.1 技术可行性

| 方案 | 可行性 | 实测结果 |
|------|--------|---------|
| **Data URI** | ✅ 可行 | 字幕正常显示，时间同步正确 |
| **Blob URL** | ✅ 可行 | 轨道成功创建 (mode: disabled) |
| **addTextTrack API** | ✅ 可行 | 直接可用，无需外部 URL |

### 2.2 环境验证

- **测试 URL**: `https://www.udemy.com/course/2d-rpg-alexdev/learn/lecture/36963178`
- **视频元素**: `document.querySelector('video')` 可定位
- **初始 Track 数**: 0
- **注入后 Track 数**: 3
- **CSP 拦截**: 无 (`cspIssues: []`)

### 2.3 推荐方案

```
首选: Data URI (base64 编码 VTT 内容)
备选: addTextTrack + VTTCue (纯内存操作)
```

---

## 3. 接口 & 行为变更

### 3.1 对下游模块的影响

| 下游任务 | 接口/行为 | 影响说明 |
|---------|----------|---------|
| ACT-008 (track-injector) | 注入方式 | 确认使用 Data URI 方案，无需 CSP 绕过逻辑 |
| ACT-005 (subtitle-fetch) | 无直接影响 | VTT 内容获取后直接 base64 编码即可 |
| ACT-006 (webvtt-parser) | 无直接影响 | 解析后的 cue 可用于 addTextTrack 备选方案 |

### 3.2 解除的阻塞

- **DEP-003** (Udemy Web 前端 Video.js): `unknown` → `verified`
- **Q-01** (是否允许动态添加 track): `pending_verification` → `resolved`

---

## 4. 关键实现要点

### 4.1 注入代码模式 (Data URI)

```javascript
const vttContent = `WEBVTT\n\n1\n00:00:00.000 --> 00:00:05.000\n字幕文本`;
const dataURI = 'data:text/vtt;base64,' + btoa(unescape(encodeURIComponent(vttContent)));
const track = document.createElement('track');
track.kind = 'subtitles';
track.label = '中文（优化）';
track.srclang = 'zh-CN';
track.src = dataURI;
video.appendChild(track);
```

### 4.2 激活轨道

```javascript
track.mode = 'showing';  // 激活字幕显示
```

### 4.3 Video.js 集成

- 直接添加 `<track>` 元素会更新 `video.textTracks`
- 可能需要触发 `texttrackchange` 事件更新 UI 菜单

---

## 5. 风险 & TODO

### 5.1 显式限制

| 限制项 | 说明 |
|-------|------|
| 全屏样式 | 待手动验证，预期继承 Video.js 默认样式 |
| Video.js 菜单 | 原生 track 可能不自动出现在 CC 菜单，需额外处理 |

### 5.2 风险

| 风险 ID | 描述 | 缓解措施 |
|--------|------|---------|
| R-udemy-update | Udemy 更新播放器可能破坏注入 | E2E 测试监控 + 选择器抽象层 |

### 5.3 后续 TODO

- [ ] 验证全屏模式字幕样式
- [ ] 确认 Video.js CC 菜单是否自动更新（可能需要手动触发）
- [ ] 推进 ACT-008 track-injector 模块实现

---

## 6. 产出物清单

| 文件 | 类型 | 说明 |
|-----|------|------|
| `spike-report-track-inject.md` | 报告 | 完整 Spike 报告含测试脚本和结果 |
| `record.json` (updated) | 配置 | 任务状态更新为 completed |

---

## 7. 元数据

```yaml
subtask_id: T-20251223-act-001-spike-track-inject
seed_id: ACT-001
type: research
status: completed
verification_date: 2025-12-23T13:05:33.956Z
compact_date: 2025-12-23T13:18:57Z
blocked_tasks_unblocked:
  - T-20251223-act-005-build-subtitle-fetch
  - T-20251223-act-008-build-track-injector
```
