import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { loadUploadModal } from '@domains/book-import';
import { reportAppError } from '@app/debug/service';
import {
  AppErrorCode,
  toAppError,
  translateAppError,
  type AppError,
} from '@shared/errors';
import { cn } from '@shared/utils/cn';

import { libraryApi } from '../api/libraryApi';
import type { NovelView } from '../api/libraryApi';
import BookCard from '../components/BookCard';

const LazyUploadModal = lazy(loadUploadModal);

export default function BookshelfPage() {
  const { t } = useTranslation();
  const [novels, setNovels] = useState<NovelView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const fetchNovels = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await libraryApi.list();
      setNovels(data);
    } catch (err) {
      const normalized = toAppError(err, {
        code: AppErrorCode.STORAGE_OPERATION_FAILED,
        kind: 'storage',
        source: 'library',
        userMessageKey: 'bookshelf.loadError',
      });
      reportAppError(normalized);
      setError(normalized);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNovels();
  }, [fetchNovels]);

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
              onClick={() => setIsUploadModalOpen(true)}
              className="shrink-0 rounded-full bg-accent px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-accent-hover active:scale-[0.98] sm:rounded-lg sm:px-4 sm:text-base"
            >
              {t('common.actions.upload')}
            </button>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary sm:mt-1 sm:text-base">
            {t('bookshelf.subtitle')}
          </p>
        </div>

        {isLoading ? (
          <div className="flex min-h-[42vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : error ? (
          <div className="flex min-h-[42vh] items-center justify-center py-4 sm:py-6">
            <div className="w-full max-w-md rounded-3xl border border-red-500/15 bg-red-500/6 px-5 py-7 text-center shadow-sm sm:px-8 sm:py-8">
              <p className="mb-4 text-sm leading-6 text-red-500 sm:text-base">
                {translateAppError(error, t, 'bookshelf.loadError')}
              </p>
              <button
                onClick={fetchNovels}
                className="rounded-full bg-bg-secondary px-4 py-2 text-sm font-medium text-accent shadow-sm transition-colors hover:text-accent-hover"
              >
                {t('bookshelf.tryAgain')}
              </button>
            </div>
          </div>
        ) : novels.length === 0 ? (
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
                onClick={() => setIsUploadModalOpen(true)}
                className="rounded-full bg-brand-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-600 sm:rounded-lg sm:px-6 sm:py-3"
              >
                {t('common.actions.upload')}
              </button>
            </div>
          </div>
        ) : (
          <div
            data-testid="bookshelf-grid"
            className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-x-2.5 gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] sm:gap-x-4 sm:gap-y-6"
          >
            {novels.map((novel) => (
              <BookCard key={novel.id} novel={novel} />
            ))}
          </div>
        )}
      </div>

      {isUploadModalOpen && (
        <Suspense fallback={null}>
          <LazyUploadModal
            isOpen={isUploadModalOpen}
            onClose={() => setIsUploadModalOpen(false)}
            onSuccess={fetchNovels}
          />
        </Suspense>
      )}
    </div>
  );
}
