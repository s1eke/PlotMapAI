import { ChapterAnalysisPanel, type AnalysisJobStatus, type ChapterAnalysisResult } from '@domains/analysis';
import type { ChapterContent } from '../../api/readerApi';
import { cn } from '@shared/utils/cn';

interface SummaryReaderContentProps {
  chapter: ChapterContent;
  novelId: number;
  analysis: ChapterAnalysisResult | null;
  job: AnalysisJobStatus | null;
  isLoading: boolean;
  isAnalyzingChapter: boolean;
  onAnalyzeChapter: () => void;
  readerTheme: string;
  textClassName: string;
  headerBgClassName: string;
}

export default function SummaryReaderContent({
  chapter,
  novelId,
  analysis,
  job,
  isLoading,
  isAnalyzingChapter,
  onAnalyzeChapter,
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
        <ChapterAnalysisPanel
          novelId={novelId}
          analysis={analysis}
          job={job}
          isLoading={isLoading}
          onAnalyzeChapter={onAnalyzeChapter}
          isAnalyzingChapter={isAnalyzingChapter}
        />
      </div>
    </div>
  );
}
