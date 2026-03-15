import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, ArrowLeft, Trash2, BookOpen, Wand2, Hash, FileText } from 'lucide-react';
import { novelsApi } from '../api/novels';
import type { Novel } from '../api/novels';
import TxtCover from '../components/TxtCover';
import Modal from '../components/Modal';

export default function BookDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [novel, setNovel] = useState<Novel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  useEffect(() => {
    const fetchDetail = async () => {
      if (!id) return;
      setIsLoading(true);
      setError(null);
      try {
        const data = await novelsApi.get(Number(id));
        setNovel(data);
      } catch (err: any) {
        setError(err.message || t('bookDetail.loadError'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetail();
  }, [id]);

  const handleDelete = async () => {
    if (!novel) return;
    setIsDeleting(true);
    try {
      await novelsApi.delete(novel.id);
      navigate('/', { replace: true });
    } catch (err: any) {
      alert(err.message || t('bookDetail.deleteFailed'));
      setIsDeleting(false);
      setIsDeleteModalOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (error || !novel) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <p className="text-red-400 mb-4">{error || t('bookDetail.notFound')}</p>
        <Link to="/" className="text-accent hover:text-accent-hover underline flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> {t('common.actions.backToBookshelf')}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-6 max-w-5xl mx-auto w-full">
      <Link to="/" className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors mb-6 w-fit">
        <ArrowLeft className="w-4 h-4" />
        <span>{t('common.actions.back')}</span>
      </Link>

      <div className="glass rounded-2xl p-6 md:p-8 flex flex-col md:flex-row gap-8 mt-2">
        {/* Left Column: Cover & Primary Actions */}
        <div className="w-full md:w-64 shrink-0 flex flex-col gap-6">
          <div className="aspect-[2/3] w-full max-w-[240px] mx-auto overflow-hidden rounded-xl shadow-xl bg-muted-bg border border-border-color/20">
            {novel.hasCover ? (
              <img 
                src={novelsApi.getCoverUrl(novel.id)} 
                alt={novel.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <TxtCover title={novel.title} />
            )}
          </div>

          <div className="flex flex-col gap-3">
            <Link 
              to={`/novel/${novel.id}/read`}
              className="w-full py-3 px-4 bg-accent hover:bg-accent-hover text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <BookOpen className="w-5 h-5" />
              {t('common.actions.startReading')}
            </Link>
            
            <button 
              className="w-full py-3 px-4 bg-muted-bg text-text-secondary/60 cursor-not-allowed font-medium rounded-xl flex items-center justify-center gap-2 transition-colors border border-border-color/20"
              title="Coming in Phase 2"
            >
              <Wand2 className="w-5 h-5" />
              {t('bookDetail.aiAnalysisSoon')}
            </button>
            
            <button 
              onClick={() => setIsDeleteModalOpen(true)}
              className="w-full py-3 px-4 text-red-400 hover:text-red-300 hover:bg-red-500/10 font-medium rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <Trash2 className="w-5 h-5" />
              {t('bookDetail.deleteBook')}
            </button>
          </div>
        </div>

        {/* Right Column: Metadata */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="mb-6">
            <h1 className="text-3xl md:text-4xl font-bold text-text-primary tracking-tight mb-2">
              {novel.title}
            </h1>
            {novel.author && (
              <p className="text-xl text-text-secondary">
                by {novel.author}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 mb-8">
            <span className="inline-flex flex-col bg-muted-bg px-4 py-2 rounded-lg border border-border-color/20">
              <span className="text-xs text-text-secondary uppercase tracking-wider font-semibold mb-1 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Format
              </span>
              <span className="font-semibold text-text-primary">{novel.fileType.toUpperCase()}</span>
            </span>
            <span className="inline-flex flex-col bg-muted-bg px-4 py-2 rounded-lg border border-border-color/20">
              <span className="text-xs text-text-secondary uppercase tracking-wider font-semibold mb-1 flex items-center gap-1">
                <Hash className="w-3 h-3" /> {t('bookDetail.chapters')}
              </span>
              <span className="font-semibold text-text-primary">{novel.chapter_count || 0}</span>
            </span>
            <span className="inline-flex flex-col bg-muted-bg px-4 py-2 rounded-lg border border-border-color/20">
              <span className="text-xs text-text-secondary uppercase tracking-wider font-semibold mb-1 flex items-center gap-1">
                <FileText className="w-3 h-3" /> {t('bookDetail.wordCount')}
              </span>
              <span className="font-semibold text-text-primary">{(novel.totalWords / 1000).toFixed(1)}k</span>
            </span>
          </div>

          <div className="flex-1 flex flex-col gap-6">
            <div>
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">{t('bookDetail.description')}</h3>
              {novel.description ? (
                <div className="prose prose-sm prose-invert max-w-none text-text-primary/90 leading-relaxed">
                  {novel.description.split('\n').map((para, i) => (
                    <p key={i} className="mb-2">{para}</p>
                  ))}
                </div>
              ) : (
                <p className="text-text-secondary italic">{t('bookDetail.descriptionEmpty')}</p>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">AI Analysis Data</h3>
              <div className="p-4 rounded-xl border border-dashed border-border-color/30 bg-muted-bg/50 text-text-secondary text-sm flex items-center justify-center min-h-[120px]">
                Pending AI Analysis. Characters, themes, and plot points will appear here.
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => !isDeleting && setIsDeleteModalOpen(false)}
        title={t('bookDetail.deleteTitle')}
      >
        <div className="flex flex-col gap-6">
          <p className="text-text-primary">
            {t('bookDetail.deleteConfirm', { title: novel.title })}
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={isDeleting}
              className="px-4 py-2 rounded-lg font-medium hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              {t('common.actions.cancel')}
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="px-4 py-2 rounded-lg font-medium bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('common.actions.delete')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
