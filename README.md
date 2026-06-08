# DreamHub

**本地 AI 创意工作室** — 基于火山引擎，支持文本对话、图像生成、视频生成与分镜规划，所有内容保存在本地。

---

## 功能

| 模块 | 说明 |
|------|------|
| **文本生成** | 多模态对话，支持图片、视频、文档上传 |
| **图像生成** | 文生图 / 图文生图 / 多图融合，最高 4K |
| **视频生成** | 文生视频，支持参考图/视频/音频，后台轮询 |
| **智能超清** | AI MediaKit 视频超分，最高 4K |
| **StoryBoard** | 剧集→场景→分镜三层规划，可视化节点画布，AI 剧本拆分 |
| **工作空间** | 本地文件管理，拖拽上传，视频帧提取 |

## 快速开始

**环境要求：** Python 3.8+

```bash
# Windows
run.bat

# macOS / Linux
chmod +x run.sh && ./run.sh
```

首次运行自动创建虚拟环境、安装依赖，完成后浏览器打开 `http://localhost:8765`。

### 配置密钥

复制 `config.json.example` 为 `config.json`，填入以下密钥（或启动后在设置页面填写）：

| 密钥 | 用途 | 获取地址 |
|------|------|----------|
| 火山方舟 API Key | 文本 / 图像 / 视频生成 | [console.volcengine.com/ark](https://console.volcengine.com/ark) |
| TOS AK / SK | 参考素材上传 | [console.volcengine.com/tos](https://console.volcengine.com/tos) |
| AI MediaKit API | 视频智能超清 | [console.volcengine.com/ai-mediakit](https://console.volcengine.com/ai-mediakit) |

## 支持的模型

| 类型 | 模型 |
|------|------|
| 文本 | Doubao Seed 2.0 Pro / Lite |
| 图像 | Seedream 4.0 / 4.5 / 5.0 Lite |
| 视频 | Seedance 2.0 / 2.0 Fast |

## StoryBoard

三层创意规划工具：**剧集 → 场景 → 分镜画布**

- 可视化节点画布（提示词 / 图像 / 视频 / 音频节点）
- AI 剧本导入：自动拆分剧集、场景、镜头
- 角色 / 道具 / 场景素材库，`@mention` 引用
- AI 助手：提示词优化、分镜设计
- 一键同步本地文件夹结构

## 技术栈

- **后端**：Python 标准库 `http.server`，单文件，无框架
- **前端**：原生 JavaScript + Tailwind CSS（CDN）
- **StoryBoard**：Vue 3 + Vue Flow（均通过 esm.sh CDN 加载）
- **依赖**：`tos`（火山引擎对象存储）、`opencv-python`（帧提取）、`Pillow`（图标生成）

## 安全说明

- `config.json` 包含 API 密钥，已加入 `.gitignore`，请勿提交
- 所有生成内容仅保存在本地，不上传至第三方服务器

## 许可证

MIT
