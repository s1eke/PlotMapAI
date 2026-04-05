import type { ReactElement } from 'react';
import type { AppError } from '@shared/errors';
import type { BookImportProgress } from '@domains/book-import';

import { BookOpen, Share2, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useRef } from 'react';
import { translateAppError } from '@shared/errors';

import {
  BookDetailActionButton,
  PRIMARY_DETAIL_ACTION_CLASS,
  TxtCover,
} from '@domains/library';

import type { BookDetailAnalysisActionButtonModel } from './types';

interface BookDetailActionPanelProps {
  currentReparseFileName: string | null;
  characterGraphHref: string;
  coverUrl: string | null;
  hasCover: boolean;
  novelTitle: string;
  onDeleteRequested: () => void;
  onReparseFilesSelected: (files: FileList | null) => void | Promise<void>;
  primaryAction: BookDetailAnalysisActionButtonModel | null;
  reparseAccept: string;
  reparseError: AppError | null;
  reparseMessage: string | null;
  reparseProgress: BookImportProgress | null;
  reparsing: boolean;
  readerHref: string;
  restartAction: BookDetailAnalysisActionButtonModel | null;
}

function buildReparseProgressLabel(
  progress: BookImportProgress,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  const stageLabel = t(`bookshelf.workerStages.${progress.stage}`);
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

export default function BookDetailActionPanel({
  currentReparseFileName,
  characterGraphHref,
  coverUrl,
  hasCover,
  novelTitle,
  onDeleteRequested,
  onReparseFilesSelected,
  primaryAction,
  reparseAccept,
  reparseError,
  reparseMessage,
  reparseProgress,
  reparsing,
  readerHref,
  restartAction,
}: BookDetailActionPanelProps): ReactElement {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reparseProgressLabel = reparseProgress
    ? buildReparseProgressLabel(reparseProgress, t)
    : null;

  return (
    <div className="flex w-full shrink-0 flex-col gap-6 md:w-64">
      <div className="mx-auto aspect-[2/3] w-full max-w-[240px] overflow-hidden rounded-xl border border-border-color/20 bg-muted-bg shadow-xl">
        {hasCover && coverUrl ? (
          <img
            src={coverUrl}
            alt={novelTitle}
            className="h-full w-full object-cover"
          />
        ) : (
          <TxtCover title={novelTitle} />
        )}
      </div>

      <div className="flex flex-col gap-3">
        <Link
          to={readerHref}
          className={`${PRIMARY_DETAIL_ACTION_CLASS} bg-accent hover:bg-accent-hover`}
        >
          <BookOpen className="h-5 w-5" />
          {t('common.actions.startReading')}
        </Link>

        <Link
          to={characterGraphHref}
          className={`${PRIMARY_DETAIL_ACTION_CLASS} bg-brand-700 hover:bg-brand-600`}
        >
          <Share2 className="h-5 w-5" />
          {t('bookDetail.characterGraphEntry')}
        </Link>

        {primaryAction ? <BookDetailActionButton {...primaryAction} /> : null}
        {restartAction ? <BookDetailActionButton {...restartAction} /> : null}

        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept={reparseAccept}
          onChange={(event) => {
            const input = event.currentTarget;
            const { files } = input;

            Promise.resolve(onReparseFilesSelected(files)).catch(() => undefined);
            input.value = '';
          }}
        />

        <button
          type="button"
          onClick={() => {
            fileInputRef.current?.click();
          }}
          disabled={reparsing}
          className={`${PRIMARY_DETAIL_ACTION_CLASS} bg-[#4f6f5f] hover:bg-[#456252]`}
        >
          {reparsing ? t('bookshelf.uploadAndProcessing') : t('bookDetail.reparseAction')}
        </button>

        <div className="rounded-xl border border-border-color/20 bg-muted-bg/45 px-4 py-3 text-sm text-text-secondary">
          <p>{t('bookDetail.reparseHint')}</p>
          {currentReparseFileName ? (
            <p className="mt-2 truncate text-xs text-text-secondary/80" title={currentReparseFileName}>
              {currentReparseFileName}
            </p>
          ) : null}
          {reparseProgress ? (
            <div className="mt-3 space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-black/20">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-200"
                  style={{ width: `${reparseProgress.progress}%` }}
                />
              </div>
              <p className="text-xs text-text-secondary">
                {reparseProgressLabel}
                {' · '}
                {reparseProgress.progress}%
              </p>
            </div>
          ) : null}
          {reparseMessage ? (
            <p className="mt-3 text-xs text-text-primary">{reparseMessage}</p>
          ) : null}
          {reparseError ? (
            <p className="mt-3 text-xs text-red-300">
              {translateAppError(reparseError, t, 'bookDetail.reparseFailed')}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onDeleteRequested}
          className="mt-1 inline-flex w-fit items-center gap-2 self-center rounded-full px-3 py-1.5 text-xs text-text-secondary/80 transition-colors hover:bg-red-500/6 hover:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t('bookDetail.deleteBook')}
        </button>
      </div>
    </div>
  );
}
