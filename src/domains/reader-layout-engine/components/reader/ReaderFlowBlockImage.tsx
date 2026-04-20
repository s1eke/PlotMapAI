import type { CSSProperties } from 'react';
import type {
  ReaderImageActivationPayload,
  ReaderImageGalleryEntry,
} from '@shared/contracts/reader';

import { useTranslation } from 'react-i18next';

import { READER_CONTENT_CLASS_NAMES } from '@shared/reader-rendering';
import { cn } from '@shared/utils/cn';

import { useReaderImageResource } from '@domains/reader-media';
import { getReaderContentBlockClassName } from '../../utils/layout/readerContentStyling';
import type { RenderImageItem } from './readerFlowBlockShared';
import {
  renderRichLineFragments,
  resolveImageJustifyClass,
  resolveTextAlignClass,
  serializeTextLines,
} from './readerFlowBlockShared';

interface ReaderFlowBlockImageProps {
  imageItem: RenderImageItem;
  imageRenderMode: 'paged' | 'scroll';
  novelId: number;
  onImageActivate?: (payload: ReaderImageActivationPayload) => void;
  onRegisterImageElement?: (
    entry: Pick<ReaderImageGalleryEntry, 'blockIndex' | 'chapterIndex' | 'imageKey'>,
    element: HTMLButtonElement | null,
  ) => void;
  positionStyle?: CSSProperties;
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

export function ReaderFlowBlockImage({
  imageItem,
  imageRenderMode,
  novelId,
  onImageActivate,
  onRegisterImageElement,
  positionStyle,
}: ReaderFlowBlockImageProps) {
  const { t } = useTranslation();
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
