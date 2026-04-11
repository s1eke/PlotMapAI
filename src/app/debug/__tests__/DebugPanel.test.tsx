import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DebugPanel from '../DebugPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string | number>) => {
      const translations: Record<string, string> = {
        'debug.panelTitle': 'Debug Panel',
        'debug.titleWithCount': 'Debug ({{count}})',
        'debug.clearLogs': 'Clear logs',
        'debug.filters.all': 'All',
        'debug.filters.errors': 'Errors',
        'debug.filters.logs': 'Logs',
        'debug.features.readerTelemetry.label': 'Reader Telemetry',
        'debug.features.readerTelemetry.description': 'Verbose reader layout snapshots and preheat source logs',
        'debug.actions.goBack': 'Go Back',
        'debug.actions.installPrompt': 'Install Prompt',
        'debug.actions.iosHint': 'iOS Hint',
        'debug.actions.updateToast': 'Update Toast',
        'debug.actions.resetPwa': 'Reset PWA',
        'debug.actions.retryReaderRestore': 'Retry Reader Restore',
        'debug.diagnostics.title': 'Diagnostics',
        'debug.diagnostics.empty': 'No diagnostics yet',
        'debug.diagnostics.labels.bookImport': 'Import Diagnostics',
        'debug.diagnostics.labels.readerLayout': 'Reader Diagnostics',
        'debug.diagnostics.labels.readerRestore': 'Restore Diagnostics',
        'debug.diagnostics.labels.readerLifecycle': 'Lifecycle Diagnostics',
        'debug.diagnostics.labels.storage': 'Storage Diagnostics',
        'debug.diagnostics.preview.storageUsage': 'Usage {{usage}} / {{quota}}',
        'debug.diagnostics.preview.storageCounts': 'Render cache {{renderCacheCount}} · rich {{richCount}} · images {{imageCount}}',
        'debug.diagnostics.preview.storageNovelCache': 'Current novel cache {{count}}',
        'debug.diagnostics.preview.readerFormat': 'Format {{format}}',
        'debug.diagnostics.preview.readerLayout': 'Layout {{layout}}',
        'debug.diagnostics.preview.readerPendingPreheat': 'Pending preheat {{count}}',
        'debug.diagnostics.preview.restoreStatus': 'Status {{status}}',
        'debug.diagnostics.preview.restoreReason': 'Reason {{reason}}',
        'debug.diagnostics.preview.restoreError': 'Error {{metric}} Δ{{delta}} (tol {{tolerance}})',
        'debug.diagnostics.preview.restoreAttempts': 'Attempts {{attempts}} · retryable {{retryable}}',
        'debug.diagnostics.preview.lifecycleState': 'State {{state}}',
        'debug.diagnostics.preview.lifecycleEvent': 'Event {{event}}',
        'debug.diagnostics.preview.lifecyclePersistence': 'Persistence {{status}} · load {{loadKey}}',
        'debug.diagnostics.preview.importOperation': 'Operation {{operation}}',
        'debug.diagnostics.preview.importFile': 'File {{file}}',
        'debug.diagnostics.preview.importStage': 'Stage {{stage}}',
        'debug.logsEmpty': 'No logs yet',
        'debug.errorDetails.retryable': 'retryable={{value}}',
        'debug.errorDetails.source': 'source: {{value}}',
        'debug.errorDetails.userVisible': 'userVisible: {{value}}',
        'debug.errorDetails.debugVisible': 'debugVisible: {{value}}',
        'debug.errorDetails.messageKey': 'messageKey: {{value}}',
        'debug.errorDetails.cause': 'cause: {{value}}',
      };
      const template = translations[key] ?? key;
      return template.replace(/\{\{(\w+)\}\}/gu, (_, name: string) => String(options?.[name] ?? `{{${name}}}`));
    },
  }),
}));

const debugTest = vi.hoisted(() => {
  let logs: Array<{ time: number; category: string; message: string }> = [];
  let snapshots: Array<{ key: string; time: number; value: unknown }> = [];
  let subscriber:
    | ((entry: { time: number; category: string; message: string }) => void)
    | null = null;
  let snapshotSubscriber:
    | ((entries: Array<{ key: string; time: number; value: unknown }>) => void)
    | null = null;
  let featureFlags = {
    readerTelemetry: false,
  };
  let featureSubscriber: ((flags: {
    readerTelemetry: boolean;
  }) => void) | null = null;

  return {
    clearMock: vi.fn(() => {
      logs = [];
    }),
    clearSnapshotMock: vi.fn(() => {
      snapshots = [];
      snapshotSubscriber?.([...snapshots]);
    }),
    getFeatureFlags: vi.fn(() => ({ ...featureFlags })),
    getSnapshots: vi.fn(() => [...snapshots]),
    setDebugFeatureEnabled: vi.fn((flag: 'readerTelemetry', enabled: boolean) => {
      featureFlags = {
        ...featureFlags,
        [flag]: enabled,
      };
      featureSubscriber?.({ ...featureFlags });
    }),
    setDebugSnapshot: vi.fn((key: string, value: unknown) => {
      const nextEntry = { key, time: snapshots.length + 1, value };
      snapshots = [
        ...snapshots.filter((entry) => entry.key !== key),
        nextEntry,
      ].sort((left, right) => left.key.localeCompare(right.key));
      snapshotSubscriber?.([...snapshots]);
    }),
    triggerDebugInstallPrompt: vi.fn(),
    triggerDebugIosInstallHint: vi.fn(),
    triggerDebugRetryReaderRestore: vi.fn(),
    triggerDebugUpdateToast: vi.fn(),
    triggerDebugResetPwaPrompts: vi.fn(),
    getLogs: () => [...logs],
    setLogs(nextLogs: Array<{ time: number; category: string; message: string }>) {
      logs = [...nextLogs];
    },
    setSnapshots(nextSnapshots: Array<{ key: string; time: number; value: unknown }>) {
      snapshots = [...nextSnapshots];
    },
    subscribe(callback: (entry: { time: number; category: string; message: string }) => void) {
      subscriber = callback;
      return () => {
        if (subscriber === callback) subscriber = null;
      };
    },
    subscribeFeatures(callback: (flags: {
      readerTelemetry: boolean;
    }) => void) {
      featureSubscriber = callback;
      return () => {
        if (featureSubscriber === callback) featureSubscriber = null;
      };
    },
    subscribeSnapshots(
      callback: (entries: Array<{ key: string; time: number; value: unknown }>) => void,
    ) {
      snapshotSubscriber = callback;
      return () => {
        if (snapshotSubscriber === callback) snapshotSubscriber = null;
      };
    },
    emit(entry: { time: number; category: string; message: string }) {
      logs = [...logs, entry];
      subscriber?.(entry);
    },
    reset() {
      logs = [];
      snapshots = [];
      featureFlags = {
        readerTelemetry: false,
      };
      subscriber = null;
      snapshotSubscriber = null;
      featureSubscriber = null;
    },
  };
});

vi.mock('@shared/debug', () => {
  return {
    clearDebugSnapshots: debugTest.clearSnapshotMock,
    debugSubscribe: debugTest.subscribe,
    debugFeatureSubscribe: debugTest.subscribeFeatures,
    debugSnapshotSubscribe: debugTest.subscribeSnapshots,
    getRecentLogs: debugTest.getLogs,
    getDebugFeatureFlags: debugTest.getFeatureFlags,
    getDebugSnapshots: debugTest.getSnapshots,
    clearLogs: debugTest.clearMock,
    MAX_LOGS: 500,
    setDebugSnapshot: debugTest.setDebugSnapshot,
    setDebugFeatureEnabled: debugTest.setDebugFeatureEnabled,
  };
});

vi.mock('@infra/db', () => ({
  db: {
    chapterImages: {
      count: vi.fn().mockResolvedValue(4),
    },
    chapterRichContents: {
      count: vi.fn().mockResolvedValue(6),
    },
    readerRenderCache: {
      count: vi.fn().mockResolvedValue(8),
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          count: vi.fn().mockResolvedValue(3),
        })),
      })),
    },
  },
}));

vi.mock('../pwaDebugTools', () => {
  return {
    triggerDebugInstallPrompt: debugTest.triggerDebugInstallPrompt,
    triggerDebugIosInstallHint: debugTest.triggerDebugIosInstallHint,
    triggerDebugRetryReaderRestore: debugTest.triggerDebugRetryReaderRestore,
    triggerDebugUpdateToast: debugTest.triggerDebugUpdateToast,
    triggerDebugResetPwaPrompts: debugTest.triggerDebugResetPwaPrompts,
  };
});

describe('DebugPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    debugTest.reset();
  });

  it('renders existing logs and appends live log entries from the subscription', async () => {
    debugTest.setLogs([{ time: 1, category: 'Reader', message: 'initial log' }]);
    const user = userEvent.setup();

    render(<DebugPanel />);
    await user.click(screen.getByTitle('Debug Panel'));

    expect(screen.getByText('initial log')).toBeInTheDocument();

    debugTest.emit({ time: 2, category: 'AI', message: 'live log' });
    expect(await screen.findByText('live log')).toBeInTheDocument();
  });

  it('clears logs through the panel action', async () => {
    debugTest.setLogs([{ time: 1, category: 'Reader', message: 'stale log' }]);
    debugTest.setSnapshots([{ key: 'reader-layout', time: 1, value: { novelId: 1 } }]);
    const user = userEvent.setup();

    render(<DebugPanel />);
    await user.click(screen.getByTitle('Debug Panel'));
    expect(screen.getByText('stale log')).toBeInTheDocument();

    await user.click(screen.getByTitle('Clear logs'));

    expect(screen.getByText('No logs yet')).toBeInTheDocument();
    expect(debugTest.clearSnapshotMock).toHaveBeenCalledTimes(1);
  });

  it('renders structured diagnostics snapshots above the log stream', async () => {
    debugTest.setSnapshots([
      {
        key: 'reader-layout',
        time: 1,
        value: {
          contentFormat: 'rich',
          layoutFeatureSet: 'scroll-rich-inline',
          pendingPreheatCount: 2,
          novelId: 7,
        },
      },
      {
        key: 'book-import',
        time: 2,
        value: {
          currentFileName: 'novel.epub',
          operation: 'import',
          progress: {
            detail: 'Chapter 4',
            progress: 62,
            stage: 'chapters',
          },
        },
      },
    ]);
    const user = userEvent.setup();

    render(<DebugPanel />);
    await user.click(screen.getByTitle('Debug Panel'));

    expect(screen.getByText('Reader Diagnostics')).toBeInTheDocument();
    expect(screen.getByText('Import Diagnostics')).toBeInTheDocument();
    expect(screen.getByText(/format rich/i)).toBeInTheDocument();
    expect(screen.getByText(/file novel\.epub/i)).toBeInTheDocument();
    expect(screen.getByText(/pending preheat 2/i)).toBeInTheDocument();
  });

  it('exposes manual PWA trigger buttons', async () => {
    const user = userEvent.setup();

    render(<DebugPanel />);
    await user.click(screen.getByTitle('Debug Panel'));

    await user.click(screen.getByRole('button', { name: /Install Prompt/i }));
    await user.click(screen.getByRole('button', { name: /iOS Hint/i }));
    await user.click(screen.getByRole('button', { name: /Update Toast/i }));
    await user.click(screen.getByRole('button', { name: /Reset PWA/i }));
    await user.click(screen.getByRole('button', { name: /Retry Reader Restore/i }));

    expect(debugTest.triggerDebugInstallPrompt).toHaveBeenCalledTimes(1);
    expect(debugTest.triggerDebugIosInstallHint).toHaveBeenCalledTimes(1);
    expect(debugTest.triggerDebugUpdateToast).toHaveBeenCalledTimes(1);
    expect(debugTest.triggerDebugResetPwaPrompts).toHaveBeenCalledTimes(1);
    expect(debugTest.triggerDebugRetryReaderRestore).toHaveBeenCalledTimes(1);
  });

  it('renders reader telemetry toggle disabled by default and wires it to the debug feature flag', async () => {
    const user = userEvent.setup();

    render(<DebugPanel />);
    await user.click(screen.getByTitle('Debug Panel'));

    const [telemetryToggle] = screen.getAllByRole('switch');
    expect(telemetryToggle).toHaveAttribute('aria-checked', 'false');

    await user.click(telemetryToggle);

    expect(debugTest.setDebugFeatureEnabled).toHaveBeenCalledWith('readerTelemetry', true);
    expect(telemetryToggle).toHaveAttribute('aria-checked', 'true');
  });
});
