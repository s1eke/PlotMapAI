import type { ChapterContent } from '../../api/readerApi';
import { cn } from '@shared/utils/cn';
import ReaderChapterSection from './ReaderChapterSection';

interface PagedReaderContentProps {
  chapter: ChapterContent;
  novelId: number;
  pageIndex: number;
  pageCount: number;
  pagedViewportRef: React.RefObject<HTMLDivElement | null>;
  pagedContentRef: React.RefObject<HTMLDivElement | null>;
  fontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
  readerTheme: string;
  textClassName: string;
  headerBgClassName: string;
  fitsTwoColumns: boolean;
  twoColumnWidth: number | undefined;
  twoColumnGap: number;
}

export default function PagedReaderContent({
  chapter,
  novelId,
  pageIndex,
  pageCount,
  pagedViewportRef,
  pagedContentRef,
  fontSize,
  lineSpacing,
  paragraphSpacing,
  readerTheme,
  textClassName,
  headerBgClassName,
  fitsTwoColumns,
  twoColumnWidth,
  twoColumnGap,
}: PagedReaderContentProps) {
  return (
    <div className={cn('h-full max-w-[1400px] mx-auto w-full px-4 sm:px-8 md:px-12 flex flex-col', textClassName)}>
      <div className={cn('flex items-center justify-between gap-4 py-3 mb-4 shrink-0 border-b border-border-color/20', headerBgClassName)}>
        <h1 className={cn('text-sm font-medium truncate transition-colors', readerTheme === 'auto' ? 'text-text-secondary' : 'opacity-60')}>
          {chapter.title}
        </h1>
        {pageCount > 1 && <div className="text-xs font-medium text-text-secondary whitespace-nowrap">{pageIndex + 1} / {pageCount}</div>}
      </div>
      <div ref={pagedViewportRef} className="flex-1 min-h-0 overflow-hidden">
        <div
          ref={pagedContentRef}
          className="h-full font-serif text-justify md:text-left selection:bg-accent/30 tracking-wide opacity-90"
          style={{
            fontSize: `${fontSize}px`,
            lineHeight: String(lineSpacing),
            columnGap: fitsTwoColumns ? `${twoColumnGap}px` : '0px',
            columnWidth: twoColumnWidth ? `${twoColumnWidth}px` : undefined,
            columnFill: 'auto',
            columnRule: fitsTwoColumns ? '1px solid var(--border-color)' : undefined,
          }}
        >
          <ReaderChapterSection
            title={chapter.title}
            content={chapter.content}
            novelId={novelId}
            paragraphSpacing={paragraphSpacing}
            headingClassName="text-xl sm:text-2xl font-bold text-center mb-8 mt-2 break-inside-avoid"
            headingStyle={{ lineHeight: '1.4' }}
            paragraphClassName="indent-8 break-inside-avoid"
            blankParagraphClassName="break-inside-avoid"
          />
        </div>
      </div>
    </div>
  );
}
