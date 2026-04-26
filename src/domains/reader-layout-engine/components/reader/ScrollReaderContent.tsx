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
  CHAPTER_TITLE_PARAGRAPH_INDEX,
  ReaderFlowBlock,
} from '../../layout-core/internal';
import ReaderPageHeader from './ReaderPageHeader';

interface ScrollReaderChapter {
  chapter: ChapterContent;
  flowEntry?: NovelFlowChapterEntry | null;
  index: number;
  layout: StaticScrollChapterTree;
}

interface ScrollReaderContentProps {
  chapters: ScrollReaderChapter[];
  headerBgClassName: string;
  headerTitle?: string;
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

const SCROLL_READER_HEADER_HEIGHT_PX = 56;

function resolveVisibleMetrics(
  layout: StaticScrollChapterTree,
  visibleRange: VisibleBlockRange | undefined,
): StaticScrollChapterTree['metrics'] {
  if (!visibleRange) {
    return layout.metrics;
  }

  if (visibleRange.endIndex < visibleRange.startIndex) {
    return layout.metrics;
  }

  return layout.metrics.slice(visibleRange.startIndex, visibleRange.endIndex + 1);
}

function isChapterTitleMetric(
  metric: StaticScrollChapterTree['metrics'][number],
): boolean {
  return metric.block.kind === 'heading'
    && metric.block.paragraphIndex === CHAPTER_TITLE_PARAGRAPH_INDEX;
}

export default function ScrollReaderContent({
  chapters,
  headerBgClassName,
  headerTitle,
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
  ) + SCROLL_READER_HEADER_HEIGHT_PX;
  const resolvedHeaderTitle = headerTitle ?? chapters[0]?.chapter.title ?? '';

  return (
    <div
      className={cn(rootClassName, 'relative w-full')}
      style={rootStyle}
    >
      <div className="pointer-events-none sticky top-0 z-10 h-0">
        <ReaderPageHeader
          headerBgClassName={headerBgClassName}
          readerTheme={readerTheme}
          textClassName={textClassName}
          title={resolvedHeaderTitle}
        />
      </div>

      <div className="relative" style={{ height: contentHeight }}>
        {chapters.map(({ chapter, flowEntry, index, layout }) => {
          const visibleRange = visibleBlockRangeByChapter?.get(index);
          const visibleMetrics = resolveVisibleMetrics(layout, visibleRange);

          return (
            <div
              key={index}
              ref={(element) => onChapterElement(index, element)}
              className={cn(READER_CONTENT_CLASS_NAMES.chapter, 'absolute left-0 right-0')}
              style={{
                top: (flowEntry?.scrollStart ?? 0) + SCROLL_READER_HEADER_HEIGHT_PX,
              }}
            >
              <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-8 md:px-12">
                <div
                  data-testid="scroll-reader-content-body"
                  ref={(element) => onChapterBodyElement?.(index, element)}
                  className={cn(
                    READER_CONTENT_CLASS_NAMES.content,
                    'mx-auto w-full max-w-[920px]',
                  )}
                  style={{ height: layout.totalHeight, position: 'relative' }}
                >
                  {visibleMetrics.map((metric) => {
                    const isChapterTitle = isChapterTitleMetric(metric);

                    return (
                      <ReaderFlowBlock
                        headingTextOverride={isChapterTitle ? chapter.title : undefined}
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
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
