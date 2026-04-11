import type { ReactElement } from 'react';

import { useParams } from 'react-router-dom';

import BookDetailScreen from './BookDetailScreen';
import { useBookDetailPageViewModel } from './useBookDetailPageViewModel';

interface BookDetailPageProps {
  novelId: number;
}

function BookDetailPageContent({ novelId }: BookDetailPageProps): ReactElement {
  const viewModel = useBookDetailPageViewModel(novelId);

  return <BookDetailScreen viewModel={viewModel} />;
}

export default function BookDetailPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const novelId = Number(id);

  return <BookDetailPageContent novelId={novelId} />;
}
