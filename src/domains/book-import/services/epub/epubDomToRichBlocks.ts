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
  'hr',
  'iframe',
  'math',
  'object',
  'picture',
  'pre',
  'ruby',
  'svg',
  'table',
  'video',
]);

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
  if (node.nodeType === Node.TEXT_NODE) {
    return createTextInline(node.textContent ?? '', marks);
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return [];
  }

  const element = node as Element;
  if (element.localName === 'br') {
    return [{ type: 'lineBreak' }];
  }

  if (element.localName === 'img') {
    return [];
  }

  const nextMarks = deriveMarks(element, marks);
  return collectInlineChildren(element, nextMarks);
}

function appendParagraphBlock(
  blocks: RichBlock[],
  inlines: RichInline[],
  align?: RichTextAlign,
  indent?: number,
): void {
  if (inlines.length === 0) {
    return;
  }

  blocks.push({
    type: 'paragraph',
    children: inlines,
    ...(align ? { align } : {}),
    ...(indent !== undefined ? { indent } : {}),
  });
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
    if (child.nodeType === Node.TEXT_NODE) {
      inlineBuffer.push(...createTextInline(child.textContent ?? '', []));
      continue;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) {
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
    if (child.nodeType === Node.TEXT_NODE) {
      inlineBuffer.push(...createTextInline(child.textContent ?? '', []));
      continue;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) {
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

  return blocks;
}

function convertListElementToBlocks(element: Element): RichBlock[] {
  const items = Array.from(element.children)
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
  return convertFlowChildrenToBlocks(element, {
    align: readTextAlign(element),
    indent: readParagraphIndent(element),
  });
}

function convertElementToBlocks(element: Element): RichBlock[] {
  if (BLOCK_CONTAINER_TAG_NAMES.has(element.localName)) {
    return convertFlowChildrenToBlocks(element);
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
  return convertFlowChildrenToBlocks(root);
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
