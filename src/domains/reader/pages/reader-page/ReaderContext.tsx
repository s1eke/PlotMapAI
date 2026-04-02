/* eslint-disable react-refresh/only-export-components */

import type { ReactNode } from 'react';

import { useEffect } from 'react';

import { flushAppThemePersistence, setAppThemeNovelId } from '@shared/stores/appThemeStore';
import {
  ReaderUiBridgeContextProvider,
  ReaderUiBridgeProvider,
  useReaderUiBridge,
  type ReaderUiBridgeValue,
} from '../../reader-ui';
import {
  flushReaderPreferencesPersistence,
  setReaderPreferencesNovelId,
} from '../../hooks/readerPreferencesStore';
import { flushPersistence } from '../../hooks/sessionStore';

interface ReaderProviderProps {
  children: ReactNode;
  novelId: number;
}

export interface ReaderContextValue extends ReaderUiBridgeValue {}

interface ReaderContextProviderProps {
  children: ReactNode;
  value: ReaderContextValue;
}

function ReaderPersistenceBoundary({ novelId, children }: ReaderProviderProps) {
  const { preparePersistenceFlushRef } = useReaderUiBridge();

  useEffect(() => {
    setReaderPreferencesNovelId(novelId);
    setAppThemeNovelId(novelId);
  }, [novelId]);

  useEffect(() => {
    const flushReaderPersistence = async (): Promise<void> => {
      preparePersistenceFlushRef.current();
      await Promise.all([
        flushPersistence(),
        flushReaderPreferencesPersistence(),
        flushAppThemePersistence(),
      ]).catch(() => undefined);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushReaderPersistence().catch(() => undefined);
      }
    };

    const handlePageHide = () => {
      flushReaderPersistence().catch(() => undefined);
    };

    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushReaderPersistence().catch(() => undefined);
    };
  }, [preparePersistenceFlushRef]);

  return children;
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
  return useReaderUiBridge();
}

export function ReaderProvider({
  children,
  novelId,
}: ReaderProviderProps) {
  return (
    <ReaderUiBridgeProvider key={novelId}>
      <ReaderPersistenceBoundary novelId={novelId}>
        {children}
      </ReaderPersistenceBoundary>
    </ReaderUiBridgeProvider>
  );
}
