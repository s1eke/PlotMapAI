import type { CSSProperties } from 'react';
import type {
  ReaderImagePageItem,
  ReaderTextPageItem,
  StaticReaderNode,
  StaticTextLine,
} from '../../utils/readerLayout';

import { useTranslation } from 'react-i18next';

import { useReaderImageResource } from '../../hooks/useReaderImageResource';
import type {
  ReaderImageActivationPayload,
  ReaderImageGalleryEntry,
} from '../../utils/readerImageGallery';

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
  blockIndex: number;
  chapterIndex: number;
  displayHeight: number;
  displayWidth: number | string;
  height: number;
  imageKey: string;
  marginAfter: number;
  marginBefore: number;
}

interface RenderTextItem {
  font: string;
  fontSizePx: number;
  height: number;
  kind: 'heading' | 'text';
  lineHeightPx: number;
  lines: StaticTextLine[];
  marginAfter: number;
  marginBefore: number;
  text: string;
}

function serializeTextLines(lines: StaticTextLine[]): string {
  if (lines.length === 0) {
    return '\u00a0';
  }

  return lines
    .map((line) => (line.text.length > 0 ? line.text : '\u00a0'))
    .join('\n');
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
      className="mx-auto block max-h-full max-w-full rounded-lg shadow-md object-contain object-center"
      decoding="async"
      draggable={false}
      loading={imageRenderMode === 'paged' ? 'eager' : 'lazy'}
      style={style}
    />
  );
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
        blockIndex: item.block.blockIndex,
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
        font: item.font,
        fontSizePx: item.fontSizePx,
        height: item.height,
        kind: item.block.kind,
        lineHeightPx: item.lineHeightPx,
        lines: item.lines,
        marginAfter: item.marginAfter,
        marginBefore: item.marginBefore,
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
        blockIndex: pageImageItem.blockIndex,
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
        font: pageTextItem.font,
        fontSizePx: pageTextItem.fontSizePx,
        height: pageTextItem.height,
        kind: pageTextItem.kind,
        lineHeightPx: pageTextItem.lineHeightPx,
        lines: pageTextItem.lines,
        marginAfter: pageTextItem.marginAfter,
        marginBefore: pageTextItem.marginBefore,
        text: pageTextItem.text,
      };
    }
  }

  if (imageItem) {
    return (
      <div
        className="flex items-center justify-center overflow-visible"
        style={{
          ...positionStyle,
          height: imageItem.height,
          paddingBottom: imageItem.marginAfter,
          paddingTop: imageItem.marginBefore,
        }}
      >
        <div
          className="relative inline-flex items-center justify-center"
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
              onPointerDownCapture={(event) => {
                event.stopPropagation();
              }}
            />
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
  const serializedText = serializeTextLines(textItem.lines);
  const renderedText = textItem.kind === 'heading'
    ? chapterTitle ?? textItem.text
    : serializedText;

  return (
    <div
      style={{
        ...positionStyle,
        height: textItem.height,
        paddingBottom: textItem.marginAfter,
        paddingTop: textItem.marginBefore,
      }}
    >
      {textItem.kind === 'heading' ? (
        <h2
          data-testid="reader-flow-text-fragment"
          className="text-center"
          style={{
            ...textStyle,
            overflow: 'hidden',
            overflowWrap: 'anywhere',
            whiteSpace: 'pre-wrap',
          }}
        >
          {renderedText}
        </h2>
      ) : (
        <div
          data-testid="reader-flow-text-fragment"
          className="opacity-90"
          style={{
            ...textStyle,
            overflow: 'hidden',
            whiteSpace: 'pre',
          }}
        >
          {renderedText}
        </div>
      )}
    </div>
  );
}
