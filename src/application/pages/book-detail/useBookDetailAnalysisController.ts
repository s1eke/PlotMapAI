import { useCallback, useMemo, useState } from 'react';
import { Bot, Pause, Play, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  pauseNovelAnalysis,
  restartNovelAnalysis,
  resumeNovelAnalysis,
  startNovelAnalysis,
} from '@application/use-cases/analysis';
import { reportAppError } from '@shared/debug';
import { AppErrorCode, toAppError } from '@shared/errors';

import type { AnalysisStatusResponse } from '@shared/contracts';
import type { AppError } from '@shared/errors';
import type {
  BookDetailAnalysisAction,
  BookDetailAnalysisActionButtonModel,
  BookDetailAnalysisController,
} from './types';

interface UseBookDetailAnalysisControllerOptions {
  job: AnalysisStatusResponse['job'] | null;
  novelId: number;
  onStatusUpdated: (nextStatus: AnalysisStatusResponse | null) => void;
}

function isValidNovelId(novelId: number): boolean {
  return Number.isFinite(novelId) && novelId > 0;
}

function getActionMessage(action: BookDetailAnalysisAction): string {
  switch (action) {
    case 'pause':
      return 'bookDetail.analysisActionPauseRequested';
    case 'resume':
      return 'bookDetail.analysisActionResumed';
    case 'restart':
      return 'bookDetail.analysisActionRestarted';
    default:
      return 'bookDetail.analysisActionStarted';
  }
}

export function useBookDetailAnalysisController({
  job,
  novelId,
  onStatusUpdated,
}: UseBookDetailAnalysisControllerOptions): BookDetailAnalysisController {
  const { t } = useTranslation();
  const [analysisAction, setAnalysisAction] = useState<BookDetailAnalysisAction | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<AppError | null>(null);

  const runAnalysisAction = useCallback(async (action: BookDetailAnalysisAction): Promise<void> => {
    if (!isValidNovelId(novelId)) {
      return;
    }

    setAnalysisAction(action);
    setActionMessage(null);
    setActionError(null);

    try {
      let result: AnalysisStatusResponse;
      switch (action) {
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
          break;
      }

      onStatusUpdated(result);
      setActionMessage(t(getActionMessage(action)));
    } catch (error) {
      const normalized = toAppError(error, {
        code: AppErrorCode.ANALYSIS_EXECUTION_FAILED,
        kind: 'execution',
        source: 'analysis',
        userMessageKey: 'bookDetail.analysisActionFailed',
        retryable: true,
      });
      reportAppError(normalized);
      setActionError(normalized);
    } finally {
      setAnalysisAction(null);
    }
  }, [novelId, onStatusUpdated, t]);

  const primaryAction = useMemo<BookDetailAnalysisActionButtonModel | null>(() => {
    if (job?.status === 'running') {
      return {
        disabled: analysisAction !== null,
        icon: Pause,
        kind: 'pause',
        label: t('bookDetail.pauseAnalysis'),
        loading: analysisAction === 'pause',
        onClick: () => {
          runAnalysisAction('pause');
        },
        tone: 'warning',
      };
    }

    if (job?.status === 'pausing' || job?.canResume) {
      return {
        disabled: job?.status === 'pausing' || analysisAction !== null,
        icon: Play,
        kind: 'resume',
        label: t('bookDetail.resumeAnalysis'),
        loading: analysisAction === 'resume',
        onClick: () => {
          runAnalysisAction('resume');
        },
        tone: 'brand-soft',
      };
    }

    if (!job || job.canStart) {
      return {
        disabled: analysisAction !== null,
        icon: Bot,
        kind: 'start',
        label: t('bookDetail.startAnalysis'),
        loading: analysisAction === 'start',
        onClick: () => {
          runAnalysisAction('start');
        },
        tone: 'brand-soft',
      };
    }

    return null;
  }, [analysisAction, job, runAnalysisAction, t]);

  const restartAction = useMemo<BookDetailAnalysisActionButtonModel | null>(() => {
    if (!job?.canRestart) {
      return null;
    }

    return {
      disabled: analysisAction !== null,
      icon: RefreshCw,
      kind: 'restart',
      label: t('bookDetail.restartAnalysis'),
      loading: analysisAction === 'restart',
      onClick: () => {
        runAnalysisAction('restart');
      },
      tone: 'brand-soft',
    };
  }, [analysisAction, job?.canRestart, runAnalysisAction, t]);

  return {
    actionError,
    actionMessage,
    primaryAction,
    restartAction,
  };
}
