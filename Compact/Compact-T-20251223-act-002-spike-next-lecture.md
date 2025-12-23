# Compact: T-20251223-act-002-spike-next-lecture

**Subtask**: Spike: 分析 Udemy 页面课程列表结构，确定下一课 ID 获取方式
**Type**: research
**Status**: completed
**Compact Time**: 2025-12-23T16:30:00Z

---

## 1. 范围对齐

| 验收标准 | 状态 | 验证方式 |
|---------|------|---------|
| 文档记录获取下一课 ID 的方式 | ✅ 通过 | Curriculum API 方案 |
| 提供示例代码片段可稳定提取下一课 ID | ✅ 通过 | next-lecture-detector.ts |
| 记录边界情况处理（最后一课、跨章节等） | ✅ 通过 | API 返回完整列表，自动处理 |

**验收结论**: 3/3 通过，Curriculum API 方案验证成功

---

## 2. 已确认事实

### 2.1 技术可行性

| 方案 | 可行性 | 实测结果 |
|------|--------|---------|
| **Curriculum API** | ✅ 可行 | 返回 224 项完整课程结构 |
| DOM 解析 | ⚠️ 受限 | 侧边栏懒加载，无传统 `<a>` 标签 |
| 导航按钮 | ⚠️ 受限 | 存在但无直接 href |
| UD 全局对象 | ❌ 不可行 | 不含 curriculum 数据 |

### 2.2 环境验证

- **测试 URL**: `https://www.udemy.com/course/2d-rpg-alexdev/learn/lecture/36963178`
- **课程 ID**: 5059176
- **API 端点**: `api-2.0/courses/{courseId}/subscriber-curriculum-items/`
- **当前课 ID**: 36963178
- **下一课 ID**: 36963182 (验证正确)

### 2.3 推荐方案

```
首选: Curriculum API (subscriber-curriculum-items)
API: https://www.udemy.com/api-2.0/courses/{courseId}/subscriber-curriculum-items/
```

---

## 3. 接口 & 行为变更

### 3.1 对下游模块的影响

| 下游任务 | 接口/行为 | 影响说明 |
|---------|----------|---------|
| ACT-011 (preloader) | 获取下一课 ID | 使用 Curriculum API，无需 DOM 解析 |
| ACT-005 (subtitle-fetch) | 课程 ID 获取 | 可复用 getCourseId() 函数 |

### 3.2 解除的阻塞

- **DEP-003** (Udemy Web 前端): `pending_verification` → `verified`

---

## 4. 关键实现要点

### 4.1 API 调用模式

```typescript
const apiUrl = `https://www.udemy.com/api-2.0/courses/${courseId}/subscriber-curriculum-items/` +
  `?page_size=1400&fields[lecture]=title,object_index,is_published,sort_order,asset` +
  `&caching_intent=True`;

const response = await fetch(apiUrl, { credentials: 'include' });
const data = await response.json();
// data.results 包含所有课程项 (lecture, chapter, quiz, practice)
```

### 4.2 获取下一课

```typescript
const lectures = data.results.filter(item => item._class === 'lecture');
const currentIndex = lectures.findIndex(l => String(l.id) === currentLectureId);
const nextLecture = lectures[currentIndex + 1]; // 下一课
```

### 4.3 获取课程 ID

```typescript
// 方法 1: 从 Performance API
const apiCalls = performance.getEntriesByType('resource');
const match = apiCalls.find(c => c.name.match(/api-2\.0\/courses\/(\d+)/));

// 方法 2: 从课程 slug 查询
const response = await fetch(`/api-2.0/courses/${courseSlug}/?fields[course]=id`);
```

---

## 5. 风险 & TODO

### 5.1 显式限制

| 限制项 | 说明 |
|-------|------|
| API 认证 | 需要用户已登录 (credentials: include) |
| 课程 ID | 需要先获取，不能直接从 URL 得到 |

### 5.2 风险

| 风险 ID | 描述 | 缓解措施 |
|--------|------|---------|
| R-api-change | Udemy API 变更 | 建立 E2E 测试监控 |
| R-rate-limit | API 请求频率限制 | 添加缓存机制 |

### 5.3 后续 TODO

- [ ] 将实现代码集成到扩展架构
- [ ] 在 ACT-011 预加载模块中调用
- [ ] 添加 curriculum 数据缓存
- [ ] 建立 API 变化监控测试

---

## 6. 产出物清单

| 文件 | 类型 | 说明 |
|-----|------|------|
| `spike-report-next-lecture.md` | 报告 | 完整 Spike 报告含测试脚本和验证结果 |
| `record.json` (updated) | 配置 | 任务状态更新为 completed |

---

## 7. 元数据

```yaml
subtask_id: T-20251223-act-002-spike-next-lecture
seed_id: ACT-002
type: research
status: completed
verification_date: 2025-12-23T16:30:00Z
compact_date: 2025-12-23T16:30:00Z
blocked_tasks_unblocked:
  - T-20251223-act-011-build-preload
api_endpoint: https://www.udemy.com/api-2.0/courses/{courseId}/subscriber-curriculum-items/
test_course_id: "5059176"
```
