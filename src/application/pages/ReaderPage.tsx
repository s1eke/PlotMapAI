import { useParams } from 'react-router-dom';

import { analyzeChapter } from '@application/use-cases/analysis';
import { ChapterAnalysisPanel, analysisService } from '@domains/analysis';
import ReaderPageContainer from '@domains/reader/pages/reader-page/ReaderPageContainer';
import { ReaderProvider } from '@domains/reader/pages/reader-page/ReaderContext';
import type { ReaderAnalysisBridgeController } from '@domains/reader/reader-analysis-bridge';

const readerAnalysisController: ReaderAnalysisBridgeController = {
  analyzeChapter,
  getChapterAnalysis: analysisService.getChapterAnalysis,
  getStatus: analysisService.getStatus,
  renderSummaryPanel: ({
    analysis,
    isAnalyzingChapter,
    isLoading,
    job,
    novelId,
    onAnalyzeChapter,
  }) => (
    <ChapterAnalysisPanel
      novelId={novelId}
      analysis={analysis}
      job={job}
      isLoading={isLoading}
      onAnalyzeChapter={onAnalyzeChapter}
      isAnalyzingChapter={isAnalyzingChapter}
    />
  ),
};

export default function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  const novelId = Number(id);

  return (
    <ReaderProvider novelId={novelId}>
      <ReaderPageContainer novelId={novelId} analysisController={readerAnalysisController} />
    </ReaderProvider>
  );
}
