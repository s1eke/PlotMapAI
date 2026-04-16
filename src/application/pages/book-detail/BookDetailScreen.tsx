import type { ReactElement } from 'react';

import { ArrowLeft, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { translateAppError } from '@shared/errors';

import type { BookDetailPageViewModel } from './types';
import BookDetailActionPanel from './BookDetailActionPanel';
import BookDetailDeleteDialog from './BookDetailDeleteDialog';
import BookDetailHero from './BookDetailHero';
import BookDetailInsightsPanel from './BookDetailInsightsPanel';
import BookDetailStats from './BookDetailStats';

interface BookDetailScreenProps {
  viewModel: BookDetailPageViewModel;
}

export default function BookDetailScreen({
  viewModel,
}: BookDetailScreenProps): ReactElement {
  const { t } = useTranslation();

  if (viewModel.isLoading) {
    return (
      <div className="flex min-h-[calc(100dvh-var(--app-header-height,0px)-2rem)] items-center justify-center px-6 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (viewModel.error || !viewModel.novel) {
    return (
      <div className="flex min-h-[calc(100dvh-var(--app-header-height,0px)-2rem)] flex-col items-center justify-center p-8 text-center">
        <p className="mb-4 text-red-400">
          {viewModel.error
            ? translateAppError(viewModel.error, t, 'bookDetail.loadError')
            : t('bookDetail.notFound')}
        </p>
        <Link
          to={viewModel.pageHrefs.bookshelf}
          className="flex items-center gap-2 text-accent underline hover:text-accent-hover"
        >
          <ArrowLeft className="h-4 w-4" /> {t('common.actions.backToBookshelf')}
        </Link>
      </div>
    );
  }

  const { analysisController, deleteFlow } = viewModel;

  const analysisError = analysisController.actionError ?? viewModel.analysisStatusError;
  const analysisErrorFallbackKey = analysisController.actionError
    ? 'bookDetail.analysisActionFailed'
    : 'bookDetail.analysisLoadError';

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col p-6">
      <div className="glass rounded-2xl p-6 md:p-8">
        <Link
          to={viewModel.pageHrefs.bookshelf}
          className="mb-6 inline-flex w-fit items-center gap-2 text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t('common.actions.back')}</span>
        </Link>

        <div className="flex flex-col gap-8 md:flex-row">
          <BookDetailActionPanel
            characterGraphHref={viewModel.pageHrefs.characterGraph}
            coverUrl={viewModel.coverUrl}
            hasCover={viewModel.novel.hasCover}
            novelTitle={viewModel.novel.title}
            onDeleteRequested={deleteFlow.openDeleteModal}
            primaryAction={analysisController.primaryAction}
            readerHref={viewModel.pageHrefs.reader}
            restartAction={analysisController.restartAction}
          />

          <div className="flex min-w-0 flex-1 flex-col">
            <BookDetailHero
              author={viewModel.novel.author}
              title={viewModel.novel.title}
            />
            <BookDetailStats
              chapterCount={viewModel.novel.chapterCount}
              fileType={viewModel.novel.fileType}
              totalWords={viewModel.novel.totalWords}
            />

            <div className="flex flex-1 flex-col gap-6">
              <BookDetailInsightsPanel
                analysisError={analysisError}
                analysisErrorFallbackKey={analysisErrorFallbackKey}
                analysisMessage={analysisController.actionMessage}
                characterChartData={viewModel.characterChartData}
                introParagraphs={viewModel.introParagraphs}
                introText={viewModel.introText}
                isAnalysisLoading={viewModel.isAnalysisLoading}
                isJobRunning={viewModel.isJobRunning}
                job={viewModel.job}
                jobStatusLabel={viewModel.jobStatusLabel}
                overview={viewModel.overview}
              />
            </div>
          </div>
        </div>
      </div>

      <BookDetailDeleteDialog
        deleteError={deleteFlow.deleteError}
        isDeleting={deleteFlow.isDeleting}
        isOpen={deleteFlow.isDeleteModalOpen}
        novelTitle={deleteFlow.novelTitle}
        onClose={deleteFlow.closeDeleteModal}
        onConfirm={deleteFlow.confirmDelete}
      />
    </div>
  );
}
