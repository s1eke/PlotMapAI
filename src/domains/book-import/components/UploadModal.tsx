import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { UploadCloud, FileText, Loader2 } from 'lucide-react';
import { reportAppError } from '@app/debug/service';
import {
  AppErrorCode,
  createAppError,
  toAppError,
  translateAppError,
  type AppError,
} from '@shared/errors';

import Modal from '@shared/components/Modal';
import { cn } from '@shared/utils/cn';

import { bookImportApi } from '../api/bookImportApi';
import type { BookImportProgress } from '../services/progress';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function UploadModal({ isOpen, onClose, onSuccess }: UploadModalProps) {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [progress, setProgress] = useState<BookImportProgress | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const currentStageLabel = progress ? t(`bookshelf.workerStages.${progress.stage}`) : null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFile = async (file: File) => {
    // Validate extension
    const name = file.name.toLowerCase();
    if (!name.endsWith('.txt') && !name.endsWith('.epub')) {
      setError(createAppError({
        code: AppErrorCode.UNSUPPORTED_FILE_TYPE,
        kind: 'unsupported',
        source: 'book-import',
        userMessageKey: 'bookshelf.invalidType',
        debugMessage: 'Only .txt and .epub files are supported',
      }));
      return;
    }

    if (file.size > 100 * 1024 * 1024) { // 100MB
      setError(createAppError({
        code: AppErrorCode.BOOK_IMPORT_FAILED,
        kind: 'validation',
        source: 'book-import',
        userMessageKey: 'bookshelf.sizeLimit',
        debugMessage: 'File size must be less than 100MB',
        debugVisible: false,
      }));
      return;
    }

    setError(null);
    setIsUploading(true);
    setProgress({ progress: 0, stage: 'hashing' });
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    try {
      await bookImportApi.importBook(file, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      onSuccess();
      onClose();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError(null);
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
      }
    } finally {
      abortControllerRef.current = null;
      setIsUploading(false);
      setProgress(null);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
            "border-2 border-dashed rounded-xl p-8 transition-colors text-center cursor-pointer flex flex-col items-center gap-4",
            isDragging 
              ? "border-accent bg-accent/5" 
              : "border-border-color hover:border-accent/50 hover:bg-white/5",
            isUploading && "opacity-50 pointer-events-none"
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
              {isUploading && currentStageLabel
                ? t('bookshelf.progressDetail', { percent: progress?.progress ?? 0, stage: currentStageLabel })
                : t('bookshelf.supportHint')}
            </p>
          </div>

          {isUploading && progress ? (
            <div className="w-full max-w-[260px] space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-200"
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
              <p className="text-xs text-text-secondary">{currentStageLabel}</p>
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
