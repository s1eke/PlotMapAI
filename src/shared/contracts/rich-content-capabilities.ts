export const RICH_MARKS = ['bold', 'italic', 'underline', 'strike', 'sup', 'sub'] as const;
export type RichMark = typeof RICH_MARKS[number];

export const RICH_TEXT_ALIGNS = ['left', 'center', 'right'] as const;
export type RichTextAlign = typeof RICH_TEXT_ALIGNS[number];

export const RICH_INLINE_TYPES = ['text', 'lineBreak', 'link'] as const;
export type RichInlineType = typeof RICH_INLINE_TYPES[number];

export const RICH_BLOCK_TYPES = [
  'heading',
  'paragraph',
  'blockquote',
  'list',
  'image',
  'hr',
  'poem',
  'table',
  'unsupported',
] as const;
export type RichBlockType = typeof RICH_BLOCK_TYPES[number];

export const RICH_READER_LEAF_VARIANTS = [
  'heading',
  'paragraph',
  'image',
  'table',
  'hr',
  'unsupported',
] as const;
export type RichReaderLeafVariant = typeof RICH_READER_LEAF_VARIANTS[number];

export const RICH_READER_CONTEXT_VARIANTS = [
  'blockquote',
  'list-item',
  'poem-line',
  'table-cell',
] as const;
export type RichReaderContextVariant = typeof RICH_READER_CONTEXT_VARIANTS[number];

export const RICH_READER_INLINE_VARIANTS = [
  ...RICH_INLINE_TYPES,
  ...RICH_MARKS,
] as const;
export type RichReaderInlineVariant = typeof RICH_READER_INLINE_VARIANTS[number];

export const RICH_CONTENT_SUPPORT_LEVELS = ['P0', 'P1', 'P2'] as const;
export type RichContentSupportLevel = typeof RICH_CONTENT_SUPPORT_LEVELS[number];

export const RICH_CONTENT_IMPLEMENTATION_STATES = [
  'implemented',
  'planned',
  'downgrade_only',
  'not_applicable',
] as const;
export type RichContentImplementationState = typeof RICH_CONTENT_IMPLEMENTATION_STATES[number];

export const RICH_CONTENT_CAPABILITY_KINDS = [
  'block',
  'inline',
  'mark',
  'structure',
  'style',
  'layout',
] as const;
export type RichContentCapabilityKind = typeof RICH_CONTENT_CAPABILITY_KINDS[number];

export const RICH_CONTENT_DOWNGRADE_STRATEGIES = [
  'recognized_structure_only',
  'unsupported_block',
  'linear_text_only',
] as const;
export type RichContentDowngradeStrategy = typeof RICH_CONTENT_DOWNGRADE_STRATEGIES[number];

export interface RichContentAstTargets {
  blockTypes?: readonly RichBlockType[];
  inlineTypes?: readonly RichInlineType[];
  marks?: readonly RichMark[];
  aligns?: readonly RichTextAlign[];
  note?: string;
}

export interface RichContentDowngradeTargets {
  strategy: RichContentDowngradeStrategy;
  blockTypes?: readonly RichBlockType[];
  inlineTypes?: readonly RichInlineType[];
  note?: string;
}

export interface RichContentReaderCoverage {
  sourceBlockTypes?: readonly RichBlockType[];
  inlineVariants?: readonly RichReaderInlineVariant[];
  leafVariants?: readonly RichReaderLeafVariant[];
  contextVariants?: readonly RichReaderContextVariant[];
}

export interface RichContentCapability {
  id: string;
  kind: RichContentCapabilityKind;
  sourceSignals: readonly string[];
  supportLevel: RichContentSupportLevel;
  importTarget: string;
  readerTarget: string;
  analysisStrategy: string;
  downgradeRule: string;
  notes: string;
  implementationState: {
    import: RichContentImplementationState;
    reader: RichContentImplementationState;
    analysis: RichContentImplementationState;
  };
  astTargets?: RichContentAstTargets;
  downgradeTargets?: RichContentDowngradeTargets;
  readerCoverage?: RichContentReaderCoverage;
}

export const RICH_CONTENT_SUPPORT_MATRIX_META = {
  definitionFields: [
    {
      description: '要讨论的结构、语义或样式能力',
      label: '能力项',
    },
    {
      description: '在 EPUB XHTML 中常见的来源形式',
      label: '典型来源标签/语义',
    },
    {
      description: '`P0` / `P1` / `P2`',
      label: '支持级别',
    },
    {
      description: '导入阶段希望产出的 Rich AST 形态或投影意图',
      label: '导入阶段目标表示',
    },
    {
      description: 'Reader 后续应消费到什么程度',
      label: 'Reader 消费目标',
    },
    {
      description: '如何投影为 plain text，供 analysis 使用',
      label: 'Analysis 投影策略',
    },
    {
      description: '无法完整保留时的确定性处理方式',
      label: '降级规则',
    },
    {
      description: '额外约束或实现提示',
      label: '备注',
    },
  ],
  intro: [
    '这份文档定义 PlotMapAI 在 EPUB 富内容改造中的支持与降级边界。',
    '它是“支持/降级契约”，不是实现进度表。某项被标记为 `P0` 或 `P1`，表示它属于目标支持范围；不表示仓库当前已经实现该能力。',
    '所有能力项统一使用以下字段描述：',
  ],
  nonGoals: [
    '完整还原出版级 CSS 视觉效果',
    '支持任意复杂 HTML/CSS/SVG 组合排版',
    '在 Reader 中复刻浏览器级布局、浮动、多栏和高级表格行为',
    '为旧书自动重建不存在的 rich-content 持久化数据',
  ],
  nonGoalsIntro: '本阶段的目标不是实现一个通用浏览器级 EPUB 渲染引擎。',
  nonGoalsOutro: '本阶段追求的是：在现有架构边界内，稳定保留一组“足够有价值、且能被 Reader 与 Analysis 分别消费”的受控结构语义。',
  sectionTitles: {
    P0: 'P0 基础支持',
    P1: 'P1 增强支持',
    P2: 'P2 明确降级',
  } as const satisfies Record<RichContentSupportLevel, string>,
  title: 'EPUB Rich Content Support Matrix',
} as const;

export const RICH_CONTENT_CAPABILITIES = [
  {
    id: 'heading',
    kind: 'block',
    sourceSignals: ['<h1> - <h6>'],
    supportLevel: 'P0',
    importTarget: '`heading` block，保留 level',
    readerTarget: '渲染层级与段前后节奏',
    analysisStrategy: '以标题文本输出，并保留分段',
    downgradeRule: '无法识别级别时降级为 `paragraph`',
    notes: '不要求保留原始字号',
    implementationState: {
      import: 'implemented',
      reader: 'implemented',
      analysis: 'implemented',
    },
    astTargets: {
      blockTypes: ['heading'],
    },
    readerCoverage: {
      sourceBlockTypes: ['heading'],
      leafVariants: ['heading'],
    },
  },
  {
    id: 'paragraph',
    kind: 'block',
    sourceSignals: ['<p>'],
    supportLevel: 'P0',
    importTarget: '`paragraph` block',
    readerTarget: '基础段落渲染',
    analysisStrategy: '按段落输出 plain text',
    downgradeRule: '空段落删除；异常容器降级为普通段落',
    notes: '是最基本正文单位',
    implementationState: {
      import: 'implemented',
      reader: 'implemented',
      analysis: 'implemented',
    },
    astTargets: {
      blockTypes: ['paragraph'],
    },
    readerCoverage: {
      sourceBlockTypes: ['paragraph'],
      leafVariants: ['paragraph'],
    },
  },
  {
    id: 'br',
    kind: 'inline',
    sourceSignals: ['<br>'],
    supportLevel: 'P0',
    importTarget: '`lineBreak` inline',
    readerTarget: '在段内换行',
    analysisStrategy: '投影为单个换行',
    downgradeRule: '连续异常换行可归并',
    notes: '不单独形成 block',
    implementationState: {
      import: 'implemented',
      reader: 'implemented',
      analysis: 'implemented',
    },
    astTargets: {
      inlineTypes: ['lineBreak'],
    },
    readerCoverage: {
      inlineVariants: ['lineBreak'],
    },
  },
  {
    id: 'strong',
    kind: 'mark',
    sourceSignals: ['<strong>', '<b>'],
    supportLevel: 'P0',
    importTarget: 'text marks: `bold`',
    readerTarget: '渲染加粗语义',
    analysisStrategy: '仅保留文本，不保留样式',
    downgradeRule: '无法映射时仅保留文本',
    notes: '不要求还原具体字重',
    implementationState: {
      import: 'implemented',
      reader: 'implemented',
      analysis: 'implemented',
    },
    astTargets: {
      marks: ['bold'],
    },
    readerCoverage: {
      inlineVariants: ['bold'],
    },
  },
  {
    id: 'em',
    kind: 'mark',
    sourceSignals: ['<em>', '<i>'],
    supportLevel: 'P0',
    importTarget: 'text marks: `italic`',
    readerTarget: '渲染强调语义',
    analysisStrategy: '仅保留文本，不保留样式',
    downgradeRule: '无法映射时仅保留文本',
    notes: '不要求还原具体字形',
    implementationState: {
      import: 'implemented',
      reader: 'implemented',
      analysis: 'implemented',
    },
    astTargets: {
      marks: ['italic'],
    },
    readerCoverage: {
      inlineVariants: ['italic'],
    },
  },
  {
    id: 'underline',
    kind: 'mark',
    sourceSignals: ['<u>', '可映射的下划线样式'],
    supportLevel: 'P0',
    importTarget: 'text marks: `underline`',
    readerTarget: '渲染下划线语义',
    analysisStrategy: '仅保留文本',
    downgradeRule: '无法稳定判定时忽略样式，仅保留文本',
    notes: '仅限可明确识别的下划线',
    implementationState: {
      import: 'implemented',
      reader: 'implemented',
      analysis: 'implemented',
    },
    astTargets: {
      marks: ['underline'],
    },
    readerCoverage: {
      inlineVariants: ['underline'],
    },
  },
  {
    id: 'strike',
    kind: 'mark',
    sourceSignals: ['<s>', '<del>', '<strike>'],
    supportLevel: 'P0',
    importTarget: 'text marks: `strike`',
    readerTarget: '渲染删除线语义',
    analysisStrategy: '仅保留文本',
    downgradeRule: '无法映射时仅保留文本',
    notes: '不保留修订语义差异',
    implementationState: {
      import: 'implemented',
      reader: 'implemented',
      analysis: 'implemented',
    },
    astTargets: {
      marks: ['strike'],
    },
    readerCoverage: {
      inlineVariants: ['strike'],
    },
  },
  {
    id: 'sup',
    kind: 'mark',
    sourceSignals: ['<sup>'],
    supportLevel: 'P0',
    importTarget: 'text marks: `sup`',
    readerTarget: '显示上标',
    analysisStrategy: '文本并入相邻内容',
    downgradeRule: '无法映射时保留文字顺序',
    notes: '不单独实现脚注系统',
    implementationState: {
      import: 'implemented',
      reader: 'implemented',
      analysis: 'implemented',
    },
    astTargets: {
      marks: ['sup'],
    },
    readerCoverage: {
      inlineVariants: ['sup'],
    },
  },
  {
    id: 'sub',
    kind: 'mark',
    sourceSignals: ['<sub>'],
    supportLevel: 'P0',
    importTarget: 'text marks: `sub`',
    readerTarget: '显示下标',
    analysisStrategy: '文本并入相邻内容',
    downgradeRule: '无法映射时保留文字顺序',
    notes: '不单独实现公式系统',
    implementationState: {
      import: 'implemented',
      reader: 'implemented',
      analysis: 'implemented',
    },
    astTargets: {
      marks: ['sub'],
    },
    readerCoverage: {
      inlineVariants: ['sub'],
    },
  },
  {
    id: 'blockquote',
    kind: 'block',
    sourceSignals: ['<blockquote>'],
    supportLevel: 'P0',
    importTarget: '`blockquote` block',
    readerTarget: '显示引用块样式',
    analysisStrategy: '以分段引用文本输出',
    downgradeRule: '内部结构异常时降级为段落组',
    notes: '不要求保留复杂嵌套样式',
    implementationState: {
      import: 'implemented',
      reader: 'implemented',
      analysis: 'implemented',
    },
    astTargets: {
      blockTypes: ['blockquote'],
    },
    readerCoverage: {
      sourceBlockTypes: ['blockquote'],
      contextVariants: ['blockquote'],
      leafVariants: ['heading', 'paragraph', 'image', 'table', 'hr', 'unsupported'],
    },
  },
  {
    id: 'ul',
    kind: 'structure',
    sourceSignals: ['<ul>'],
    supportLevel: 'P0',
    importTarget: '`list` block，`ordered: false`',
    readerTarget: '渲染无序列表',
    analysisStrategy: '投影为逐项 plain text 列表',
    downgradeRule: '结构破损时展平为段落',
    notes: '与 `li` 配套出现',
    implementationState: {
      import: 'implemented',
      reader: 'implemented',
      analysis: 'implemented',
    },
    astTargets: {
      blockTypes: ['list'],
      note: '无序列表通过 list.ordered = false 表示。',
    },
    readerCoverage: {
      sourceBlockTypes: ['list'],
      contextVariants: ['list-item'],
      leafVariants: ['heading', 'paragraph', 'image', 'table', 'hr', 'unsupported'],
    },
  },
  {
    id: 'ol',
    kind: 'structure',
    sourceSignals: ['<ol>'],
    supportLevel: 'P0',
    importTarget: '`list` block，`ordered: true`',
    readerTarget: '渲染有序列表',
    analysisStrategy: '投影为带序号 plain text 列表',
    downgradeRule: '序号信息缺失时退化为无序列表文本',
    notes: '不保留复杂编号样式',
    implementationState: {
      import: 'implemented',
      reader: 'implemented',
      analysis: 'implemented',
    },
    astTargets: {
      blockTypes: ['list'],
      note: '有序列表通过 list.ordered = true 表示。',
    },
    readerCoverage: {
      sourceBlockTypes: ['list'],
      contextVariants: ['list-item'],
      leafVariants: ['heading', 'paragraph', 'image', 'table', 'hr', 'unsupported'],
    },
  },
  {
    id: 'li',
    kind: 'structure',
    sourceSignals: ['<li>'],
    supportLevel: 'P0',
    importTarget: '`list` item 内容块',
    readerTarget: '渲染列表项',
    analysisStrategy: '每项输出为单独文本项',
    downgradeRule: '嵌套异常时并入父列表或展平为段落',
    notes: '列表项内允许基础 inline 语义',
    implementationState: {
      import: 'implemented',
      reader: 'implemented',
      analysis: 'implemented',
    },
    astTargets: {
      blockTypes: ['list'],
      note: '列表项内容承载在 list.items 中。',
    },
    readerCoverage: {
      sourceBlockTypes: ['list'],
      contextVariants: ['list-item'],
      leafVariants: ['heading', 'paragraph', 'image', 'table', 'hr', 'unsupported'],
    },
  },
  {
    id: 'image',
    kind: 'block',
    sourceSignals: ['<img>'],
    supportLevel: 'P0',
    importTarget: '`image` block，引用提取后的资源 key',
    readerTarget: '显示插图并接入既有图片资源链路',
    analysisStrategy: '投影为 `（插图）` 或说明文本',
    downgradeRule: '无资源或无法解析时转 `unsupported`，并保留可用 alt 文本',
    notes: '不再仅依赖 `[IMG:key]` 作为最终目标表示',
    implementationState: {
      import: 'implemented',
      reader: 'implemented',
      analysis: 'implemented',
    },
    astTargets: {
      blockTypes: ['image'],
    },
    readerCoverage: {
      sourceBlockTypes: ['image'],
      leafVariants: ['image'],
    },
  },
  {
    id: 'caption',
    kind: 'structure',
    sourceSignals: ['图片相邻说明', '<figcaption>'],
    supportLevel: 'P0',
    importTarget: '`image.caption` 或独立说明文本',
    readerTarget: '显示图片说明',
    analysisStrategy: '优先输出 caption 文本',
    downgradeRule: '无法稳定归属时降级为相邻段落',
    notes: 'caption 只做基础关联',
    implementationState: {
      import: 'implemented',
      reader: 'implemented',
      analysis: 'implemented',
    },
    astTargets: {
      blockTypes: ['image', 'paragraph'],
      note: '当前 parser 会优先写入 image.caption，无法归属时保留为 paragraph。',
    },
    readerCoverage: {
      sourceBlockTypes: ['image', 'paragraph'],
      leafVariants: ['image', 'paragraph'],
    },
  },
  {
    id: 'text-align',
    kind: 'style',
    sourceSignals: ['align 属性', '白名单内 `text-align` 样式'],
    supportLevel: 'P0',
    importTarget: '`align` 属性附着到 heading / paragraph / image',
    readerTarget: '支持左、中、右对齐',
    analysisStrategy: 'Analysis 忽略对齐，仅保留文本',
    downgradeRule: '非白名单对齐值忽略，退回默认对齐',
    notes: '仅保留基础对齐语义',
    implementationState: {
      import: 'implemented',
      reader: 'implemented',
      analysis: 'not_applicable',
    },
    astTargets: {
      blockTypes: ['heading', 'paragraph', 'image'],
      aligns: ['left', 'center', 'right'],
    },
    readerCoverage: {
      sourceBlockTypes: ['heading', 'paragraph', 'image'],
      leafVariants: ['heading', 'paragraph', 'image'],
    },
  },
  {
    id: 'hr',
    kind: 'block',
    sourceSignals: ['<hr>'],
    supportLevel: 'P1',
    importTarget: '`hr` block',
    readerTarget: '渲染基础分隔符',
    analysisStrategy: '投影为空行或简单分隔线',
    downgradeRule: '无法稳定承载时记为空段边界',
    notes: '主要用于章节内部结构分隔',
    implementationState: {
      import: 'implemented',
      reader: 'implemented',
      analysis: 'implemented',
    },
    astTargets: {
      blockTypes: ['hr'],
    },
    readerCoverage: {
      sourceBlockTypes: ['hr'],
      leafVariants: ['hr'],
    },
  },
  {
    id: 'poem',
    kind: 'block',
    sourceSignals: ['诗歌段', '显式换行诗行'],
    supportLevel: 'P1',
    importTarget: '`poem` block 或保留逐行结构',
    readerTarget: '保留逐行排布',
    analysisStrategy: '按逐行文本输出',
    downgradeRule: '无法可靠识别时降级为多行段落',
    notes: '只支持简单诗行，不支持复杂格律布局',
    implementationState: {
      import: 'planned',
      reader: 'implemented',
      analysis: 'implemented',
    },
    astTargets: {
      blockTypes: ['poem'],
    },
    readerCoverage: {
      sourceBlockTypes: ['poem'],
      contextVariants: ['poem-line'],
      leafVariants: ['paragraph'],
    },
  },
  {
    id: 'simple-table',
    kind: 'block',
    sourceSignals: ['简单 `<table>` 结构'],
    supportLevel: 'P1',
    importTarget: '`table` block',
    readerTarget: '支持基础表格阅读',
    analysisStrategy: '按行列顺序投影为 plain text',
    downgradeRule: '超过简单表格范围时转 `unsupported` 或展平文本',
    notes: '只面向简单二维表格',
    implementationState: {
      import: 'implemented',
      reader: 'implemented',
      analysis: 'implemented',
    },
    astTargets: {
      blockTypes: ['table'],
    },
    readerCoverage: {
      sourceBlockTypes: ['table'],
      contextVariants: ['table-cell'],
      leafVariants: ['table'],
    },
  },
  {
    id: 'footnote',
    kind: 'structure',
    sourceSignals: ['上标注记', '文末注释链接'],
    supportLevel: 'P1',
    importTarget: '受控脚注节点或链接关系',
    readerTarget: '允许基础跳转或注释展示',
    analysisStrategy: '将注释内容并入 plain-text 投影',
    downgradeRule: '无法建立关联时保留注记文本并展平',
    notes: '不支持完整学术注释系统',
    implementationState: {
      import: 'planned',
      reader: 'planned',
      analysis: 'planned',
    },
  },
  {
    id: 'internal-link',
    kind: 'inline',
    sourceSignals: ['章节内锚点', '目录内跳转'],
    supportLevel: 'P1',
    importTarget: '`link` inline / block，保留内部 href',
    readerTarget: 'Reader 可逐步接入内部跳转',
    analysisStrategy: 'Analysis 仅保留链接文本',
    downgradeRule: '无法解析目标时去掉链接行为，仅保留文本',
    notes: '不含外部网络链接扩展目标',
    implementationState: {
      import: 'implemented',
      reader: 'implemented',
      analysis: 'implemented',
    },
    astTargets: {
      inlineTypes: ['link'],
    },
    readerCoverage: {
      inlineVariants: ['link'],
    },
  },
  {
    id: 'complex-css',
    kind: 'style',
    sourceSignals: ['多层选择器', '复杂版式样式表'],
    supportLevel: 'P2',
    importTarget: '不单独建模 CSS 规则',
    readerTarget: 'Reader 不承诺还原复杂视觉效果',
    analysisStrategy: '仅保留可投影文本',
    downgradeRule: '仅提取白名单语义；其余样式一律忽略',
    notes: '白名单范围以后续契约 PR 为准',
    implementationState: {
      import: 'downgrade_only',
      reader: 'not_applicable',
      analysis: 'not_applicable',
    },
    downgradeTargets: {
      strategy: 'recognized_structure_only',
      note: '忽略复杂 CSS，只保留已经被识别的结构语义与文本内容。',
    },
  },
  {
    id: 'multi-column',
    kind: 'layout',
    sourceSignals: ['CSS columns', '报刊式分栏'],
    supportLevel: 'P2',
    importTarget: '不保留多栏布局结构',
    readerTarget: 'Reader 不实现多栏排版',
    analysisStrategy: '按阅读顺序展平为 plain text',
    downgradeRule: '无法明确顺序时转 `unsupported` 并保留可用文本',
    notes: '不把分页器扩展为通用版式引擎',
    implementationState: {
      import: 'downgrade_only',
      reader: 'not_applicable',
      analysis: 'not_applicable',
    },
    downgradeTargets: {
      strategy: 'linear_text_only',
      note: '按解析顺序展平为线性文本或已识别结构。',
    },
  },
  {
    id: 'float',
    kind: 'layout',
    sourceSignals: ['左右浮动图片', '文本包裹'],
    supportLevel: 'P2',
    importTarget: '不保留 float 布局语义',
    readerTarget: 'Reader 按普通块流渲染',
    analysisStrategy: '文本按线性顺序投影',
    downgradeRule: '忽略浮动定位，仅保留内容与可识别图片块',
    notes: '不承诺文字环绕',
    implementationState: {
      import: 'downgrade_only',
      reader: 'not_applicable',
      analysis: 'not_applicable',
    },
    downgradeTargets: {
      strategy: 'recognized_structure_only',
      note: '忽略 float 布局，仅保留线性内容和已识别图片块。',
    },
  },
  {
    id: 'complex-svg',
    kind: 'block',
    sourceSignals: ['内嵌 SVG', '交互式矢量内容'],
    supportLevel: 'P2',
    importTarget: '不保留 SVG DOM 结构',
    readerTarget: 'Reader 不直接渲染复杂 SVG 结构',
    analysisStrategy: '保留可提取文本说明',
    downgradeRule: '优先保留 alt/title/说明文本；无可用文本时转 `unsupported`',
    notes: '不实现通用 SVG 渲染支持',
    implementationState: {
      import: 'downgrade_only',
      reader: 'not_applicable',
      analysis: 'not_applicable',
    },
    downgradeTargets: {
      strategy: 'unsupported_block',
      blockTypes: ['unsupported'],
      note: '复杂 SVG 当前统一降级为 unsupported fallback。',
    },
  },
  {
    id: 'extreme-class-style',
    kind: 'style',
    sourceSignals: ['依赖 class 才能理解的视觉语义'],
    supportLevel: 'P2',
    importTarget: '不把 class 名本身当作稳定语义',
    readerTarget: 'Reader 仅消费可映射的基础语义',
    analysisStrategy: '仅保留文本',
    downgradeRule: '忽略 class 驱动的呈现细节，仅保留可识别结构和文本',
    notes: '例如装饰性 class、特定出版商命名约定',
    implementationState: {
      import: 'downgrade_only',
      reader: 'not_applicable',
      analysis: 'not_applicable',
    },
    downgradeTargets: {
      strategy: 'recognized_structure_only',
      note: 'class 只作为辅助信号，无法稳定映射时不进入 Rich AST 语义。',
    },
  },
  {
    id: 'complex-inline-style',
    kind: 'style',
    sourceSignals: ['大量内联样式', '混合版式指令'],
    supportLevel: 'P2',
    importTarget: '仅映射白名单内基础语义',
    readerTarget: 'Reader 仅消费基础语义字段',
    analysisStrategy: '仅保留文本',
    downgradeRule: '非白名单 style 一律忽略；无法映射时只保留文本或转 `unsupported`',
    notes: '白名单外样式不进入契约',
    implementationState: {
      import: 'downgrade_only',
      reader: 'not_applicable',
      analysis: 'not_applicable',
    },
    downgradeTargets: {
      strategy: 'recognized_structure_only',
      note: '仅保留白名单语义，复杂 inline style 不进入稳定 AST 字段。',
    },
  },
] as const satisfies readonly RichContentCapability[];

export type RichContentCapabilityId = (typeof RICH_CONTENT_CAPABILITIES)[number]['id'];

export const RICH_CONTENT_CAPABILITY_IDS = RICH_CONTENT_CAPABILITIES
  .map((capability) => capability.id) as RichContentCapabilityId[];

export const RICH_CONTENT_CAPABILITIES_BY_ID = Object.fromEntries(
  RICH_CONTENT_CAPABILITIES.map((capability) => [capability.id, capability]),
) as Record<RichContentCapabilityId, (typeof RICH_CONTENT_CAPABILITIES)[number]>;
