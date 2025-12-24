# UdemyChCaption-Plus

Udemy 字幕语义重构 + AI 翻译 + 时轴重对齐，原生替换中文字幕轨道的 Chrome 扩展。

## 功能特性

- **AI 驱动翻译**：使用 OpenAI 或 Google Gemini API 进行高质量字幕翻译
- **原生字幕替换**：直接替换 Udemy 播放器的字幕轨道，无缝体验
- **字幕预加载**：可选预加载下一课字幕，减少等待时间
- **费用估算**：实时显示 Token 消耗和费用估算
- **本地存储**：所有数据（API Key、设置、缓存）仅存储在本地浏览器

## 安装指南

### 方式一：从源码安装（开发者模式）

1. **克隆仓库**
   ```bash
   git clone https://github.com/VVittgenstein/UdemyChCaption-Plus.git
   cd UdemyChCaption-Plus
   ```

2. **安装依赖并构建**
   ```bash
   npm install
   npm run build
   ```

3. **在 Chrome 中加载扩展**
   - 打开 Chrome 浏览器，访问 `chrome://extensions/`
   - 开启右上角的「开发者模式」
   - 点击「加载已解压的扩展程序」
   - 选择项目的 `dist` 目录

4. **固定扩展图标**（可选）
   - 点击 Chrome 工具栏的扩展图标（拼图图标）
   - 找到「Udemy 字幕增强」，点击图钉固定

### 方式二：从 Chrome Web Store 安装

*即将上线，敬请期待*

## 使用说明

### 1. 获取 API Key

本扩展需要您自己的 LLM API Key。支持以下服务：

**OpenAI**
1. 访问 [OpenAI Platform](https://platform.openai.com/)
2. 注册/登录账户
3. 进入 [API Keys](https://platform.openai.com/api-keys) 页面
4. 点击「Create new secret key」创建新密钥
5. 复制并妥善保存（密钥只显示一次）

**Google Gemini**
1. 访问 [Google AI Studio](https://aistudio.google.com/)
2. 登录 Google 账户
3. 点击「Get API key」
4. 创建或选择项目，获取 API Key

### 2. 配置扩展

1. 点击 Chrome 工具栏中的扩展图标
2. 在弹出窗口中：
   - **翻译服务**：选择 OpenAI 或 Google Gemini
   - **API Key**：粘贴您的 API Key
   - **模型**：选择翻译模型（推荐 GPT-4o-mini 或 Gemini Flash）
3. 点击「保存并验证」确认 API Key 有效

### 3. 开启字幕翻译

1. 打开任意 Udemy 课程视频页面
2. 点击扩展图标，开启「字幕替换」开关
3. 扩展会自动获取并翻译当前视频的字幕

### 4. 高级设置

| 选项 | 说明 |
|------|------|
| 自动翻译字幕 | 切换视频时自动翻译新字幕 |
| 预加载下一课字幕 | 提前翻译下一课的字幕 |
| 显示费用估算 | 在弹窗中显示 Token 消耗和费用 |
| 显示翻译进度 | 在页面上显示翻译状态指示器 |

### 5. 手动操作

- **重新翻译当前课**：如果翻译结果不理想，可点击此按钮重新翻译

## 常见问题 (FAQ)

### Q: API Key 安全吗？

A: 是的。您的 API Key 仅存储在本地浏览器的 Chrome Storage 中，不会上传到任何服务器。翻译请求直接从您的浏览器发送到 OpenAI/Gemini 官方 API，不经过任何中间服务器。

### Q: 翻译一门课程大概需要多少费用？

A: 费用取决于课程字幕的字数和您选择的模型。以 GPT-4o-mini 为例：
- 一门 10 小时的课程约有 5-8 万字字幕
- 翻译费用约为 $0.05 - $0.15
- Gemini Flash 模型可能更便宜

您可以开启「显示费用估算」选项实时查看消耗。

### Q: 支持哪些语言的翻译？

A: 目前主要优化了英文到中文的翻译。理论上可以翻译任何语言，但翻译质量可能有所不同。

### Q: 为什么有些课程无法翻译？

A: 可能的原因：
- 课程本身没有字幕
- 网络连接问题
- API Key 余额不足或过期
- API 服务暂时不可用

### Q: 翻译后的字幕可以导出吗？

A: 目前版本暂不支持导出功能，未来版本会考虑添加。

### Q: 扩展会影响 Udemy 网站的正常使用吗？

A: 不会。扩展只在您开启字幕替换功能时才会生效，关闭后 Udemy 完全恢复原样。

### Q: 如何更新扩展？

A:
- **Chrome Web Store 版本**：Chrome 会自动更新
- **开发者模式版本**：拉取最新代码后重新构建，然后在 `chrome://extensions/` 点击刷新按钮

## 隐私政策

详见 [PRIVACY.md](./PRIVACY.md)

**要点**：
- 所有数据仅存储在本地浏览器
- API Key 仅用于直连官方 LLM 服务
- 不收集任何用户个人信息

## 技术栈

- TypeScript
- Chrome Extension Manifest V3
- IndexedDB (字幕缓存)
- OpenAI API / Google Gemini API

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 运行测试
npm test

# 类型检查
npm run type-check
```

## 许可证

MIT License
