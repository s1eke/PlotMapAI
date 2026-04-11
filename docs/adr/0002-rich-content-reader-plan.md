# ADR 0002: EPUB Rich Content Reader Plan

- Status: Accepted
- Date: 2026-04-04

## Context

PlotMapAI 当前的 EPUB 导入链路仍然以“阅读可用的纯文本结果”为中心：

- `book-import` 在 Worker 中解析 `EPUB`，读取 OPF、spine、TOC 和章节 HTML
- 章节图片会被提取为独立资源，并在正文中替换为 `[IMG:key]` 占位符
- HTML 内容会被归一化为纯文本章节，供后续阅读、净化和分析链路使用

当前分层边界也已经较为明确：

- `book-import` 是 parse-only 领域，不直接写数据库
- 真正的持久化写入由 application 层的 `bookLifecycleService` 承接
- `reader-content` 不直接读取持久层，而是通过 application 提供的 `ReaderContentRuntimeValue` 获取章节内容
- analysis 当前消费的是 plain-text 章节输入，而不是富文本结构

这套设计让现有系统保持稳定，但也带来了一个明显限制：EPUB 在导入阶段就被压平成纯文本，章节中的标题层级、引用、列表、图片说明和基础文本样式等结构信息无法继续传递到 Reader 或 Analysis 的后续链路中。

后续改造的目标不是把 PlotMapAI 演进成一个通用浏览器级 EPUB 排版引擎，而是在现有架构边界内，为“受控富文本结构”建立稳定表示层，并允许 Reader 与 Analysis 按不同投影消费这些内容。

为了避免后续 PR 在“是否支持表格、复杂样式、脚注、分页优先级、旧书升级方式”等问题上反复摇摆，需要先用一份 ADR 冻结范围与演进顺序。

## Decision

### 导入目标

后续 EPUB 升级链路的目标表示固定为：

`EPUB -> Rich AST + Plain Text`

其中：

- `Rich AST` 用于承载受控的结构化内容，供 Reader 后续逐步消费
- `Plain Text` 作为稳定投影，继续服务 Analysis 和需要纯文本输入的既有链路

### Reader 升级顺序

Reader 的升级顺序固定为：

1. 先让滚动模式消费富内容
2. 再让分页模式消费富内容

这项顺序约束用于控制复杂度，避免在内容表示层尚未稳定前，同时重写滚动与分页两套阅读运行时。

### Analysis 策略

Analysis 继续消费 plain-text projection，不直接消费 rich content。

这意味着：

- 富内容改造不能打乱现有 analysis 的输入模型
- 富内容中的结构与样式信息，如需影响 analysis，必须先通过明确的 plain-text projection 规则投影后再进入 analysis

### 旧书升级策略

旧书不自动补建 rich content。

对已经导入且仅保存 plain-text 内容的书籍，只支持“重新解析升级”，不在后台自动重建富内容，也不在读取时做隐式补算。

### 支持范围

富内容支持边界以 [`docs/epub-rich-content-support-matrix.md`](../epub-rich-content-support-matrix.md) 为唯一矩阵依据。

该矩阵将支持项分为：

- `P0`：必须优先支持的基础结构与基础语义
- `P1`：在核心链路稳定后逐步接入的增强结构
- `P2`：明确不做完整支持、必须按规则降级的样式与复杂结构

## Consequences

- 后续 PR 可以围绕稳定边界推进，而不是在实现过程中重新定义目标
- 内容表示层、Reader 渲染能力、Analysis 输入模型将被显式拆分，避免一个领域的实现细节泄漏到另一个领域
- 滚动模式会成为富内容消费的第一落点，分页模式可以在契约稳定后再接入
- 旧书兼容策略会保持保守，避免在未持久化原始 EPUB 富内容的前提下引入不透明的自动迁移行为
- 对复杂样式和复杂排版的预期将被提前收窄，减少“看起来像 HTML 就应该完整还原”的误解

## Guardrails

- PR-01 只冻结边界，不引入任何代码契约、schema、repository、feature flag 或运行时代码
- shared 层未来定义的 rich-content 契约不得提前绑定 DOM、HTMLElement、CSSStyleDeclaration 或具体渲染器状态
- `book-import` 继续保持 parse-only 边界，不直接写 Dexie
- `reader-content` 继续通过 application runtime 取内容，不得绕过 application 直连持久层
- Analysis 不直接依赖 rich-content 存储结构，只能消费约定好的 plain-text projection
- 支持矩阵中的 `P2` 项必须有确定性的降级规则，不能以“后续再看”代替边界定义
