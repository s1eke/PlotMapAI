import type { ReactElement } from 'react';
import type { BookDetailContentSummary } from './types';

import { FileText, Hash } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface BookDetailStatsProps {
  chapterCount: number;
  contentSummary: BookDetailContentSummary;
  fileType: string;
  totalWords: number;
}

function formatWordCount(totalWords: number): string {
  return `${(totalWords / 1000).toFixed(1)}k`;
}

export default function BookDetailStats({
  chapterCount,
  contentSummary,
  fileType,
  totalWords,
}: BookDetailStatsProps): ReactElement {
  const { t } = useTranslation();
  const contentFormatLabel = contentSummary.contentFormat === 'rich'
    ? t('bookDetail.contentFormatRich')
    : t('bookDetail.contentFormatPlain');
  const contentVersionLabel = contentSummary.contentVersion == null
    ? '-'
    : `v${contentSummary.contentVersion}`;
  const importFormatVersionLabel = contentSummary.importFormatVersion == null
    ? '-'
    : `v${contentSummary.importFormatVersion}`;
  const lastParsedAtLabel = contentSummary.lastParsedAt
    ? new Date(contentSummary.lastParsedAt).toLocaleString()
    : '-';

  return (
    <div className="mb-8 flex flex-wrap items-center gap-4">
      <span className="inline-flex flex-col rounded-lg border border-border-color/20 bg-muted-bg px-4 py-2">
        <span className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-text-secondary">
          <FileText className="h-3 w-3" /> {t('bookDetail.format')}
        </span>
        <span className="font-semibold text-text-primary">{fileType.toUpperCase()}</span>
      </span>
      <span className="inline-flex flex-col rounded-lg border border-border-color/20 bg-muted-bg px-4 py-2">
        <span className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-text-secondary">
          <Hash className="h-3 w-3" /> {t('bookDetail.chapters')}
        </span>
        <span className="font-semibold text-text-primary">{chapterCount}</span>
      </span>
      <span className="inline-flex flex-col rounded-lg border border-border-color/20 bg-muted-bg px-4 py-2">
        <span className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-text-secondary">
          <FileText className="h-3 w-3" /> {t('bookDetail.wordCount')}
        </span>
        <span className="font-semibold text-text-primary">{formatWordCount(totalWords)}</span>
      </span>
      <span className="inline-flex flex-col rounded-lg border border-border-color/20 bg-muted-bg px-4 py-2">
        <span className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-secondary">
          {t('bookDetail.contentFormat')}
        </span>
        <span className="font-semibold text-text-primary">{contentFormatLabel}</span>
      </span>
      <span className="inline-flex flex-col rounded-lg border border-border-color/20 bg-muted-bg px-4 py-2">
        <span className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-secondary">
          {t('bookDetail.contentVersion')}
        </span>
        <span className="font-semibold text-text-primary">{contentVersionLabel}</span>
      </span>
      <span className="inline-flex flex-col rounded-lg border border-border-color/20 bg-muted-bg px-4 py-2">
        <span className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-secondary">
          {t('bookDetail.importFormatVersion')}
        </span>
        <span className="font-semibold text-text-primary">{importFormatVersionLabel}</span>
      </span>
      <span className="inline-flex flex-col rounded-lg border border-border-color/20 bg-muted-bg px-4 py-2">
        <span className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-secondary">
          {t('bookDetail.lastParsedAt')}
        </span>
        <span className="font-semibold text-text-primary">{lastParsedAtLabel}</span>
      </span>
    </div>
  );
}
