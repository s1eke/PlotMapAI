import type { ChapterContent } from '../../readerContentService';
import type {
  StaticScrollChapterTree,
  VisibleBlockRange,
} from '../../utils/readerLayout';
import type {
  ReaderImageActivationPayload,
  ReaderImageGalleryEntry,
} from '../../utils/readerImageGallery';

import { cn } from '@shared/utils/cn';

import ReaderFlowBlock from './ReaderFlowBlock';

interface ScrollReaderChapter {
  chapter: ChapterContent;
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
  textClassName,
  visibleBlockRangeByChapter,
}: ScrollReaderContentProps) {
  return (
    <div className={cn('relative mx-auto w-full max-w-[1200px] px-4 sm:px-8 md:px-12', textClassName)}>
      <div className="pt-6">
        {chapters.map(({ chapter, index, layout }) => {
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
              className="mb-12"
            >
              <div
                className={cn(
                  'sticky top-0 z-10 -mx-4 border-b border-border-color/20 px-4 py-3 backdrop-blur-sm sm:-mx-8 sm:px-8 md:-mx-12 md:px-12',
                  headerBgClassName,
                )}
              >
                <h1 className={cn('break-words whitespace-normal text-sm font-medium leading-snug transition-colors', readerTheme === 'auto' ? 'text-text-secondary' : 'opacity-60')}>
                  {chapter.title}
                </h1>
              </div>

              <div
                data-testid="scroll-reader-content-body"
                ref={(element) => onChapterBodyElement?.(index, element)}
                className="mx-auto w-full max-w-[920px] selection:bg-accent/30"
                style={{ height: layout.totalHeight, position: 'relative' }}
              >
                {visibleMetrics.map((metric) => (
                  <ReaderFlowBlock
                    chapterTitle={chapter.title}
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
