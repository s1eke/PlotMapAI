import type { CSSProperties, RefObject } from 'react';
import type {
  DebugEntry,
  DebugFeatureFlags,
  DebugSnapshotEntry,
} from '@shared/debug';

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { DebugWorkspacePageId } from './debugPanelShared';
import {
  DebugDiagnosticsPage,
  DebugLogPage,
  DebugPageTabs,
  DebugToolsPage,
} from './DebugWorkspaceSections';

interface DebugWorkspaceProps {
  activeFlagCount: number;
  activePage: DebugWorkspacePageId;
  buttonRef: RefObject<HTMLButtonElement | null>;
  errorCount: number;
  errorLogs: DebugEntry[];
  featureFlags: DebugFeatureFlags;
  logCount: number;
  logListRef: RefObject<HTMLDivElement | null>;
  logs: DebugEntry[];
  onChangePage: (page: DebugWorkspacePageId) => void;
  onClear: () => void;
  onClose: () => void;
  onLogScroll: () => void;
  orderedSnapshots: DebugSnapshotEntry[];
  snapshotCount: number;
}

export default function DebugWorkspace({
  activeFlagCount,
  activePage,
  buttonRef,
  errorCount,
  errorLogs,
  featureFlags,
  logCount,
  logListRef,
  logs,
  onChangePage,
  onClear,
  onClose,
  onLogScroll,
  orderedSnapshots,
  snapshotCount,
}: DebugWorkspaceProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const launcherButton = buttonRef.current;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      launcherButton?.focus();
    };
  }, [buttonRef]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  if (typeof document === 'undefined') {
    return null;
  }

  const shellPaddingStyle: CSSProperties = {
    paddingTop: 'max(env(safe-area-inset-top, 0px), 0.5rem)',
    paddingRight: 'max(env(safe-area-inset-right, 0px), 0.5rem)',
    paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.5rem)',
    paddingLeft: 'max(env(safe-area-inset-left, 0px), 0.5rem)',
  };

  return createPortal(
    <div className="fixed inset-0 z-[90]">
      <div
        data-testid="debug-workspace-backdrop"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div className="absolute inset-0" style={shellPaddingStyle}>
        <div className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border-color bg-bg-primary shadow-[0_20px_48px_rgba(15,23,42,0.16)]">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            data-testid="debug-workspace"
            className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)]"
          >
            <header className="border-b border-border-color bg-bg-primary px-3 py-3 sm:px-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h1 id={titleId} className="text-sm font-semibold text-text-primary">
                    {t('debug.panelTitle')}
                  </h1>
                  <div className="text-[11px] text-text-secondary">
                    {t('debug.titleWithCount', { count: logCount })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClear}
                    title={t('debug.clearLogs')}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-color bg-bg-secondary px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-primary hover:text-text-primary"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('debug.clearLogs')}</span>
                  </button>
                  <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={onClose}
                    title={t('debug.workspace.close')}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-color bg-bg-secondary text-text-secondary transition-colors hover:bg-bg-primary hover:text-text-primary"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </header>

            <div className="border-b border-border-color bg-bg-primary px-3 py-2 sm:px-4">
              <DebugPageTabs
                activePage={activePage}
                errorCount={errorCount}
                onChangePage={onChangePage}
                t={t}
              />
            </div>

            <div className="min-h-0 bg-bg-primary">
              {activePage === 'logs' && (
                <DebugLogPage
                  emptyMessage={t('debug.logsEmpty')}
                  entries={logs}
                  logListRef={logListRef}
                  onLogScroll={onLogScroll}
                  panelId="debug-page-logs"
                  labelledBy="debug-tab-logs"
                  t={t}
                />
              )}
              {activePage === 'errors' && (
                <DebugLogPage
                  emptyMessage={t('debug.workspace.errorsEmpty')}
                  entries={errorLogs}
                  logListRef={logListRef}
                  onLogScroll={onLogScroll}
                  panelId="debug-page-errors"
                  labelledBy="debug-tab-errors"
                  t={t}
                />
              )}
              {activePage === 'diagnostics' && (
                <DebugDiagnosticsPage
                  orderedSnapshots={orderedSnapshots}
                  snapshotCount={snapshotCount}
                  t={t}
                />
              )}
              {activePage === 'tools' && (
                <DebugToolsPage
                  activeFlagCount={activeFlagCount}
                  featureFlags={featureFlags}
                  t={t}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
