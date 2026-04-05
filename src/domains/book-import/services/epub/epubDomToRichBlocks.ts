import type {
  Mark,
  RichBlock,
  RichInline,
  RichTextAlign,
} from '@shared/contracts';

const BLOCK_CONTAINER_TAG_NAMES = new Set([
  'article',
  'body',
  'div',
  'main',
  'section',
]);

const INLINE_CONTAINER_TAG_NAMES = new Set([
  'a',
  'abbr',
  'b',
  'cite',
  'code',
  'del',
  'em',
  'font',
  'i',
  's',
  'small',
  'span',
  'strike',
  'strong',
  'sub',
  'sup',
  'u',
]);

const UNSUPPORTED_BLOCK_TAG_NAMES = new Set([
  'aside',
  'audio',
  'canvas',
  'details',
  'dl',
  'fieldset',
  'form',
  'iframe',
  'math',
  'object',
  'picture',
  'pre',
  'ruby',
  'svg',
  'video',
]);

const TABLE_SECTION_TAG_NAMES = new Set(['tbody', 'tfoot', 'thead']);
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

function getElementChildren(parent: Element): Element[] {
  return Array.from(parent.childNodes)
    .filter((child): child is Element => child.nodeType === ELEMENT_NODE);
}

function normalizeInlineWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ');
}

function trimFallbackText(value: string): string {
  return value
    .replace(/[^\S\n]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function parseStyleAttribute(styleValue: string | null): Map<string, string> {
  const declarations = new Map<string, string>();
  if (!styleValue) {
    return declarations;
  }

  for (const declaration of styleValue.split(';')) {
    const separatorIndex = declaration.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
    const value = declaration.slice(separatorIndex + 1).trim();
    if (property.length === 0 || value.length === 0) {
      continue;
    }

    declarations.set(property, value);
  }

  return declarations;
}

function readTextAlign(element: Element): RichTextAlign | undefined {
  const alignAttribute = element.getAttribute('align')?.trim().toLowerCase();
  if (alignAttribute === 'left' || alignAttribute === 'center' || alignAttribute === 'right') {
    return alignAttribute;
  }

  const textAlign = parseStyleAttribute(element.getAttribute('style')).get('text-align')?.toLowerCase();
  if (textAlign === 'left' || textAlign === 'center' || textAlign === 'right') {
    return textAlign;
  }

  return undefined;
}

function readDimension(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.trim().match(/^(\d+(?:\.\d+)?)/u);
  if (!match) {
    return undefined;
  }

  const numericValue = Number.parseFloat(match[1]);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : undefined;
}

function readDimensionFromElement(element: Element, attributeName: 'width' | 'height'): number | undefined {
  const attributeValue = readDimension(element.getAttribute(attributeName));
  if (attributeValue !== undefined) {
    return attributeValue;
  }

  return readDimension(parseStyleAttribute(element.getAttribute('style')).get(attributeName) ?? null);
}

function readParagraphIndent(element: Element): number | undefined {
  const rawValue = parseStyleAttribute(element.getAttribute('style')).get('text-indent');
  if (!rawValue) {
    return undefined;
  }

  const parsedValue = readDimension(rawValue);
  return parsedValue !== undefined && parsedValue > 0 ? parsedValue : undefined;
}

function readAnchorId(element: Element): string | undefined {
  const rawAnchorId = element.getAttribute('id')?.trim();
  return rawAnchorId || undefined;
}

function extractInternalHrefTarget(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue.startsWith('#')) {
    return undefined;
  }

  const targetId = trimmedValue.slice(1).trim();
  return targetId.length > 0 ? targetId : undefined;
}

function pushUniqueMark(marks: Mark[], mark: Mark): void {
  if (!marks.includes(mark)) {
    marks.push(mark);
  }
}

function deriveMarks(element: Element, baseMarks: Mark[]): Mark[] {
  const nextMarks = [...baseMarks];
  const { localName } = element;
  if (localName === 'b' || localName === 'strong') {
    pushUniqueMark(nextMarks, 'bold');
  }
  if (localName === 'em' || localName === 'i') {
    pushUniqueMark(nextMarks, 'italic');
  }
  if (localName === 'u') {
    pushUniqueMark(nextMarks, 'underline');
  }
  if (localName === 's' || localName === 'strike' || localName === 'del') {
    pushUniqueMark(nextMarks, 'strike');
  }
  if (localName === 'sup') {
    pushUniqueMark(nextMarks, 'sup');
  }
  if (localName === 'sub') {
    pushUniqueMark(nextMarks, 'sub');
  }

  const styles = parseStyleAttribute(element.getAttribute('style'));
  const fontWeight = styles.get('font-weight')?.toLowerCase();
  if (fontWeight === 'bold' || Number.parseInt(fontWeight ?? '', 10) >= 600) {
    pushUniqueMark(nextMarks, 'bold');
  }

  const fontStyle = styles.get('font-style')?.toLowerCase();
  if (fontStyle === 'italic' || fontStyle === 'oblique') {
    pushUniqueMark(nextMarks, 'italic');
  }

  const textDecoration = styles.get('text-decoration')?.toLowerCase() ?? '';
  if (textDecoration.includes('underline')) {
    pushUniqueMark(nextMarks, 'underline');
  }
  if (textDecoration.includes('line-through')) {
    pushUniqueMark(nextMarks, 'strike');
  }

  const verticalAlign = styles.get('vertical-align')?.toLowerCase();
  if (verticalAlign === 'super' || verticalAlign === 'sup') {
    pushUniqueMark(nextMarks, 'sup');
  }
  if (verticalAlign === 'sub') {
    pushUniqueMark(nextMarks, 'sub');
  }

  return nextMarks;
}

function createTextInline(text: string, marks: Mark[]): RichInline[] {
  const normalizedText = normalizeInlineWhitespace(text);
  if (normalizedText.trim().length === 0) {
    return [];
  }

  return [{
    type: 'text',
    text: normalizedText,
    ...(marks.length > 0 ? { marks } : {}),
  }];
}

function createUnsupportedBlock(element: Element): RichBlock[] {
  const fallbackText = trimFallbackText(element.textContent ?? '');
  if (fallbackText.length === 0 && element.localName !== 'img') {
    return [];
  }

  return [{
    type: 'unsupported',
    fallbackText: fallbackText || '（插图）',
    originalTag: element.localName,
  }];
}

function attachAnchorIdToBlock<T extends RichBlock>(
  block: T,
  anchorId: string | undefined,
): T {
  if (!anchorId) {
    return block;
  }

  if (
    block.type === 'heading'
    || block.type === 'paragraph'
    || block.type === 'image'
    || block.type === 'hr'
    || block.type === 'poem'
    || block.type === 'table'
  ) {
    return {
      ...block,
      anchorId,
    };
  }

  return block;
}

function attachAnchorIdToFirstBlock(
  blocks: RichBlock[],
  anchorId: string | undefined,
): RichBlock[] {
  if (!anchorId || blocks.length === 0) {
    return blocks;
  }

  const [firstBlock, ...remainingBlocks] = blocks;
  return [
    attachAnchorIdToBlock(firstBlock, anchorId),
    ...remainingBlocks,
  ];
}

function flattenInlineText(inlines: RichInline[]): string {
  let value = '';
  for (const inline of inlines) {
    if (inline.type === 'lineBreak') {
      value += '\n';
      continue;
    }

    if (inline.type === 'link') {
      value += flattenInlineText(inline.children);
      continue;
    }

    value += inline.text;
  }

  return trimFallbackText(value);
}

function collectInlineChildren(parent: ParentNode, marks: Mark[]): RichInline[] {
  const inlines: RichInline[] = [];
  for (const child of Array.from(parent.childNodes)) {
    inlines.push(...convertNodeToInlines(child, marks));
  }
  return inlines;
}

function convertNodeToInlines(node: ChildNode, marks: Mark[]): RichInline[] {
  if (node.nodeType === TEXT_NODE) {
    return createTextInline(node.textContent ?? '', marks);
  }

  if (node.nodeType !== ELEMENT_NODE) {
    return [];
  }

  const element = node as Element;
  if (element.localName === 'br') {
    return [{ type: 'lineBreak' }];
  }

  if (element.localName === 'img') {
    return [];
  }

  if (element.localName === 'a') {
    const children = collectInlineChildren(element, deriveMarks(element, marks));
    if (children.length === 0) {
      return [];
    }

    const targetId = extractInternalHrefTarget(element.getAttribute('href'));
    if (!targetId) {
      return children;
    }

    return [{
      type: 'link',
      href: `#${targetId}`,
      children,
    }];
  }

  const nextMarks = deriveMarks(element, marks);
  return collectInlineChildren(element, nextMarks);
}

function appendParagraphBlock(
  blocks: RichBlock[],
  inlines: RichInline[],
  align?: RichTextAlign,
  indent?: number,
  anchorId?: string,
): void {
  if (inlines.length === 0) {
    return;
  }

  blocks.push(attachAnchorIdToBlock({
    type: 'paragraph',
    children: inlines,
    ...(align ? { align } : {}),
    ...(indent !== undefined ? { indent } : {}),
  }, anchorId));
}

function convertFlowChildrenToBlocks(
  parent: ParentNode,
  options: {
    align?: RichTextAlign;
    indent?: number;
  } = {},
): RichBlock[] {
  const blocks: RichBlock[] = [];
  let inlineBuffer: RichInline[] = [];

  const flushParagraph = (): void => {
    appendParagraphBlock(blocks, inlineBuffer, options.align, options.indent);
    inlineBuffer = [];
  };

  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === TEXT_NODE) {
      inlineBuffer.push(...createTextInline(child.textContent ?? '', []));
      continue;
    }

    if (child.nodeType !== ELEMENT_NODE) {
      continue;
    }

    const element = child as Element;
    if (element.localName === 'br' || INLINE_CONTAINER_TAG_NAMES.has(element.localName)) {
      inlineBuffer.push(...convertNodeToInlines(element, []));
      continue;
    }

    flushParagraph();
    blocks.push(...convertElementToBlocks(element));
  }

  flushParagraph();
  return blocks;
}

function convertHeadingElementToBlocks(element: Element): RichBlock[] {
  const level = Number.parseInt(element.localName.slice(1), 10);
  if (!Number.isFinite(level) || level < 1 || level > 6) {
    return [];
  }

  const children = collectInlineChildren(element, []);
  if (children.length === 0) {
    return [];
  }

  return [{
    type: 'heading',
    ...(readAnchorId(element) ? { anchorId: readAnchorId(element) } : {}),
    level: level as 1 | 2 | 3 | 4 | 5 | 6,
    children,
    ...(readTextAlign(element) ? { align: readTextAlign(element) } : {}),
  }];
}

function convertImageElementToBlocks(element: Element): RichBlock[] {
  const key = element.getAttribute('data-plotmapai-image-key');
  if (!key) {
    return createUnsupportedBlock(element);
  }

  return [{
    type: 'image',
    ...(readAnchorId(element) ? { anchorId: readAnchorId(element) } : {}),
    key,
    ...(element.getAttribute('alt') ? { alt: element.getAttribute('alt') ?? undefined } : {}),
    ...(readDimensionFromElement(element, 'width') ? { width: readDimensionFromElement(element, 'width') } : {}),
    ...(readDimensionFromElement(element, 'height') ? { height: readDimensionFromElement(element, 'height') } : {}),
    ...(readTextAlign(element) ? { align: readTextAlign(element) } : {}),
  }];
}

function convertFigureElementToBlocks(element: Element): RichBlock[] {
  const blocks: RichBlock[] = [];
  let captionInlines: RichInline[] | undefined;
  let inlineBuffer: RichInline[] = [];

  const flushParagraph = (): void => {
    appendParagraphBlock(blocks, inlineBuffer);
    inlineBuffer = [];
  };

  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === TEXT_NODE) {
      inlineBuffer.push(...createTextInline(child.textContent ?? '', []));
      continue;
    }

    if (child.nodeType !== ELEMENT_NODE) {
      continue;
    }

    const childElement = child as Element;
    if (childElement.localName === 'figcaption') {
      captionInlines = collectInlineChildren(childElement, []);
      continue;
    }

    if (childElement.localName === 'br' || INLINE_CONTAINER_TAG_NAMES.has(childElement.localName)) {
      inlineBuffer.push(...convertNodeToInlines(childElement, []));
      continue;
    }

    flushParagraph();
    blocks.push(...convertElementToBlocks(childElement));
  }

  flushParagraph();

  if (captionInlines && captionInlines.length > 0) {
    const firstImageBlock = blocks.find((block) => block.type === 'image');
    if (firstImageBlock && firstImageBlock.type === 'image' && !firstImageBlock.caption) {
      firstImageBlock.caption = captionInlines;
    }
  }

  return attachAnchorIdToFirstBlock(blocks, readAnchorId(element));
}

function convertListElementToBlocks(element: Element): RichBlock[] {
  const items = getElementChildren(element)
    .filter((child) => child.localName === 'li')
    .map((child) => {
      const blocks = convertFlowChildrenToBlocks(child);
      return blocks.length > 0 ? blocks : createUnsupportedBlock(child);
    })
    .filter((item): item is RichBlock[] => item.length > 0);

  if (items.length === 0) {
    return [];
  }

  return [{
    type: 'list',
    ordered: element.localName === 'ol',
    items,
  }];
}

function convertBlockquoteElementToBlocks(element: Element): RichBlock[] {
  const children = convertFlowChildrenToBlocks(element);
  if (children.length === 0) {
    return [];
  }

  return [{
    type: 'blockquote',
    children,
  }];
}

function convertParagraphElementToBlocks(element: Element): RichBlock[] {
  return attachAnchorIdToFirstBlock(convertFlowChildrenToBlocks(element, {
    align: readTextAlign(element),
    indent: readParagraphIndent(element),
  }), readAnchorId(element));
}

function joinTextualBlocksIntoInlines(blocks: RichBlock[]): RichInline[] | null {
  const inlines: RichInline[] = [];

  blocks.forEach((block, blockIndex) => {
    if (block.type !== 'heading' && block.type !== 'paragraph') {
      return;
    }

    if (blockIndex > 0) {
      inlines.push({ type: 'lineBreak' }, { type: 'lineBreak' });
    }
    inlines.push(...block.children);
  });

  return blocks.every((block) => block.type === 'heading' || block.type === 'paragraph')
    ? inlines
    : null;
}

function convertTableRowElementToCells(
  rowElement: Element,
): Array<{ children: RichInline[] }> | null {
  const cells: Array<{ children: RichInline[] }> = [];

  for (const child of getElementChildren(rowElement)) {
    if (child.localName !== 'td' && child.localName !== 'th') {
      continue;
    }

    const rowspan = child.getAttribute('rowspan');
    const colspan = child.getAttribute('colspan');
    if ((rowspan && rowspan !== '1') || (colspan && colspan !== '1')) {
      return null;
    }

    const cellBlocks = convertFlowChildrenToBlocks(child);
    const cellChildren = joinTextualBlocksIntoInlines(cellBlocks);
    if (!cellChildren) {
      return null;
    }

    cells.push({ children: cellChildren });
  }

  return cells.length > 0 ? cells : null;
}

function collectTableRows(
  element: Element,
): Array<Array<{ children: RichInline[] }>> | null {
  const rows: Array<Array<{ children: RichInline[] }>> = [];

  const appendRowsFromContainer = (container: Element): boolean => {
    for (const rowCandidate of getElementChildren(container)) {
      if (rowCandidate.localName !== 'tr') {
        continue;
      }

      const cells = convertTableRowElementToCells(rowCandidate);
      if (!cells) {
        return false;
      }

      rows.push(cells);
    }

    return true;
  };

  for (const child of getElementChildren(element)) {
    if (child.localName === 'tr') {
      const cells = convertTableRowElementToCells(child);
      if (!cells) {
        return null;
      }

      rows.push(cells);
      continue;
    }

    if (TABLE_SECTION_TAG_NAMES.has(child.localName)) {
      if (!appendRowsFromContainer(child)) {
        return null;
      }
    }
  }

  return rows.length > 0 ? rows : null;
}

function convertTableElementToBlocks(element: Element): RichBlock[] {
  const rows = collectTableRows(element);
  if (!rows) {
    return createUnsupportedBlock(element);
  }

  return [{
    type: 'table',
    ...(readAnchorId(element) ? { anchorId: readAnchorId(element) } : {}),
    rows,
  }];
}

function collectAnchorIdsFromBlocks(blocks: RichBlock[]): Set<string> {
  const anchorIds = new Set<string>();

  const visitBlocks = (blockList: RichBlock[]): void => {
    blockList.forEach((block) => {
      if ('anchorId' in block && typeof block.anchorId === 'string' && block.anchorId.length > 0) {
        anchorIds.add(block.anchorId);
      }

      if (block.type === 'blockquote') {
        visitBlocks(block.children);
        return;
      }

      if (block.type === 'list') {
        block.items.forEach((item) => visitBlocks(item));
      }
    });
  };

  visitBlocks(blocks);
  return anchorIds;
}

function filterResolvableInternalLinksInInlines(
  inlines: RichInline[],
  anchorIds: ReadonlySet<string>,
): RichInline[] {
  const filtered: RichInline[] = [];

  inlines.forEach((inline) => {
    if (inline.type !== 'link') {
      filtered.push(inline);
      return;
    }

    const children = filterResolvableInternalLinksInInlines(inline.children, anchorIds);
    if (children.length === 0) {
      return;
    }

    const targetId = extractInternalHrefTarget(inline.href);
    if (!targetId || !anchorIds.has(targetId)) {
      filtered.push(...children);
      return;
    }

    filtered.push({
      ...inline,
      href: `#${targetId}`,
      children,
    });
  });

  return filtered;
}

function filterResolvableInternalLinksInBlocks(
  blocks: RichBlock[],
  anchorIds: ReadonlySet<string>,
): RichBlock[] {
  return blocks.map((block) => {
    if (block.type === 'heading' || block.type === 'paragraph') {
      return {
        ...block,
        children: filterResolvableInternalLinksInInlines(block.children, anchorIds),
      };
    }

    if (block.type === 'image') {
      return {
        ...block,
        caption: block.caption
          ? filterResolvableInternalLinksInInlines(block.caption, anchorIds)
          : undefined,
      };
    }

    if (block.type === 'poem') {
      return {
        ...block,
        lines: block.lines.map((line) => filterResolvableInternalLinksInInlines(line, anchorIds)),
      };
    }

    if (block.type === 'table') {
      return {
        ...block,
        rows: block.rows.map((row) => row.map((cell) => ({
          ...cell,
          children: filterResolvableInternalLinksInInlines(cell.children, anchorIds),
        }))),
      };
    }

    if (block.type === 'blockquote') {
      return {
        ...block,
        children: filterResolvableInternalLinksInBlocks(block.children, anchorIds),
      };
    }

    if (block.type === 'list') {
      return {
        ...block,
        items: block.items.map((item) => filterResolvableInternalLinksInBlocks(item, anchorIds)),
      };
    }

    return block;
  });
}

function convertElementToBlocks(element: Element): RichBlock[] {
  if (BLOCK_CONTAINER_TAG_NAMES.has(element.localName)) {
    return attachAnchorIdToFirstBlock(convertFlowChildrenToBlocks(element), readAnchorId(element));
  }

  if (element.localName === 'p') {
    return convertParagraphElementToBlocks(element);
  }

  if (element.localName === 'blockquote') {
    return convertBlockquoteElementToBlocks(element);
  }

  if (element.localName === 'ul' || element.localName === 'ol') {
    return convertListElementToBlocks(element);
  }

  if (element.localName === 'figure') {
    return convertFigureElementToBlocks(element);
  }

  if (element.localName === 'img') {
    return convertImageElementToBlocks(element);
  }

  if (element.localName === 'hr') {
    return [{
      type: 'hr',
      ...(readAnchorId(element) ? { anchorId: readAnchorId(element) } : {}),
    }];
  }

  if (element.localName === 'table') {
    return convertTableElementToBlocks(element);
  }

  if (/^h[1-6]$/u.test(element.localName)) {
    return convertHeadingElementToBlocks(element);
  }

  if (UNSUPPORTED_BLOCK_TAG_NAMES.has(element.localName)) {
    return createUnsupportedBlock(element);
  }

  if (INLINE_CONTAINER_TAG_NAMES.has(element.localName)) {
    const children = collectInlineChildren(element, []);
    return children.length > 0 ? [{
      type: 'paragraph',
      children,
    }] : [];
  }

  return createUnsupportedBlock(element);
}

export function epubDomToRichBlocks(root: ParentNode): RichBlock[] {
  const blocks = convertFlowChildrenToBlocks(root);
  const anchorIds = collectAnchorIdsFromBlocks(blocks);
  return filterResolvableInternalLinksInBlocks(blocks, anchorIds);
}

export function getRichBlockText(block: RichBlock): string {
  if (block.type === 'image') {
    return block.caption ? flattenInlineText(block.caption) : block.alt ?? '（插图）';
  }

  if (block.type === 'unsupported') {
    return block.fallbackText;
  }

  if (block.type === 'blockquote') {
    return trimFallbackText(block.children.map((child) => getRichBlockText(child)).join('\n\n'));
  }

  if (block.type === 'list') {
    return trimFallbackText(block.items
      .map((item) => item.map((child) => getRichBlockText(child)).join('\n'))
      .join('\n'));
  }

  if (block.type === 'table') {
    return trimFallbackText(block.rows
      .map((row) => row.map((cell) => flattenInlineText(cell.children)).join(' | '))
      .join('\n'));
  }

  if (block.type === 'poem') {
    return trimFallbackText(block.lines.map((line) => flattenInlineText(line)).join('\n'));
  }

  if (block.type === 'hr') {
    return '';
  }

  return flattenInlineText(block.children);
}
