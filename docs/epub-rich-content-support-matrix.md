# EPUB Rich Content Support Matrix

This file is generated from `src/shared/contracts/rich-content-capabilities.ts`. Do not edit it manually.

这份文档定义 PlotMapAI 在 EPUB 富内容改造中的支持与降级边界。

它是“支持/降级契约”，不是实现进度表。某项被标记为 `P0` 或 `P1`，表示它属于目标支持范围；不表示仓库当前已经实现该能力。

所有能力项统一使用以下字段描述：

- 能力项：要讨论的结构、语义或样式能力
- 典型来源标签/语义：在 EPUB XHTML 中常见的来源形式
- 支持级别：`P0` / `P1` / `P2`
- 导入阶段目标表示：导入阶段希望产出的 Rich AST 形态或投影意图
- Reader 消费目标：Reader 后续应消费到什么程度
- Analysis 投影策略：如何投影为 plain text，供 analysis 使用
- 降级规则：无法完整保留时的确定性处理方式
- 备注：额外约束或实现提示

## P0 基础支持

| 能力项 | 典型来源标签/语义 | 支持级别 | 导入阶段目标表示 | Reader 消费目标 | Analysis 投影策略 | 降级规则 | 备注 |
|------|------|------|------|------|------|------|------|
| `heading` | <h1> - <h6> | `P0` | `heading` block，保留 level | 渲染层级与段前后节奏 | 以标题文本输出，并保留分段 | 无法识别级别时降级为 `paragraph` | 不要求保留原始字号 |
| `paragraph` | <p> | `P0` | `paragraph` block | 基础段落渲染 | 按段落输出 plain text | 空段落删除；异常容器降级为普通段落 | 是最基本正文单位 |
| `br` | <br> | `P0` | `lineBreak` inline | 在段内换行 | 投影为单个换行 | 连续异常换行可归并 | 不单独形成 block |
| `strong` | <strong>、<b> | `P0` | text marks: `bold` | 渲染加粗语义 | 仅保留文本，不保留样式 | 无法映射时仅保留文本 | 不要求还原具体字重 |
| `em` | <em>、<i> | `P0` | text marks: `italic` | 渲染强调语义 | 仅保留文本，不保留样式 | 无法映射时仅保留文本 | 不要求还原具体字形 |
| `underline` | <u>、可映射的下划线样式 | `P0` | text marks: `underline` | 渲染下划线语义 | 仅保留文本 | 无法稳定判定时忽略样式，仅保留文本 | 仅限可明确识别的下划线 |
| `strike` | <s>、<del>、<strike> | `P0` | text marks: `strike` | 渲染删除线语义 | 仅保留文本 | 无法映射时仅保留文本 | 不保留修订语义差异 |
| `sup` | <sup> | `P0` | text marks: `sup` | 显示上标 | 文本并入相邻内容 | 无法映射时保留文字顺序 | 不单独实现脚注系统 |
| `sub` | <sub> | `P0` | text marks: `sub` | 显示下标 | 文本并入相邻内容 | 无法映射时保留文字顺序 | 不单独实现公式系统 |
| `blockquote` | <blockquote> | `P0` | `blockquote` block | 显示引用块样式 | 以分段引用文本输出 | 内部结构异常时降级为段落组 | 不要求保留复杂嵌套样式 |
| `ul` | <ul> | `P0` | `list` block，`ordered: false` | 渲染无序列表 | 投影为逐项 plain text 列表 | 结构破损时展平为段落 | 与 `li` 配套出现 |
| `ol` | <ol> | `P0` | `list` block，`ordered: true` | 渲染有序列表 | 投影为带序号 plain text 列表 | 序号信息缺失时退化为无序列表文本 | 不保留复杂编号样式 |
| `li` | <li> | `P0` | `list` item 内容块 | 渲染列表项 | 每项输出为单独文本项 | 嵌套异常时并入父列表或展平为段落 | 列表项内允许基础 inline 语义 |
| `image` | <img> | `P0` | `image` block，引用提取后的资源 key | 显示插图并接入既有图片资源链路 | 投影为 `（插图）` 或说明文本 | 无资源或无法解析时转 `unsupported`，并保留可用 alt 文本 | 不再仅依赖 `[IMG:key]` 作为最终目标表示 |
| `caption` | 图片相邻说明、<figcaption> | `P0` | `image.caption` 或独立说明文本 | 显示图片说明 | 优先输出 caption 文本 | 无法稳定归属时降级为相邻段落 | caption 只做基础关联 |
| `text-align` | align 属性、白名单内 `text-align` 样式 | `P0` | `align` 属性附着到 heading / paragraph / image | 支持左、中、右对齐 | Analysis 忽略对齐，仅保留文本 | 非白名单对齐值忽略，退回默认对齐 | 仅保留基础对齐语义 |

## P1 增强支持

| 能力项 | 典型来源标签/语义 | 支持级别 | 导入阶段目标表示 | Reader 消费目标 | Analysis 投影策略 | 降级规则 | 备注 |
|------|------|------|------|------|------|------|------|
| `hr` | <hr> | `P1` | `hr` block | 渲染基础分隔符 | 投影为空行或简单分隔线 | 无法稳定承载时记为空段边界 | 主要用于章节内部结构分隔 |
| `poem` | 诗歌段、显式换行诗行 | `P1` | `poem` block 或保留逐行结构 | 保留逐行排布 | 按逐行文本输出 | 无法可靠识别时降级为多行段落 | 只支持简单诗行，不支持复杂格律布局 |
| `simple-table` | 简单 `<table>` 结构 | `P1` | `table` block | 支持基础表格阅读 | 按行列顺序投影为 plain text | 超过简单表格范围时转 `unsupported` 或展平文本 | 只面向简单二维表格 |
| `footnote` | 上标注记、文末注释链接 | `P1` | 受控脚注节点或链接关系 | 允许基础跳转或注释展示 | 将注释内容并入 plain-text 投影 | 无法建立关联时保留注记文本并展平 | 不支持完整学术注释系统 |
| `internal-link` | 章节内锚点、目录内跳转 | `P1` | `link` inline / block，保留内部 href | Reader 可逐步接入内部跳转 | Analysis 仅保留链接文本 | 无法解析目标时去掉链接行为，仅保留文本 | 不含外部网络链接扩展目标 |

## P2 明确降级

| 能力项 | 典型来源标签/语义 | 支持级别 | 导入阶段目标表示 | Reader 消费目标 | Analysis 投影策略 | 降级规则 | 备注 |
|------|------|------|------|------|------|------|------|
| `complex-css` | 多层选择器、复杂版式样式表 | `P2` | 不单独建模 CSS 规则 | Reader 不承诺还原复杂视觉效果 | 仅保留可投影文本 | 仅提取白名单语义；其余样式一律忽略 | 白名单范围以后续契约 PR 为准 |
| `multi-column` | CSS columns、报刊式分栏 | `P2` | 不保留多栏布局结构 | Reader 不实现多栏排版 | 按阅读顺序展平为 plain text | 无法明确顺序时转 `unsupported` 并保留可用文本 | 不把分页器扩展为通用版式引擎 |
| `float` | 左右浮动图片、文本包裹 | `P2` | 不保留 float 布局语义 | Reader 按普通块流渲染 | 文本按线性顺序投影 | 忽略浮动定位，仅保留内容与可识别图片块 | 不承诺文字环绕 |
| `complex-svg` | 内嵌 SVG、交互式矢量内容 | `P2` | 不保留 SVG DOM 结构 | Reader 不直接渲染复杂 SVG 结构 | 保留可提取文本说明 | 优先保留 alt/title/说明文本；无可用文本时转 `unsupported` | 不实现通用 SVG 渲染支持 |
| `extreme-class-style` | 依赖 class 才能理解的视觉语义 | `P2` | 不把 class 名本身当作稳定语义 | Reader 仅消费可映射的基础语义 | 仅保留文本 | 忽略 class 驱动的呈现细节，仅保留可识别结构和文本 | 例如装饰性 class、特定出版商命名约定 |
| `complex-inline-style` | 大量内联样式、混合版式指令 | `P2` | 仅映射白名单内基础语义 | Reader 仅消费基础语义字段 | 仅保留文本 | 非白名单 style 一律忽略；无法映射时只保留文本或转 `unsupported` | 白名单外样式不进入契约 |

## 非目标

本阶段的目标不是实现一个通用浏览器级 EPUB 渲染引擎。

明确不以以下能力为目标：

- 完整还原出版级 CSS 视觉效果
- 支持任意复杂 HTML/CSS/SVG 组合排版
- 在 Reader 中复刻浏览器级布局、浮动、多栏和高级表格行为
- 为旧书自动重建不存在的 rich-content 持久化数据

本阶段追求的是：在现有架构边界内，稳定保留一组“足够有价值、且能被 Reader 与 Analysis 分别消费”的受控结构语义。
