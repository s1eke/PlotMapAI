import type { ReactElement } from 'react';

import { useParams } from 'react-router-dom';

import { applicationReaderContentRuntime } from '@application/services/readerContentRuntime';
import { ReaderProvider } from '@domains/reader-shell';

import ReaderScreen from './ReaderScreen';
import { useReaderPageViewModel } from './useReaderPageViewModel';

function ReaderPageContent({ novelId }: { novelId: number }): ReactElement {
  const viewModel = useReaderPageViewModel(novelId);

  return <ReaderScreen viewModel={viewModel} />;
}

export default function ReaderPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const novelId = Number(id);

  return (
    <ReaderProvider contentRuntime={applicationReaderContentRuntime} novelId={novelId}>
      <ReaderPageContent novelId={novelId} />
    </ReaderProvider>
  );
}
