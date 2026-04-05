import type { BookImportProgress } from '@domains/book-import';
import type { AppError } from '@shared/errors';
import type { BookDetailReparseController } from './types';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { reparseBookAndRefreshDetail } from '@application/use-cases/library';
import { reportAppError, setDebugSnapshot } from '@shared/debug';
import { AppErrorCode, serializeAppError, toAppError } from '@shared/errors';

interface UseBookDetailReparseControllerOptions {
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

export function useBookDetailReparseController({
  fileType,
  novelId,
  onReparsed,
}: UseBookDetailReparseControllerOptions): BookDetailReparseController {
  const { t } = useTranslation();
  const [actionError, setActionError] = useState<AppError | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);
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
      currentFileName,
      error: actionError ? serializeAppError(actionError) : null,
      novelId,
      operation: 'reparse',
      progress,
      totalFiles: isReparsing ? 1 : 0,
    });
  }, [actionError, currentFileName, isReparsing, novelId, progress]);

  const onFilesSelected = useCallback(async (files: FileList | null): Promise<void> => {
    const file = files?.[0];
    if (!file) {
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setCurrentFileName(file.name);
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
      await onReparsed();
      setActionMessage(t('bookDetail.reparseSucceeded'));
    } catch (error) {
      if (!isAbortError(error)) {
        const normalized = toAppError(error, {
          code: AppErrorCode.BOOK_IMPORT_FAILED,
          kind: 'execution',
          source: 'book-import',
          userMessageKey: 'bookDetail.reparseFailed',
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
      setCurrentFileName(null);
    }
  }, [novelId, onReparsed, t]);

  return {
    accept: getAcceptByFileType(fileType),
    actionError,
    actionMessage,
    currentFileName,
    isReparsing,
    onFilesSelected,
    progress,
  };
}
