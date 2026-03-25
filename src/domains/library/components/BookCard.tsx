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
      className="group flex flex-col gap-3 rounded-xl p-3 hover:bg-white/5 transition-colors"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg shadow-md group-hover:shadow-lg transition-shadow bg-brand-800">
        {novel.hasCover && coverUrl ? (
          <img 
            src={coverUrl}
            alt={novel.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <TxtCover title={novel.title} />
        )}
        
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-brand-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="text-white font-medium px-4 py-2 rounded-full glass backdrop-blur-md">
            {t('common.actions.viewDetails')}
          </span>
        </div>
      </div>
      
      <div className="flex flex-col">
        <h3 className="font-semibold text-text-primary line-clamp-1 group-hover:text-accent transition-colors" title={novel.title}>
          {novel.title}
        </h3>
        {novel.author && (
          <span className="text-sm text-text-secondary line-clamp-1">
            {novel.author}
          </span>
        )}
      </div>
    </Link>
  );
}
