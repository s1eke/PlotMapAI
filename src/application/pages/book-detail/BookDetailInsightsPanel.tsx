import type { ReactElement } from 'react';
import type { AnalysisJobStatus, AnalysisOverview } from '@shared/contracts';
import type { AppError } from '@shared/errors';

import { AlertTriangle, Bot, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CharacterShareChart } from '@domains/library';
import { translateAppError } from '@shared/errors';

import type { BookDetailParagraph } from './types';

interface BookDetailInsightsPanelProps {
  analysisError: AppError | null;
  analysisErrorFallbackKey: string;
  analysisMessage: string | null;
  characterChartData: AnalysisOverview['characterStats'];
  introParagraphs: BookDetailParagraph[];
  introText: string;
  isAnalysisLoading: boolean;
  isJobRunning: boolean;
  job: AnalysisJobStatus | null;
  jobStatusLabel: string;
  overview: AnalysisOverview | null;
}

export default function BookDetailInsightsPanel({
  analysisError,
  analysisErrorFallbackKey,
  analysisMessage,
  characterChartData,
  introParagraphs,
  introText,
  isAnalysisLoading,
  isJobRunning,
  job,
  jobStatusLabel,
  overview,
}: BookDetailInsightsPanelProps): ReactElement {
  const { t } = useTranslation();

  return (
    <>
      <div className="rounded-2xl border border-border-color/20 bg-muted-bg/35 p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
          {t('bookDetail.description')}
        </h3>
        {introText ? (
          <div className="mt-4 space-y-3">
            <div className="prose prose-sm max-w-none prose-invert text-text-primary/90 leading-relaxed">
              {introParagraphs.map(({ key, paragraph }) => (
                <p key={key} className="mb-2">{paragraph}</p>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-4 italic text-text-secondary">{t('bookDetail.descriptionEmpty')}</p>
        )}

        <div className="mt-6 border-t border-border-color/20 pt-4">
          <p className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            {t('bookDetail.analysisThemesTitle')}
          </p>
          {overview?.themes.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {overview.themes.map((theme) => (
                <span
                  key={theme}
                  className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1.5 text-sm text-accent"
                >
                  {theme}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-text-secondary">{t('bookDetail.analysisThemesEmpty')}</p>
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-secondary">
          {t('bookDetail.aiAnalysisData')}
        </h3>
        <div className="space-y-5 rounded-2xl border border-border-color/20 bg-muted-bg/40 p-5">
          {isAnalysisLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
            </div>
          ) : (
            <>
              {analysisMessage ? (
                <div className="rounded-xl border border-border-color/20 bg-black/10 px-4 py-3 text-sm leading-6 text-text-secondary">
                  {analysisMessage}
                </div>
              ) : null}
              {analysisError ? (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-300">
                  {translateAppError(analysisError, t, analysisErrorFallbackKey)}
                </div>
              ) : null}

              {job ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 font-semibold text-text-primary">
                        <Bot className="h-4 w-4 text-accent" />
                        {t('bookDetail.analysisStatusLabel')}
                        <span>{jobStatusLabel}</span>
                      </div>
                    </div>
                    {job.totalChunks > 0 ? (
                      <div className="text-sm text-text-secondary">
                        {t('bookDetail.analysisChunksSummary', {
                          analyzedChapters: job.analyzedChapters,
                          completedChunks: job.completedChunks,
                          totalChapters: job.totalChapters,
                          totalChunks: job.totalChunks,
                        })}
                      </div>
                    ) : null}
                  </div>

                  {isJobRunning && job.totalChunks > 0 ? (
                    <div className="space-y-3">
                      <div className="h-2 overflow-hidden rounded-full bg-black/20">
                        <div
                          className="h-full bg-accent transition-all duration-300"
                          style={{ width: `${job.progressPercent}%` }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-secondary">
                        <span>{t('bookDetail.analysisProgress', { percent: job.progressPercent.toFixed(2) })}</span>
                        {job.currentStage === 'overview' ? (
                          <span>{t('bookDetail.analysisCurrentStage')}</span>
                        ) : null}
                        {job.currentStage !== 'overview' && job.currentChunk ? (
                          <span>
                            {t('bookDetail.analysisCurrentChunk', {
                              end: job.currentChunk.endChapterIndex + 1,
                              start: job.currentChunk.startChapterIndex + 1,
                            })}
                          </span>
                        ) : null}
                        {job.lastHeartbeat ? (
                          <span>
                            {t('bookDetail.analysisLastHeartbeat', {
                              time: new Date(job.lastHeartbeat).toLocaleString(),
                            })}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {job.lastError ? (
                    <div className="flex gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{t(`errors.${job.lastError}`, { defaultValue: job.lastError })}</span>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-text-secondary">{t('bookDetail.analysisNoJob')}</p>
              )}

              {overview ? (
                <div className="rounded-2xl border border-border-color/20 bg-card-bg/40 p-5">
                  <p className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                    {t('bookDetail.analysisOverviewTitle')}
                  </p>
                  <p className="mt-4 whitespace-pre-line leading-7 text-text-primary">
                    {overview.globalSummary || t('bookDetail.analysisOverviewEmpty')}
                  </p>

                  <div className="mt-6 border-t border-border-color/20 pt-5">
                    <p className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                      {t('bookDetail.analysisCharactersTitle')}
                    </p>
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
                <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-border-color/30 bg-muted-bg/50 p-4 text-sm text-text-secondary">
                  {t('bookDetail.analysisNoOverview')}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
