import type { CSSProperties } from 'react';
import type { RichInline } from '@shared/contracts';
import type {
  ReaderImagePageItem,
  ReaderTextPageItem,
  StaticReaderNode,
  StaticTextLine,
} from '../../utils/readerLayout';

import { useTranslation } from 'react-i18next';

import { READER_CONTENT_CLASS_NAMES } from '@domains/reader-shell/constants/readerContentContract';
import { cn } from '@shared/utils/cn';

import { useReaderImageResource } from '../../hooks/useReaderImageResource';
import type {
  ReaderImageActivationPayload,
  ReaderImageGalleryEntry,
} from '../../utils/readerImageGallery';
import {
  getReaderContentBlockClassName,
  getReaderContentContextClassName,
} from '../../utils/readerContentStyling';
import {
  formatRichScrollListMarker,
  resolveRichScrollBlockInsets,
} from '../../utils/richScroll';
import RichInlineRenderer from './RichInlineRenderer';

interface ReaderFlowBlockProps {
  chapterTitle?: string;
  imageRenderMode: 'paged' | 'scroll';
  item: StaticReaderNode;
  novelId: number;
  onImageActivate?: (payload: ReaderImageActivationPayload) => void;
  onRegisterImageElement?: (
    entry: Pick<ReaderImageGalleryEntry, 'blockIndex' | 'chapterIndex' | 'imageKey'>,
    element: HTMLButtonElement | null,
  ) => void;
  positionStyle?: CSSProperties;
}

interface RenderImageItem {
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

interface RenderTextItem {
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

function serializeInlineKey(children: RichInline[]): string {
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

function serializeTextLines(lines: StaticTextLine[]): string {
  if (lines.length === 0) {
    return '\u00a0';
  }

  return lines
    .map((line) => (line.text.length > 0 ? line.text : '\u00a0'))
    .join('\n');
}

function renderRichLineFragments(
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

function ReaderLayoutImage({
  imageKey,
  imageRenderMode,
  novelId,
  style,
}: {
  imageKey: string;
  imageRenderMode: 'paged' | 'scroll';
  novelId: number;
  style: CSSProperties;
}) {
  const imageUrl = useReaderImageResource(novelId, imageKey);
  if (!imageUrl) {
    return null;
  }

  return (
    <img
      src={imageUrl}
      alt=""
      className="mx-auto block max-h-full max-w-full object-contain object-center"
      decoding="async"
      draggable={false}
      loading={imageRenderMode === 'paged' ? 'eager' : 'lazy'}
      style={style}
    />
  );
}

function resolveTextAlignClass(align: 'left' | 'center' | 'right' | undefined): string {
  if (align === 'center') {
    return 'text-center';
  }

  if (align === 'right') {
    return 'text-right';
  }

  return 'text-left';
}

function resolveImageJustifyClass(align: 'left' | 'center' | 'right' | undefined): string {
  if (align === 'center') {
    return 'justify-center';
  }

  if (align === 'right') {
    return 'justify-end';
  }

  return 'justify-start';
}

function getHeadingTagName(level: number | undefined): 'h2' | 'h3' | 'h4' | 'h5' | 'h6' {
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

export default function ReaderFlowBlock({
  chapterTitle,
  imageRenderMode,
  item,
  novelId,
  onImageActivate,
  onRegisterImageElement,
  positionStyle,
}: ReaderFlowBlockProps) {
  const { t } = useTranslation();
  let imageItem: RenderImageItem | null = null;
  let textItem: RenderTextItem | null = null;

  if ('block' in item) {
    if (item.block.kind === 'blank') {
      return null;
    }

    if (item.block.kind === 'image') {
      imageItem = {
        align: item.block.align,
        anchorId: item.block.anchorId,
        blockIndex: item.block.blockIndex,
        captionFont: item.captionFont,
        captionFontSizePx: item.captionFontSizePx,
        captionLineHeightPx: item.captionLineHeightPx,
        captionLines: item.captionLines,
        captionRichLineFragments: item.captionRichLineFragments,
        captionSpacing: item.captionSpacing,
        chapterIndex: item.block.chapterIndex,
        displayHeight: item.displayHeight ?? item.contentHeight,
        displayWidth: item.displayWidth ?? '100%',
        height: item.height,
        imageKey: item.block.imageKey ?? '',
        marginAfter: item.marginAfter,
        marginBefore: item.marginBefore,
      };
    } else {
      textItem = {
        align: item.block.align,
        anchorId: item.block.anchorId,
        blockIndex: item.block.blockIndex,
        blockquoteDepth: item.block.blockquoteDepth,
        container: item.block.container,
        font: item.font,
        fontSizePx: item.fontSizePx,
        height: item.height,
        headingLevel: item.block.headingLevel,
        indent: item.block.indent,
        kind: item.block.kind,
        lineHeightPx: item.lineHeightPx,
        lineStartIndex: 0,
        lines: item.lines,
        listContext: item.block.listContext,
        marginAfter: item.marginAfter,
        marginBefore: item.marginBefore,
        originalTag: item.block.originalTag,
        renderRole: item.block.renderRole,
        richLineFragments: undefined,
        showListMarker: item.block.showListMarker,
        tableRowHeights: item.tableRowHeights,
        tableRows: item.block.tableRows,
        text: item.block.text ?? '',
      };
    }
  } else {
    if (item.kind === 'blank') {
      return null;
    }

    if (item.kind === 'image') {
      const pageImageItem = item as ReaderImagePageItem;
      imageItem = {
        align: pageImageItem.align,
        anchorId: pageImageItem.anchorId,
        blockIndex: pageImageItem.blockIndex,
        captionFont: pageImageItem.captionFont,
        captionFontSizePx: pageImageItem.captionFontSizePx,
        captionLineHeightPx: pageImageItem.captionLineHeightPx,
        captionLines: pageImageItem.captionLines,
        captionRichLineFragments: pageImageItem.captionRichLineFragments,
        captionSpacing: pageImageItem.captionSpacing,
        chapterIndex: pageImageItem.chapterIndex,
        displayHeight: pageImageItem.displayHeight,
        displayWidth: pageImageItem.displayWidth,
        height: pageImageItem.height,
        imageKey: pageImageItem.imageKey,
        marginAfter: pageImageItem.marginAfter,
        marginBefore: pageImageItem.marginBefore,
      };
    } else {
      const pageTextItem = item as ReaderTextPageItem;
      textItem = {
        align: pageTextItem.align,
        anchorId: pageTextItem.anchorId,
        blockIndex: pageTextItem.blockIndex,
        blockquoteDepth: pageTextItem.blockquoteDepth,
        container: pageTextItem.container,
        font: pageTextItem.font,
        fontSizePx: pageTextItem.fontSizePx,
        height: pageTextItem.height,
        headingLevel: pageTextItem.headingLevel,
        indent: pageTextItem.indent,
        kind: pageTextItem.kind,
        lineHeightPx: pageTextItem.lineHeightPx,
        lineStartIndex: pageTextItem.lineStartIndex,
        lines: pageTextItem.lines,
        listContext: pageTextItem.listContext,
        marginAfter: pageTextItem.marginAfter,
        marginBefore: pageTextItem.marginBefore,
        originalTag: pageTextItem.originalTag,
        renderRole: pageTextItem.renderRole,
        richLineFragments: pageTextItem.richLineFragments,
        showListMarker: pageTextItem.showListMarker,
        tableRowHeights: pageTextItem.tableRowHeights,
        tableRows: pageTextItem.tableRows,
        text: pageTextItem.text,
      };
    }
  }

  if (imageItem) {
    const serializedCaption = serializeTextLines(imageItem.captionLines ?? []);
    const hasRichCaption = Boolean(
      imageItem.captionRichLineFragments?.some((line) => line.length > 0),
    );
    const hasCaption = hasRichCaption
      || Boolean(imageItem.captionLines && imageItem.captionLines.length > 0);

    return (
      <div
        id={imageItem.anchorId}
        className={cn(
          getReaderContentBlockClassName({ kind: 'image' }),
          'flex items-center overflow-visible',
          resolveImageJustifyClass(imageItem.align),
        )}
        style={{
          ...positionStyle,
          height: imageItem.height,
          paddingBottom: imageItem.marginAfter,
          paddingTop: imageItem.marginBefore,
        }}
      >
        <div
          className={cn('relative inline-flex max-w-full flex-col', resolveImageJustifyClass(imageItem.align))}
          style={{
            maxWidth: '100%',
            width: imageItem.displayWidth,
          }}
        >
          <div
            className={cn('relative inline-flex', resolveImageJustifyClass(imageItem.align))}
            style={{
              height: imageItem.displayHeight,
              maxWidth: '100%',
              width: imageItem.displayWidth,
            }}
          >
            <ReaderLayoutImage
              imageKey={imageItem.imageKey}
              imageRenderMode={imageRenderMode}
              novelId={novelId}
              style={{
                height: imageItem.displayHeight,
                maxWidth: '100%',
                width: imageItem.displayWidth,
              }}
            />
            {onImageActivate ? (
              <button
                ref={(element) => onRegisterImageElement?.({
                  blockIndex: imageItem.blockIndex,
                  chapterIndex: imageItem.chapterIndex,
                  imageKey: imageItem.imageKey,
                }, element)}
                data-reader-image-activate=""
                type="button"
                aria-label={t('reader.imageViewer.title')}
                className="absolute -inset-3 z-10 cursor-zoom-in rounded-2xl bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onImageActivate({
                    blockIndex: imageItem.blockIndex,
                    chapterIndex: imageItem.chapterIndex,
                    imageKey: imageItem.imageKey,
                    sourceElement: event.currentTarget,
                  });
                }}
                onPointerDownCapture={imageRenderMode === 'scroll'
                  ? (event) => {
                    event.stopPropagation();
                  }
                  : undefined}
              />
            ) : null}
          </div>
          {hasCaption ? (
            <figcaption
              data-testid="reader-flow-image-caption"
              className={cn(
                READER_CONTENT_CLASS_NAMES.imageCaption,
                'w-full text-sm',
                resolveTextAlignClass(imageItem.align),
              )}
              style={{
                font: imageItem.captionFont,
                fontSize: imageItem.captionFontSizePx
                  ? `${imageItem.captionFontSizePx}px`
                  : undefined,
                lineHeight: imageItem.captionLineHeightPx
                  ? `${imageItem.captionLineHeightPx}px`
                  : undefined,
                minHeight: imageItem.captionLines && imageItem.captionLineHeightPx
                  ? `${imageItem.captionLines.length * imageItem.captionLineHeightPx}px`
                  : undefined,
                whiteSpace: 'pre',
              }}
            >
              {hasRichCaption && imageItem.captionFont && imageItem.captionFontSizePx
                ? renderRichLineFragments(
                  imageItem.captionRichLineFragments ?? [],
                  `${imageItem.blockIndex}:caption`,
                  imageItem.captionFont,
                  imageItem.captionFontSizePx,
                )
                : serializedCaption}
            </figcaption>
          ) : null}
        </div>
      </div>
    );
  }

  if (!textItem) {
    return null;
  }

  const textStyle = {
    font: textItem.font,
    fontSize: `${textItem.fontSizePx}px`,
    lineHeight: `${textItem.lineHeightPx}px`,
  } satisfies CSSProperties;
  const insets = resolveRichScrollBlockInsets({
    blockquoteDepth: textItem.blockquoteDepth,
    container: textItem.container,
    listContext: textItem.listContext,
  });
  const showListMarker = Boolean(
    textItem.listContext
    && textItem.showListMarker
    && textItem.lineStartIndex === 0,
  );
  const listMarker = showListMarker
    ? formatRichScrollListMarker({ listContext: textItem.listContext })
    : null;
  const listPaddingStart = textItem.listContext
    ? Math.max(0, insets.listInset - insets.markerWidth - insets.markerGap) + insets.poemInset
    : insets.poemInset;
  const serializedText = serializeTextLines(textItem.lines);
  const hasRichLineFragments = Boolean(
    textItem.richLineFragments?.some((line) => line.length > 0),
  );
  let renderedText = serializedText;
  if (textItem.kind === 'heading') {
    renderedText = textItem.blockIndex === 0
      ? chapterTitle ?? textItem.text
      : textItem.text;
  }

  if (textItem.renderRole === 'hr') {
    return (
      <div
        id={textItem.anchorId}
        style={{
          ...positionStyle,
          height: textItem.height,
          paddingBottom: textItem.marginAfter,
          paddingTop: textItem.marginBefore,
        }}
      >
        <div className="flex h-full items-center">
          <div
            data-testid="reader-flow-hr"
            className={cn(getReaderContentBlockClassName({ kind: 'text', renderRole: 'hr' }), 'w-full')}
          />
        </div>
      </div>
    );
  }

  if (textItem.renderRole === 'table' && textItem.tableRows) {
    const rowCounts = new Map<string, number>();
    let content = (
      <div
        data-testid="reader-flow-table"
        className={cn(
          getReaderContentBlockClassName({ kind: 'text', renderRole: 'table' }),
          'h-full overflow-x-auto px-1 py-1',
        )}
      >
        <table
          className="min-w-full table-fixed border-collapse"
          style={{
            ...textStyle,
          }}
        >
          <tbody>
            {textItem.tableRows.map((row, rowIndex) => {
              const rowSignature = row.map((cell) => serializeInlineKey(cell.children)).join('|');
              const rowOccurrence = rowCounts.get(rowSignature) ?? 0;
              rowCounts.set(rowSignature, rowOccurrence + 1);
              const rowKey = `${textItem.blockIndex}:row:${rowSignature}:${rowOccurrence}`;
              const cellCounts = new Map<string, number>();

              return (
                <tr
                  key={rowKey}
                  style={textItem.tableRowHeights?.[rowIndex]
                    ? { height: `${textItem.tableRowHeights[rowIndex]}px` }
                    : undefined}
                >
                  {row.map((cell) => {
                    const cellSignature = serializeInlineKey(cell.children);
                    const cellOccurrence = cellCounts.get(cellSignature) ?? 0;
                    cellCounts.set(cellSignature, cellOccurrence + 1);
                    const cellKey = `${rowKey}:cell:${cellSignature}:${cellOccurrence}`;

                    return (
                      <td
                        key={cellKey}
                        className={READER_CONTENT_CLASS_NAMES.tableCell}
                      >
                        <RichInlineRenderer
                          baseFont={textItem.font}
                          baseFontSizePx={textItem.fontSizePx}
                          inlines={cell.children}
                          keyPrefix={cellKey}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );

    if ((textItem.blockquoteDepth ?? 0) > 0) {
      content = (
        <div
          className={cn(getReaderContentContextClassName('blockquote'), 'h-full')}
          style={{
            paddingLeft: `calc(${insets.quoteInset}px - var(--pm-reader-blockquote-border-width))`,
          }}
        >
          {content}
        </div>
      );
    }

    return (
      <div
        id={textItem.anchorId}
        style={{
          ...positionStyle,
          height: textItem.height,
          paddingBottom: textItem.marginAfter,
          paddingRight: insets.end,
          paddingTop: textItem.marginBefore,
        }}
      >
        {content}
      </div>
    );
  }

  let content = textItem.kind === 'heading'
    ? (() => {
      const TagName = getHeadingTagName(textItem.headingLevel);
      return (
        <TagName
          data-testid="reader-flow-text-fragment"
          className={cn(
            getReaderContentBlockClassName({ kind: 'heading' }),
            'break-words font-semibold',
            resolveTextAlignClass(textItem.align),
          )}
          style={{
            ...textStyle,
            overflow: 'hidden',
            overflowWrap: 'anywhere',
            whiteSpace: hasRichLineFragments ? undefined : 'pre-wrap',
          }}
        >
          {hasRichLineFragments && textItem.blockIndex !== 0
            ? renderRichLineFragments(
              textItem.richLineFragments ?? [],
              `${textItem.blockIndex}:heading`,
              textItem.font,
              textItem.fontSizePx,
            )
            : renderedText}
        </TagName>
      );
    })()
    : (
      <div
        data-testid="reader-flow-text-fragment"
        className={cn(
          getReaderContentBlockClassName({
            kind: 'text',
            renderRole: textItem.renderRole,
          }),
          resolveTextAlignClass(textItem.align),
        )}
        style={{
          ...textStyle,
          overflow: 'hidden',
          textIndent: !hasRichLineFragments
            && typeof textItem.indent === 'number'
            && textItem.lineStartIndex === 0
            ? `${textItem.indent}em`
            : undefined,
          whiteSpace: hasRichLineFragments ? undefined : 'pre',
        }}
      >
        {hasRichLineFragments
          ? renderRichLineFragments(
            textItem.richLineFragments ?? [],
            `${textItem.blockIndex}:text`,
            textItem.font,
            textItem.fontSizePx,
            typeof textItem.indent === 'number' && textItem.lineStartIndex === 0
              ? textItem.indent
              : undefined,
          )
          : renderedText}
      </div>
    );

  if (textItem.renderRole === 'unsupported' && textItem.originalTag === 'table') {
    content = (
      <div
        data-testid="reader-flow-table-fallback"
        className={cn(
          getReaderContentBlockClassName({ kind: 'text', renderRole: 'unsupported' }),
          'px-4 py-3',
        )}
      >
        {content}
      </div>
    );
  }

  if (textItem.listContext) {
    content = (
      <div
        className={cn(getReaderContentContextClassName('list-item'), 'flex h-full min-w-0 items-start')}
        style={{ paddingLeft: `${listPaddingStart}px` }}
      >
        <div
          aria-hidden="true"
          className={cn(READER_CONTENT_CLASS_NAMES.listMarker, 'shrink-0 text-right')}
          style={{
            fontSize: `${textItem.fontSizePx}px`,
            lineHeight: `${textItem.lineHeightPx}px`,
            paddingRight: `${insets.markerGap}px`,
            width: `${insets.markerWidth}px`,
          }}
        >
          {listMarker}
        </div>
        <div className="min-w-0 flex-1">{content}</div>
      </div>
    );
  } else if (insets.poemInset > 0) {
    content = (
      <div
        className={getReaderContentContextClassName('poem-line')}
        style={{ paddingLeft: `${insets.poemInset}px` }}
      >
        {content}
      </div>
    );
  }

  if ((textItem.blockquoteDepth ?? 0) > 0) {
    content = (
      <div
        className={cn(getReaderContentContextClassName('blockquote'), 'h-full')}
        style={{
          paddingLeft: `calc(${insets.quoteInset}px - var(--pm-reader-blockquote-border-width))`,
        }}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      id={textItem.anchorId}
      style={{
        ...positionStyle,
        height: textItem.height,
        paddingBottom: textItem.marginAfter,
        paddingRight: insets.end,
        paddingTop: textItem.marginBefore,
      }}
    >
      {content}
    </div>
  );
}
