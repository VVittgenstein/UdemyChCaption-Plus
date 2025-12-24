# Compact: T-20251223-act-020-chrome-store-prep

| 字段 | 值 |
|------|-----|
| **Subtask ID** | T-20251223-act-020-chrome-store-prep |
| **标题** | Chrome Web Store 发布准备 |
| **类型** | doc |
| **状态** | completed |
| **时间戳** | 2025-12-24T23:46:09Z |

---

## 1. 范围对齐

**验收标准 (acceptance_draft)**:
- [x] 撰写商店描述（短描述 + 详细描述）
- [~] 准备 1-5 张功能截图（1280x800 或 640x400）→ 已提供规格和清单，待用户制作
- [~] 准备宣传图片（440x280 小型, 920x680 大型 marquee 可选）→ 已提供规格说明，待用户制作
- [x] 确认分类 (Productivity / Education)
- [x] 确认隐私政策 URL 可访问
- [x] 打包扩展为 .zip 文件
- [ ] 创建 Chrome 开发者账号（如尚未有）→ 需用户自行完成

---

## 2. 已确认事实

### 2.1 产出物清单

| 文件/目录 | 状态 | 说明 |
|-----------|------|------|
| `docs/store-listing.md` | 已创建 | Chrome Web Store 完整发布指南 |
| `screenshots/` | 已创建 | 空目录，待填充截图 |
| `udemy-subtitle-enhancement.zip` | 已生成 | 266KB，排除了 *.map 和 test-* 文件 |

### 2.2 商店描述内容

**短描述 (132字符内)**:
- 中文: `AI 驱动的 Udemy 字幕翻译工具，将英文字幕实时翻译为中文，原生替换字幕轨道，流畅观课无阻碍。`
- 英文: `AI-powered Udemy subtitle translator. Translates English subtitles to Chinese in real-time, seamlessly replacing native tracks.`

**详细描述**: 已提供中英文双语版本，涵盖核心功能、隐私保护、使用说明、费用说明、开源信息。

### 2.3 分类决策

| 决策项 | 结果 | 理由 |
|--------|------|------|
| 主分类 | Education | 核心用途是辅助在线学习，目标用户是 Udemy 学习者 |
| 备选 | Productivity | 如 Education 审核受阻可切换 |

### 2.4 隐私政策验证

- **URL**: `https://github.com/VVittgenstein/UdemyChCaption-Plus/blob/main/PRIVACY.md`
- **状态**: 已验证可访问
- **内容**: 中英双语，涵盖数据存储、API Key 使用、数据收集、网络通信、第三方服务、权限说明等

### 2.5 权限说明文档

已在 store-listing.md 中记录每个权限的用途说明，供 Chrome Web Store 审核使用：
- `storage`: 本地存储设置、API Key、缓存
- `activeTab`: 访问当前 Udemy 标签页注入字幕
- `host_permissions (udemy.com, udemycdn.com)`: 运行内容脚本、获取字幕文件

---

## 3. 接口 & 行为变更

**本次无代码变更**，仅产出文档和打包文件。

| 变更类型 | 内容 | 影响范围 |
|----------|------|----------|
| 新增文件 | `docs/store-listing.md` | 无代码影响 |
| 新增目录 | `screenshots/` | 无代码影响 |
| 新增文件 | `udemy-subtitle-enhancement.zip` | 发布用打包，不入 git |

---

## 4. 关键实现要点

1. **打包命令**: 使用 PowerShell `Compress-Archive` 实现（WSL 环境无原生 zip）
2. **排除规则**: 打包时已排除 `*.map` 和 `test-*` 文件
3. **截图清单**: 定义了 5 张截图需求（popup、translation、settings、progress、cost）
4. **宣传图规格**: 小型 440x280（必需）、大型 920x680（可选）

---

## 5. 风险 & TODO

### 5.1 待用户完成项

| 项目 | 优先级 | 说明 |
|------|--------|------|
| 截图制作 | P1 | 至少需要 1 张，推荐 3-5 张 |
| 宣传图制作 | P1 | 440x280 小型图为必需 |
| 开发者账号注册 | P1 | 需支付 $5 一次性费用 |

### 5.2 潜在风险

| 风险 | 级别 | 缓解措施 |
|------|------|----------|
| 审核被拒（权限过多） | 低 | 已准备详细权限说明文档 |
| 截图不符合规范 | 中 | store-listing.md 中已提供制作指南 |

### 5.3 后续建议

- [ ] 用户制作截图后放入 `screenshots/` 目录
- [ ] 发布前重新运行 `npm run build` 确保代码最新
- [ ] 重新生成 zip 包（当前 zip 基于现有 dist 目录）
- [ ] 考虑将 `udemy-subtitle-enhancement.zip` 加入 `.gitignore`

---

## 6. record.json 更新摘要

```json
{
  "status": "completed",
  "status_note": "已完成：创建了 docs/store-listing.md（含商店描述、截图清单、宣传图说明）、screenshots/ 目录、udemy-subtitle-enhancement.zip 打包文件。隐私政策 URL 已验证可访问。截图和宣传图需用户手动制作。",
  "artifacts": [
    "docs/store-listing.md",
    "screenshots/",
    "udemy-subtitle-enhancement.zip"
  ],
  "updated_at": "2025-12-25T07:40:00Z",
  "owner": "claude-code"
}
```

---

*Compact 生成时间: 2025-12-24T23:46:09Z*
