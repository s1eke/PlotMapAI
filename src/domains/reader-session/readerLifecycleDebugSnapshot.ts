import type { ReaderSessionState } from '@shared/contracts/reader';

import { setDebugSnapshot } from '@shared/debug';

interface ReaderLifecycleSnapshot {
  currentState: ReaderSessionState['restoreStatus'];
  lastEvent: ReaderSessionState['lifecycleLastEvent'];
  loadKey: ReaderSessionState['lifecycleLoadKey'];
  pendingRestoreTarget: {
    chapterIndex: number;
    mode: 'scroll' | 'paged' | 'summary';
  } | null;
  lastRestoreResult: ReaderSessionState['lastRestoreResult'];
  persistenceStatus: ReaderSessionState['persistenceStatus'];
  lastPersistenceFailure: ReaderSessionState['lastPersistenceFailure'];
}

export function writeReaderLifecycleDebugSnapshot(state: ReaderSessionState): void {
  const snapshot: ReaderLifecycleSnapshot = {
    currentState: state.restoreStatus,
    lastEvent: state.lifecycleLastEvent,
    loadKey: state.lifecycleLoadKey,
    pendingRestoreTarget: state.pendingRestoreTarget
      ? {
        chapterIndex: state.pendingRestoreTarget.chapterIndex,
        mode: state.pendingRestoreTarget.mode,
      }
      : null,
    lastRestoreResult: state.lastRestoreResult,
    persistenceStatus: state.persistenceStatus,
    lastPersistenceFailure: state.lastPersistenceFailure,
  };

  setDebugSnapshot('reader-lifecycle', snapshot);
}
