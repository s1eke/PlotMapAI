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

- **小说阅读** — 支持 EPUB / TXT 格式，滚动/分页双模式，动画翻页（cover/slide），拖拽手势翻页
- **AI 章节分析** — 对接 OpenAI 兼容 API，生成章节摘要、角色提取、关键要点、关系分析，支持暂停/恢复
- **人物关系图谱** — 可视化展示整部小说的人物关系网络和角色重要度，支持拖拽和缩放
- **文本净化** — 可配置正则规则清除广告、译注等干扰内容，支持互斥组（如缩进/去缩进二选一）、默认规则保护、YAML 导入/导出
- **章节检测** — 自动识别 TXT 章节标题，自定义规则跳过弱标题校验
- **离线优先** — 所有数据存储在 IndexedDB（Dexie），API Key 使用 AES-256-GCM 加密存储
- **PWA** — 支持安装到桌面，自动更新提醒，独立窗口模式
- **移动端适配** — 全宽底部工具栏、BottomSheet 面板、安全区域（刘海屏）适配、触摸手势
- **跨平台字体** — 覆盖小米/华为/vivo/OPPO/鸿蒙/iOS/Windows/Linux 系统字体
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
| 动画 | motion (Framer Motion) |
| 存储 | Dexie (IndexedDB) + AES-256-GCM 加密 |
| 解析 | JSZip (EPUB)、原生 JS (TXT/编码检测) |
| 路由 | React Router 7 |
| 国际化 | i18next + react-i18next |
| PWA | vite-plugin-pwa + Workbox |
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
| `npm run generate:pwa-icons` | 生成多尺寸 PWA 图标 |

### 运行单个测试

```bash
npx vitest run src/domains/reader/hooks/__tests__/useReaderPreferences.test.ts  # 按文件
npx vitest run -t "restores reading position"                                    # 按名称
```

## Docker 部署

```bash
docker compose up -d
```

通过 nginx 在 80 端口提供前端静态文件服务。

## 项目结构

采用领域驱动设计（Domain-Driven Design）：

```
src/
├── app/                # 应用壳：路由、布局、Provider、调试面板、错误边界
├── domains/            # 业务领域（每个领域自包含）
│   ├── analysis/       #   AI 章节分析（Provider 适配、运行时、Prompt）
│   ├── book-import/    #   EPUB/TXT 导入与解析
│   ├── character-graph/#   人物关系图谱可视化
│   ├── library/        #   书架与书籍管理
│   ├── reader/         #   阅读器（分页/滚动、导航、偏好设置）
│   └── settings/       #   设置（净化规则、目录规则、AI 配置）
├── shared/             # 跨领域共享：UI 组件、错误体系、文本处理、工具函数
├── infra/              # 基础设施：Dexie 数据库、localStorage 封装、Web Worker
├── i18n/               # 国际化配置与语言文件（zh/en）
├── test/               # 测试基础设施（MSW handlers、setup、mocks）
└── assets/             # 静态资源
```

### 路径别名

| 别名 | 映射 |
|------|------|
| `@app/*` | `src/app/*` |
| `@domains/*` | `src/domains/*` |
| `@shared/*` | `src/shared/*` |
| `@infra/*` | `src/infra/*` |
| `@test/*` | `src/test/*` |

### 关键架构模式

- **领域隔离** — `@shared/` 和 `@infra/` 不得导入 `@domains/`，领域间通过 barrel export（`index.ts`）交互
- **本地存储** — 使用 `@infra/storage`（三级封装：primary/cache/secure），禁止直接访问 `localStorage`
- **错误处理** — 统一 `AppError` 基类 + `as const` 错误码，UI 通过 i18n 翻译错误消息
- **Web Worker** — EPUB 解析、文本净化、图谱布局在 Worker 中执行，不阻塞主线程
- **PWA** — `registerType: 'prompt'`，用户确认后更新

## 配置文件

- `defaultTocRules.yaml` — 默认章节检测规则（首次启动时自动填充）
- `defaultPurificationRules.yaml` — 默认文本净化规则
- 净化规则/目录规则 — 在设置页面通过 YAML 导入/导出

## 许可证

[MIT](LICENSE)
