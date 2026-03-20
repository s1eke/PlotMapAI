<h1 align="center">PlotMapAI</h1>

<p align="center">
  <a href="https://github.com/s1eke-labs/PlotMapAI/actions/workflows/ci.yml"><img src="https://github.com/s1eke-labs/PlotMapAI/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS">
  <img src="https://img.shields.io/badge/Vitest-4-6E9F18?logo=vitest&logoColor=white" alt="Vitest">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

<p align="center">
  AI 驱动的小说阅读器 — 支持 EPUB / TXT，章节分析、人物关系图谱、文本净化，数据全部存储在浏览器本地。
</p>

---

## 功能特性

- **小说阅读** — 支持 EPUB / TXT 格式，可自定义主题、字号、行距、两栏分页模式
- **AI 章节分析** — 对接 OpenAI 兼容 API，生成章节摘要、角色提取、关键要点、关系分析
- **人物关系图谱** — 可视化展示整部小说的人物关系网络和角色重要度
- **文本净化** — 可配置正则规则清除广告、译注等干扰内容，支持按范围和书籍筛选
- **章节检测** — 自动识别 TXT 章节标题，规则支持 YAML 导入/导出
- **离线优先** — 所有数据存储在 IndexedDB，无需后端数据库
- **中英双语** — 支持中文和英文界面

## 截图

| 书架 | 阅读器 |
|:---:|:---:|
| ![书架](docs/images/bookshelf.png) | ![阅读器](docs/images/reader.png) |

| 书籍详情 | 人物图谱 |
|:---:|:---:|
| ![书籍详情](docs/images/book-detail.png) | ![人物图谱](docs/images/character-graph.png) |

| 设置 |
|:---:|
| ![设置](docs/images/settings.png) |

## 技术栈

| 分类 | 技术 |
|------|------|
| 框架 | React 19 |
| 构建 | Vite 8 |
| 语言 | TypeScript 5.9 |
| 样式 | Tailwind CSS v4 |
| 存储 | Dexie (IndexedDB) |
| 解析 | JSZip (EPUB)、原生 JS (TXT/编码检测) |
| 路由 | React Router 7 |
| 国际化 | i18next + react-i18next |
| 测试 | Vitest 4、Testing Library、MSW v2 |
| 代码检查 | ESLint 9 + typescript-eslint |

## 快速开始

```bash
npm install
npm run dev
```

打开 http://localhost:5173，应用完全在浏览器端运行，无需后端服务。

如需使用 AI 分析功能，在设置页面配置 OpenAI 兼容的 API 地址和密钥。

### 调试模式

```bash
npm run dev:debug
```

启用浮动调试面板，显示分类日志。

## 脚本命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run dev:debug` | 启动开发服务器（含调试日志） |
| `npm run build` | 类型检查 + 生产构建 |
| `npm run preview` | 预览生产构建 |
| `npm run lint` | 运行 ESLint |
| `npm test` | 运行测试 |
| `npm run test:watch` | 监听模式运行测试 |
| `npm run coverage` | 测试覆盖率报告 |

## Docker 部署

```bash
docker compose up -d
```

通过 nginx 在 80 端口提供前端静态文件服务。

## 项目结构

```
src/
├── api/            # 数据访问层（Dexie IndexedDB）
├── components/     # 可复用 UI 组件
├── constants/      # 常量（阅读器主题等）
├── context/        # React Context（主题等）
├── i18n/           # 国际化（中文/英文）
├── pages/          # 页面级组件
├── services/       # 业务逻辑（解析、AI、数据库、调试）
├── test/           # 测试基础设施（MSW mock、setup）
└── utils/          # 工具函数（cn.ts 类名合并）
```

## 配置文件

- `defaultTocRules.yaml` — 默认章节检测规则（首次启动时自动填充）
- 净化规则 — 在设置页面通过 YAML 导入/导出

## 许可证

[MIT](LICENSE)
