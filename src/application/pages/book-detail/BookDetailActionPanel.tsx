import type { ReactElement } from 'react';

import { BookOpen, Share2, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import {
  BookDetailActionButton,
  PRIMARY_DETAIL_ACTION_CLASS,
  TxtCover,
} from '@domains/library';

import type { BookDetailAnalysisActionButtonModel } from './types';

interface BookDetailActionPanelProps {
  characterGraphHref: string;
  coverUrl: string | null;
  hasCover: boolean;
  novelTitle: string;
  onDeleteRequested: () => void;
  primaryAction: BookDetailAnalysisActionButtonModel | null;
  readerHref: string;
  restartAction: BookDetailAnalysisActionButtonModel | null;
}

export default function BookDetailActionPanel({
  characterGraphHref,
  coverUrl,
  hasCover,
  novelTitle,
  onDeleteRequested,
  primaryAction,
  readerHref,
  restartAction,
}: BookDetailActionPanelProps): ReactElement {
  const { t } = useTranslation();

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
