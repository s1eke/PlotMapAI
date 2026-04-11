import type { ReactNode } from 'react';
import type { ChapterContent } from '@shared/contracts/reader';

import { cn } from '@shared/utils/cn';

interface SummaryReaderContentProps {
  chapter: ChapterContent;
  analysisPanel: ReactNode;
  readerTheme: string;
  textClassName: string;
  headerBgClassName: string;
}

export default function SummaryReaderContent({
  chapter,
  analysisPanel,
  readerTheme,
  textClassName,
  headerBgClassName,
}: SummaryReaderContentProps) {
  return (
    <div className={cn('px-4 sm:px-8 md:px-12 max-w-[1200px] mx-auto w-full relative', textClassName)}>
      <div className={cn('sticky top-0 z-10 -mx-4 sm:-mx-8 md:-mx-12 px-4 sm:px-8 md:px-12 py-3 border-b border-border-color/20 backdrop-blur-sm', headerBgClassName)}>
        <h1 className={cn('text-sm font-medium truncate transition-colors', readerTheme === 'auto' ? 'text-text-secondary' : 'opacity-60')}>{chapter.title}</h1>
      </div>
      <div className="pt-6">
        {analysisPanel}
      </div>
    </div>
  );
}
