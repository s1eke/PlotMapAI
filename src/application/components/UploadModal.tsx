import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UploadCloud, FileText, Loader2 } from 'lucide-react';

import { importBookAndRefreshLibrary } from '@application/use-cases/library';
import type { BookImportProgress } from '@domains/book-import';
import { reportAppError, setDebugSnapshot } from '@shared/debug';
import {
  AppErrorCode,
  createAppError,
  serializeAppError,
  toAppError,
  translateAppError,
  type AppError,
} from '@shared/errors';

import Modal from '@shared/components/Modal';
import { cn } from '@shared/utils/cn';

const MAX_BOOK_FILE_SIZE = 100 * 1024 * 1024;

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialFiles?: File[] | null;
  onInitialFilesHandled?: () => void;
}

interface UploadBatchState {
  currentFileIndex: number;
  totalFiles: number;
  currentFileName: string;
  progress: BookImportProgress;
}

function buildImportProgressLabel(
  progress: BookImportProgress,
  stageLabel: string,
): string {
  const detailParts = [
    progress.current != null && progress.total != null
      ? `${progress.current}/${progress.total}`
      : null,
    progress.detail ?? null,
  ].filter((value): value is string => Boolean(value));

  if (detailParts.length === 0) {
    return stageLabel;
  }

  return `${stageLabel} · ${detailParts.join(' · ')}`;
}

function validateImportFile(file: File): AppError | null {
  const name = file.name.toLowerCase();
  if (!name.endsWith('.txt') && !name.endsWith('.epub')) {
    return createAppError({
      code: AppErrorCode.UNSUPPORTED_FILE_TYPE,
      kind: 'unsupported',
      source: 'book-import',
      userMessageKey: 'bookshelf.invalidType',
      debugMessage: 'Only .txt and .epub files are supported',
      details: { filename: file.name },
    });
  }

  if (file.size > MAX_BOOK_FILE_SIZE) {
    return createAppError({
      code: AppErrorCode.BOOK_IMPORT_FAILED,
      kind: 'validation',
      source: 'book-import',
      userMessageKey: 'bookshelf.sizeLimit',
      debugMessage: 'File size must be less than 100MB',
      debugVisible: false,
      details: { filename: file.name },
    });
  }

  return null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export default function UploadModal({
  isOpen,
  onClose,
  onSuccess,
  initialFiles = null,
  onInitialFilesHandled,
}: UploadModalProps) {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [batchState, setBatchState] = useState<UploadBatchState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const autoProcessedFilesRef = useRef<File[] | null>(null);
  const latestProgressRef = useRef<BookImportProgress | null>(null);
  const progressRafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (progressRafRef.current !== null) {
        cancelAnimationFrame(progressRafRef.current);
      }
    };
  }, []);

  const currentStageLabel = batchState ? t(`bookshelf.workerStages.${batchState.progress.stage}`) : null;
  const currentProgressLabel = batchState && currentStageLabel
    ? buildImportProgressLabel(batchState.progress, currentStageLabel)
    : null;
  let currentFileLabel: string | null = null;
  if (batchState) {
    if (batchState.totalFiles > 1) {
      currentFileLabel = t('bookshelf.batchProgressFile', {
        current: batchState.currentFileIndex + 1,
        total: batchState.totalFiles,
        name: batchState.currentFileName,
      });
    } else {
      currentFileLabel = batchState.currentFileName;
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    const validationError = files
      .map(validateImportFile)
      .find((candidate) => candidate !== null) ?? null;
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsUploading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    let importedCount = 0;

    try {
      for (const [index, file] of files.entries()) {
        controller.signal.throwIfAborted?.();
        setBatchState({
          currentFileIndex: index,
          totalFiles: files.length,
          currentFileName: file.name,
          progress: { progress: 0, stage: 'hashing' },
        });

        await importBookAndRefreshLibrary(file, {
          signal: controller.signal,
          onProgress: (progress) => {
            latestProgressRef.current = progress;
            if (progressRafRef.current === null) {
              progressRafRef.current = requestAnimationFrame(() => {
                progressRafRef.current = null;
                const p = latestProgressRef.current;
                if (!p) return;

                setBatchState((current) => {
                  if (!current || current.currentFileIndex !== index) {
                    return current;
                  }

                  if (
                    current.progress.progress === p.progress &&
                    current.progress.stage === p.stage &&
                    current.progress.detail === p.detail &&
                    current.progress.current === p.current &&
                    current.progress.total === p.total
                  ) {
                    return current;
                  }

                  return {
                    ...current,
                    progress: p,
                  };
                });
              });
            }
          },
        });
        importedCount += 1;
      }

      if (importedCount > 0) {
        onSuccess();
        onClose();
      }
    } catch (err) {
      if (isAbortError(err)) {
        setError(null);
        if (importedCount > 0) {
          onSuccess();
        }
      } else {
        const normalized = toAppError(err, {
          code: AppErrorCode.BOOK_IMPORT_FAILED,
          kind: 'execution',
          source: 'book-import',
          userMessageKey: 'bookshelf.uploadFailed',
          retryable: true,
        });
        reportAppError(normalized);
        setError(normalized);
        if (importedCount > 0) {
          onSuccess();
        }
      }
    } finally {
      abortControllerRef.current = null;
      if (progressRafRef.current !== null) {
        cancelAnimationFrame(progressRafRef.current);
        progressRafRef.current = null;
      }
      setIsUploading(false);
      setBatchState(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [onClose, onSuccess]);

  useEffect(() => {
    if (!isOpen || isUploading || !initialFiles || initialFiles.length === 0) {
      return;
    }

    if (autoProcessedFilesRef.current === initialFiles) {
      return;
    }

    autoProcessedFilesRef.current = initialFiles;
    processFiles(initialFiles).finally(() => {
      onInitialFilesHandled?.();
      if (autoProcessedFilesRef.current === initialFiles) {
        autoProcessedFilesRef.current = null;
      }
    });
  }, [initialFiles, isOpen, isUploading, onInitialFilesHandled, processFiles]);

  useEffect(() => {
    setDebugSnapshot('book-import', {
      active: isUploading,
      currentFileIndex: batchState ? batchState.currentFileIndex + 1 : null,
      currentFileName: batchState?.currentFileName ?? null,
      error: error ? serializeAppError(error) : null,
      operation: 'import',
      progress: batchState?.progress ?? null,
      totalFiles: batchState?.totalFiles ?? 0,
    });
  }, [batchState, error, isUploading]);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    await processFiles(Array.from(e.dataTransfer.files ?? []));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await processFiles(Array.from(e.target.files ?? []));
  };

  const handleCancelUpload = () => {
    abortControllerRef.current?.abort();
  };

  const handleClose = () => {
    if (isUploading) {
      abortControllerRef.current?.abort();
    }
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('bookshelf.uploadTitle')} className="max-w-md">
      <div className="flex flex-col gap-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg p-3 text-sm">
            {translateAppError(error, t, 'bookshelf.uploadFailed')}
          </div>
        )}

        <div
          className={cn(
            'border-2 border-dashed rounded-xl p-8 transition-colors text-center cursor-pointer flex flex-col items-center gap-4',
            isDragging
              ? 'border-accent bg-accent/5'
              : 'border-border-color hover:border-accent/50 hover:bg-white/5',
            isUploading && 'opacity-50 pointer-events-none',
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".txt,.epub"
            multiple
            onChange={handleFileChange}
          />

          <div className="w-16 h-16 rounded-full bg-brand-800 flex items-center justify-center text-accent shadow-inner">
            {isUploading ? <Loader2 className="w-8 h-8 animate-spin" /> : <UploadCloud className="w-8 h-8" />}
          </div>

          <div>
            <p className="text-lg font-medium text-text-primary">
              {isUploading ? t('bookshelf.uploadAndProcessing') : t('bookshelf.clickOrDrag')}
            </p>
            <p className="text-sm text-text-secondary mt-1 max-w-[250px] mx-auto">
              {isUploading && currentProgressLabel
                ? t('bookshelf.progressDetail', {
                  percent: batchState?.progress.progress ?? 0,
                  stage: currentProgressLabel,
                })
                : t('bookshelf.supportHint')}
            </p>
          </div>

          {isUploading && batchState ? (
            <div className="w-full max-w-[260px] space-y-2">
              {currentFileLabel && (
                <p className="truncate text-xs text-text-secondary" title={currentFileLabel}>
                  {currentFileLabel}
                </p>
              )}
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-200"
                  style={{ width: `${batchState.progress.progress}%` }}
                />
              </div>
              <p className="text-xs text-text-secondary">
                {currentProgressLabel ?? currentStageLabel}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-2 text-xs text-text-secondary">
              <FileText className="w-4 h-4" />
              <span>{t('bookshelf.maxSize')}</span>
            </div>
          )}
        </div>

        {isUploading && (
          <button
            type="button"
            onClick={handleCancelUpload}
            className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-white/5"
          >
            {t('common.actions.cancel')}
          </button>
        )}
      </div>
    </Modal>
  );
}
