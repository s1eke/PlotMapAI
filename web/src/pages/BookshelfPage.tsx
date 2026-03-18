import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { novelsApi } from '../api/novels';
import type { Novel } from '../api/novels';
import BookCard from '../components/BookCard';
import UploadModal from '../components/UploadModal';

export default function BookshelfPage() {
  const { t } = useTranslation();
  const [novels, setNovels] = useState<Novel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const fetchNovels = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await novelsApi.list();
      setNovels(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('bookshelf.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchNovels();
  }, [fetchNovels]);

  return (
    <div className="flex-1 flex flex-col p-6 max-w-7xl mx-auto w-full">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">{t('bookshelf.title')}</h1>
          <p className="text-text-secondary mt-1">{t('bookshelf.subtitle')}</p>
        </div>
        <button
          onClick={() => setIsUploadModalOpen(true)}
          className="bg-accent hover:bg-accent-hover text-white font-medium px-4 py-2 rounded-lg transition-colors shadow-sm"
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
          <p className="text-red-400 mb-4">{error}</p>
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

      <UploadModal 
        isOpen={isUploadModalOpen} 
        onClose={() => setIsUploadModalOpen(false)} 
        onSuccess={fetchNovels}
      />
    </div>
  );
}
