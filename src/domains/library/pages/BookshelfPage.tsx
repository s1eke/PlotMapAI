import { lazy, Suspense, useState, useEffect, useCallback } from 'react';
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
    <div className="flex-1 flex flex-col p-6 max-w-7xl mx-auto w-full">
      <div
        data-testid="bookshelf-page-header"
        className={cn(
          'mb-6 flex items-start justify-between gap-4',
          'sticky top-16 z-40 -mx-6 border-b border-border-color/60 bg-bg-primary/95 px-6 py-4 shadow-sm backdrop-blur-sm',
          'sm:static sm:mx-0 sm:mb-8 sm:items-end sm:border-b-0 sm:bg-transparent sm:px-0 sm:py-0 sm:shadow-none sm:backdrop-blur-none'
        )}
      >
        <div>
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">{t('bookshelf.title')}</h1>
          <p className="text-text-secondary mt-1">{t('bookshelf.subtitle')}</p>
        </div>
        <button
          onClick={() => setIsUploadModalOpen(true)}
          className="shrink-0 bg-accent hover:bg-accent-hover text-white font-medium px-4 py-2 rounded-lg transition-colors shadow-sm"
        >
          {t('common.actions.upload')}
        </button>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-brand-800/20 rounded-2xl border border-white/5">
          <p className="text-red-400 mb-4">
            {translateAppError(error, t, 'bookshelf.loadError')}
          </p>
          <button 
            onClick={fetchNovels}
            className="text-accent hover:text-accent-hover underline underline-offset-4"
          >
            {t('bookshelf.tryAgain')}
          </button>
        </div>
      ) : novels.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-12 glass rounded-2xl">
          <div className="w-20 h-20 bg-brand-800 rounded-full flex items-center justify-center mb-6 shadow-inner">
            <span className="text-3xl">📚</span>
          </div>
          <h2 className="text-xl font-semibold text-text-primary mb-2">{t('bookshelf.noBooks')}</h2>
          <p className="text-text-secondary max-w-md mb-6">
            {t('bookshelf.noBooksHint')}
          </p>
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="bg-brand-700 hover:bg-brand-600 text-white font-medium px-6 py-3 rounded-lg transition-colors border border-white/10"
          >
            {t('common.actions.upload')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {novels.map(novel => (
            <BookCard key={novel.id} novel={novel} />
          ))}
        </div>
      )}

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
