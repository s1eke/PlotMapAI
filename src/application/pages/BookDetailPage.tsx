import type { ReactElement } from 'react';
import type { AnalysisStatusResponse } from '@shared/contracts';
import type { AppError } from '@shared/errors';
import type { NovelView } from '@domains/library';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, BookOpen, Bot, FileText, Hash, Loader2, Pause, Play, RefreshCw, Share2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  pauseNovelAnalysis,
  restartNovelAnalysis,
  resumeNovelAnalysis,
  startNovelAnalysis,
} from '@application/use-cases/analysis';
import { deleteNovelAndCleanupArtifacts } from '@application/use-cases/library';
import { reportAppError } from '@app/debug/service';
import { appPaths } from '@app/router/paths';
import { analysisService } from '@domains/analysis';
import { novelRepository } from '@domains/library';
import BookDetailActionButton, { PRIMARY_DETAIL_ACTION_CLASS } from '@domains/library/components/BookDetailActionButton';
import CharacterShareChart from '@domains/library/components/CharacterShareChart';
import TxtCover from '@domains/library/components/TxtCover';
import {
  AppErrorCode,
  toAppError,
  translateAppError,
} from '@shared/errors';
import Modal from '@shared/components/Modal';

export default function BookDetailPage(): ReactElement {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const novelId = Number(id);

  const [novel, setNovel] = useState<NovelView | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<AppError | null>(null);
  const [analysisAction, setAnalysisAction] = useState<'start' | 'pause' | 'resume' | 'restart' | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<AppError | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  useEffect(() => {
    const scrollContainer = document.querySelector<HTMLElement>('[data-scroll-container="true"]');
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
      return;
    }

    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [novelId]);

  const loadNovel = useCallback(async () => {
    if (!novelId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await novelRepository.get(novelId);
      setNovel(data);
      if (data.hasCover) {
        const url = await novelRepository.getCoverUrl(novelId);
        setCoverUrl(url);
      }
    } catch (err) {
      const normalized = toAppError(err, {
        code: AppErrorCode.STORAGE_OPERATION_FAILED,
        kind: 'storage',
        source: 'library',
        userMessageKey: 'bookDetail.loadError',
      });
      reportAppError(normalized);
      setError(normalized);
    } finally {
      setIsLoading(false);
    }
  }, [novelId]);

  const loadAnalysisStatus = useCallback(async (silent = false) => {
    if (!novelId) return;
    if (!silent) setIsAnalysisLoading(true);
    try {
      const data = await analysisService.getStatus(novelId);
      setAnalysisStatus(data);
      setAnalysisError(null);
    } catch (err) {
      const normalized = toAppError(err, {
        code: AppErrorCode.ANALYSIS_EXECUTION_FAILED,
        kind: 'execution',
        source: 'analysis',
        userMessageKey: 'bookDetail.analysisLoadError',
        retryable: true,
      });
      reportAppError(normalized);
      setAnalysisError(normalized);
      setAnalysisStatus(null);
    } finally {
      if (!silent) setIsAnalysisLoading(false);
    }
  }, [novelId]);

  useEffect(() => {
    loadNovel();
    loadAnalysisStatus();
  }, [loadAnalysisStatus, loadNovel]);

  useEffect(() => {
    const status = analysisStatus?.job.status;
    if (!novelId || (status !== 'running' && status !== 'pausing')) return;

    const timer = window.setInterval(() => {
      loadAnalysisStatus(true);
    }, 3000);

    return () => {
      window.clearInterval(timer);
    };
  }, [analysisStatus?.job.status, loadAnalysisStatus, novelId]);

  const job = analysisStatus?.job ?? null;
  const overview = analysisStatus?.overview ?? null;
  const characterChartData = useMemo(
    () => (overview?.characterStats ?? []).slice(0, 5),
    [overview],
  );
  const isJobRunning = job?.status === 'running' || job?.status === 'pausing';
  const introText = overview?.bookIntro || novel?.description || '';
  const introParagraphs = useMemo(() => {
    let cursor = 0;
    return introText.split('\n').map((paragraph) => {
      const key = `${cursor}:${paragraph}`;
      cursor += paragraph.length + 1;
      return {
        key,
        paragraph,
      };
    });
  }, [introText]);
  const jobStatusLabel = (() => {
    if (!job) {
      return t('bookDetail.analysisStatusIdle');
    }
    if (job.analysisComplete) {
      return t('bookDetail.analysisStatusCompleted');
    }
    if (job.currentStage === 'overview' && isJobRunning) {
      return t('bookDetail.analysisStatusGeneratingOverview');
    }

    switch (job.status) {
      case 'running':
        return t('bookDetail.analysisStatusRunning');
      case 'pausing':
        return t('bookDetail.analysisStatusPausing');
      case 'paused':
        return t('bookDetail.analysisStatusPaused');
      case 'failed':
        return t('bookDetail.analysisStatusFailed');
      case 'completed':
        return t('bookDetail.analysisStatusPending');
      default:
        return t('bookDetail.analysisStatusIdle');
    }
  })();

  const handleDelete = useCallback(async () => {
    if (!novel) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await deleteNovelAndCleanupArtifacts(novel.id);
      navigate(appPaths.bookshelf(), { replace: true });
    } catch (err) {
      const normalized = toAppError(err, {
        code: AppErrorCode.STORAGE_OPERATION_FAILED,
        kind: 'storage',
        source: 'library',
        userMessageKey: 'bookDetail.deleteFailed',
      });
      reportAppError(normalized);
      setDeleteError(normalized);
      setIsDeleting(false);
    }
  }, [navigate, novel]);

  const openDeleteModal = useCallback((): void => {
    setDeleteError(null);
    setIsDeleteModalOpen(true);
  }, []);

  const closeDeleteModal = useCallback((): void => {
    if (isDeleting) {
      return;
    }

    setDeleteError(null);
    setIsDeleteModalOpen(false);
  }, [isDeleting]);

  const runAnalysisAction = async (action: 'start' | 'pause' | 'resume' | 'restart') => {
    if (!novelId) return;
    setAnalysisAction(action);
    setAnalysisMessage(null);
    setAnalysisError(null);
    try {
      let result: AnalysisStatusResponse;
      switch (action) {
        case 'start':
          result = await startNovelAnalysis(novelId);
          break;
        case 'pause':
          result = await pauseNovelAnalysis(novelId);
          break;
        case 'resume':
          result = await resumeNovelAnalysis(novelId);
          break;
        case 'restart':
          result = await restartNovelAnalysis(novelId);
          break;
        default:
          result = await startNovelAnalysis(novelId);
      }
      setAnalysisStatus(result);
      let nextMessage = t('bookDetail.analysisActionStarted');
      if (action === 'pause') {
        nextMessage = t('bookDetail.analysisActionPauseRequested');
      } else if (action === 'resume') {
        nextMessage = t('bookDetail.analysisActionResumed');
      } else if (action === 'restart') {
        nextMessage = t('bookDetail.analysisActionRestarted');
      }
      setAnalysisMessage(nextMessage);
    } catch (err) {
      const normalized = toAppError(err, {
        code: AppErrorCode.ANALYSIS_EXECUTION_FAILED,
        kind: 'execution',
        source: 'analysis',
        userMessageKey: 'bookDetail.analysisActionFailed',
        retryable: true,
      });
      reportAppError(normalized);
      setAnalysisError(normalized);
    } finally {
      setAnalysisAction(null);
    }
  };
  const analysisPrimaryAction = (() => {
    if (job?.status === 'running') {
      return (
        <BookDetailActionButton
          icon={Pause}
          label={t('bookDetail.pauseAnalysis')}
          onClick={() => runAnalysisAction('pause')}
          loading={analysisAction === 'pause'}
          disabled={analysisAction !== null}
          tone="warning"
        />
      );
    }
    if (job?.status === 'pausing' || job?.canResume) {
      return (
        <BookDetailActionButton
          icon={Play}
          label={t('bookDetail.resumeAnalysis')}
          onClick={() => runAnalysisAction('resume')}
          loading={analysisAction === 'resume'}
          disabled={job?.status === 'pausing' || analysisAction !== null}
          tone="brand-soft"
        />
      );
    }
    if (!job || job.canStart) {
      return (
        <BookDetailActionButton
          icon={Bot}
          label={t('bookDetail.startAnalysis')}
          onClick={() => runAnalysisAction('start')}
          loading={analysisAction === 'start'}
          disabled={analysisAction !== null}
          tone="brand-soft"
        />
      );
    }
    return null;
  })();

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100dvh-var(--app-header-height,0px)-2rem)] items-center justify-center px-6 py-8">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (error || !novel) {
    return (
      <div className="flex min-h-[calc(100dvh-var(--app-header-height,0px)-2rem)] flex-col items-center justify-center p-8 text-center">
        <p className="text-red-400 mb-4">
          {error ? translateAppError(error, t, 'bookDetail.loadError') : t('bookDetail.notFound')}
        </p>
        <Link to={appPaths.bookshelf()} className="text-accent hover:text-accent-hover underline flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> {t('common.actions.backToBookshelf')}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col p-6">
      <div className="glass rounded-2xl p-6 md:p-8">
        <Link to={appPaths.bookshelf()} className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors mb-6 w-fit">
          <ArrowLeft className="w-4 h-4" />
          <span>{t('common.actions.back')}</span>
        </Link>

        <div className="flex flex-col gap-8 md:flex-row">
          <div className="flex w-full shrink-0 flex-col gap-6 md:w-64">
            <div className="mx-auto aspect-[2/3] w-full max-w-[240px] overflow-hidden rounded-xl border border-border-color/20 bg-muted-bg shadow-xl">
              {novel.hasCover && coverUrl ? (
                <img
                  src={coverUrl}
                  alt={novel.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <TxtCover title={novel.title} />
              )}
            </div>

            <div className="flex flex-col gap-3">
              <Link
                to={appPaths.reader(novel.id)}
                className={`${PRIMARY_DETAIL_ACTION_CLASS} bg-accent hover:bg-accent-hover`}
              >
                <BookOpen className="w-5 h-5" />
                {t('common.actions.startReading')}
              </Link>

              <Link
                to={appPaths.characterGraph(novel.id)}
                className={`${PRIMARY_DETAIL_ACTION_CLASS} bg-brand-700 hover:bg-brand-600`}
              >
                <Share2 className="w-5 h-5" />
                {t('bookDetail.characterGraphEntry')}
              </Link>

              {analysisPrimaryAction}

              {job?.canRestart && (
                <BookDetailActionButton
                  icon={RefreshCw}
                  label={t('bookDetail.restartAnalysis')}
                  onClick={() => runAnalysisAction('restart')}
                  loading={analysisAction === 'restart'}
                  disabled={analysisAction !== null}
                  tone="brand-soft"
                />
              )}

              <button
                type="button"
                onClick={openDeleteModal}
                className="mt-1 inline-flex w-fit items-center gap-2 self-center rounded-full px-3 py-1.5 text-xs text-text-secondary/80 transition-colors hover:bg-red-500/6 hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('bookDetail.deleteBook')}
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <div className="mb-6">
              <h1 className="text-3xl md:text-4xl font-bold text-text-primary tracking-tight mb-2">{novel.title}</h1>
              {novel.author && (
                <p className="text-xl text-text-secondary">
                  {t('bookDetail.byAuthor', { author: novel.author })}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 mb-8">
              <span className="inline-flex flex-col bg-muted-bg px-4 py-2 rounded-lg border border-border-color/20">
                <span className="text-xs text-text-secondary uppercase tracking-wider font-semibold mb-1 flex items-center gap-1">
                  <FileText className="w-3 h-3" /> {t('bookDetail.format')}
                </span>
                <span className="font-semibold text-text-primary">{novel.fileType.toUpperCase()}</span>
              </span>
              <span className="inline-flex flex-col bg-muted-bg px-4 py-2 rounded-lg border border-border-color/20">
                <span className="text-xs text-text-secondary uppercase tracking-wider font-semibold mb-1 flex items-center gap-1">
                  <Hash className="w-3 h-3" /> {t('bookDetail.chapters')}
                </span>
                <span className="font-semibold text-text-primary">{novel.chapterCount || 0}</span>
              </span>
              <span className="inline-flex flex-col bg-muted-bg px-4 py-2 rounded-lg border border-border-color/20">
                <span className="text-xs text-text-secondary uppercase tracking-wider font-semibold mb-1 flex items-center gap-1">
                  <FileText className="w-3 h-3" /> {t('bookDetail.wordCount')}
                </span>
                <span className="font-semibold text-text-primary">{(novel.totalWords / 1000).toFixed(1)}k</span>
              </span>
            </div>

            <div className="flex-1 flex flex-col gap-6">
              <div className="rounded-2xl border border-border-color/20 bg-muted-bg/35 p-5">
                <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">{t('bookDetail.description')}</h3>
                {introText ? (
                  <div className="mt-4 space-y-3">
                    <div className="prose prose-sm prose-invert max-w-none text-text-primary/90 leading-relaxed">
                      {introParagraphs.map(({ key, paragraph }) => (
                        <p key={key} className="mb-2">{paragraph}</p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-text-secondary italic">{t('bookDetail.descriptionEmpty')}</p>
                )}

                <div className="mt-6 border-t border-border-color/20 pt-4">
                  <p className="text-sm font-semibold text-text-secondary uppercase tracking-wider">{t('bookDetail.analysisThemesTitle')}</p>
                  {overview?.themes.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {overview.themes.map((theme) => (
                        <span key={theme} className="px-3 py-1.5 rounded-full bg-accent/10 text-accent text-sm border border-accent/20">
                          {theme}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-text-secondary text-sm">{t('bookDetail.analysisThemesEmpty')}</p>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">{t('bookDetail.aiAnalysisData')}</h3>
                <div className="rounded-2xl border border-border-color/20 bg-muted-bg/40 p-5 space-y-5">
                  {isAnalysisLoading ? (
                    <div className="py-10 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
                  ) : (
                    <>
                      {analysisMessage && (
                        <div className="rounded-xl border border-border-color/20 bg-black/10 px-4 py-3 text-sm text-text-secondary leading-6">
                          {analysisMessage}
                        </div>
                      )}
                      {analysisError && (
                        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300 leading-6">
                          {translateAppError(analysisError, t, 'bookDetail.analysisActionFailed')}
                        </div>
                      )}

                      {job ? (
                        <>
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2 text-text-primary font-semibold">
                                <Bot className="w-4 h-4 text-accent" />
                                {t('bookDetail.analysisStatusLabel')}
                                <span>{jobStatusLabel}</span>
                              </div>
                            </div>
                            {job.totalChunks > 0 && (
                              <div className="text-sm text-text-secondary">
                                {t('bookDetail.analysisChunksSummary', {
                                  completedChunks: job.completedChunks,
                                  totalChunks: job.totalChunks,
                                  analyzedChapters: job.analyzedChapters,
                                  totalChapters: job.totalChapters,
                                })}
                              </div>
                            )}
                          </div>

                          {isJobRunning && job.totalChunks > 0 && (
                            <div className="space-y-3">
                              <div className="h-2 rounded-full bg-black/20 overflow-hidden">
                                <div className="h-full bg-accent transition-all duration-300" style={{ width: `${job.progressPercent}%` }} />
                              </div>
                              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-secondary">
                                <span>{t('bookDetail.analysisProgress', { percent: job.progressPercent.toFixed(2) })}</span>
                                {job.currentStage === 'overview' && (
                                  <span>{t('bookDetail.analysisCurrentStage')}</span>
                                )}
                                {job.currentStage !== 'overview' && job.currentChunk && (
                                  <span>
                                    {t('bookDetail.analysisCurrentChunk', {
                                      start: job.currentChunk.startChapterIndex + 1,
                                      end: job.currentChunk.endChapterIndex + 1,
                                    })}
                                  </span>
                                )}
                                {job.lastHeartbeat && <span>{t('bookDetail.analysisLastHeartbeat', { time: new Date(job.lastHeartbeat).toLocaleString() })}</span>}
                              </div>
                            </div>
                          )}

                          {job.lastError && (
                            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex gap-3">
                              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                              <span>{t(`errors.${job.lastError}`, { defaultValue: job.lastError })}</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-text-secondary">{t('bookDetail.analysisNoJob')}</p>
                      )}

                      {overview ? (
                        <div className="rounded-2xl border border-border-color/20 bg-card-bg/40 p-5">
                          <p className="text-sm font-semibold text-text-secondary uppercase tracking-wider">{t('bookDetail.analysisOverviewTitle')}</p>
                          <p className="mt-4 text-text-primary leading-7 whitespace-pre-line">{overview.globalSummary || t('bookDetail.analysisOverviewEmpty')}</p>

                          <div className="mt-6 border-t border-border-color/20 pt-5">
                            <p className="text-sm font-semibold text-text-secondary uppercase tracking-wider">{t('bookDetail.analysisCharactersTitle')}</p>
                            <div className="mt-4">
                              <CharacterShareChart
                                characters={characterChartData}
                                emptyLabel={t('bookDetail.analysisCharactersEmpty')}
                                roleFallback={t('bookDetail.analysisCharacterRoleFallback')}
                                ariaLabel={t('bookDetail.analysisCharactersTitle')}
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 rounded-xl border border-dashed border-border-color/30 bg-muted-bg/50 text-text-secondary text-sm flex items-center justify-center min-h-[120px]">
                          {t('bookDetail.analysisNoOverview')}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={closeDeleteModal}
        title={t('bookDetail.deleteTitle')}
      >
        <div className="flex flex-col gap-6">
          <p className="text-text-primary">{t('bookDetail.deleteConfirm', { title: novel.title })}</p>
          {deleteError && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300 leading-6">
              {translateAppError(deleteError, t, 'bookDetail.deleteFailed')}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              onClick={closeDeleteModal}
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
