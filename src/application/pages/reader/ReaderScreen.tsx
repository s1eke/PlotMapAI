import type { ReactElement } from 'react';

import { ReaderPageLayout } from '@domains/reader-shell';

import type { ReaderPageViewModel } from './types';

interface ReaderScreenProps {
  viewModel: ReaderPageViewModel;
}

export default function ReaderScreen({
  viewModel,
}: ReaderScreenProps): ReactElement {
  return <ReaderPageLayout {...viewModel} />;
}
