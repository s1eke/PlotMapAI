import type { CSSProperties } from 'react';
import type {
  ReaderImageActivationPayload,
  ReaderImageGalleryEntry,
} from '@shared/contracts/reader';
import type { StaticReaderNode } from '../../utils/layout/readerLayout';

import { ReaderFlowBlockImage } from './ReaderFlowBlockImage';
import { ReaderFlowBlockText } from './ReaderFlowBlockText';
import type { RenderImageItem, RenderTextItem } from './readerFlowBlockShared';

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

function resolveRenderImageItem(item: StaticReaderNode): RenderImageItem | null {
  if ('block' in item) {
    if (item.block.kind !== 'image') {
      return null;
    }

    return {
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
  }

  if (item.kind !== 'image') {
    return null;
  }

  return {
    align: item.align,
    anchorId: item.anchorId,
    blockIndex: item.blockIndex,
    captionFont: item.captionFont,
    captionFontSizePx: item.captionFontSizePx,
    captionLineHeightPx: item.captionLineHeightPx,
    captionLines: item.captionLines,
    captionRichLineFragments: item.captionRichLineFragments,
    captionSpacing: item.captionSpacing,
    chapterIndex: item.chapterIndex,
    displayHeight: item.displayHeight,
    displayWidth: item.displayWidth,
    height: item.height,
    imageKey: item.imageKey,
    marginAfter: item.marginAfter,
    marginBefore: item.marginBefore,
  };
}

function resolveRenderTextItem(item: StaticReaderNode): RenderTextItem | null {
  if ('block' in item) {
    if (item.block.kind === 'blank' || item.block.kind === 'image') {
      return null;
    }

    return {
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
      richLineFragments: item.richLineFragments,
      showListMarker: item.block.showListMarker,
      tableRowHeights: item.tableRowHeights,
      tableRows: item.block.tableRows,
      text: item.block.text ?? '',
    };
  }

  if (item.kind === 'blank' || item.kind === 'image') {
    return null;
  }

  return {
    align: item.align,
    anchorId: item.anchorId,
    blockIndex: item.blockIndex,
    blockquoteDepth: item.blockquoteDepth,
    container: item.container,
    font: item.font,
    fontSizePx: item.fontSizePx,
    height: item.height,
    headingLevel: item.headingLevel,
    indent: item.indent,
    kind: item.kind,
    lineHeightPx: item.lineHeightPx,
    lineStartIndex: item.lineStartIndex,
    lines: item.lines,
    listContext: item.listContext,
    marginAfter: item.marginAfter,
    marginBefore: item.marginBefore,
    originalTag: item.originalTag,
    renderRole: item.renderRole,
    richLineFragments: item.richLineFragments,
    showListMarker: item.showListMarker,
    tableRowHeights: item.tableRowHeights,
    tableRows: item.tableRows,
    text: item.text,
  };
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
  if (('block' in item && item.block.kind === 'blank') || (!('block' in item) && item.kind === 'blank')) {
    return null;
  }

  const imageItem = resolveRenderImageItem(item);
  if (imageItem) {
    return (
      <ReaderFlowBlockImage
        imageItem={imageItem}
        imageRenderMode={imageRenderMode}
        novelId={novelId}
        onImageActivate={onImageActivate}
        onRegisterImageElement={onRegisterImageElement}
        positionStyle={positionStyle}
      />
    );
  }

  const textItem = resolveRenderTextItem(item);
  if (!textItem) {
    return null;
  }

  return (
    <ReaderFlowBlockText
      chapterTitle={chapterTitle}
      positionStyle={positionStyle}
      textItem={textItem}
    />
  );
}
