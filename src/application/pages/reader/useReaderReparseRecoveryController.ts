import type { BookImportProgress } from '@domains/book-import';
import type { AppError } from '@shared/errors';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { reparseBookAndRefreshDetail } from '@application/use-cases/book-detail';
import { reportAppError, setDebugSnapshot } from '@shared/debug';
import { AppErrorCode, serializeAppError, toAppError } from '@shared/errors';

export interface ReaderReparseRecoveryController {
  accept: string;
  actionError: AppError | null;
  actionMessage: string | null;
  isReparsing: boolean;
  onFilesSelected: (files: FileList | null) => void | Promise<void>;
  progress: BookImportProgress | null;
}

interface UseReaderReparseRecoveryControllerOptions {
  fileType: string;
  novelId: number;
  onReparsed: () => Promise<void> | void;
}

function getAcceptByFileType(fileType: string): string {
  switch (fileType.toLowerCase()) {
    case 'epub':
      return '.epub';
    case 'txt':
      return '.txt';
    default:
      return '.txt,.epub';
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function useReaderReparseRecoveryController({
  fileType,
  novelId,
  onReparsed,
}: UseReaderReparseRecoveryControllerOptions): ReaderReparseRecoveryController {
  const { t } = useTranslation();
  const [actionError, setActionError] = useState<AppError | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isReparsing, setIsReparsing] = useState(false);
  const [progress, setProgress] = useState<BookImportProgress | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    setDebugSnapshot('book-import', {
      active: isReparsing,
      currentFileIndex: isReparsing ? 1 : null,
      currentFileName: progress?.detail ?? null,
      error: actionError ? serializeAppError(actionError) : null,
      novelId,
      operation: 'reparse',
      progress,
      totalFiles: isReparsing ? 1 : 0,
    });
  }, [actionError, isReparsing, novelId, progress]);

  const onFilesSelected = useCallback(async (files: FileList | null): Promise<void> => {
    const file = files?.[0];
    if (!file) {
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsReparsing(true);
    setProgress({
      progress: 0,
      stage: 'hashing',
      detail: file.name,
    });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await reparseBookAndRefreshDetail(novelId, file, {
        signal: controller.signal,
        onProgress: (nextProgress) => {
          setProgress(nextProgress);
        },
      });
      setActionMessage(t('reader.reparse.succeeded'));
      await onReparsed();
    } catch (error) {
      if (!isAbortError(error)) {
        const normalized = toAppError(error, {
          code: AppErrorCode.BOOK_IMPORT_FAILED,
          kind: 'execution',
          source: 'book-import',
          userMessageKey: 'reader.reparse.failed',
          retryable: true,
          details: {
            filename: file.name,
            novelId,
          },
        });
        reportAppError(normalized);
        setActionError(normalized);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsReparsing(false);
      setProgress(null);
    }
  }, [novelId, onReparsed, t]);

  return {
    accept: getAcceptByFileType(fileType),
    actionError,
    actionMessage,
    isReparsing,
    onFilesSelected,
    progress,
  };
}
