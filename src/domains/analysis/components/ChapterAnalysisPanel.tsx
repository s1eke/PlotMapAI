import { AlertTriangle, Bot, GitBranch, Loader2, PauseCircle, Sparkles, Tags, Users } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import type { AnalysisJobStatus, ChapterAnalysisResult } from '@shared/contracts';

interface ChapterAnalysisPanelProps {
  analysis: ChapterAnalysisResult | null;
  job: AnalysisJobStatus | null;
  isLoading: boolean;
  onAnalyzeChapter?: () => void;
  isAnalyzingChapter?: boolean;
  progressHref: string;
  settingsHref: string;
}

export default function ChapterAnalysisPanel({
  analysis,
  job,
  isLoading,
  onAnalyzeChapter,
  isAnalyzingChapter,
  progressHref,
  settingsHref,
}: ChapterAnalysisPanelProps) {
  const { t } = useTranslation();
  const keyedKeyPoints = useMemo(() => {
    const pointCounts = new Map<string, number>();
    return analysis?.keyPoints.map((point) => {
      const occurrence = pointCounts.get(point) ?? 0;
      pointCounts.set(point, occurrence + 1);
      return {
        key: `${point}:${occurrence}`,
        point,
      };
    }) ?? [];
  }, [analysis?.keyPoints]);
  const keyedRelationships = useMemo(() => {
    const relationCounts = new Map<string, number>();
    return analysis?.relationships.map((relationship) => {
      const relationId = [
        relationship.source,
        relationship.target,
        relationship.type,
      ].join(':');
      const occurrence = relationCounts.get(relationId) ?? 0;
      relationCounts.set(relationId, occurrence + 1);
      return {
        key: `${relationId}:${occurrence}`,
        relationship,
      };
    }) ?? [];
  }, [analysis?.relationships]);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto bg-card-bg rounded-2xl p-8 border border-border-color/20 shadow-xl flex items-center justify-center min-h-[280px]">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (analysis) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        <section className="bg-card-bg rounded-2xl p-8 border border-border-color/20 shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-accent/15 flex items-center justify-center">
              <Bot className="w-6 h-6 text-accent" />
            </div>
            <div>
              <p className="text-sm text-text-secondary">{t('reader.analysisPanel.title')}</p>
              <h3 className="text-2xl font-semibold text-text-primary">{analysis.chapterTitle}</h3>
            </div>
          </div>
          <p className="text-text-primary leading-8 text-lg">{analysis.summary}</p>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-card-bg rounded-2xl p-6 border border-border-color/20 shadow-xl">
            <h4 className="text-lg font-semibold text-text-primary mb-4">{t('reader.analysisPanel.keyPointsTitle')}</h4>
            {analysis.keyPoints.length > 0 ? (
              <ul className="space-y-3 text-text-primary">
                {keyedKeyPoints.map(({ key, point }) => (
                  <li key={key} className="flex gap-3 leading-7">
                    <span className="mt-2 h-2 w-2 rounded-full bg-accent shrink-0" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-text-secondary">{t('reader.analysisPanel.keyPointsEmpty')}</p>
            )}
          </div>

          <div className="bg-card-bg rounded-2xl p-6 border border-border-color/20 shadow-xl">
            <div className="flex items-center gap-2 mb-4 text-text-primary">
              <Tags className="w-4 h-4 text-accent" />
              <h4 className="text-lg font-semibold">{t('reader.analysisPanel.tagsTitle')}</h4>
            </div>
            {analysis.tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {analysis.tags.map((tag) => (
                  <span key={tag} className="px-3 py-1.5 rounded-full bg-accent/10 text-accent text-sm border border-accent/20">
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-text-secondary">{t('reader.analysisPanel.tagsEmpty')}</p>
            )}
          </div>
        </section>

        <section className="bg-card-bg rounded-2xl p-6 border border-border-color/20 shadow-xl">
          <div className="flex items-center gap-2 mb-4 text-text-primary">
            <Users className="w-5 h-5 text-accent" />
            <h4 className="text-lg font-semibold">{t('reader.analysisPanel.charactersTitle')}</h4>
          </div>
          {analysis.characters.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {analysis.characters.map((character) => (
                <div key={character.name} className="rounded-xl border border-border-color/20 bg-muted-bg/50 p-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <p className="font-semibold text-text-primary">{character.name}</p>
                      <p className="text-sm text-text-secondary">{character.role || t('reader.analysisPanel.characterRoleFallback')}</p>
                    </div>
                    <span className="text-sm font-semibold text-accent">{t('reader.analysisPanel.characterWeight', { weight: character.weight })}</span>
                  </div>
                  <p className="text-sm text-text-secondary leading-6">{character.description || t('reader.analysisPanel.characterDescriptionEmpty')}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-text-secondary">{t('reader.analysisPanel.charactersEmpty')}</p>
          )}
        </section>

        <section className="bg-card-bg rounded-2xl p-6 border border-border-color/20 shadow-xl">
          <div className="flex items-center gap-2 mb-4 text-text-primary">
            <GitBranch className="w-5 h-5 text-accent" />
            <h4 className="text-lg font-semibold">{t('reader.analysisPanel.relationshipsTitle')}</h4>
          </div>
          {analysis.relationships.length > 0 ? (
            <div className="space-y-3">
              {keyedRelationships.map(({ key, relationship }) => (
                <div
                  key={key}
                  className="rounded-xl border border-border-color/20 bg-muted-bg/50 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="font-semibold text-text-primary">{relationship.source}</span>
                    <span className="text-text-secondary">→</span>
                    <span className="font-semibold text-text-primary">{relationship.target}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-accent/10 text-accent border border-accent/20">{relationship.type}</span>
                    <span className="text-xs text-text-secondary">{t('reader.analysisPanel.relationshipWeight', { weight: relationship.weight })}</span>
                  </div>
                  <p className="text-sm text-text-secondary leading-6">{relationship.description || t('reader.analysisPanel.relationshipDescriptionEmpty')}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-text-secondary">{t('reader.analysisPanel.relationshipsEmpty')}</p>
          )}
        </section>
      </div>
    );
  }

  const progress = job?.progressPercent ?? 0;
  const isRunning = job?.status === 'running' || job?.status === 'pausing';
  const isPaused = job?.status === 'paused';
  const isFailed = job?.status === 'failed';
  const isOverviewStage = job?.currentStage === 'overview';
  const hasIncompleteOutputs = Boolean(job && !job.analysisComplete);
  const statusIcon = (() => {
    if (isRunning) {
      return <Loader2 className="w-8 h-8 text-accent animate-spin" />;
    }
    if (isPaused) {
      return <PauseCircle className="w-8 h-8 text-yellow-400" />;
    }
    if (isFailed) {
      return <AlertTriangle className="w-8 h-8 text-red-400" />;
    }
    return <Bot className="w-8 h-8 text-accent opacity-80" />;
  })();
  const statusTitle = (() => {
    if (isRunning) {
      if (isOverviewStage) {
        return t('reader.analysisPanel.statusGeneratingOverview');
      }
      return t('reader.analysisPanel.statusQueued');
    }
    if (isPaused) {
      return t('reader.analysisPanel.statusPaused');
    }
    if (isFailed) {
      return t('reader.analysisPanel.statusFailed');
    }
    if (hasIncompleteOutputs) {
      return t('reader.analysisPanel.statusIncomplete');
    }
    return t('reader.analysisPanel.statusEmpty');
  })();
  const statusHint = (() => {
    if (isRunning) {
      if (isOverviewStage) {
        return t('reader.analysisPanel.hintGeneratingOverview');
      }
      return t('reader.analysisPanel.hintRunning');
    }
    if (isPaused) {
      return t('reader.analysisPanel.hintPaused');
    }
    if (isFailed) {
      return t(`errors.${job?.lastError}`, { defaultValue: job?.lastError })
        || t('reader.analysisPanel.hintFailed');
    }
    if (hasIncompleteOutputs) {
      return t('reader.analysisPanel.hintIncomplete');
    }
    return t('reader.analysisPanel.hintEmpty');
  })();
  const progressStage = (() => {
    if (isOverviewStage) {
      return <span>{t('reader.analysisPanel.progressOverviewStage')}</span>;
    }
    if (job?.currentChunk) {
      return (
        <span>
          {t('reader.analysisPanel.progressCurrentChunk', {
            start: job.currentChunk.startChapterIndex + 1,
            end: job.currentChunk.endChapterIndex + 1,
          })}
        </span>
      );
    }
    return null;
  })();

  return (
    <div className="max-w-3xl mx-auto bg-card-bg rounded-2xl p-8 border border-border-color/20 text-center animate-fade-in shadow-xl">
      <div className="w-16 h-16 bg-muted-bg rounded-full flex items-center justify-center mx-auto mb-6">
        {statusIcon}
      </div>

      <h3 className="text-xl font-medium mb-4 text-text-primary">
        {statusTitle}
      </h3>

      <p className="text-text-secondary leading-relaxed max-w-xl mx-auto mb-6">
        {statusHint}
      </p>

      {isRunning && job && job.totalChunks > 0 && (
        <div className="mb-6 text-left bg-muted-bg/50 rounded-xl border border-border-color/20 p-4 space-y-3">
          <div className="flex items-center justify-between text-sm text-text-secondary">
            <span>{t('reader.analysisPanel.progressTitle')}</span>
            <span>{t('reader.analysisPanel.progressChunks', { completed: job.completedChunks, total: job.totalChunks })}</span>
          </div>
          <div className="h-2 rounded-full bg-black/20 overflow-hidden">
            <div className="h-full bg-accent transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-secondary">
            <span>{t('reader.analysisPanel.progressChapters', { done: job.analyzedChapters, total: job.totalChapters })}</span>
            {progressStage}
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        {onAnalyzeChapter && !isRunning && (
          <button
            type="button"
            onClick={onAnalyzeChapter}
            disabled={isAnalyzingChapter}
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {isAnalyzingChapter ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {isAnalyzingChapter
              ? t('reader.analysisPanel.analyzingChapter')
              : t('reader.analysisPanel.analyzeChapter')}
          </button>
        )}
        <Link
          to={progressHref}
          className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors"
        >
          {t('reader.analysisPanel.viewProgress')}
        </Link>
        <Link
          to={settingsHref}
          className="px-4 py-2 rounded-lg border border-border-color/30 hover:bg-white/5 text-text-primary transition-colors"
        >
          {t('reader.analysisPanel.openAiSettings')}
        </Link>
      </div>
    </div>
  );
}
