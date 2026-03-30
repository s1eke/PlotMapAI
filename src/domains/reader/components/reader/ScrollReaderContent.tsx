import type { ChapterContent } from '../../api/readerApi';
import type { StaticScrollChapterTree } from '../../utils/readerLayout';

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
  onChapterBodyElement?: (chapterIndex: number, element: HTMLDivElement | null) => void;
  onChapterElement: (chapterIndex: number, element: HTMLDivElement | null) => void;
  readerTheme: string;
  textClassName: string;
}

export default function ScrollReaderContent({
  chapters,
  headerBgClassName,
  novelId,
  onChapterBodyElement,
  onChapterElement,
  readerTheme,
  textClassName,
}: ScrollReaderContentProps) {
  return (
    <div className={cn('relative mx-auto w-full max-w-[1200px] px-4 sm:px-8 md:px-12', textClassName)}>
      <div className="pt-6">
        {chapters.map(({ chapter, index, layout }) => (
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
              <h1 className={cn('truncate text-sm font-medium transition-colors', readerTheme === 'auto' ? 'text-text-secondary' : 'opacity-60')}>
                {chapter.title}
              </h1>
            </div>

            <div
              data-testid="scroll-reader-content-body"
              ref={(element) => onChapterBodyElement?.(index, element)}
              className="mx-auto w-full max-w-[920px] selection:bg-accent/30"
              style={{ height: layout.totalHeight, position: 'relative' }}
            >
              {layout.metrics.map((metric) => (
                <ReaderFlowBlock
                  key={metric.block.key}
                  imageRenderMode="scroll"
                  item={metric}
                  novelId={novelId}
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
        ))}
      </div>
    </div>
  );
}
