import type { ReactElement } from 'react';

import { ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { CharacterGraphStage } from '@domains/character-graph';
import { translateAppError } from '@shared/errors';

import type { CharacterGraphPageViewModel } from './types';

interface CharacterGraphScreenProps {
  viewModel: CharacterGraphPageViewModel;
}

export default function CharacterGraphScreen({
  viewModel,
}: CharacterGraphScreenProps): ReactElement {
  const { t } = useTranslation();

  if (viewModel.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#f5f2eb]">
        <Loader2 className="h-8 w-8 animate-spin text-[#34527a]" />
      </div>
    );
  }

  if (viewModel.error || !viewModel.novel || !viewModel.graph) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[#f5f2eb] p-8 text-center">
        <p className="text-[#8f4c42]">
          {viewModel.error
            ? translateAppError(viewModel.error, t, 'characterGraph.loadError')
            : t('characterGraph.loadError')}
        </p>
        <Link
          to={viewModel.errorBackHref}
          className="inline-flex items-center gap-2 text-[#5f6b79] transition hover:text-[#18202a]"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('characterGraph.backToBook')}
        </Link>
      </div>
    );
  }

  if (!viewModel.graph.meta.hasData) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center overflow-hidden bg-[#f5f2eb] px-6 py-8">
        <div className="max-w-xl rounded-[32px] border border-[#d9d3c7] bg-[#fffdfa] p-10 text-center shadow-[0_24px_70px_rgba(28,35,45,0.07)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#eef1f4] text-[#34527a]">
            <Sparkles className="h-8 w-8" />
          </div>
          <h2 className="mt-5 text-3xl font-semibold text-[#18202a]">{t('characterGraph.empty')}</h2>
          <p className="mt-3 text-[#6b7563]">{t('characterGraph.emptyHint')}</p>
          <Link
            to={viewModel.novelDetailHref}
            className="mt-7 inline-flex items-center gap-2 rounded-full border border-[#d9d3c7] bg-white px-5 py-3 text-sm font-medium text-[#18202a] transition hover:border-[#34527a]/20 hover:text-[#34527a]"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('characterGraph.openBookDetail')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <CharacterGraphStage
      canvas={viewModel.canvas}
      fullscreenRef={viewModel.fullscreenRef}
      actionMessage={viewModel.actionBannerMessage}
      backHref={viewModel.novelDetailHref}
      canRefreshOverview={viewModel.canRefreshOverview}
      graphGeneratedAt={viewModel.graph.meta.generatedAt}
      isComplete={viewModel.graph.meta.isComplete}
      isFullscreen={viewModel.isFullscreen}
      isMobile={viewModel.isMobile}
      isRefreshingOverview={viewModel.isRefreshingOverview}
      novelTitle={viewModel.novel.title}
      onRefreshOverview={() => {
        viewModel.refreshOverview().catch(() => undefined);
      }}
      onToggleFullscreen={() => {
        viewModel.toggleFullscreen().catch(() => undefined);
      }}
    />
  );
}
