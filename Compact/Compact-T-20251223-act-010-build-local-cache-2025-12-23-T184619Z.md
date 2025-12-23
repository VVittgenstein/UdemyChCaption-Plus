# Compact: T-20251223-act-010-build-local-cache

**Generated**: 2025-12-23T18:46:19Z
**Task**: 实现本地缓存模块（IndexedDB 存储已翻译字幕）
**Status**: Completed
**Owner**: claude-code

---

## 1. 范围对齐

| 维度 | 内容 |
|------|------|
| **Subtask ID** | T-20251223-act-010-build-local-cache |
| **所属功能** | FR-07 本地缓存避免重复翻译 |
| **依赖任务** | T-20251223-act-004-design-architecture (已完成) |
| **并行任务** | ACT-005, ACT-006, ACT-009 |
| **下游消费** | ACT-007 (LLM翻译), ACT-012 (版本检测), ACT-011 (预加载) |

---

## 2. 已落实事实 (Confirmed Facts)

### 2.1 验收标准达成

| # | 验收条件 | 状态 | 验证方式 |
|---|---------|------|---------|
| 1 | 使用 IndexedDB 存储翻译结果 | ✅ | 代码实现 + 38个单元测试 |
| 2 | 缓存键为课程/课时唯一标识 | ✅ | `generateCacheKey(courseId, lectureId)` → `${courseId}-${lectureId}` |
| 3 | 数据结构包含完整字段 | ✅ | SubtitleCacheEntry 类型定义 |
| 4 | 缓存命中时 0 API 调用 | ✅ | getCache() 直接返回本地数据 |
| 5 | 浏览器重启后数据持久 | ✅ | IndexedDB 原生特性 |
| 6 | 提供查询/写入/删除接口 | ✅ | CRUD 函数完整实现 |
| 7 | 缓存大小管理 (LRU 淘汰) | ✅ | evictIfNeeded() + touchCache() |

### 2.2 产出文件

| 文件 | 行数 | 用途 |
|------|------|------|
| `src/storage/subtitle-cache.ts` | ~450 | 主模块，IndexedDB 操作封装 |
| `src/storage/__tests__/subtitle-cache.test.ts` | ~350 | 单元测试 (38 cases) |
| `src/test-setup.ts` | ~10 | Jest polyfill (structuredClone) |

### 2.3 依赖变更

| 包名 | 版本 | 用途 |
|------|------|------|
| `fake-indexeddb` | ^6.0.0 | devDependency, 测试环境 IndexedDB mock |

---

## 3. 接口 & 行为变更

### 3.1 新增公共 API

```typescript
// === 函数式 API ===
generateCacheKey(courseId: string, lectureId: string): string
getCache(courseId, lectureId, originalHash?): Promise<CacheLookupResult>
setCache(input: CacheEntryInput, options?: CacheOptions): Promise<SubtitleCacheEntry>
deleteCache(courseId, lectureId): Promise<boolean>
deleteCourseCache(courseId): Promise<number>
clearAllCache(): Promise<void>

// === 查询 API ===
getCourseEntries(courseId): Promise<SubtitleCacheEntry[]>
getAllEntries(): Promise<SubtitleCacheEntry[]>
getCacheCount(): Promise<number>
getCacheStats(): Promise<CacheStats>

// === LRU 管理 ===
touchCache(courseId, lectureId): Promise<boolean>
evictIfNeeded(options?: CacheOptions): Promise<number>
cleanupCache(options?: CacheOptions): Promise<CleanupResult>

// === 工具函数 ===
isIndexedDBAvailable(): boolean
deleteDatabase(): Promise<void>

// === 类式 API ===
class SubtitleCache {
  get(), set(), delete(), deleteCourse(), clear()
  has(), hasValid(), getCount(), getStats()
  getCourseEntries(), cleanup(), setOptions()
}

// === 单例导出 ===
export const subtitleCache: SubtitleCache
```

### 3.2 新增类型定义 (在 subtitle-cache.ts 内)

```typescript
interface CacheOptions {
  maxEntries?: number      // 默认 500
  maxSizeBytes?: number    // 默认 100MB
  autoEvict?: boolean      // 默认 true
}

interface CacheStats {
  totalEntries: number
  totalSizeBytes: number
  oldestEntry: number | null
  newestEntry: number | null
  totalTokensUsed: number
  totalEstimatedCost: number
}

interface CacheLookupResult {
  hit: boolean
  entry?: SubtitleCacheEntry
  hashMatch?: boolean       // 原字幕哈希校验结果
}

interface CacheEntryInput {
  courseId, lectureId, courseName, lectureName: string
  originalHash, translatedVTT: string
  provider, model: string
  tokensUsed: number
  estimatedCost: number
}
```

### 3.3 复用现有类型

- `SubtitleCacheEntry` (来自 `src/types/index.ts`，已存在)

---

## 4. 关键实现要点

### 4.1 IndexedDB 存储设计

| 属性 | 值 |
|------|-----|
| 数据库名 | `UdemyCaptionCache` |
| 版本 | 1 |
| 对象仓库 | `subtitles` |
| 主键 | `id` (格式: `courseId-lectureId`) |
| 索引 | courseId, lectureId, updatedAt, createdAt, provider, model |

### 4.2 LRU 淘汰策略

- 触发条件: 条目数 > maxEntries 或 大小 > maxSizeBytes
- 排序依据: `updatedAt` 升序 (最久未访问优先淘汰)
- 触发时机: setCache() 后台自动触发 (autoEvict=true)
- 手动更新访问时间: touchCache() / SubtitleCache.get()

### 4.3 哈希校验机制

```typescript
// 场景: 检测原字幕是否变化
const result = await getCache(courseId, lectureId, currentHash);
if (result.hit && result.hashMatch) {
  // 缓存有效，直接使用
} else if (result.hit && !result.hashMatch) {
  // 原字幕已变化，需重新翻译
}
```

---

## 5. 风险 & TODO

### 5.1 显式限制

| 限制 | 说明 |
|------|------|
| 浏览器环境 | 依赖 IndexedDB API，不支持 Node.js (除测试环境) |
| 存储配额 | 受浏览器 IndexedDB 配额限制 (通常 50MB-无限制) |
| 同步限制 | 无跨设备同步，仅本地存储 |

### 5.2 已知 TODO / 未来扩展

| 项目 | 优先级 | 说明 |
|------|--------|------|
| 数据导出/导入 | P3 | 允许用户备份/恢复缓存 |
| 存储配额监控 | P3 | 检测浏览器配额并警告 |
| 压缩存储 | P3 | 对 translatedVTT 进行压缩减少占用 |

### 5.3 测试覆盖

| 类别 | 测试数 |
|------|--------|
| generateCacheKey | 3 |
| setCache/getCache | 4 |
| deleteCache | 2 |
| deleteCourseCache | 2 |
| clearAllCache | 1 |
| getCourseEntries | 2 |
| getAllEntries | 2 |
| getCacheCount | 1 |
| getCacheStats | 2 |
| evictIfNeeded | 2 |
| touchCache | 2 |
| cleanupCache | 1 |
| SubtitleCache class | 10 |
| subtitleCache singleton | 2 |
| Utility functions | 2 |
| **Total** | **38** |

---

## 6. 下游集成指引

### 6.1 与 LLM 翻译模块集成 (ACT-007)

```typescript
import { subtitleCache } from '@/storage/subtitle-cache';

// 翻译完成后存储
await subtitleCache.set({
  courseId, lectureId, courseName, lectureName,
  originalHash: computedHash,
  translatedVTT: result.vtt,
  provider: 'openai',
  model: 'gpt-4o',
  tokensUsed: result.tokens,
  estimatedCost: result.cost
});
```

### 6.2 与字幕抓取模块集成 (ACT-005)

```typescript
// 抓取前检查缓存
const cached = await subtitleCache.get(courseId, lectureId, originalHash);
if (cached.hit && cached.hashMatch) {
  return cached.entry.translatedVTT; // 直接返回缓存
}
// 否则继续抓取和翻译流程
```

### 6.3 与版本检测模块集成 (ACT-012)

```typescript
// 检测原字幕是否变化
const result = await subtitleCache.get(courseId, lectureId, newHash);
if (result.hit && !result.hashMatch) {
  // 原字幕已更新，触发重新翻译
}
```

---

## 7. 自测结果

```
Test Suites: 4 passed, 4 total
Tests:       163 passed, 163 total (含新增 38 个)
Time:        1.551 s
```

---

## 8. 配置变更

### jest.config.js
```javascript
setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts']
```

### package.json
```json
"devDependencies": {
  "fake-indexeddb": "^6.0.0"
}
```

---

**End of Compact**
