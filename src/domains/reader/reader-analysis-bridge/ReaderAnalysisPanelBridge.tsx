import type { AnalysisJobStatus, ChapterAnalysisResult } from '@domains/analysis';

import { ChapterAnalysisPanel } from '@domains/analysis';

interface ReaderAnalysisPanelBridgeProps {
  novelId: number;
  analysis: ChapterAnalysisResult | null;
  job: AnalysisJobStatus | null;
  isLoading: boolean;
  isAnalyzingChapter: boolean;
  onAnalyzeChapter: () => void;
}

export default function ReaderAnalysisPanelBridge({
  novelId,
  analysis,
  job,
  isLoading,
  isAnalyzingChapter,
  onAnalyzeChapter,
}: ReaderAnalysisPanelBridgeProps) {
  return (
    <ChapterAnalysisPanel
      novelId={novelId}
      analysis={analysis}
      job={job}
      isLoading={isLoading}
      onAnalyzeChapter={onAnalyzeChapter}
      isAnalyzingChapter={isAnalyzingChapter}
    />
  );
}
