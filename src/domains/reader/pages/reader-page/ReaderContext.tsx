/* eslint-disable react-refresh/only-export-components */

import type {
  Dispatch,
  MutableRefObject,
  ReactNode,
  SetStateAction,
} from 'react';
import type {
  ReaderMode,
  ReaderRestoreTarget,
  StoredReaderState,
} from '../../reader-session';

import {
  ReaderUiBridgeContextProvider,
  ReaderUiBridgeProvider,
  useReaderUiBridge,
  type ReaderUiBridgeValue,
} from '../../reader-ui';

interface ReaderProviderProps {
  children: ReactNode;
  novelId: number;
}

interface LegacyReaderContextFields {
  novelId?: number;
  chapterIndex?: number;
  lastContentMode?: 'scroll' | 'paged';
  mode?: ReaderMode;
  pendingRestoreTarget?: ReaderRestoreTarget | null;
  viewMode?: 'original' | 'summary';
  isPagedMode?: boolean;
  setChapterIndex?: Dispatch<SetStateAction<number>>;
  setMode?: Dispatch<SetStateAction<ReaderMode>>;
  latestReaderStateRef?: MutableRefObject<StoredReaderState>;
  hasUserInteractedRef?: MutableRefObject<boolean>;
  markUserInteracted?: () => void;
  persistReaderState?: (
    nextState: StoredReaderState,
    options?: { flush?: boolean },
  ) => void;
  loadPersistedReaderState?: () => Promise<StoredReaderState>;
}

export interface ReaderContextValue extends ReaderUiBridgeValue, LegacyReaderContextFields {}

interface ReaderContextProviderProps {
  children: ReactNode;
  value: ReaderContextValue;
}

export function ReaderContextProvider({
  children,
  value,
}: ReaderContextProviderProps) {
  return (
    <ReaderUiBridgeContextProvider value={value}>
      {children}
    </ReaderUiBridgeContextProvider>
  );
}

export function useReaderContext(): ReaderContextValue {
  return useReaderUiBridge() as ReaderContextValue;
}

export function ReaderProvider({
  children,
  novelId,
}: ReaderProviderProps) {
  return <ReaderUiBridgeProvider key={novelId}>{children}</ReaderUiBridgeProvider>;
}
