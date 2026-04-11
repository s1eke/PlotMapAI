import type { CSSProperties } from 'react';
import type { RichInline } from '@shared/contracts';
import type {
  ReaderImageActivationPayload,
  ReaderImageGalleryEntry,
} from '@shared/contracts/reader';
import type {
  StaticScrollBlockNode,
} from '../../utils/readerLayout';

import { useTranslation } from 'react-i18next';

import { READER_CONTENT_CLASS_NAMES } from '@shared/reader-content';
import { cn } from '@shared/utils/cn';
import { useReaderImageResource } from '@domains/reader-media';
import {
  getReaderContentBlockClassName,
  getReaderContentContextClassName,
} from '../../utils/readerContentStyling';
import {
  formatRichScrollListMarker,
  resolveRichScrollBlockInsets,
} from '../../utils/richScroll';
import RichInlineRenderer from './RichInlineRenderer';

interface RichBlockRendererProps {
  chapterTitle?: string;
  item: StaticScrollBlockNode;
  novelId: number;
  onImageActivate?: (payload: ReaderImageActivationPayload) => void;
  onRegisterImageElement?: (
    entry: Pick<ReaderImageGalleryEntry, 'blockIndex' | 'chapterIndex' | 'imageKey'>,
    element: HTMLButtonElement | null,
  ) => void;
  positionStyle?: CSSProperties;
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

function RichImage({
  imageKey,
  novelId,
  style,
}: {
  imageKey: string;
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
      className="block max-h-full max-w-full object-contain object-center"
      decoding="async"
      draggable={false}
      loading="lazy"
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

function getHeadingTagName(level: number): 'h2' | 'h3' | 'h4' | 'h5' | 'h6' {
  if (level <= 2) {
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

function renderRichContent(metric: StaticScrollBlockNode, chapterTitle?: string) {
  const { block } = metric;
  const richChildren = block.richChildren ?? [];
  let textFragmentTestId = 'reader-rich-text-fragment';
  if (block.renderRole === 'unsupported' && block.originalTag === 'table') {
    textFragmentTestId = 'reader-flow-table-fallback';
  } else if (block.renderRole === 'unsupported') {
    textFragmentTestId = 'reader-flow-text-fragment';
  }

  if (block.kind === 'heading') {
    const TagName = getHeadingTagName(block.blockIndex === 0 ? 2 : (block.headingLevel ?? 2));

    return (
      <TagName
        data-testid="reader-rich-text-fragment"
        className={cn(
          getReaderContentBlockClassName(block),
          'break-words whitespace-pre-wrap font-semibold',
          resolveTextAlignClass(block.align),
        )}
        style={{
          font: metric.font,
          fontSize: `${metric.fontSizePx}px`,
          lineHeight: `${metric.lineHeightPx}px`,
        }}
      >
        <RichInlineRenderer
          baseFont={metric.font}
          baseFontSizePx={metric.fontSizePx}
          inlines={richChildren.length > 0 ? richChildren : [{
            type: 'text',
            text: chapterTitle ?? block.text ?? '',
          }]}
          keyPrefix={`${block.key}:heading`}
        />
      </TagName>
    );
  }

  if (block.renderRole === 'hr' || block.sourceBlockType === 'hr') {
    return (
      <div className="flex h-full items-center">
        <div
          data-testid="reader-rich-hr"
          className={cn(getReaderContentBlockClassName(block), 'w-full')}
          style={{ height: metric.contentHeight }}
        />
      </div>
    );
  }

  if (block.renderRole === 'table' && block.tableRows) {
    const rowCounts = new Map<string, number>();

    return (
      <div
        data-testid="reader-rich-table"
        className={cn(getReaderContentBlockClassName(block), 'h-full overflow-x-auto px-1 py-1')}
      >
        <table
          className="min-w-full table-fixed border-collapse"
          style={{
            font: metric.font,
            fontSize: `${metric.fontSizePx}px`,
            lineHeight: `${metric.lineHeightPx}px`,
          }}
        >
          <tbody>
            {block.tableRows.map((row, rowIndex) => {
              const rowSignature = row.map((cell) => serializeInlineKey(cell.children)).join('|');
              const rowOccurrence = rowCounts.get(rowSignature) ?? 0;
              rowCounts.set(rowSignature, rowOccurrence + 1);
              const rowKey = `${block.key}:row:${rowSignature}:${rowOccurrence}`;
              const cellCounts = new Map<string, number>();

              return (
                <tr
                  key={rowKey}
                  style={metric.tableRowHeights?.[rowIndex]
                    ? { height: `${metric.tableRowHeights[rowIndex]}px` }
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
                          baseFont={metric.font}
                          baseFontSizePx={metric.fontSizePx}
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
  }

  return (
    <div
      data-testid={textFragmentTestId}
      className={cn(
        getReaderContentBlockClassName(block),
        'break-words whitespace-pre-wrap',
        resolveTextAlignClass(block.align),
      )}
      style={{
        font: metric.font,
        fontSize: `${metric.fontSizePx}px`,
        lineHeight: `${metric.lineHeightPx}px`,
        textIndent: typeof block.indent === 'number' ? `${block.indent}em` : undefined,
      }}
    >
      <RichInlineRenderer
        baseFont={metric.font}
        baseFontSizePx={metric.fontSizePx}
        inlines={richChildren.length > 0 ? richChildren : [{
          type: 'text',
          text: block.text ?? '',
        }]}
        keyPrefix={`${block.key}:text`}
      />
    </div>
  );
}

export default function RichBlockRenderer({
  chapterTitle,
  item,
  novelId,
  onImageActivate,
  onRegisterImageElement,
  positionStyle,
}: RichBlockRendererProps) {
  const { t } = useTranslation();

  if (item.block.kind === 'blank') {
    return null;
  }

  const metric = item;
  const { block, contentHeight } = metric;
  const insets = resolveRichScrollBlockInsets(block);
  const listMarker = formatRichScrollListMarker(block);
  const listPaddingStart = block.listContext
    ? Math.max(0, insets.listInset - insets.markerWidth - insets.markerGap) + insets.poemInset
    : insets.poemInset;

  let content = renderRichContent(metric, chapterTitle);

  if (block.kind === 'image') {
    content = (
      <figure className={cn(getReaderContentBlockClassName(block), 'flex h-full w-full flex-col', resolveImageJustifyClass(block.align))}>
        <div
          className={cn('relative flex w-full', resolveImageJustifyClass(block.align))}
          style={{
            height: contentHeight,
          }}
        >
          <div
            className="relative inline-flex max-w-full flex-col items-center"
            style={{
              width: metric.displayWidth ?? '100%',
            }}
          >
            <RichImage
              imageKey={block.imageKey ?? ''}
              novelId={novelId}
              style={{
                height: metric.displayHeight,
                maxWidth: '100%',
                width: metric.displayWidth ?? '100%',
              }}
            />
            {metric.captionHeight && metric.captionHeight > 0 ? (
              <figcaption
                data-testid="reader-flow-image-caption"
                className={cn(
                  READER_CONTENT_CLASS_NAMES.imageCaption,
                  'w-full text-sm',
                  resolveTextAlignClass(block.align),
                )}
                style={{
                  font: metric.captionFont,
                  fontSize: `${metric.captionFontSizePx}px`,
                  lineHeight: `${metric.captionLineHeightPx}px`,
                  minHeight: metric.captionHeight,
                }}
              >
                <RichInlineRenderer
                  baseFont={metric.captionFont}
                  baseFontSizePx={metric.captionFontSizePx}
                  inlines={block.imageCaption ?? []}
                  keyPrefix={`${block.key}:caption`}
                />
              </figcaption>
            ) : null}
            {onImageActivate ? (
              <button
                ref={(element) => onRegisterImageElement?.({
                  blockIndex: block.blockIndex,
                  chapterIndex: block.chapterIndex,
                  imageKey: block.imageKey ?? '',
                }, element)}
                data-reader-image-activate=""
                type="button"
                aria-label={t('reader.imageViewer.title')}
                className="absolute -inset-3 z-10 cursor-zoom-in rounded-2xl bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onImageActivate({
                    blockIndex: block.blockIndex,
                    chapterIndex: block.chapterIndex,
                    imageKey: block.imageKey ?? '',
                    sourceElement: event.currentTarget,
                  });
                }}
                onPointerDownCapture={(event) => {
                  event.stopPropagation();
                }}
              />
            ) : null}
          </div>
        </div>
      </figure>
    );
  }

  if (block.listContext) {
    content = (
      <div
        className={cn(getReaderContentContextClassName('list-item'), 'flex h-full min-w-0 items-start')}
        style={{ paddingLeft: `${listPaddingStart}px` }}
      >
        <div
          aria-hidden="true"
          className={cn(READER_CONTENT_CLASS_NAMES.listMarker, 'shrink-0 text-right')}
          style={{
            fontSize: `${metric.fontSizePx}px`,
            lineHeight: `${metric.lineHeightPx}px`,
            paddingRight: `${insets.markerGap}px`,
            width: `${insets.markerWidth}px`,
          }}
        >
          {block.showListMarker ? listMarker : null}
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

  if ((block.blockquoteDepth ?? 0) > 0) {
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
      id={block.anchorId}
      style={{
        ...positionStyle,
        height: metric.height,
        paddingBottom: metric.marginAfter,
        paddingRight: insets.end,
        paddingTop: metric.marginBefore,
      }}
    >
      {content}
    </div>
  );
}
