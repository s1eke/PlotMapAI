import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, BookOpen, Bot, FileText, Hash, Loader2, Pause, Play, RefreshCw, Share2, Trash2, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appPaths } from '@app/router/paths';
import { analysisApi, type AnalysisStatusResponse } from '@domains/analysis';

import Modal from '@shared/components/Modal';

import { libraryApi } from '../api/libraryApi';
import type { NovelView } from '../api/libraryApi';
import TxtCover from '../components/TxtCover';

export default function BookDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const novelId = Number(id);

  const [novel, setNovel] = useState<NovelView | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);
  const [analysisAction, setAnalysisAction] = useState<'start' | 'pause' | 'resume' | 'restart' | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  const loadNovel = useCallback(async () => {
    if (!novelId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await libraryApi.get(novelId);
      setNovel(data);
      if (data.hasCover) {
        const url = await libraryApi.getCoverUrl(novelId);
        setCoverUrl(url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('bookDetail.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [novelId, t]);

  const loadAnalysisStatus = useCallback(async (silent = false) => {
    if (!novelId) return;
    if (!silent) setIsAnalysisLoading(true);
    try {
      const data = await analysisApi.getStatus(novelId);
      setAnalysisStatus(data);
    } catch (err) {
      setAnalysisMessage(err instanceof Error ? err.message : t('bookDetail.analysisLoadError'));
      setAnalysisStatus(null);
    } finally {
      if (!silent) setIsAnalysisLoading(false);
    }
  }, [novelId, t]);

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
  const characterChartData = useMemo(() => (overview?.characterStats ?? []).slice(0, 5), [overview]);
  const isJobRunning = job?.status === 'running' || job?.status === 'pausing';
  const introText = overview?.bookIntro || novel?.description || '';
  const jobStatusLabel = !job
    ? t('bookDetail.analysisStatusIdle')
    : job.analysisComplete
      ? t('bookDetail.analysisStatusCompleted')
      : job.currentStage === 'overview' && isJobRunning
        ? t('bookDetail.analysisStatusGeneratingOverview')
        : job.status === 'running'
          ? t('bookDetail.analysisStatusRunning')
          : job.status === 'pausing'
            ? t('bookDetail.analysisStatusPausing')
            : job.status === 'paused'
              ? t('bookDetail.analysisStatusPaused')
              : job.status === 'failed'
                ? t('bookDetail.analysisStatusFailed')
                : job.status === 'completed'
                  ? t('bookDetail.analysisStatusPending')
                  : t('bookDetail.analysisStatusIdle');

  const handleDelete = async () => {
    if (!novel) return;
    setIsDeleting(true);
    try {
      await libraryApi.delete(novel.id);
      navigate(appPaths.bookshelf(), { replace: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : t('bookDetail.deleteFailed'));
      setIsDeleting(false);
      setIsDeleteModalOpen(false);
    }
  };

  const runAnalysisAction = async (action: 'start' | 'pause' | 'resume' | 'restart') => {
    if (!novelId) return;
    setAnalysisAction(action);
    setAnalysisMessage(null);
    try {
      const result = await (action === 'start'
        ? analysisApi.start(novelId)
        : action === 'pause'
          ? analysisApi.pause(novelId)
          : action === 'resume'
            ? analysisApi.resume(novelId)
            : analysisApi.restart(novelId));
      setAnalysisStatus(result);
      setAnalysisMessage(
        action === 'pause'
          ? t('bookDetail.analysisActionPauseRequested')
          : action === 'resume'
            ? t('bookDetail.analysisActionResumed')
            : action === 'restart'
              ? t('bookDetail.analysisActionRestarted')
              : t('bookDetail.analysisActionStarted')
      );
    } catch (err) {
      setAnalysisMessage(err instanceof Error ? err.message : t('bookDetail.analysisActionFailed'));
    } finally {
      setAnalysisAction(null);
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
        <Link to={appPaths.bookshelf()} className="text-accent hover:text-accent-hover underline flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> {t('common.actions.backToBookshelf')}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-6 max-w-5xl mx-auto w-full">
      <div className="glass rounded-2xl p-6 md:p-8">
        <Link to={appPaths.bookshelf()} className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors mb-6 w-fit">
          <ArrowLeft className="w-4 h-4" />
          <span>{t('common.actions.back')}</span>
        </Link>

        <div className="flex flex-col md:flex-row gap-8">
        <div className="w-full md:w-64 shrink-0 flex flex-col gap-6">
          <div className="aspect-[2/3] w-full max-w-[240px] mx-auto overflow-hidden rounded-xl shadow-xl bg-muted-bg border border-border-color/20">
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

            {job?.status === 'running' || job?.status === 'pausing' ? (
              <DetailActionButton
                icon={Pause}
                label={job.status === 'pausing' ? t('bookDetail.pausingAnalysis') : t('bookDetail.pauseAnalysis')}
                onClick={() => runAnalysisAction('pause')}
                loading={analysisAction === 'pause'}
                disabled={analysisAction !== null}
                tone="warning"
              />
            ) : job?.canResume ? (
              <DetailActionButton
                icon={Play}
                label={t('bookDetail.resumeAnalysis')}
                onClick={() => runAnalysisAction('resume')}
                loading={analysisAction === 'resume'}
                disabled={analysisAction !== null}
                tone="brand-soft"
              />
            ) : (!job || job.canStart) ? (
              <DetailActionButton
                icon={Bot}
                label={t('bookDetail.startAnalysis')}
                onClick={() => runAnalysisAction('start')}
                loading={analysisAction === 'start'}
                disabled={analysisAction !== null}
                tone="brand-soft"
              />
            ) : null}

            {job?.canRestart && (
              <DetailActionButton
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
              onClick={() => setIsDeleteModalOpen(true)}
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
                    {introText.split('\n').map((para, index) => (
                      <p key={index} className="mb-2">{para}</p>
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
                              {job.currentStage === 'overview'
                                ? <span>{t('bookDetail.analysisCurrentStage')}</span>
                                : job.currentChunk
                                  ? <span>{t('bookDetail.analysisCurrentChunk', { start: job.currentChunk.startChapterIndex + 1, end: job.currentChunk.endChapterIndex + 1 })}</span>
                                  : null}
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
        onClose={() => !isDeleting && setIsDeleteModalOpen(false)}
        title={t('bookDetail.deleteTitle')}
      >
        <div className="flex flex-col gap-6">
          <p className="text-text-primary">{t('bookDetail.deleteConfirm', { title: novel.title })}</p>
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

type DetailActionButtonTone = 'neutral' | 'brand' | 'brand-soft' | 'warning' | 'danger';

const PRIMARY_DETAIL_ACTION_CLASS = 'flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-[1px] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60';

function DetailActionButton({
  icon: Icon,
  label,
  onClick,
  loading = false,
  disabled = false,
  tone = 'neutral',
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  tone?: DetailActionButtonTone;
}) {
  const toneClassName = {
    neutral: 'bg-[#5f6b79] hover:bg-[#53606f]',
    brand: 'bg-brand-700 hover:bg-brand-600',
    'brand-soft': 'bg-[#586a84] hover:bg-[#4d5f79]',
    warning: 'bg-[#b07b1e] hover:bg-[#9b6b17]',
    danger: 'bg-[#a14a47] hover:bg-[#8d403d]',
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${PRIMARY_DETAIL_ACTION_CLASS} ${toneClassName}`}
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
      <span className="tracking-[0.01em]">{label}</span>
    </button>
  );
}

function CharacterShareChart({
  characters,
  emptyLabel,
  roleFallback,
}: {
  characters: Array<{
    name: string;
    role: string;
    sharePercent: number;
  }>;
  emptyLabel: string;
  roleFallback: string;
}) {
  if (characters.length === 0) {
    return <p className="text-sm text-text-secondary">{emptyLabel}</p>;
  }

  const chartWidth = 680;
  const chartHeight = 332;
  const padding = {
    top: 34,
    right: 26,
    bottom: 92,
    left: 54,
  };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const maxShare = Math.max(...characters.map((character) => character.sharePercent));
  const step = getShareChartStep(maxShare);
  const axisMax = Math.max(step * 3, Math.ceil(maxShare / step) * step);
  const tickValues = Array.from({ length: Math.floor(axisMax / step) + 1 }, (_, index) => index * step);
  const groupWidth = plotWidth / characters.length;
  const barWidth = Math.min(72, groupWidth * 0.5);

  return (
    <div className="overflow-hidden rounded-[28px] border border-[#e4e8ef] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,247,251,0.98)_100%)] p-4 shadow-[0_18px_48px_rgba(31,41,55,0.08)] md:p-5">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-auto w-full" role="img" aria-label="Character share chart">
        <defs>
          <linearGradient id="character-share-card" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.96)" />
            <stop offset="100%" stopColor="rgba(245,247,251,0.96)" />
          </linearGradient>
          <linearGradient id="character-share-bar" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#31496b" />
            <stop offset="55%" stopColor="#466286" />
            <stop offset="100%" stopColor="#6c84a6" />
          </linearGradient>
          <filter id="character-share-shadow" x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx="0" dy="12" stdDeviation="14" floodColor="rgba(49,73,107,0.16)" />
          </filter>
          <filter id="character-share-badge-shadow" x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="rgba(31,41,55,0.08)" />
          </filter>
        </defs>

        <rect x="1" y="1" width={chartWidth - 2} height={chartHeight - 2} rx="28" fill="url(#character-share-card)" />
        <ellipse cx={chartWidth - 80} cy="24" rx="120" ry="46" fill="rgba(244,199,104,0.10)" />
        <ellipse cx="92" cy={chartHeight - 26} rx="148" ry="54" fill="rgba(49,73,107,0.06)" />
        <rect
          x={padding.left}
          y={padding.top}
          width={plotWidth}
          height={plotHeight}
          rx={22}
          fill="rgba(245,247,251,0.72)"
        />

        {tickValues.map((tickValue) => {
          const y = padding.top + plotHeight - (tickValue / axisMax) * plotHeight;
          return (
            <g key={tickValue}>
              <line
                x1={padding.left}
                x2={padding.left + plotWidth}
                y1={y}
                y2={y}
                stroke="rgba(95,107,121,0.16)"
                strokeDasharray={tickValue === 0 ? undefined : '4 6'}
              />
              <text
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                fontSize="12"
                fill="rgba(95,107,121,0.92)"
              >
                {tickValue}%
              </text>
            </g>
          );
        })}

        <line
          x1={padding.left}
          x2={padding.left + plotWidth}
          y1={padding.top + plotHeight}
          y2={padding.top + plotHeight}
          stroke="rgba(24,32,42,0.18)"
        />

        {characters.map((character, index) => {
          const barHeight = (character.sharePercent / axisMax) * plotHeight;
          const centerX = padding.left + groupWidth * index + groupWidth / 2;
          const barX = centerX - barWidth / 2;
          const barY = padding.top + plotHeight - barHeight;
          const roleLabel = truncateChartLabel(character.role || roleFallback, 14);
          const valueLabel = formatChartPercent(character.sharePercent);
          const badgeWidth = Math.max(66, valueLabel.length * 10 + 22);
          const badgeX = centerX - badgeWidth / 2;
          const badgeY = Math.max(8, barY - 42);

          return (
            <g key={character.name}>
              <title>{`${character.name} ${valueLabel}`}</title>
              <line
                x1={centerX}
                x2={centerX}
                y1={padding.top + plotHeight}
                y2={padding.top + plotHeight + 8}
                stroke="rgba(24,32,42,0.16)"
              />
              <g filter="url(#character-share-badge-shadow)">
                <rect
                  x={badgeX}
                  y={badgeY}
                  width={badgeWidth}
                  height="28"
                  rx="14"
                  fill="rgba(255,253,249,0.98)"
                  stroke="rgba(217,146,0,0.26)"
                />
              </g>
              <text
                x={centerX}
                y={badgeY + 18}
                textAnchor="middle"
                fontSize="15"
                fontWeight="700"
                fill="#b97900"
              >
                {valueLabel}
              </text>
              <rect
                x={barX}
                y={barY}
                width={barWidth}
                height={Math.max(barHeight, 6)}
                rx={18}
                fill="url(#character-share-bar)"
                filter="url(#character-share-shadow)"
              />
              <text
                x={centerX}
                y={padding.top + plotHeight + 34}
                textAnchor="middle"
                fontSize="16"
                fontWeight="600"
                fill="#18202a"
              >
                {truncateChartLabel(character.name, 8)}
              </text>
              <text
                x={centerX}
                y={padding.top + plotHeight + 58}
                textAnchor="middle"
                fontSize="12"
                fill="rgba(95,107,121,0.92)"
              >
                {roleLabel}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function getShareChartStep(maxValue: number) {
  if (maxValue <= 20) return 5;
  if (maxValue <= 50) return 10;
  return 20;
}

function formatChartPercent(value: number) {
  const normalized = Number(value.toFixed(1));
  return Number.isInteger(normalized) ? `${normalized.toFixed(0)}%` : `${normalized}%`;
}

function truncateChartLabel(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}
