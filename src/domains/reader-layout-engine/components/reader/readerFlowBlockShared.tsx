import type { RichInline } from '@shared/contracts';
import type {
  ReaderImagePageItem,
  ReaderTextPageItem,
  StaticTextLine,
} from '../../utils/readerLayout';

import RichInlineRenderer from './RichInlineRenderer';

export interface RenderImageItem {
  align?: 'left' | 'center' | 'right';
  anchorId?: string;
  blockIndex: number;
  captionFont?: string;
  captionFontSizePx?: number;
  captionLineHeightPx?: number;
  captionLines?: StaticTextLine[];
  captionRichLineFragments?: ReaderImagePageItem['captionRichLineFragments'];
  captionSpacing?: number;
  chapterIndex: number;
  displayHeight: number;
  displayWidth: number | string;
  height: number;
  imageKey: string;
  marginAfter: number;
  marginBefore: number;
}

export interface RenderTextItem {
  align?: 'left' | 'center' | 'right';
  anchorId?: string;
  blockIndex: number;
  blockquoteDepth?: number;
  container?: ReaderTextPageItem['container'];
  font: string;
  fontSizePx: number;
  height: number;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  indent?: number;
  kind: 'heading' | 'text';
  lineHeightPx: number;
  lineStartIndex: number;
  lines: StaticTextLine[];
  listContext?: ReaderTextPageItem['listContext'];
  marginAfter: number;
  marginBefore: number;
  originalTag?: string;
  renderRole?: ReaderTextPageItem['renderRole'];
  richLineFragments?: ReaderTextPageItem['richLineFragments'];
  showListMarker?: boolean;
  tableRowHeights?: number[];
  tableRows?: ReaderTextPageItem['tableRows'];
  text: string;
}

export function serializeInlineKey(children: RichInline[]): string {
  return children.map((child) => {
    if (child.type === 'text') {
      return child.text;
    }

    if (child.type === 'lineBreak') {
      return '\n';
    }

    return `${child.href}:${serializeInlineKey(child.children)}`;
  }).join('');
}

export function serializeTextLines(lines: StaticTextLine[]): string {
  if (lines.length === 0) {
    return '\u00a0';
  }

  return lines
    .map((line) => (line.text.length > 0 ? line.text : '\u00a0'))
    .join('\n');
}

export function renderRichLineFragments(
  richLineFragments: NonNullable<ReaderTextPageItem['richLineFragments']>,
  keyPrefix: string,
  baseFont: string,
  baseFontSizePx: number,
  firstLineIndent?: number,
) {
  const lineCounts = new Map<string, number>();

  return richLineFragments.map((line, index) => {
    const lineSignature = serializeInlineKey(line);
    const lineOccurrence = lineCounts.get(lineSignature) ?? 0;
    lineCounts.set(lineSignature, lineOccurrence + 1);
    const lineKey = `${keyPrefix}:line:${lineSignature}:${lineOccurrence}`;

    return (
      <span
        key={lineKey}
        className="block overflow-hidden whitespace-pre"
        style={typeof firstLineIndent === 'number' && index === 0
          ? { paddingLeft: `${firstLineIndent}em` }
          : undefined}
      >
        {line.length > 0 ? (
          <RichInlineRenderer
            baseFont={baseFont}
            baseFontSizePx={baseFontSizePx}
            inlines={line}
            keyPrefix={lineKey}
          />
        ) : '\u00a0'}
      </span>
    );
  });
}

export function resolveTextAlignClass(
  align: 'left' | 'center' | 'right' | undefined,
): string {
  if (align === 'center') {
    return 'text-center';
  }

  if (align === 'right') {
    return 'text-right';
  }

  return 'text-left';
}

export function resolveImageJustifyClass(
  align: 'left' | 'center' | 'right' | undefined,
): string {
  if (align === 'center') {
    return 'justify-center';
  }

  if (align === 'right') {
    return 'justify-end';
  }

  return 'justify-start';
}

export function getHeadingTagName(
  level: number | undefined,
): 'h2' | 'h3' | 'h4' | 'h5' | 'h6' {
  if (!level || level <= 2) {
    return 'h2';
  }

  if (level === 3) {
    return 'h3';
  }

  if (level === 4) {
    return 'h4';
  }

  if (level === 5) {
    return 'h5';
  }

  return 'h6';
}
