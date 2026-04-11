import type { ReactElement } from 'react';

import { useTranslation } from 'react-i18next';

interface BookDetailHeroProps {
  author: string;
  title: string;
}

export default function BookDetailHero({
  author,
  title,
}: BookDetailHeroProps): ReactElement {
  const { t } = useTranslation();

  return (
    <div className="mb-6">
      <h1 className="mb-2 text-3xl font-bold tracking-tight text-text-primary md:text-4xl">
        {title}
      </h1>
      {author ? (
        <p className="text-xl text-text-secondary">
          {t('bookDetail.byAuthor', { author })}
        </p>
      ) : null}
    </div>
  );
}
