import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ArrowLeft, Bug, ChevronDown, Download, RefreshCw, RotateCcw, Smartphone, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  clearDebugSnapshots,
  clearLogs,
  debugFeatureSubscribe,
  debugSnapshotSubscribe,
  debugSubscribe,
  getDebugFeatureFlags,
  getRecentLogs,
  getDebugSnapshots,
  MAX_LOGS,
  setDebugSnapshot,
  setDebugFeatureEnabled,
  type DebugEntry,
  type DebugSnapshotEntry,
} from '@shared/debug';
import Toggle from '@shared/components/Toggle';
import { cn } from '@shared/utils/cn';
import { db } from '@infra/db';

import {
  triggerDebugInstallPrompt,
  triggerDebugIosInstallHint,
  triggerDebugRetryReaderRestore,
  triggerDebugUpdateToast,
  triggerDebugResetPwaPrompts,
} from './pwaDebugTools';

const CATEGORY_COLORS: Record<string, string> = {
  Debug: 'text-slate-300',
  Reader: 'text-green-400',
  READER: 'text-green-400',
  reader: 'text-green-400',
  Purify: 'text-yellow-400',
  TXT: 'text-blue-400',
  ChapterDetect: 'text-cyan-400',
  Upload: 'text-purple-400',
  'book-import': 'text-purple-400',
  Settings: 'text-orange-400',
  settings: 'text-orange-400',
  AI: 'text-pink-400',
  Analysis: 'text-red-400',
  analysis: 'text-red-400',
  PWA: 'text-sky-400',
  app: 'text-sky-400',
  library: 'text-amber-400',
  storage: 'text-rose-400',
  worker: 'text-indigo-400',
  'character-graph': 'text-cyan-300',
};

const SNAPSHOT_ORDER = [
  'reader-layout',
  'reader-mode-hydration',
  'reader-mode-resolution',
  'reader-mode-switch',
  'reader-position-hydration',
  'reader-position-persist',
  'reader-position-restore',
  'reader-restore',
  'reader-lifecycle',
  'book-import',
  'storage',
];

interface ReaderLayoutDiagnosticSnapshot {
  novelId: number | null;
}

interface ReaderRestoreDiagnosticSnapshot {
  action?: string;
  attempts?: number;
  measuredError?: {
    metric?: string;
    delta?: number;
    tolerance?: number;
  };
  reason?: string;
  retryable?: boolean;
  status?: string;
  target?: {
    chapterIndex?: number;
    mode?: string;
  };
}

interface ReaderLifecycleDiagnosticSnapshot {
  currentState?: string;
  lastEvent?: string | null;
  loadKey?: string | null;
  persistenceStatus?: string;
}

interface StorageDiagnosticSnapshot {
  chapterImagesCount: number;
  chapterRichContentsCount: number;
  currentNovelRenderCacheCount: number | null;
  novelId: number | null;
  quota: number | null;
  readerRenderCacheCount: number;
  usage: number | null;
}

function getDebugEntryKey(entry: DebugEntry): string {
  return `${entry.kind}:${entry.time}:${entry.category}:${entry.message}`;
}

function getDebugSnapshotKey(entry: DebugSnapshotEntry): string {
  return `${entry.key}:${entry.time}`;
}

function formatDiagnosticTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
}

function formatBytes(value: number | null): string {
  if (value == null || Number.isNaN(value)) {
    return '-';
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getSnapshotLabel(
  key: string,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (key) {
    case 'book-import':
      return t('debug.diagnostics.labels.bookImport');
    case 'reader-layout':
      return t('debug.diagnostics.labels.readerLayout');
    case 'storage':
      return t('debug.diagnostics.labels.storage');
    case 'reader-restore':
      return t('debug.diagnostics.labels.readerRestore');
    case 'reader-lifecycle':
      return t('debug.diagnostics.labels.readerLifecycle');
    default:
      return key;
  }
}

function buildSnapshotPreview(
  snapshot: DebugSnapshotEntry,
  t: ReturnType<typeof useTranslation>['t'],
): string[] {
  if (snapshot.key === 'storage') {
    const value = snapshot.value as Partial<StorageDiagnosticSnapshot>;
    return [
      t('debug.diagnostics.preview.storageUsage', {
        quota: formatBytes(value.quota ?? null),
        usage: formatBytes(value.usage ?? null),
      }),
      t('debug.diagnostics.preview.storageCounts', {
        imageCount: value.chapterImagesCount ?? 0,
        renderCacheCount: value.readerRenderCacheCount ?? 0,
        richCount: value.chapterRichContentsCount ?? 0,
      }),
      t('debug.diagnostics.preview.storageNovelCache', {
        count: value.currentNovelRenderCacheCount ?? 0,
      }),
    ];
  }

  if (snapshot.key === 'reader-layout') {
    const value = snapshot.value as Record<string, unknown>;
    return [
      t('debug.diagnostics.preview.readerFormat', {
        format: String(value.contentFormat ?? value.activeContentFormat ?? '-'),
      }),
      t('debug.diagnostics.preview.readerLayout', {
        layout: String(value.layoutFeatureSet ?? value.activeLayoutFeatureSet ?? '-'),
      }),
      t('debug.diagnostics.preview.readerPendingPreheat', {
        count: Number(value.pendingPreheatCount ?? 0),
      }),
    ];
  }

  if (snapshot.key === 'book-import') {
    const value = snapshot.value as Record<string, unknown>;
    const progress = typeof value.progress === 'object' && value.progress ? value.progress as Record<string, unknown> : null;
    return [
      t('debug.diagnostics.preview.importOperation', {
        operation: String(value.operation ?? '-'),
      }),
      t('debug.diagnostics.preview.importFile', {
        file: String(value.currentFileName ?? '-'),
      }),
      t('debug.diagnostics.preview.importStage', {
        stage: String(progress?.stage ?? '-'),
      }),
    ];
  }

  if (snapshot.key === 'reader-restore') {
    const value = snapshot.value as ReaderRestoreDiagnosticSnapshot;
    const { measuredError } = value;
    return [
      t('debug.diagnostics.preview.restoreStatus', {
        status: String(value.status ?? value.action ?? '-'),
      }),
      t('debug.diagnostics.preview.restoreReason', {
        reason: String(value.reason ?? '-'),
      }),
      measuredError
        ? t('debug.diagnostics.preview.restoreError', {
          metric: String(measuredError.metric ?? '-'),
          delta: String(measuredError.delta ?? '-'),
          tolerance: String(measuredError.tolerance ?? '-'),
        })
        : t('debug.diagnostics.preview.restoreAttempts', {
          attempts: value.attempts ?? 0,
          retryable: String(value.retryable ?? false),
        }),
    ];
  }

  if (snapshot.key === 'reader-lifecycle') {
    const value = snapshot.value as ReaderLifecycleDiagnosticSnapshot;
    return [
      t('debug.diagnostics.preview.lifecycleState', {
        state: String(value.currentState ?? '-'),
      }),
      t('debug.diagnostics.preview.lifecycleEvent', {
        event: String(value.lastEvent ?? '-'),
      }),
      t('debug.diagnostics.preview.lifecyclePersistence', {
        status: String(value.persistenceStatus ?? '-'),
        loadKey: String(value.loadKey ?? '-'),
      }),
    ];
  }

  return [];
}

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

export default function DebugPanel() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<DebugEntry[]>(() => getRecentLogs());
  const [snapshots, setSnapshots] = useState<DebugSnapshotEntry[]>(() => getDebugSnapshots());
  const [filter, setFilter] = useState<'all' | 'errors' | 'logs'>('all');
  const [featureFlags, setFeatureFlags] = useState(() => getDebugFeatureFlags());
  const listRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    return debugSubscribe((entry) => {
      setLogs((prev) => {
        const next = [...prev, entry];
        if (next.length > MAX_LOGS) next.splice(0, next.length - MAX_LOGS);
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

  useEffect(() => {
    if (autoScrollRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [logs]);

  const handleScroll = useCallback(() => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40;
  }, []);

  const handleClear = useCallback(() => {
    clearLogs();
    clearDebugSnapshots();
    setLogs([]);
    setSnapshots([]);
  }, []);

  const readerSnapshot = useMemo(() => {
    return snapshots.find((entry) => entry.key === 'reader-layout')?.value as ReaderLayoutDiagnosticSnapshot | undefined;
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
    } satisfies StorageDiagnosticSnapshot);
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

  const visibleLogs = logs.filter((entry) => {
    if (filter === 'errors') return entry.kind === 'error';
    if (filter === 'logs') return entry.kind === 'log';
    return true;
  });

  const orderedSnapshots = useMemo(() => {
    const rankByKey = new Map(SNAPSHOT_ORDER.map((key, index) => [key, index]));
    return [...snapshots].sort((left, right) => {
      const leftRank = rankByKey.get(left.key) ?? SNAPSHOT_ORDER.length;
      const rightRank = rankByKey.get(right.key) ?? SNAPSHOT_ORDER.length;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return right.time - left.time;
    });
  }, [snapshots]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          'fixed bottom-4 right-4 z-[70] w-10 h-10 rounded-full flex items-center justify-center shadow-lg border border-border-color transition-colors',
          'bg-bg-secondary/90 dark:bg-brand-800/90 backdrop-blur-sm hover:bg-bg-secondary dark:hover:bg-brand-800',
        )}
        title={t('debug.panelTitle')}
      >
        <Bug className="w-4 h-4 text-text-primary" />
        {logs.length > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
            {logs.length > 99 ? '99+' : logs.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[70] w-[420px] max-h-[60vh] bg-bg-secondary/95 dark:bg-brand-800/95 backdrop-blur-xl rounded-xl border border-border-color shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-color/50">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-accent" />
          <span className="text-xs font-semibold text-text-primary">
            {t('debug.titleWithCount', { count: logs.length })}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleClear} className="p-1 rounded hover:bg-white/10 text-text-secondary transition-colors" title={t('debug.clearLogs')}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setIsOpen(false)} className="p-1 rounded hover:bg-white/10 text-text-secondary transition-colors">
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 border-b border-border-color/50 px-3 py-2">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={cn(
            'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
            filter === 'all' ? 'bg-accent text-white' : 'bg-white/5 text-text-secondary hover:bg-white/10',
          )}
        >
          {t('debug.filters.all')}
        </button>
        <button
          type="button"
          onClick={() => setFilter('errors')}
          className={cn(
            'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
            filter === 'errors' ? 'bg-red-500 text-white' : 'bg-white/5 text-text-secondary hover:bg-white/10',
          )}
        >
          {t('debug.filters.errors')}
        </button>
        <button
          type="button"
          onClick={() => setFilter('logs')}
          className={cn(
            'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
            filter === 'logs' ? 'bg-brand-700 text-white' : 'bg-white/5 text-text-secondary hover:bg-white/10',
          )}
        >
          {t('debug.filters.logs')}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 border-b border-border-color/50 p-2">
        <div className="col-span-2 flex items-center justify-between rounded-lg border border-border-color/50 px-3 py-2">
          <div className="min-w-0">
            <div className="text-xs font-medium text-text-primary">{t('debug.features.readerTelemetry.label')}</div>
            <div className="text-[10px] text-text-secondary">{t('debug.features.readerTelemetry.description')}</div>
          </div>
          <Toggle
            checked={featureFlags.readerTelemetry}
            onChange={(checked) => {
              setDebugFeatureEnabled('readerTelemetry', checked);
            }}
            className="ml-3"
          />
        </div>
        <button
          onClick={() => window.history.back()}
          className="flex items-center justify-center gap-2 rounded-lg border border-border-color/50 px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-white/10"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('debug.actions.goBack')}
        </button>
        <button
          onClick={triggerDebugInstallPrompt}
          className="flex items-center justify-center gap-2 rounded-lg border border-border-color/50 px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-white/10"
        >
          <Download className="h-3.5 w-3.5" />
          {t('debug.actions.installPrompt')}
        </button>
        <button
          onClick={triggerDebugIosInstallHint}
          className="flex items-center justify-center gap-2 rounded-lg border border-border-color/50 px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-white/10"
        >
          <Smartphone className="h-3.5 w-3.5" />
          {t('debug.actions.iosHint')}
        </button>
        <button
          onClick={triggerDebugUpdateToast}
          className="flex items-center justify-center gap-2 rounded-lg border border-border-color/50 px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-white/10"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('debug.actions.updateToast')}
        </button>
        <button
          onClick={triggerDebugResetPwaPrompts}
          className="flex items-center justify-center gap-2 rounded-lg border border-border-color/50 px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-white/10"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('debug.actions.resetPwa')}
        </button>
        <button
          onClick={triggerDebugRetryReaderRestore}
          className="flex items-center justify-center gap-2 rounded-lg border border-border-color/50 px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-white/10"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('debug.actions.retryReaderRestore')}
        </button>
      </div>
      <div className="border-b border-border-color/50 p-2">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary/80">
            {t('debug.diagnostics.title')}
          </span>
          <span className="text-[10px] text-text-secondary/60">
            {orderedSnapshots.length}
          </span>
        </div>
        <div className="max-h-48 overflow-y-auto pr-1 custom-scrollbar sm:max-h-64">
          <div className="space-y-2">
            {orderedSnapshots.length === 0 && (
              <div className="rounded-lg border border-white/5 bg-black/10 px-3 py-2 text-[11px] text-text-secondary">
                {t('debug.diagnostics.empty')}
              </div>
            )}
            {orderedSnapshots.map((snapshot) => (
              <section
                key={getDebugSnapshotKey(snapshot)}
                className="rounded-lg border border-white/5 bg-black/10 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-semibold text-text-primary">
                    {getSnapshotLabel(snapshot.key, t)}
                  </span>
                  <span className="shrink-0 text-[10px] text-text-secondary/60">
                    {formatDiagnosticTime(snapshot.time)}
                  </span>
                </div>
                <div className="mt-2 space-y-1">
                  {buildSnapshotPreview(snapshot, t).map((line) => (
                    <div key={line} className="text-[10px] text-text-secondary/90">
                      {line}
                    </div>
                  ))}
                </div>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-black/15 p-2 text-[10px] text-text-secondary/90">
                  {JSON.stringify(snapshot.value, null, 2)}
                </pre>
              </section>
            ))}
          </div>
        </div>
      </div>
      <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-2 space-y-0.5 text-[11px] font-mono leading-relaxed custom-scrollbar">
        {visibleLogs.length === 0 && (
          <div className="text-text-secondary text-center py-8">{t('debug.logsEmpty')}</div>
        )}
        {visibleLogs.map((entry) => (
          <div
            key={getDebugEntryKey(entry)}
            className="rounded-lg border border-white/5 bg-black/10 px-2 py-1.5"
          >
            <div className="flex gap-1.5">
              <span className="text-text-secondary/60 shrink-0">{formatTime(entry.time)}</span>
              <span className={cn('shrink-0 font-semibold', CATEGORY_COLORS[entry.category] || 'text-text-secondary')}>
                [{entry.category}]
              </span>
              <span className={cn(
                'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                entry.kind === 'error' ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-text-secondary',
              )}
              >
                {entry.kind}
              </span>
              <span className="text-text-primary/80 break-all">{entry.message}</span>
            </div>

            {entry.kind === 'error' && (
              <details className="mt-2 rounded bg-black/15 p-2 text-[10px] text-text-secondary">
                <summary className="cursor-pointer select-none font-semibold text-text-primary/85">
                  {entry.error.code} · {entry.error.kind}
                  {' · '}
                  {t('debug.errorDetails.retryable', { value: String(entry.error.retryable) })}
                </summary>
                <div className="mt-2 space-y-1 break-all">
                  <div>{t('debug.errorDetails.source', { value: entry.error.source })}</div>
                  <div>{t('debug.errorDetails.userVisible', { value: String(entry.error.userVisible) })}</div>
                  <div>{t('debug.errorDetails.debugVisible', { value: String(entry.error.debugVisible) })}</div>
                  {entry.error.userMessageKey && (
                    <div>{t('debug.errorDetails.messageKey', { value: entry.error.userMessageKey })}</div>
                  )}
                  {entry.error.details && (
                    <pre className="whitespace-pre-wrap text-[10px] text-text-secondary/90">
                      {JSON.stringify(entry.error.details, null, 2)}
                    </pre>
                  )}
                  {entry.error.cause?.message && <div>{t('debug.errorDetails.cause', { value: entry.error.cause.message })}</div>}
                  {entry.error.stack && (
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[10px] text-text-secondary/90">
                      {entry.error.stack}
                    </pre>
                  )}
                </div>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
