import type { ReactElement, ReactNode } from 'react';

import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { appPaths } from '@shared/routing/appPaths';
import { BookCard } from '@domains/library';
import { translateAppError } from '@shared/errors';
import { cn } from '@shared/utils/cn';

import type { BookshelfPageViewModel } from './types';

interface BookshelfScreenProps {
  uploadModal: ReactNode;
  viewModel: BookshelfPageViewModel;
}

export default function BookshelfScreen({
  uploadModal,
  viewModel,
}: BookshelfScreenProps): ReactElement {
  const { t } = useTranslation();

  return (
    <div data-testid="bookshelf-scroll-container" className="w-full">
      <div className="mx-auto flex w-full max-w-7xl flex-col px-3 pb-6 pt-3 sm:px-6 sm:pb-8 sm:pt-6 lg:px-8">
        <div
          data-testid="bookshelf-page-header"
          className={cn(
            '-mx-3 mb-4 border-b border-border-color/80 bg-bg-primary px-3 py-3 shadow-[0_12px_24px_rgba(15,23,42,0.05)]',
            'sm:mx-0 sm:mb-8 sm:border-b-0 sm:px-0 sm:py-0 sm:shadow-none',
          )}
        >
          <div className="flex items-start justify-between gap-3 sm:items-end sm:gap-4">
            <div className="min-w-0">
              <h1 className="text-[1.75rem] font-bold tracking-tight text-text-primary sm:text-3xl">
                {t('bookshelf.title')}
              </h1>
            </div>
            <button
              type="button"
              onClick={viewModel.openUploadModal}
              className="shrink-0 rounded-full bg-accent px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-accent-hover active:scale-[0.98] sm:rounded-lg sm:px-4 sm:text-base"
            >
              {t('common.actions.upload')}
            </button>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary sm:mt-1 sm:text-base">
            {t('bookshelf.subtitle')}
          </p>
        </div>

        {(() => {
          if (viewModel.isLoading) {
            return (
              <div className="flex min-h-[42vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-accent" />
              </div>
            );
          }

          if (viewModel.error) {
            return (
              <div className="flex min-h-[42vh] items-center justify-center py-4 sm:py-6">
                <div className="w-full max-w-md rounded-3xl border border-red-500/15 bg-red-500/6 px-5 py-7 text-center shadow-sm sm:px-8 sm:py-8">
                  <p className="mb-4 text-sm leading-6 text-red-500 sm:text-base">
                    {translateAppError(viewModel.error, t, 'bookshelf.loadError')}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      viewModel.refreshNovels().catch(() => undefined);
                    }}
                    className="rounded-full bg-bg-secondary px-4 py-2 text-sm font-medium text-accent shadow-sm transition-colors hover:text-accent-hover"
                  >
                    {t('bookshelf.tryAgain')}
                  </button>
                </div>
              </div>
            );
          }

          if (viewModel.novels.length === 0) {
            return (
              <div className="flex min-h-[42vh] items-center justify-center py-4 sm:py-6">
                <div className="w-full max-w-md rounded-[2rem] border border-border-color/70 bg-bg-secondary px-5 py-8 text-center shadow-[0_16px_36px_rgba(15,23,42,0.06)] sm:px-8 sm:py-10">
                  <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-brand-800 text-2xl shadow-inner">
                    <span>📚</span>
                  </div>
                  <h2 className="mb-2 text-xl font-semibold text-text-primary">{t('bookshelf.noBooks')}</h2>
                  <p className="mx-auto mb-6 max-w-sm text-sm leading-6 text-text-secondary sm:text-base">
                    {t('bookshelf.noBooksHint')}
                  </p>
                  <button
                    type="button"
                    onClick={viewModel.openUploadModal}
                    className="rounded-full bg-brand-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600 sm:rounded-lg sm:px-6 sm:py-3"
                  >
                    {t('common.actions.upload')}
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div
              data-testid="bookshelf-grid"
              className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-x-2.5 gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] sm:gap-x-4 sm:gap-y-6"
            >
              {viewModel.novels.map((novel) => (
                <BookCard key={novel.id} detailHref={appPaths.novel(novel.id)} novel={novel} />
              ))}
            </div>
          );
        })()}
      </div>

      {uploadModal}
    </div>
  );
}
