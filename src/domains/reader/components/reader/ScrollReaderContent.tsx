import type { ChapterContent } from '../../api/readerApi';
import { cn } from '@shared/utils/cn';
import ReaderChapterSection from './ReaderChapterSection';

interface ScrollReaderChapter {
  index: number;
  chapter: ChapterContent;
}

interface ScrollReaderContentProps {
  chapters: ScrollReaderChapter[];
  novelId: number;
  fontSize: number;
  lineSpacing: number;
  paragraphSpacing: number;
  readerTheme: string;
  textClassName: string;
  headerBgClassName: string;
  onChapterElement: (chapterIndex: number, element: HTMLDivElement | null) => void;
}

export default function ScrollReaderContent({
  chapters,
  novelId,
  fontSize,
  lineSpacing,
  paragraphSpacing,
  readerTheme,
  textClassName,
  headerBgClassName,
  onChapterElement,
}: ScrollReaderContentProps) {
  return (
    <div className={cn('px-4 sm:px-8 md:px-12 max-w-[1200px] mx-auto w-full relative', textClassName)}>
      <div className="pt-6">
        {chapters.map(({ index, chapter }) => (
          <div
            key={index}
            ref={(element) => onChapterElement(index, element)}
            className="mb-12"
          >
            <div className={cn('sticky top-0 z-10 -mx-4 sm:-mx-8 md:-mx-12 px-4 sm:px-8 md:px-12 py-3 border-b border-border-color/20 backdrop-blur-sm', headerBgClassName)}>
              <h1 className={cn('text-sm font-medium truncate transition-colors', readerTheme === 'auto' ? 'text-text-secondary' : 'opacity-60')}>{chapter.title}</h1>
            </div>
            <div
              className="leading-relaxed font-serif mx-auto w-full transition-all text-justify md:text-left selection:bg-accent/30 tracking-wide opacity-90"
              style={{ fontSize: `${fontSize}px`, maxWidth: '800px', lineHeight: String(lineSpacing) }}
            >
              <ReaderChapterSection
                title={chapter.title}
                content={chapter.content}
                novelId={novelId}
                paragraphSpacing={paragraphSpacing}
                headingClassName="text-xl sm:text-2xl font-bold text-center mb-8 mt-2"
                headingStyle={{ lineHeight: '1.4' }}
                paragraphClassName="indent-8"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
