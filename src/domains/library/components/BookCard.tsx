import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { appPaths } from '@app/router/paths';

import { libraryApi } from '../api/libraryApi';
import type { NovelView } from '../api/libraryApi';
import TxtCover from './TxtCover';

interface BookCardProps {
  novel: NovelView;
}

export default function BookCard({ novel }: BookCardProps) {
  const { t } = useTranslation();
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!novel.hasCover) return;
    let revoked = false;
    libraryApi.getCoverUrl(novel.id).then(url => {
      if (!revoked) setCoverUrl(url);
    });
    return () => { revoked = true; };
  }, [novel.id, novel.hasCover]);

  return (
    <Link
      to={appPaths.novel(novel.id)}
      className="group flex h-full touch-manipulation flex-col gap-2 rounded-2xl p-1.5 transition-all duration-200 active:scale-[0.98] active:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary sm:gap-3 sm:rounded-xl sm:p-2.5 sm:hover:bg-white/5"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[1rem] bg-brand-800 shadow-md transition-shadow duration-200 group-active:shadow-sm sm:rounded-lg sm:group-hover:shadow-lg">
        {novel.hasCover && coverUrl ? (
          <img
            src={coverUrl}
            alt={novel.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <TxtCover title={novel.title} />
        )}

        <div className="absolute inset-0 hidden items-center justify-center bg-brand-900/40 opacity-0 transition-opacity md:flex md:group-hover:opacity-100">
          <span className="text-white font-medium px-4 py-2 rounded-full glass backdrop-blur-md">
            {t('common.actions.viewDetails')}
          </span>
        </div>
      </div>

      <div className="min-w-0 flex flex-1 flex-col">
        <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-text-primary transition-colors sm:line-clamp-1 sm:text-base sm:group-hover:text-accent" title={novel.title}>
          {novel.title}
        </h3>
        {novel.author && (
          <span className="mt-0.5 line-clamp-1 text-xs text-text-secondary sm:text-sm">
            {novel.author}
          </span>
        )}
      </div>
    </Link>
  );
}
