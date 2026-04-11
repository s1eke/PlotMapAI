import type { ComponentProps } from 'react';
import type { AppError } from '@shared/errors';
import type { ReaderImageViewerProps } from '@domains/reader-media';

import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { ReaderImageViewer } from '@domains/reader-media';
import { AppErrorCode, translateAppError } from '@shared/errors';
import { cn } from '@shared/utils/cn';
import ReaderSidebar from '../../components/reader/ReaderSidebar';
import ReaderToolbar from '../../components/ReaderToolbar';
import ReaderTopBar from '../../components/reader/ReaderTopBar';
import ReaderViewport from '../../components/reader/ReaderViewport';

interface ReaderReparseProgress {
  current?: number;
  detail?: string;
  progress: number;
  stage: string;
  total?: number;
}

export interface ReaderReparseRecoveryProps {
  accept: string;
  actionError: AppError | null;
  actionMessage: string | null;
  isReparsing: boolean;
  onFilesSelected: (files: FileList | null) => void | Promise<void>;
  progress: ReaderReparseProgress | null;
  visible: boolean;
}

function buildReparseProgressLabel(
  progress: ReaderReparseProgress,
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

export interface ReaderPageLayoutProps {
  backHref: string;
  imageViewerProps: ReaderImageViewerProps;
  pageBgClassName: string;
  readerError: AppError | null;
  reparseRecovery: ReaderReparseRecoveryProps;
  sidebarProps: ComponentProps<typeof ReaderSidebar>;
  toolbarProps?: ComponentProps<typeof ReaderToolbar>;
  topBarProps: ComponentProps<typeof ReaderTopBar>;
  viewportProps: ComponentProps<typeof ReaderViewport>;
}

export default function ReaderPageLayout({
  backHref,
  imageViewerProps,
  pageBgClassName,
  readerError,
  reparseRecovery,
  sidebarProps,
  toolbarProps,
  topBarProps,
  viewportProps,
}: ReaderPageLayoutProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (readerError) {
    const isStructuredContentMissing =
      readerError.code === AppErrorCode.CHAPTER_STRUCTURED_CONTENT_MISSING
      && reparseRecovery.visible;
    const reparseProgressLabel = reparseRecovery.progress
      ? buildReparseProgressLabel(reparseRecovery.progress, t)
      : null;

    return (
      <div className={cn('flex h-screen w-full items-center justify-center px-6 transition-colors duration-300', pageBgClassName)}>
        <div className="w-full max-w-lg rounded-3xl border border-red-500/20 bg-card-bg/90 p-8 text-center shadow-xl">
          {isStructuredContentMissing ? (
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept={reparseRecovery.accept}
              onChange={(event) => {
                const input = event.currentTarget;
                const { files } = input;
                Promise.resolve(reparseRecovery.onFilesSelected(files)).catch(() => undefined);
                input.value = '';
              }}
            />
          ) : null}
          <p className="text-lg font-semibold text-text-primary">
            {translateAppError(readerError, t, 'reader.loadError')}
          </p>
          {isStructuredContentMissing ? (
            <p className="mt-3 text-sm text-text-secondary">
              {t('reader.reparse.description')}
            </p>
          ) : null}
          {isStructuredContentMissing && reparseRecovery.progress ? (
            <div className="mt-6 space-y-2 rounded-2xl border border-border-color/20 bg-muted-bg/45 px-4 py-3 text-left">
              <div className="h-2 overflow-hidden rounded-full bg-black/20">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-200"
                  style={{ width: `${reparseRecovery.progress.progress}%` }}
                />
              </div>
              <p className="text-xs text-text-secondary">
                {reparseProgressLabel}
                {' · '}
                {reparseRecovery.progress.progress}%
              </p>
            </div>
          ) : null}
          {isStructuredContentMissing && reparseRecovery.actionMessage ? (
            <p className="mt-3 text-sm text-text-primary">{reparseRecovery.actionMessage}</p>
          ) : null}
          {isStructuredContentMissing && reparseRecovery.actionError ? (
            <p className="mt-3 text-sm text-red-300">
              {translateAppError(reparseRecovery.actionError, t, 'reader.reparse.failed')}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {isStructuredContentMissing ? (
              <button
                type="button"
                disabled={reparseRecovery.isReparsing}
                onClick={() => {
                  fileInputRef.current?.click();
                }}
                className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
              >
                {reparseRecovery.isReparsing
                  ? t('bookshelf.uploadAndProcessing')
                  : t('reader.reparse.action')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              >
                {t('common.actions.retry')}
              </button>
            )}
            <Link
              to={backHref}
              className="rounded-xl border border-border-color/30 px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-white/5"
            >
              {t('reader.goBack')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex h-screen w-full overflow-hidden transition-colors duration-300', pageBgClassName)}>
      <ReaderSidebar {...sidebarProps} />

      <main className="flex-1 flex flex-col min-w-0 relative text-text-primary">
        <ReaderTopBar {...topBarProps} />
        <ReaderViewport {...viewportProps} />
        {toolbarProps ? <ReaderToolbar {...toolbarProps} /> : null}
        <ReaderImageViewer {...imageViewerProps} />
      </main>
    </div>
  );
}
