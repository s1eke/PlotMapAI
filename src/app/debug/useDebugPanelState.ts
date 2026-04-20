import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type {
  DebugEntry,
  DebugFeatureFlags,
  DebugSnapshotEntry,
} from '@shared/debug';
import {
  MAX_LOGS,
  clearDebugSnapshots,
  clearLogs,
  debugFeatureSubscribe,
  debugSnapshotSubscribe,
  debugSubscribe,
  getDebugFeatureFlags,
  getDebugSnapshots,
  getRecentLogs,
  setDebugSnapshot,
} from '@shared/debug';
import { db } from '@infra/db';

import {
  type DebugWorkspacePageId,
  type ReaderLayoutDiagnosticSnapshot,
  SNAPSHOT_ORDER,
} from './debugPanelShared';

async function getStorageEstimate(): Promise<{ quota?: number; usage?: number } | null> {
  const estimate = navigator.storage?.estimate;
  if (!estimate) {
    return null;
  }

  try {
    return await estimate.call(navigator.storage);
  } catch {
    return null;
  }
}

export interface UseDebugPanelStateParams {
  activePage: DebugWorkspacePageId;
  isOpen: boolean;
  logListRef: RefObject<HTMLDivElement | null>;
}

export interface UseDebugPanelStateResult {
  activeFlagCount: number;
  activeFlags: Array<keyof DebugFeatureFlags>;
  errorLogs: DebugEntry[];
  errorCount: number;
  featureFlags: DebugFeatureFlags;
  handleClear: () => void;
  handleLogScroll: () => void;
  logCount: number;
  logs: DebugEntry[];
  orderedSnapshots: DebugSnapshotEntry[];
  snapshotCount: number;
}

export function useDebugPanelState({
  activePage,
  isOpen,
  logListRef,
}: UseDebugPanelStateParams): UseDebugPanelStateResult {
  const [logs, setLogs] = useState<DebugEntry[]>(() => getRecentLogs());
  const [snapshots, setSnapshots] = useState<DebugSnapshotEntry[]>(() => getDebugSnapshots());
  const [featureFlags, setFeatureFlags] = useState(() => getDebugFeatureFlags());
  const autoScrollRef = useRef(true);

  useEffect(() => {
    return debugSubscribe((entry) => {
      setLogs((prev) => {
        const next = [...prev, entry];
        if (next.length > MAX_LOGS) {
          next.splice(0, next.length - MAX_LOGS);
        }
        return next;
      });
    });
  }, []);

  useEffect(() => {
    return debugFeatureSubscribe((nextFlags) => {
      setFeatureFlags(nextFlags);
    });
  }, []);

  useEffect(() => {
    return debugSnapshotSubscribe((entries) => {
      setSnapshots(entries);
    });
  }, []);

  const errorLogs = useMemo(() => {
    return logs.filter((entry) => entry.kind === 'error');
  }, [logs]);
  let activeLogEntries: DebugEntry[] | null = null;
  if (activePage === 'errors') {
    activeLogEntries = errorLogs;
  } else if (activePage === 'logs') {
    activeLogEntries = logs;
  }

  useEffect(() => {
    const logElement = logListRef.current;
    if (!isOpen || !autoScrollRef.current || !logElement || !activeLogEntries) {
      return;
    }

    logElement.scrollTop = logElement.scrollHeight;
  }, [activeLogEntries, isOpen, logListRef]);

  const handleLogScroll = useCallback(() => {
    if (!logListRef.current) {
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = logListRef.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40;
  }, [logListRef]);

  const handleClear = useCallback(() => {
    clearLogs();
    clearDebugSnapshots();
    setLogs([]);
    setSnapshots([]);
  }, []);

  const readerSnapshot = useMemo(() => {
    return snapshots.find((entry) => entry.key === 'reader-layout')?.value as
      | ReaderLayoutDiagnosticSnapshot
      | undefined;
  }, [snapshots]);
  const readerNovelId = typeof readerSnapshot?.novelId === 'number'
    ? readerSnapshot.novelId
    : null;

  const refreshStorageDiagnostics = useCallback(async (): Promise<void> => {
    const estimate = await getStorageEstimate();
    const [
      readerRenderCacheCount,
      chapterRichContentsCount,
      chapterImagesCount,
      currentNovelRenderCacheCount,
    ] = await Promise.all([
      db.readerRenderCache.count(),
      db.chapterRichContents.count(),
      db.chapterImages.count(),
      readerNovelId == null
        ? Promise.resolve(null)
        : db.readerRenderCache.where('novelId').equals(readerNovelId).count(),
    ]);

    setDebugSnapshot('storage', {
      chapterImagesCount,
      chapterRichContentsCount,
      currentNovelRenderCacheCount,
      novelId: readerNovelId,
      quota: estimate?.quota ?? null,
      readerRenderCacheCount,
      usage: estimate?.usage ?? null,
    });
  }, [readerNovelId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const refreshDiagnostics = (): void => {
      refreshStorageDiagnostics().catch(() => undefined);
    };

    refreshDiagnostics();
    const timer = window.setInterval(() => {
      refreshDiagnostics();
    }, 10_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isOpen, refreshStorageDiagnostics]);

  const orderedSnapshots = useMemo(() => {
    const rankByKey = new Map<string, number>(
      SNAPSHOT_ORDER.map((key, index) => [key, index]),
    );
    return [...snapshots].sort((left, right) => {
      const leftRank = rankByKey.get(left.key) ?? SNAPSHOT_ORDER.length;
      const rightRank = rankByKey.get(right.key) ?? SNAPSHOT_ORDER.length;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return right.time - left.time;
    });
  }, [snapshots]);

  const activeFlags = useMemo(() => {
    return Object.entries(featureFlags)
      .filter(([, enabled]) => enabled)
      .map(([flag]) => flag as keyof DebugFeatureFlags);
  }, [featureFlags]);
  const errorCount = useMemo(() => {
    return logs.reduce((count, entry) => count + (entry.kind === 'error' ? 1 : 0), 0);
  }, [logs]);

  return {
    activeFlagCount: activeFlags.length,
    activeFlags,
    errorLogs,
    errorCount,
    featureFlags,
    handleClear,
    handleLogScroll,
    logCount: logs.length,
    logs,
    orderedSnapshots,
    snapshotCount: orderedSnapshots.length,
  };
}
