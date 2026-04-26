# E2E 测试用例清单（Playwright）

This file is generated from `tests/playwright/**/*.spec.ts` and `tests/playwright/**/*.manual.spec.ts`. Do not edit it manually.

这份文档从 Playwright 测试定义自动生成，用于追踪端到端测试覆盖面、编号连续性和 project 执行范围。

## 总览

- 用例定义总数：41
- 自动运行：40
- 手工复现：1
- 统计口径：每个 `test("TC-xxx ...")` 算一条用例；同一用例在多个 Playwright project 中执行时不额外编号。

| 分类 | 数量 |
|------|------:|
| 冒烟测试 | 2 |
| 边界与空状态 | 1 |
| 业务主流程 | 1 |
| 阅读会话恢复 | 9 |
| 功能交互 | 17 |
| 视觉回归 | 10 |
| 手工复现 | 1 |

## Project 覆盖

| Project | 用例数 | 说明 |
|------|------:|------|
| `chromium` | 34 | 由 `playwright.config.ts` 自动匹配执行 |
| `mobile-chromium` | 9 | 由 `playwright.config.ts` 自动匹配执行 |
| `manual` | 1 | 默认 Playwright 配置忽略，需要手工按需运行 |

## 全量用例清单

### 冒烟测试

| 编号 | 用例 | Describe | Project | 来源 |
|------|------|------|------|------|
| `TC-001` | App Shell 可进入设置页并通过 Logo 返回书架 | 路由冒烟测试 | `chromium`, `mobile-chromium` | [smoke/routeSmoke.spec.ts](../tests/playwright/smoke/routeSmoke.spec.ts) |
| `TC-002` | 主题切换可更新配色方案 | 路由冒烟测试 | `chromium`, `mobile-chromium` | [smoke/routeSmoke.spec.ts](../tests/playwright/smoke/routeSmoke.spec.ts) |

### 边界与空状态

| 编号 | 用例 | Describe | Project | 来源 |
|------|------|------|------|------|
| `TC-003` | 未导入书籍时书架显示空提示 | 空状态 | `chromium` | [edge/emptyStates.spec.ts](../tests/playwright/edge/emptyStates.spec.ts) |

### 业务主流程

| 编号 | 用例 | Describe | Project | 来源 |
|------|------|------|------|------|
| `TC-004` | 完整主流程：上传 → 书架 → 详情 → 阅读 → 返回 | 导入后阅读流程 | `chromium`, `mobile-chromium` | [flow/importToRead.spec.ts](../tests/playwright/flow/importToRead.spec.ts) |

### 阅读会话恢复

| 编号 | 用例 | Describe | Project | 来源 |
|------|------|------|------|------|
| `TC-005` | 滚动模式下退出重进，阅读记录恢复正常 | 移动端阅读会话恢复 | `mobile-chromium` | [flow/mobileReaderSessionRestore.spec.ts](../tests/playwright/flow/mobileReaderSessionRestore.spec.ts) |
| `TC-006` | 翻页模式下退出重进，阅读记录恢复正常 | 移动端阅读会话恢复 | `mobile-chromium` | [flow/mobileReaderSessionRestore.spec.ts](../tests/playwright/flow/mobileReaderSessionRestore.spec.ts) |
| `TC-007` | 通过目录跳转章节后，阅读记录恢复正常 | 移动端阅读会话恢复 | `mobile-chromium` | [flow/mobileReaderSessionRestore.spec.ts](../tests/playwright/flow/mobileReaderSessionRestore.spec.ts) |
| `TC-008` | 刷新页面后，阅读记录恢复正常 | 移动端阅读会话恢复 | `mobile-chromium` | [flow/mobileReaderSessionRestore.spec.ts](../tests/playwright/flow/mobileReaderSessionRestore.spec.ts) |
| `TC-009` | 不同书籍之间的阅读记录互不影响 | 移动端阅读会话恢复 | `mobile-chromium` | [flow/mobileReaderSessionRestore.spec.ts](../tests/playwright/flow/mobileReaderSessionRestore.spec.ts) |
| `TC-010` | 同一章节内切换阅读方式后，阅读内容位置应连续 | 移动端阅读会话恢复 | `mobile-chromium` | [flow/mobileReaderSessionRestore.spec.ts](../tests/playwright/flow/mobileReaderSessionRestore.spec.ts) |
| `TC-022` | 滚动模式：SPA 返回导航后可恢复滚动位置 | 阅读会话恢复 | `chromium` | [behavior/readerSessionRestore.spec.ts](../tests/playwright/behavior/readerSessionRestore.spec.ts) |
| `TC-023` | 翻页模式：SPA 返回导航后可恢复页码 | 阅读会话恢复 | `chromium` | [behavior/readerSessionRestore.spec.ts](../tests/playwright/behavior/readerSessionRestore.spec.ts) |
| `TC-024` | 多章节场景：SPA 返回导航后可恢复到正确章节 | 阅读会话恢复 | `chromium` | [behavior/readerSessionRestore.spec.ts](../tests/playwright/behavior/readerSessionRestore.spec.ts) |

### 功能交互

| 编号 | 用例 | Describe | Project | 来源 |
|------|------|------|------|------|
| `TC-011` | 单个 EPUB 上传成功并显示书籍卡片 | 书架行为 | `chromium` | [behavior/bookshelf.spec.ts](../tests/playwright/behavior/bookshelf.spec.ts) |
| `TC-012` | 单个 TXT 上传成功并显示书籍卡片 | 书架行为 | `chromium` | [behavior/bookshelf.spec.ts](../tests/playwright/behavior/bookshelf.spec.ts) |
| `TC-013` | 多本书上传后显示多张书籍卡片 | 书架行为 | `chromium` | [behavior/bookshelf.spec.ts](../tests/playwright/behavior/bookshelf.spec.ts) |
| `TC-014` | 正确展示书籍元数据 | 书籍详情行为 | `chromium` | [behavior/bookDetail.spec.ts](../tests/playwright/behavior/bookDetail.spec.ts) |
| `TC-015` | 删除书籍可取消确认或确认移除 | 书籍详情行为 | `chromium` | [behavior/bookDetail.spec.ts](../tests/playwright/behavior/bookDetail.spec.ts) |
| `TC-016` | 返回按钮可回到书架 | 书籍详情行为 | `chromium` | [behavior/bookDetail.spec.ts](../tests/playwright/behavior/bookDetail.spec.ts) |
| `TC-017` | 可从书籍详情进入空图谱并返回详情 | 人物关系图行为 | `chromium` | [behavior/characterGraph.spec.ts](../tests/playwright/behavior/characterGraph.spec.ts) |
| `TC-018` | 阅读器打开后展示章节内容 | 阅读器行为 | `chromium` | [behavior/reader.spec.ts](../tests/playwright/behavior/reader.spec.ts) |
| `TC-019` | 刷新后保留滚动位置 | 阅读器行为 | `chromium` | [behavior/reader.spec.ts](../tests/playwright/behavior/reader.spec.ts) |
| `TC-020` | 点击图片可打开查看器，按 Escape 可关闭 | 阅读器行为 | `chromium` | [behavior/reader.spec.ts](../tests/playwright/behavior/reader.spec.ts) |
| `TC-021` | 原文和摘要切换在预置分析数据下可正常工作 | 阅读器行为 | `chromium` | [behavior/reader.spec.ts](../tests/playwright/behavior/reader.spec.ts) |
| `TC-025` | 多次滚动与翻页往返切换后位置保持稳定 | 阅读模式切换回归 | `chromium` | [behavior/readerModeSwitch.spec.ts](../tests/playwright/behavior/readerModeSwitch.spec.ts) |
| `TC-026` | 多章节翻页模式显示全书页码并保留章节内页码数据 | 阅读模式切换回归 | `chromium` | [behavior/readerModeSwitch.spec.ts](../tests/playwright/behavior/readerModeSwitch.spec.ts) |
| `TC-027` | 在章节边界处可正确恢复位置 | 阅读模式切换回归 | `chromium` | [behavior/readerModeSwitch.spec.ts](../tests/playwright/behavior/readerModeSwitch.spec.ts) |
| `TC-028` | 封面翻页模式下位置保持稳定 | 阅读模式切换回归 | `chromium` | [behavior/readerModeSwitch.spec.ts](../tests/playwright/behavior/readerModeSwitch.spec.ts) |
| `TC-029` | 设置页标签存在且可切换到对应面板 | 设置页行为 | `chromium` | [behavior/settings.spec.ts](../tests/playwright/behavior/settings.spec.ts) |
| `TC-030` | 刷新后仍保留设置页面状态 | 设置页行为 | `chromium` | [behavior/settings.spec.ts](../tests/playwright/behavior/settings.spec.ts) |

### 视觉回归

| 编号 | 用例 | Describe | Project | 来源 |
|------|------|------|------|------|
| `TC-031` | 富文本滚动视口基线渲染正确 | 阅读器视觉回归 | `chromium` | [visual/readerVisual.spec.ts](../tests/playwright/visual/readerVisual.spec.ts) |
| `TC-032` | 分页模式（水平滑动转场）的阅读器基线渲染正确 | 阅读器视觉回归 | `chromium` | [visual/readerVisual.spec.ts](../tests/playwright/visual/readerVisual.spec.ts) |
| `TC-033` | 图片查看器遮罩层基线渲染正确 | 阅读器视觉回归 | `chromium` | [visual/readerVisual.spec.ts](../tests/playwright/visual/readerVisual.spec.ts) |
| `TC-034` | 预置章节分析数据时摘要视图基线渲染正确 | 阅读器视觉回归 | `chromium` | [visual/readerVisual.spec.ts](../tests/playwright/visual/readerVisual.spec.ts) |
| `TC-035` | 通过阅读流程正确渲染导入的分隔线、内部链接和简单表格 | 阅读器视觉回归 | `chromium` | [visual/readerVisual.spec.ts](../tests/playwright/visual/readerVisual.spec.ts) |
| `TC-036` | 多图片章节的画廊间距渲染稳定 | 阅读器视觉回归 | `chromium` | [visual/readerVisual.spec.ts](../tests/playwright/visual/readerVisual.spec.ts) |
| `TC-037` | 滚动模式下纸张主题首屏语义展示渲染正确 | 阅读器视觉回归 | `chromium` | [visual/readerVisual.spec.ts](../tests/playwright/visual/readerVisual.spec.ts) |
| `TC-038` | 文本策略首屏、图注与表格渲染稳定 | 阅读器视觉回归 | `chromium` | [visual/readerVisual.spec.ts](../tests/playwright/visual/readerVisual.spec.ts) |
| `TC-039` | 窄栏翻页标题按测量行渲染稳定 | 阅读器视觉回归 | `chromium` | [visual/readerVisual.spec.ts](../tests/playwright/visual/readerVisual.spec.ts) |
| `TC-040` | 夜间翻页主题下诗歌块通过标准富文本管线渲染正确 | 阅读器视觉回归 | `chromium` | [visual/readerVisual.spec.ts](../tests/playwright/visual/readerVisual.spec.ts) |

### 手工复现

| 编号 | 用例 | Describe | Project | 来源 |
|------|------|------|------|------|
| `TC-041` | 当翻页与滚动分支不一致时捕获追踪产物 | 阅读追踪手工复现 | `manual` | [manual/readerTrace.manual.spec.ts](../tests/playwright/manual/readerTrace.manual.spec.ts) |

