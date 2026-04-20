import type { TFunction } from 'i18next';
import type { DebugEntry, DebugSnapshotEntry } from '@shared/debug';

export const CATEGORY_COLORS: Record<string, string> = {
  Debug: 'text-slate-300',
  Reader: 'text-green-300',
  READER: 'text-green-300',
  reader: 'text-green-300',
  Purify: 'text-yellow-300',
  TXT: 'text-blue-300',
  ChapterDetect: 'text-cyan-300',
  Upload: 'text-fuchsia-300',
  'book-import': 'text-fuchsia-300',
  Settings: 'text-orange-300',
  settings: 'text-orange-300',
  AI: 'text-pink-300',
  Analysis: 'text-rose-300',
  analysis: 'text-rose-300',
  PWA: 'text-sky-300',
  app: 'text-sky-300',
  library: 'text-amber-300',
  storage: 'text-red-300',
  worker: 'text-indigo-300',
  'character-graph': 'text-cyan-200',
};

export const SNAPSHOT_ORDER = [
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
] as const;

export type DebugWorkspacePageId = 'logs' | 'errors' | 'diagnostics' | 'tools';

export interface ReaderLayoutDiagnosticSnapshot {
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

export function getDebugEntryKey(entry: DebugEntry): string {
  return `${entry.kind}:${entry.time}:${entry.category}:${entry.message}`;
}

export function getDebugSnapshotKey(entry: DebugSnapshotEntry): string {
  return `${entry.key}:${entry.time}`;
}

export function formatClockTime(ts: number): string {
  const date = new Date(ts);
  return `${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}.${date.getMilliseconds().toString().padStart(3, '0')}`;
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

export function getSnapshotLabel(key: string, t: TFunction): string {
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

export function buildSnapshotPreview(
  snapshot: DebugSnapshotEntry,
  t: TFunction,
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
    const progress = typeof value.progress === 'object' && value.progress
      ? value.progress as Record<string, unknown>
      : null;
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
