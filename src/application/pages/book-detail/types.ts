import type { LucideIcon } from 'lucide-react';
import type {
  AnalysisJobStatus,
  AnalysisOverview,
  AnalysisStatusResponse,
} from '@shared/contracts';
import type { NovelView } from '@domains/library';
import type { AppError } from '@shared/errors';

export interface BookDetailParagraph {
  key: string;
  paragraph: string;
}

export interface BookDetailPageHrefs {
  bookshelf: string;
  characterGraph: string;
  reader: string;
}

export interface BookDetailPageViewModel {
  analysisController: BookDetailAnalysisController;
  analysisStatus: AnalysisStatusResponse | null;
  analysisStatusError: AppError | null;
  characterChartData: AnalysisOverview['characterStats'];
  contentSummary: BookDetailContentSummary;
  coverUrl: string | null;
  deleteFlow: BookDetailDeleteFlow;
  error: AppError | null;
  introParagraphs: BookDetailParagraph[];
  introText: string;
  isAnalysisLoading: boolean;
  isJobRunning: boolean;
  isLoading: boolean;
  job: AnalysisJobStatus | null;
  jobStatusLabel: string;
  novel: NovelView | null;
  overview: AnalysisOverview | null;
  pageHrefs: BookDetailPageHrefs;
}

export type BookDetailAnalysisAction = 'start' | 'pause' | 'resume' | 'restart';
export type BookDetailActionTone = 'neutral' | 'brand' | 'brand-soft' | 'warning' | 'danger';

export interface BookDetailContentSummary {
  contentFormat: 'rich';
  contentVersion: number | null;
  importFormatVersion: number | null;
  lastParsedAt: string | null;
}

export interface BookDetailAnalysisActionButtonModel {
  disabled: boolean;
  icon: LucideIcon;
  kind: BookDetailAnalysisAction;
  label: string;
  loading: boolean;
  onClick: () => void;
  tone: BookDetailActionTone;
}

export interface BookDetailAnalysisController {
  actionError: AppError | null;
  actionMessage: string | null;
  primaryAction: BookDetailAnalysisActionButtonModel | null;
  restartAction: BookDetailAnalysisActionButtonModel | null;
}

export interface BookDetailDeleteFlow {
  closeDeleteModal: () => void;
  confirmDelete: () => Promise<void>;
  deleteError: AppError | null;
  isDeleteModalOpen: boolean;
  isDeleting: boolean;
  novelTitle: string;
  openDeleteModal: () => void;
}
