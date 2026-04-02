import type { RefObject } from 'react';

import type { CharacterGraphResponse } from '@shared/contracts';
import type { NovelView } from '@domains/library';
import type { AppError } from '@shared/errors';

import type { useCharacterGraphCanvasController } from '@domains/character-graph';

export interface CharacterGraphPageViewModel {
  actionBannerMessage: string | null;
  canvas: ReturnType<typeof useCharacterGraphCanvasController>;
  canRefreshOverview: boolean;
  error: AppError | null;
  errorBackHref: string;
  fullscreenRef: RefObject<HTMLDivElement | null>;
  graph: CharacterGraphResponse | null;
  isFullscreen: boolean;
  isLoading: boolean;
  isMobile: boolean;
  isRefreshingOverview: boolean;
  novel: NovelView | null;
  novelDetailHref: string;
  refreshOverview: () => Promise<void>;
  toggleFullscreen: () => Promise<void>;
}
