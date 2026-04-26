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
  AI 驱动的本地优先小说阅读器，支持 EPUB / TXT、结构化富内容阅读、章节分析、人物关系图谱与文本净化。
</p>

---

## 项目简介

PlotMapAI 是一个运行在浏览器里的 local-first SPA，核心目标是把“导入小说、阅读、净化、分析、图谱可视化”这些能力放在一套纯前端工作流里完成。

项目特点：

- 没有后端数据库，书籍内容、章节、分析结果、阅读进度都落在浏览器本地
- EPUB / TXT 在导入阶段统一落成结构化内容与 plain-text projection
- 阅读器已经拆分成多个 `reader-*` 领域，滚动与分页共用受控富内容管线
- AI 分析使用 OpenAI-compatible 接口，配置由浏览器本地保存，API Key 通过 AES-GCM 加密存储
- 支持 PWA 安装、更新提示与 File Handling API 文件关联打开

## 核心功能

- **小说阅读** — 支持 EPUB / TXT 格式，滚动/分页双模式，动画翻页（cover/slide），拖拽手势翻页
- **结构化富内容** — 支持标题、段落、引用、列表、图片、表格、诗歌、分隔线等富内容阅读与投影
- **AI 章节分析** — 对接 OpenAI-compatible API，生成章节摘要、角色提取、关键要点、关系分析，支持暂停/恢复/重跑
- **人物关系图谱** — 可视化展示整部小说的人物关系网络和角色重要度，支持拖拽和缩放
- **文本净化** — 可配置正则规则清除广告、译注等干扰内容，支持互斥组（如缩进/去缩进二选一）、默认规则保护、YAML 导入/导出
- **章节检测** — 自动识别 TXT 章节标题，自定义规则跳过弱标题校验
- **离线优先** — 所有核心数据存储在 IndexedDB（Dexie），敏感设置通过 `@infra/storage` 加密保存
- **PWA** — 支持安装到桌面、自动更新提醒、独立窗口模式与文件关联打开
- **移动端适配** — 全宽底部工具栏、BottomSheet 面板、安全区域（刘海屏）适配、触摸手势
- **跨平台字体** — 覆盖小米/华为/vivo/OPPO/鸿蒙/iOS/Windows/Linux 系统字体
- **中英双语** — 支持中文和英文界面
- **启动恢复** — 当本地数据库 schema 超出受支持迁移线时，提供显式恢复流程而不是静默失败

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
| 动画 | motion |
| 存储 | Dexie (IndexedDB) + AES-256-GCM 加密 |
| 解析 | JSZip (EPUB)、原生 JS (TXT/编码检测) |
| 路由 | React Router 7 |
| 国际化 | i18next + react-i18next |
| PWA | vite-plugin-pwa + Workbox |
| 测试 | Vitest 4、Testing Library、MSW、Playwright |
| 代码检查 | ESLint 9 + Reader 架构门禁脚本 |

## 快速开始

```bash
npm install
npm run dev
```

打开 http://localhost:5173，应用完全在浏览器端运行，无需后端服务。

如需使用 AI 分析功能，在设置页面配置 OpenAI-compatible API 地址、模型名和密钥。

建议环境：

- Node.js 20+
- 现代 Chromium / Safari / Firefox 浏览器

### 本地优先与安全说明

- 书籍、章节、图谱、分析结果、阅读进度保存在 IndexedDB
- 普通应用设置通过 `@infra/storage` 的 `primary` / `cache` 层访问
- AI API Key 通过 `storage.secure` 使用 AES-GCM 在浏览器本地加密保存
- 这不是服务端密钥托管；本项目默认信任“当前浏览器 + 当前设备”的本地环境

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
| `npm run build` | `tsc -b` + `vite build` + bundle budget 校验 |
| `npm run analyze` | 输出 bundle 可视化分析报告 + architecture dependency graph report |
| `npm run analyze:deps` | 输出 architecture dependency graph report 到 `dist/analysis` |
| `npm run preview` | 预览生产构建 |
| `npm run lint` | ESLint + dependency graph gate + 表权属校验 + 模块健康门禁 + 文档漂移门禁 + Reader 架构门禁 |
| `npm run lint:deps` | 执行 dependency graph / file-level cycle 门禁 |
| `npm run lint:docs` | 统一校验生成文档同步，包括 rich-content support matrix 与 E2E 用例清单 |
| `npm run lint:capabilities` | 校验 rich-content capability registry 与 support matrix 文档同步 |
| `npm run lint:e2e-inventory` | 校验 Playwright E2E 用例编号与清单文档同步 |
| `npm run lint:ownership` | 执行 Dexie 表 ownership 静态校验 |
| `npm run lint:module-health` | 执行热点目录模块健康门禁 |
| `npm test` | 运行 Vitest（单次） |
| `npm run test:watch` | 监听模式运行测试 |
| `npm run coverage` | 测试覆盖率报告 |
| `npm run test:visual` | 运行 Playwright 视觉回归 |
| `npm run generate:pwa-icons` | 生成多尺寸 PWA 图标 |

### 运行单个测试

```bash
npx vitest run src/application/pages/reader/__tests__/useReaderPageViewModel.test.tsx
npx vitest run src/shared/components/__tests__/Modal.test.tsx
npx vitest run -t "calls onClose when close button is clicked"
npx playwright test tests/playwright/readerVisual.spec.ts
```

如果你第一次运行 Playwright，可能需要先安装浏览器：

```bash
npx playwright install --with-deps chromium
```

## 开发与验收

默认改动验收命令：

```bash
npm run lint && npm test && npm run build
```

如果改动涉及阅读器布局、富文本渲染或样式基线，请额外执行：

```bash
npm run test:visual
```

## 项目结构

项目采用分层架构：`app / application / domains / shared / infra`。

```text
src/
├── app/                      # 应用壳：Router、Provider、Layout、错误边界、启动恢复、PWA 提示
├── application/              # 编排层：页面、use-cases、跨域 services、读模型组合
├── domains/                  # 业务域 owner
│   ├── analysis/             # AI 分析、provider、运行时状态机、总览与人物关系输出
│   ├── book-content/         # 章节、结构化内容、章节图片与图库索引
│   ├── book-import/          # TXT/EPUB 解析、编码检测、章节检测、导入进度、EPUB Worker
│   ├── character-graph/      # 图谱画布、视口控制、布局算法、布局 Worker
│   ├── library/              # 书架、书籍元信息、封面资源
│   ├── reader-content/       # 阅读器章节读取 hook，消费 application runtime
│   ├── reader-interaction/   # 点击、拖拽、快捷交互
│   ├── reader-layout-engine/ # 滚动/分页布局、summary shell、render cache
│   ├── reader-media/         # 图片资源、图片查看器与手势
│   ├── reader-session/       # 阅读进度、restore、session persistence
│   ├── reader-shell/         # Reader Provider、Toolbar、主题、壳层 UI
│   └── settings/             # AI 配置、净化规则、目录规则、YAML 导入导出
├── shared/                   # 中立共享：contracts、组件、errors、debug、text-processing、utils
├── infra/                    # Dexie、schema/migrations、storage、workers
├── i18n/                     # 国际化配置与语言包
└── test/                     # 测试基础设施与 mocks
```

### 架构约束与门禁

README 只保留高层说明；精确规则、allowlist 和阈值统一收敛到机器可读 contract，由多个 gate 消费。

- 分层与 Reader 规则 contract: [`scripts/architecture/contracts/architecture.json`](scripts/architecture/contracts/architecture.json)
- Dexie 表 ownership contract: [`scripts/architecture/contracts/table-ownership.json`](scripts/architecture/contracts/table-ownership.json)
- rich-content capability registry: [`src/shared/contracts/rich-content-capabilities.ts`](src/shared/contracts/rich-content-capabilities.ts)
- E2E 测试用例清单: [`docs/e2e-test-cases-inventory.md`](docs/e2e-test-cases-inventory.md)
- dependency graph gate: [`scripts/checkDependencyGraph.mjs`](scripts/checkDependencyGraph.mjs)
- rich-content support matrix gate: [`scripts/checkRichContentCapabilities.mjs`](scripts/checkRichContentCapabilities.mjs)
- E2E test inventory gate: [`scripts/checkE2eTestCasesInventory.mjs`](scripts/checkE2eTestCasesInventory.mjs)
- Reader 专项门禁: [`scripts/checkReaderArchitecture.mjs`](scripts/checkReaderArchitecture.mjs)
- 表 ownership 门禁: [`scripts/checkTableOwnership.mjs`](scripts/checkTableOwnership.mjs)
- 热点目录模块健康门禁: [`scripts/checkModuleHealth.mjs`](scripts/checkModuleHealth.mjs)

当前自动化门禁覆盖的重点包括：

- `app / application / domains / shared / infra` 之间的导入边界
- layer 依赖方向、domain 间未声明关系，以及 file-level cycle baseline / new cycle 检查
- Reader 家族的逻辑行数硬上限、函数长度、导入耦合、deep import、稳定 barrel 暴露面和 pass-through re-export
- Dexie 表 ownership 与 application 层跨域编排白名单
- `book-import`、`application/services`、`shared/text-processing`、`app/debug` 的热点模块逻辑行数硬上限、函数长度与导入耦合
- rich-content support matrix、类型契约、EPUB parser、Reader content contract 与 plain-text projection 的防漂移校验
- Playwright E2E 用例编号、分类清单与生成文档的防漂移校验

## 核心数据流

### 导入

`UploadModal` / PWA 文件打开 → `bookLifecycleService` → `bookImportService` → TXT / EPUB parser → 结构化 rich content + plain text projection → Dexie transaction 持久化。

### 阅读

Reader 页面通过 `ReaderProvider` 注入 `applicationReaderContentRuntime`，由 application 层组合原始章节、结构化章节内容和净化规则，再交给 Reader 各子域消费。

### 分析

分析功能读取章节 plain-text projection，经 `analysisService` 组织 chunk 执行并持久化结果，Book Detail、Character Graph 和 Reader Summary Shell 共同消费这些工件。

## 路径别名

| 别名 | 映射 |
|------|------|
| `@app/*` | `src/app/*` |
| `@application/*` | `src/application/*` |
| `@domains/*` | `src/domains/*` |
| `@shared/*` | `src/shared/*` |
| `@infra/*` | `src/infra/*` |
| `@test/*` | `src/test/*` |

## PWA 与部署

### PWA

- 使用 `vite-plugin-pwa`
- `registerType: 'prompt'`
- 支持安装、更新提示和文件关联打开
- `main.tsx` 对 iOS standalone overscroll 做了额外处理

### Docker 部署

```bash
docker compose up -d
```

通过 nginx 在 80 端口提供前端静态文件服务。

## 重要配置与文档

- `src/domains/settings/services/defaultTocRules.yaml` — 默认章节检测规则（首次启动时自动填充）
- `src/domains/settings/services/defaultPurificationRules.yaml` — 默认文本净化规则
- `docs/adr/0001-layer-responsibilities.md` — 分层职责 ADR
- `docs/adr/0002-rich-content-reader-plan.md` — EPUB 富内容阅读计划 ADR
- `docs/db-table-ownership.md` — Dexie 表 ownership 与跨域访问规则
- `docs/epub-rich-content-support-matrix.md` — 富内容支持/降级矩阵

## 贡献说明

如果你准备长期维护或让 AI agent 参与改动，建议先阅读：

1. `README.md`
2. `docs/adr/0001-layer-responsibilities.md`
3. `docs/db-table-ownership.md`

这几个文件已经基本定义了“代码该放哪、怎么依赖、改完要跑什么”。

## 许可证

[MIT](LICENSE)
