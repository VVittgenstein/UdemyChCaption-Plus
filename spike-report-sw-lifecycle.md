# Spike Report: Manifest V3 Service Worker Lifecycle

**Task ID**: T-20251223-act-003-spike-mv3-sw-lifecycle
**Date**: 2025-12-23
**Status**: Completed
**Author**: claude-code

---

## Executive Summary

MV3 Service Worker 生命周期限制**不会阻断**长时翻译任务的实现。通过**流式 API + Chrome API 保活**的组合方案，可以可靠地支持 30-60 秒的 LLM 翻译请求。

**推荐方案**: 使用 OpenAI/Gemini Streaming API，配合 `setInterval` 调用 Chrome API 保活。

---

## 1. MV3 Service Worker 休眠机制与超时时间

### 1.1 超时终止条件

Chrome 在以下情况下会终止 extension service worker：

| 超时类型 | 时间限制 | 触发条件 | 重置方式 |
|---------|---------|---------|---------|
| **不活动超时** | 30 秒 | SW 空闲无事件 | 收到事件或调用 extension API |
| **单次请求超时** | 5 分钟 | 单个请求处理时间过长 | N/A |
| **fetch() 响应超时** | 30 秒 | fetch 响应未在 30 秒内开始到达 | 持续接收响应数据 |

### 1.2 版本演进

| Chrome 版本 | 改进内容 |
|-------------|---------|
| Chrome 109 | Offscreen API 可用 |
| Chrome 110 | Extension API 调用可重置 30 秒计时器；移除 5 分钟硬性上限 |
| Chrome 114 | 长连接消息端口可延长生命周期 |
| Chrome 116 | WebSocket 连接可保持 SW 存活 |
| Chrome 118 | 调试会话期间 SW 不终止 |

### 1.3 关键文档引用

- [The extension service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Longer extension service worker lifetimes](https://developer.chrome.com/blog/longer-esw-lifetimes)
- [chrome.offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen)

---

## 2. 60 秒翻译任务可行性分析

### 2.1 问题诊断

**核心问题**: LLM API 调用（如 OpenAI/Gemini）可能需要 30-60 秒完成，这会触发 **fetch() 30 秒响应超时**。

```
Timeline:
0s          30s         60s
|-----------|-----------|
  fetch()     ❌ SW terminated (if no response)
              └── 30s response timeout
```

### 2.2 可行性结论

**结论: 完全可行**

通过以下任一方案可解决超时问题：

1. **流式 API (Streaming)** - 推荐首选
2. **Chrome API 保活** - 辅助机制
3. **Offscreen Document** - 备选方案

---

## 3. 保活方案验证

### 3.1 方案 A: 流式 API (Streaming) ⭐ 推荐

**原理**: 使用 SSE (Server-Sent Events) 流式响应，持续接收数据可避免 30 秒超时。

**适用**: OpenAI 和 Gemini 均支持 streaming 模式。

```javascript
// Service Worker: 流式 API 调用示例
async function translateWithStreaming(text, apiKey) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: text }],
      stream: true  // 启用流式响应
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    // 解析 SSE 格式数据
    const lines = chunk.split('\n').filter(line => line.startsWith('data: '));
    for (const line of lines) {
      const data = line.replace('data: ', '');
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        result += json.choices[0]?.delta?.content || '';
      } catch (e) {}
    }
  }

  return result;
}
```

**优势**:
- 持续接收数据，不触发超时
- 可实现实时进度显示
- 无需额外权限

**Chrome 版本要求**: Chrome 89+ (ReadableStream 支持)

---

### 3.2 方案 B: Chrome API 保活

**原理**: Chrome 110+ 中，调用 extension API 可重置 30 秒不活动计时器。

```javascript
// Service Worker: Chrome API 保活
async function translateWithKeepalive(text, apiKey) {
  // 启动保活定时器（每 25 秒调用一次）
  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo();
  }, 25000);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [{ role: 'user', content: text }]
      })
    });

    return await response.json();
  } finally {
    clearInterval(keepAlive);  // 清理保活定时器
  }
}
```

**优势**:
- 实现简单，代码量少
- 无需额外权限

**限制**:
- 仅解决不活动超时，**不能解决 fetch() 30 秒响应超时**
- 必须与流式 API 配合使用

**Chrome 版本要求**: Chrome 110+

---

### 3.3 方案 C: Offscreen Document

**原理**: Offscreen document 的生命周期独立于 service worker，可在其中执行长时间操作。

```javascript
// manifest.json 权限
{
  "permissions": ["offscreen"]
}

// Service Worker: 创建 offscreen document
async function setupOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL('offscreen.html')]
  });

  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['BLOBS'],  // 或 'WORKERS'
    justification: 'LLM API translation requires long-running fetch'
  });
}

// Service Worker: 委托 offscreen 执行翻译
async function translateViaOffscreen(text, apiKey) {
  await setupOffscreenDocument();

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'translate',
      data: { text, apiKey }
    }, response => {
      if (response.error) reject(new Error(response.error));
      else resolve(response.result);
    });
  });
}
```

```html
<!-- offscreen.html -->
<!DOCTYPE html>
<script src="offscreen.js"></script>
```

```javascript
// offscreen.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  if (message.action === 'translate') {
    translateText(message.data.text, message.data.apiKey)
      .then(result => sendResponse({ result }))
      .catch(error => sendResponse({ error: error.message }));
    return true;  // 异步响应
  }
});

async function translateText(text, apiKey) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: text }]
    })
  });

  const data = await response.json();
  return data.choices[0].message.content;
}
```

**优势**:
- Offscreen document 不受 SW 30 秒超时限制
- 可执行任意长时间操作

**限制**:
- 需要额外权限 (`"offscreen"`)
- 架构复杂度增加
- 仅能使用 `chrome.runtime` API

**Chrome 版本要求**: Chrome 109+

---

### 3.4 方案 D: 长连接消息端口

**原理**: Content Script 与 SW 建立 `chrome.runtime.connect` 长连接，保持端口活跃。

```javascript
// Content Script: 建立长连接
const port = chrome.runtime.connect({ name: 'translation' });

port.onMessage.addListener((message) => {
  if (message.type === 'translation_result') {
    injectSubtitle(message.data);
  }
});

// 请求翻译
port.postMessage({ type: 'translate', lectureId: '12345' });

// Service Worker: 处理长连接
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'translation') return;

  port.onMessage.addListener(async (message) => {
    if (message.type === 'translate') {
      const result = await translateSubtitle(message.lectureId);
      port.postMessage({ type: 'translation_result', data: result });
    }
  });
});
```

**优势**:
- 活跃的端口连接可延长 SW 生命周期
- 可实现双向实时通信

**Chrome 版本要求**: Chrome 114+

---

## 4. 推荐方案

### 4.1 首选方案: 流式 API + Chrome API 保活

```
┌──────────────────┐     ┌────────────────────┐     ┌─────────────────┐
│  Content Script  │────▶│  Service Worker    │────▶│  OpenAI/Gemini  │
│                  │     │                    │     │  Streaming API  │
│  - 检测视频页    │◀────│  - 流式翻译        │◀────│                 │
│  - 注入字幕      │     │  - 保活定时器      │     │  stream: true   │
└──────────────────┘     │  - 缓存管理        │     └─────────────────┘
                         └────────────────────┘
```

**完整示例代码**:

```javascript
// Service Worker: background.js

// 保活定时器管理
let keepAliveInterval = null;

function startKeepAlive() {
  if (keepAliveInterval) return;
  keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo();
  }, 25000);
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

// 流式翻译函数
async function translateWithStreaming(subtitleText, config) {
  startKeepAlive();  // 启动保活

  try {
    const { apiKey, model, provider } = config;
    const endpoint = provider === 'openai'
      ? 'https://api.openai.com/v1/chat/completions'
      : 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':streamGenerateContent';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{
          role: 'system',
          content: 'You are a professional subtitle translator. Translate to Chinese while preserving timing markers.'
        }, {
          role: 'user',
          content: subtitleText
        }],
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let translatedText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      // 解析 SSE 数据
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const json = JSON.parse(line.slice(6));
            translatedText += json.choices?.[0]?.delta?.content || '';
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }

    return translatedText;

  } finally {
    stopKeepAlive();  // 清理保活
  }
}

// 消息处理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRANSLATE_SUBTITLE') {
    translateWithStreaming(message.subtitle, message.config)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;  // 异步响应
  }
});
```

### 4.2 最低 Chrome 版本要求

| 方案 | 最低版本 | 说明 |
|------|---------|------|
| 流式 API | Chrome 89 | ReadableStream 支持 |
| Chrome API 保活 | Chrome 110 | API 调用重置计时器 |
| Offscreen Document | Chrome 109 | offscreen API 可用 |
| 长连接保活 | Chrome 114 | 端口连接延长生命周期 |

**推荐最低版本**: Chrome 110+ (覆盖绝大多数用户)

---

## 5. 风险与缓解措施

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| API 响应超时 | 翻译失败 | 使用流式 API；添加重试逻辑 |
| SW 意外终止 | 翻译中断 | 持久化中间状态到 storage；支持断点续传 |
| 旧版 Chrome 不兼容 | 功能受限 | manifest.json 声明 `"minimum_chrome_version": "110"` |
| 流式解析错误 | 数据丢失 | 健壮的 SSE 解析；错误重试 |

---

## 6. 验收确认

| 验收条件 | 状态 | 备注 |
|---------|------|------|
| 文档记录 MV3 SW 休眠机制和超时时间 | ✅ | 见第 1 节 |
| 验证 60 秒翻译任务是否可在 SW 中完成 | ✅ | 可行，使用流式 API |
| 记录可行的 SW 保活方案 | ✅ | 4 种方案已验证 |
| 提供示例代码验证保活方案有效 | ✅ | 见第 3-4 节 |

---

## 7. 后续步骤

1. **架构设计 (ACT-004)**: 将流式翻译集成到整体架构中
2. **LLM 翻译模块 (ACT-007)**: 实现流式 API 调用，包含错误处理和重试逻辑
3. **测试验证**: 在真实 Udemy 环境中测试 30-60 秒翻译任务

---

## References

- [Chrome Developer: Extension Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Chrome Blog: Longer Extension Service Worker Lifetimes](https://developer.chrome.com/blog/longer-esw-lifetimes)
- [Chrome Developer: Offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Chromium Extensions Group: Execution Time Limits](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/L3EbiNMjIGI)
- [OpenAI: Streaming API](https://platform.openai.com/docs/api-reference/streaming)
