import type { CSSProperties } from 'react';
import type { ChapterContent } from '@shared/contracts/reader';
import type {
  NovelFlowChapterEntry,
  StaticScrollChapterTree,
  VisibleBlockRange,
} from '../../layout-core/internal';
import type {
  ReaderImageActivationPayload,
  ReaderImageGalleryEntry,
} from '../../layout-core/internal';

import { READER_CONTENT_CLASS_NAMES } from '@shared/reader-rendering';
import { cn } from '@shared/utils/cn';

import {
  ReaderFlowBlock,
} from '../../layout-core/internal';

interface ScrollReaderChapter {
  chapter: ChapterContent;
  flowEntry?: NovelFlowChapterEntry | null;
  index: number;
  layout: StaticScrollChapterTree;
}

interface ScrollReaderContentProps {
  chapters: ScrollReaderChapter[];
  headerBgClassName: string;
  novelId: number;
  onImageActivate?: (payload: ReaderImageActivationPayload) => void;
  onRegisterImageElement?: (
    entry: Pick<ReaderImageGalleryEntry, 'blockIndex' | 'chapterIndex' | 'imageKey'>,
    element: HTMLButtonElement | null,
  ) => void;
  onChapterBodyElement?: (chapterIndex: number, element: HTMLDivElement | null) => void;
  onChapterElement: (chapterIndex: number, element: HTMLDivElement | null) => void;
  readerTheme: string;
  rootClassName: string;
  rootStyle: CSSProperties;
  scrollFlowTotalHeight?: number;
  textClassName: string;
  visibleBlockRangeByChapter?: ReadonlyMap<number, VisibleBlockRange>;
}

export default function ScrollReaderContent({
  chapters,
  headerBgClassName,
  novelId,
  onImageActivate,
  onRegisterImageElement,
  onChapterBodyElement,
  onChapterElement,
  readerTheme,
  rootClassName,
  rootStyle,
  scrollFlowTotalHeight,
  textClassName,
  visibleBlockRangeByChapter,
}: ScrollReaderContentProps) {
  const contentHeight = Math.max(
    scrollFlowTotalHeight ?? 0,
    ...chapters.map(({ flowEntry, layout }) => (
      (flowEntry?.scrollStart ?? 0) + layout.totalHeight
    )),
    0,
  );

  return (
    <div
      className={cn(rootClassName, 'relative mx-auto w-full max-w-[1200px] px-4 sm:px-8 md:px-12')}
      style={rootStyle}
    >
      <div className="relative pt-6" style={{ height: contentHeight }}>
        {chapters.map(({ chapter, flowEntry, index, layout }) => {
          const visibleRange = visibleBlockRangeByChapter?.get(index);
          let visibleMetrics = layout.metrics;
          if (visibleRange) {
            visibleMetrics = visibleRange.endIndex >= visibleRange.startIndex
              ? layout.metrics.slice(visibleRange.startIndex, visibleRange.endIndex + 1)
              : [];
          }

          return (
            <div
              key={index}
              ref={(element) => onChapterElement(index, element)}
              className={cn(READER_CONTENT_CLASS_NAMES.chapter, 'absolute left-0 right-0')}
              style={{
                top: flowEntry?.scrollStart ?? 0,
              }}
            >
              <div
                className={cn(
                  READER_CONTENT_CLASS_NAMES.chapterHeader,
                  'pointer-events-none absolute left-0 right-0 top-0 z-10 -mx-4 border-b border-border-color/20 px-4 py-3 backdrop-blur-sm sm:-mx-8 sm:px-8 md:-mx-12 md:px-12',
                  headerBgClassName,
                )}
              >
                <h1 className={cn(
                  'break-words whitespace-normal text-sm font-medium leading-snug transition-colors',
                  textClassName,
                  readerTheme === 'auto' ? 'text-text-secondary' : 'opacity-60',
                )}
                >
                  {chapter.title}
                </h1>
              </div>

              <div
                data-testid="scroll-reader-content-body"
                ref={(element) => onChapterBodyElement?.(index, element)}
                className={cn(
                  READER_CONTENT_CLASS_NAMES.content,
                  'mx-auto w-full max-w-[920px]',
                )}
                style={{ height: layout.totalHeight, position: 'relative' }}
              >
                {visibleMetrics.map((metric) => (
                  <ReaderFlowBlock
                    key={metric.block.key}
                    imageRenderMode="scroll"
                    item={metric}
                    novelId={novelId}
                    onImageActivate={onImageActivate}
                    onRegisterImageElement={onRegisterImageElement}
                    positionStyle={{
                      left: 0,
                      position: 'absolute',
                      right: 0,
                      top: metric.top,
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
