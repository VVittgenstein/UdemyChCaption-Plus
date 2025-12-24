# 隐私政策 / Privacy Policy

**最后更新 / Last Updated: 2025-12-24**

---

## 中文版

### 概述

Udemy 字幕增强 (UdemyChCaption-Plus) 是一款 Chrome 浏览器扩展，用于为 Udemy 视频课程提供 AI 驱动的中文字幕翻译功能。我们高度重视用户隐私，本扩展的设计原则是**最小化数据收集**。

### 数据存储

**所有数据仅存储在您的本地浏览器中**，包括：

- API Key（您的 OpenAI 或 Google Gemini API 密钥）
- 用户偏好设置（翻译服务选择、模型选择、功能开关等）
- 缓存的翻译结果

我们**不会**将上述任何数据上传至我们的服务器或任何第三方服务器。

### API Key 使用

- 您的 API Key 仅用于**直接连接**至您所选择的官方 LLM 服务（OpenAI API 或 Google Gemini API）
- API 请求从您的浏览器直接发送至官方服务端点，**不经过任何中间服务器**
- 我们无法访问、查看或存储您的 API Key

### 数据收集

本扩展**不收集任何用户个人信息**，包括但不限于：

- 个人身份信息（姓名、邮箱、电话等）
- 浏览历史或浏览行为
- Udemy 账户信息
- 视频观看记录
- 设备信息或唯一标识符

### 网络通信

本扩展仅在以下情况下进行网络通信：

1. **字幕翻译请求**：当您启用字幕翻译功能时，扩展会将原始字幕文本发送至您配置的 LLM 服务（OpenAI 或 Google Gemini）进行翻译
2. **API Key 验证**：当您保存 API Key 时，扩展会向对应的官方 API 发送验证请求

所有网络请求均使用 HTTPS 加密传输。

### 第三方服务

本扩展可能使用以下第三方服务，这些服务受其各自隐私政策的约束：

- [OpenAI API](https://openai.com/policies/privacy-policy)
- [Google Gemini API](https://policies.google.com/privacy)

请注意，当您使用这些服务时，您发送的字幕内容将受到相应服务提供商隐私政策的约束。

### 权限说明

本扩展请求的浏览器权限及其用途：

| 权限 | 用途 |
|------|------|
| `activeTab` | 访问当前 Udemy 页面以注入字幕 |
| `storage` | 在本地存储您的设置和缓存 |
| `host_permissions` (udemy.com) | 在 Udemy 网站上运行扩展功能 |

### 数据安全

- 所有敏感数据（如 API Key）使用 Chrome 的安全存储 API 进行存储
- 扩展不包含任何数据分析或追踪代码
- 代码开源，可供审查

### 儿童隐私

本扩展不针对 13 岁以下儿童，也不会有意收集任何儿童的个人信息。

### 隐私政策更新

如果我们对本隐私政策进行重大更改，将在扩展更新日志中通知用户。

### 联系方式

如有任何隐私相关问题，请通过 GitHub Issues 联系我们。

---

## English Version

### Overview

Udemy Subtitle Enhancement (UdemyChCaption-Plus) is a Chrome browser extension that provides AI-powered Chinese subtitle translation for Udemy video courses. We take user privacy seriously, and this extension is designed with the principle of **minimal data collection**.

### Data Storage

**All data is stored locally in your browser only**, including:

- API Key (your OpenAI or Google Gemini API key)
- User preferences (translation service selection, model selection, feature toggles, etc.)
- Cached translation results

We **do not** upload any of the above data to our servers or any third-party servers.

### API Key Usage

- Your API Key is used **only for direct connection** to the official LLM service of your choice (OpenAI API or Google Gemini API)
- API requests are sent directly from your browser to official service endpoints, **without passing through any intermediary servers**
- We cannot access, view, or store your API Key

### Data Collection

This extension **does not collect any personal user information**, including but not limited to:

- Personal identification information (name, email, phone, etc.)
- Browsing history or behavior
- Udemy account information
- Video watching history
- Device information or unique identifiers

### Network Communication

This extension only communicates over the network in the following cases:

1. **Subtitle translation requests**: When you enable subtitle translation, the extension sends the original subtitle text to your configured LLM service (OpenAI or Google Gemini) for translation
2. **API Key validation**: When you save an API Key, the extension sends a validation request to the corresponding official API

All network requests use HTTPS encrypted transmission.

### Third-Party Services

This extension may use the following third-party services, which are subject to their respective privacy policies:

- [OpenAI API](https://openai.com/policies/privacy-policy)
- [Google Gemini API](https://policies.google.com/privacy)

Please note that when you use these services, the subtitle content you send is subject to the privacy policies of the respective service providers.

### Permissions Explanation

Browser permissions requested by this extension and their purposes:

| Permission | Purpose |
|------------|---------|
| `activeTab` | Access current Udemy page to inject subtitles |
| `storage` | Store your settings and cache locally |
| `host_permissions` (udemy.com) | Run extension functionality on Udemy website |

### Data Security

- All sensitive data (such as API Key) is stored using Chrome's secure storage API
- The extension does not contain any analytics or tracking code
- The code is open source and available for review

### Children's Privacy

This extension is not intended for children under 13 years of age, and we do not knowingly collect any personal information from children.

### Privacy Policy Updates

If we make significant changes to this privacy policy, users will be notified in the extension's update log.

### Contact

For any privacy-related questions, please contact us via GitHub Issues.
