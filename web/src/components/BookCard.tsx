import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Novel } from '../api/novels';
import TxtCover from './TxtCover';

interface BookCardProps {
  novel: Novel;
}

export default function BookCard({ novel }: BookCardProps) {
  const { t } = useTranslation();
  return (
    <Link 
      to={`/novel/${novel.id}`}
      className="group flex flex-col gap-3 rounded-xl p-3 hover:bg-white/5 transition-colors"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg shadow-md group-hover:shadow-lg transition-shadow bg-brand-800">
        {novel.hasCover ? (
          <img 
            src={`/api/novels/${novel.id}/cover`} 
            alt={novel.title}
            className="w-full h-full object-cover"
            loading="lazy"
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
