import type { CSSProperties } from 'react';

import { READER_CONTENT_CLASS_NAMES } from '@shared/reader-rendering';
import { cn } from '@shared/utils/cn';

import {
  getReaderContentBlockClassName,
  getReaderContentContextClassName,
} from '../../utils/layout/readerContentStyling';
import {
  formatRichScrollListMarker,
  resolveRichScrollBlockInsets,
} from '../../utils/layout/richScroll';
import RichInlineRenderer from './RichInlineRenderer';
import type { RenderTextItem } from './readerFlowBlockShared';
import {
  getHeadingTagName,
  renderRichLineFragments,
  resolveTextAlignClass,
  serializeInlineKey,
  serializeTextLines,
} from './readerFlowBlockShared';

interface ReaderFlowBlockTextProps {
  chapterTitle?: string;
  positionStyle?: CSSProperties;
  textItem: RenderTextItem;
}

export function ReaderFlowBlockText({
  chapterTitle,
  positionStyle,
  textItem,
}: ReaderFlowBlockTextProps) {
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
          style={textStyle}
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
