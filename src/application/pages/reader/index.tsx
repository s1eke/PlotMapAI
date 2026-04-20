import type { ReactElement } from 'react';

import { useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';

import { applicationReaderContentRuntime } from '@application/services/readerContentRuntime';
import { ReaderProvider } from '@domains/reader-shell';
import {
  registerReaderTraceTools,
  setReaderTraceNovelId,
  syncReaderTraceEnabledFromSearch,
} from '@shared/reader-trace';

import ReaderScreen from './ReaderScreen';
import { useReaderPageViewModel } from './useReaderPageViewModel';

function ReaderPageContent({ novelId }: { novelId: number }): ReactElement {
  const location = useLocation();
  const viewModel = useReaderPageViewModel(novelId);

  useEffect(() => {
    setReaderTraceNovelId(novelId);
    syncReaderTraceEnabledFromSearch(location.search);

    return () => {
      setReaderTraceNovelId(null);
    };
  }, [location.search, novelId]);

  useEffect(() => {
    return registerReaderTraceTools();
  }, []);

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
