# Compact: T-20251223-act-006-build-webvtt-parser

**Subtask**: 实现 WebVTT 解析与生成模块
**Status**: completed
**Timestamp**: 2025-12-23T17:39:10Z
**Owner**: claude-code

---

## 1. 范围对齐

| 验收标准 | 状态 | 验证方式 |
|---------|------|---------|
| 解析器可正确解析标准 WebVTT 文件（含 cue ID、时间戳、文本） | ✅ 完成 | 12 个 Parser 测试用例 |
| 生成器可将解析结果还原为有效 WebVTT 字符串 | ✅ 完成 | 17 个 Generator 测试用例 |
| 单元测试覆盖各种 VTT 格式（多行文本、样式标签等） | ✅ 完成 | 61 个测试全部通过 |
| 解析后再生成的文件与原文件语义等价 | ✅ 完成 | 4 个 Round-Trip 测试 |
| 边界情况处理（空文件、格式错误等） | ✅ 完成 | 空输入、null、无签名、错误时间戳测试 |

---

## 2. 已落实事实

### 2.1 新增文件

| 文件 | 行数 | 职责 |
|-----|------|-----|
| `src/utils/webvtt-parser.ts` | ~400 | WebVTT 解析，字符串 → 结构化数据 |
| `src/utils/webvtt-generator.ts` | ~350 | WebVTT 生成，结构化数据 → 字符串 |
| `src/utils/__tests__/webvtt.test.ts` | ~450 | 单元测试 (61 cases) |
| `src/types/index.ts` | +90 | 新增 VTT 相关类型定义 |

### 2.2 新增类型定义 (src/types/index.ts)

```typescript
// 时间戳结构
interface VTTTimestamp {
  hours: number;      // 0-99
  minutes: number;    // 0-59
  seconds: number;    // 0-59
  milliseconds: number; // 0-999
}

// 单个字幕条目
interface VTTCue {
  id?: string;
  startTime: VTTTimestamp;
  endTime: VTTTimestamp;
  text: string;
  settings?: string;  // position, align 等
}

// 完整 VTT 文件结构
interface VTTFile {
  header?: string;
  styles?: string[];
  regions?: VTTRegion[];
  cues: VTTCue[];
  notes?: string[];
}

interface VTTRegion { id: string; settings: string; }
interface VTTParseResult { success: boolean; data?: VTTFile; error?: string; warnings?: string[]; }
interface VTTGeneratorOptions { includeCueIds?: boolean; includeStyles?: boolean; ... }
```

---

## 3. 接口 & 行为变更

### 3.1 Parser 导出接口 (webvtt-parser.ts)

| 函数 | 签名 | 用途 |
|-----|------|-----|
| `parseVTT` | `(vttString: string) => VTTParseResult` | **主入口**：解析 VTT 字符串 |
| `parseTimestamp` | `(timestamp: string) => VTTTimestamp \| null` | 解析单个时间戳 |
| `timestampToMs` | `(ts: VTTTimestamp) => number` | 时间戳转毫秒 |
| `msToTimestamp` | `(ms: number) => VTTTimestamp` | 毫秒转时间戳 |
| `compareTimestamps` | `(a, b) => number` | 比较两个时间戳 |
| `isValidVTT` | `(content: string) => boolean` | 检查是否为有效 VTT |
| `stripVTTTags` | `(text: string) => string` | 移除 VTT 样式标签 |
| `getVTTDuration` | `(vttFile: VTTFile) => number` | 获取总时长(ms) |
| `getCuesAtTime` | `(vttFile, timeMs) => VTTCue[]` | 获取指定时间的字幕 |

### 3.2 Generator 导出接口 (webvtt-generator.ts)

| 函数 | 签名 | 用途 |
|-----|------|-----|
| `generateVTT` | `(vttFile: VTTFile, options?) => string` | **主入口**：生成 VTT 字符串 |
| `generateCue` | `(cue: VTTCue, options?) => string` | 生成单个 cue 块 |
| `generateFromCues` | `(cues: VTTCue[], header?) => string` | 从 cue 数组快速生成 |
| `generateDataUri` | `(vttFile \| string) => string` | **关键**：生成 data URI 用于 track 注入 |
| `generateBlobUrl` | `(vttFile \| string) => string` | 生成 Blob URL (浏览器) |
| `formatTimestamp` | `(ts, useShort?) => string` | 格式化时间戳 |
| `createTimestamp` | `(h, m, s, ms) => VTTTimestamp` | 创建时间戳 |
| `createCue` | `(...) => VTTCue` | 创建 cue 对象 |
| `replaceCueTexts` | `(original, newTexts) => VTTFile` | **翻译关键**：替换文本保留时间戳 |
| `mergeVTTFiles` | `(files: VTTFile[]) => VTTFile` | 合并多个 VTT |
| `extractCueTexts` | `(vttFile) => string[]` | **翻译关键**：提取所有文本 |
| `validateVTTFile` | `(vttFile) => {valid, errors}` | 验证结构 |

### 3.3 下游模块依赖关系

```
ACT-007 (LLM 翻译模块)
  ├── 输入: extractCueTexts() 提取待翻译文本
  └── 输出: replaceCueTexts() 将翻译结果回填

ACT-008 (字幕注入模块)
  └── 输入: generateDataUri() 生成可注入的 VTT data URI
```

---

## 4. 关键实现要点

### 4.1 解析器特性

- **BOM 处理**: 自动剥离 `\uFEFF` 前缀
- **行结束符**: 支持 `\r\n`, `\r`, `\n` 三种格式
- **时间戳格式**: 支持 `HH:MM:SS.mmm` 和 `MM:SS.mmm`
- **容错解析**: 无效 cue 记录 warning 但不中断解析
- **支持块类型**: STYLE, REGION, NOTE, Cue

### 4.2 生成器特性

- **Data URI 编码**: Base64 编码，MIME type `text/vtt`
- **选项控制**: 可配置是否包含 cue ID、styles、regions、notes
- **短时间戳**: 可选 `MM:SS.mmm` 格式（hours=0 时）

### 4.3 翻译场景工作流

```typescript
// 1. 解析原文 VTT
const parsed = parseVTT(originalVTT);

// 2. 提取文本送翻译
const texts = extractCueTexts(parsed.data);
const translated = await llmTranslate(texts);

// 3. 回填翻译结果
const newVTT = replaceCueTexts(parsed.data, translated);

// 4. 生成可注入的 data URI
const dataUri = generateDataUri(newVTT);
```

---

## 5. 风险 & TODO

### 5.1 显式限制

| 限制 | 说明 |
|-----|------|
| 无 HTML 实体编码 | `stripVTTTags` 只做解码，生成器不做编码 |
| Region 解析简化 | 只保存原始设置字符串，不解析具体属性 |
| 无 cue 内时间戳处理 | `<00:00:00.000>` 类 karaoke 标签被 stripVTTTags 移除 |

### 5.2 潜在风险

| 风险 | 影响 | 缓解措施 |
|-----|------|---------|
| `generateBlobUrl` 环境限制 | Node.js 环境无 Blob/URL | 已添加环境检测，抛出明确错误 |
| 大文件性能 | 未做流式解析 | VTT 通常 < 1MB，暂不影响 |

### 5.3 后续 TODO（非本任务范围）

- [ ] ACT-007 集成时验证 `extractCueTexts` + `replaceCueTexts` 工作流
- [ ] ACT-008 集成时验证 `generateDataUri` 在真实 Udemy 页面的注入效果

---

## 6. 测试覆盖

```
Test Suites: 1 passed, 1 total
Tests:       61 passed, 61 total
Time:        0.749s

Categories:
├── Parser 基础解析: 12 tests
├── Timestamp 处理: 7 tests
├── VTT 验证与工具函数: 8 tests
├── Generator 生成: 17 tests
├── 辅助函数: 12 tests
└── Round-Trip 验证: 4 tests
```

---

## 7. 变更文件清单

```
src/
├── types/
│   └── index.ts              [MODIFIED] +90 lines (VTT types)
└── utils/
    ├── webvtt-parser.ts      [NEW] ~400 lines
    ├── webvtt-generator.ts   [NEW] ~350 lines
    └── __tests__/
        └── webvtt.test.ts    [NEW] ~450 lines
```

---

## 8. Code Review

**Review Status**: Passed
**Reviewed At**: 2025-12-24T00:30:00Z

### Findings Resolved

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| CR-006-01 | P2 | NOTE blocks dropped on default generation - `includeNotes` defaults to `false`, causing parse→generate round-trips to silently omit NOTE blocks | Changed `DEFAULT_OPTIONS.includeNotes` from `false` to `true` in [webvtt-generator.ts:38](src/utils/webvtt-generator.ts#L38), consistent with other metadata options |
| CR-006-02 | P1 | Region blocks never parsed - REGION parser looks for `id=` prefix but WebVTT uses colon-separated keys (`id:region1`), causing all REGION blocks to be discarded | Changed from `line.startsWith('id=')` to regex `/(?:^|\s)id:([^\s]+)/` in [webvtt-parser.ts:337-342](src/utils/webvtt-parser.ts#L337-L342), properly matching WebVTT region settings format |
| CR-006-03 | P1 | Region IDs capture full setting string - Regex `/(?:^|\\s)id:([^\\s]+)/` uses double backslash which matches literal `\s` instead of whitespace character class, causing IDs like `region1 width:40% lines:3` instead of `region1` | Changed to `/(?:^|\s)id:([^\s]+)/` with single backslash in [webvtt-parser.ts:339](src/utils/webvtt-parser.ts#L339), correctly stopping ID capture at whitespace |

### Changes Made

```diff
// src/utils/webvtt-generator.ts:33-40
const DEFAULT_OPTIONS: VTTGeneratorOptions = {
  includeCueIds: true,
  includeStyles: true,
  includeRegions: true,
-  includeNotes: false,
+  includeNotes: true,
  useShortTimestamp: false,
};
```

```diff
// src/utils/webvtt-parser.ts:337-342 (initial fix for colon-separated format)
-    // Extract region ID
-    if (line.startsWith('id=')) {
-      regionId = line.substring(3);
-    }
+    // Extract region ID (WebVTT uses colon-separated key:value pairs)
+    // Region settings can be space-separated on a line, e.g., "id:region1 width:50%"
+    const idMatch = line.match(/(?:^|\s)id:([^\s]+)/);
+    if (idMatch) {
+      regionId = idMatch[1];
+    }
```

```diff
// src/utils/webvtt-parser.ts:339 (fix for regex escape)
-    const idMatch = line.match(/(?:^|\\s)id:([^\\s]+)/);
+    const idMatch = line.match(/(?:^|\s)id:([^\s]+)/);
```

---

**Compact By**: Claude Code
**Review Status**: Passed
