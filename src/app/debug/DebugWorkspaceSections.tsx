import type { ReactNode, RefObject } from 'react';
import type { TFunction } from 'i18next';
import type {
  DebugEntry,
  DebugFeatureFlags,
  DebugSnapshotEntry,
} from '@shared/debug';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  RefreshCw,
  RotateCcw,
  Smartphone,
} from 'lucide-react';
import { setDebugFeatureEnabled } from '@shared/debug';
import Toggle from '@shared/components/Toggle';
import { cn } from '@shared/utils/cn';

import {
  triggerDebugInstallPrompt,
  triggerDebugIosInstallHint,
  triggerDebugResetPwaPrompts,
  triggerDebugRetryReaderRestore,
  triggerDebugUpdateToast,
} from './pwaDebugTools';
import {
  buildSnapshotPreview,
  CATEGORY_COLORS,
  formatClockTime,
  getDebugEntryKey,
  getDebugSnapshotKey,
  getSnapshotLabel,
  type DebugWorkspacePageId,
} from './debugPanelShared';

async function writeClipboardText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  if (typeof document === 'undefined') {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}

function useDebugCopyAction() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const copy = useCallback((key: string, payload: unknown): void => {
    const text = typeof payload === 'string'
      ? payload
      : JSON.stringify(payload, null, 2);

    writeClipboardText(text)
      .then((copied) => {
        if (!copied) {
          return;
        }

        setCopiedKey(key);
        if (timerRef.current) {
          window.clearTimeout(timerRef.current);
        }
        timerRef.current = window.setTimeout(() => {
          setCopiedKey(null);
          timerRef.current = null;
        }, 1500);
      })
      .catch(() => undefined);
  }, []);

  return {
    copiedKey,
    copy,
  };
}

interface CopyButtonProps {
  copied: boolean;
  copiedLabel: string;
  label: string;
  onClick: () => void;
}

function CopyButton({ copied, copiedLabel, label, onClick }: CopyButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors',
        copied
          ? 'border-accent bg-accent/10 text-accent'
          : 'border-border-color bg-bg-primary text-text-secondary hover:text-text-primary',
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      <span>{copied ? copiedLabel : label}</span>
    </button>
  );
}

interface DebugPageTabsProps {
  activePage: DebugWorkspacePageId;
  errorCount: number;
  onChangePage: (page: DebugWorkspacePageId) => void;
  t: TFunction;
}

export function DebugPageTabs({
  activePage,
  errorCount,
  onChangePage,
  t,
}: DebugPageTabsProps) {
  const pages: Array<{ id: DebugWorkspacePageId; label: string; count?: number }> = [
    { id: 'logs', label: t('debug.workspace.pages.logs') },
    { id: 'errors', label: t('debug.workspace.pages.errors'), count: errorCount },
    { id: 'diagnostics', label: t('debug.workspace.pages.diagnostics') },
    { id: 'tools', label: t('debug.workspace.pages.tools') },
  ];

  return (
    <div
      role="tablist"
      aria-label={t('debug.workspace.sectionsLabel')}
      className="hide-scrollbar flex items-center gap-2 overflow-x-auto"
    >
      {pages.map((page) => {
        const isActive = page.id === activePage;

        return (
          <button
            key={page.id}
            id={`debug-tab-${page.id}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`debug-page-${page.id}`}
            onClick={() => onChangePage(page.id)}
            className={cn(
              'inline-flex min-w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              isActive
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border-color bg-bg-secondary text-text-secondary hover:bg-bg-primary hover:text-text-primary',
            )}
          >
            <span>{page.label}</span>
            {page.id === 'errors' && (page.count ?? 0) > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                {page.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface DebugLogPageProps {
  emptyMessage: string;
  entries: DebugEntry[];
  logListRef: RefObject<HTMLDivElement | null>;
  onLogScroll: () => void;
  panelId: string;
  labelledBy: string;
  t: TFunction;
}

export function DebugLogPage({
  emptyMessage,
  entries,
  logListRef,
  onLogScroll,
  panelId,
  labelledBy,
  t,
}: DebugLogPageProps) {
  const { copiedKey, copy } = useDebugCopyAction();

  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledBy}
      ref={logListRef}
      onScroll={onLogScroll}
      className="min-h-0 h-full overflow-y-auto px-3 py-3 sm:px-4"
    >
      <div className="space-y-2">
        {entries.length === 0 && (
          <div className="rounded-xl border border-border-color bg-bg-secondary px-4 py-6 text-center text-sm text-text-secondary">
            {emptyMessage}
          </div>
        )}
        {entries.map((entry) => (
          <article
            key={getDebugEntryKey(entry)}
            className={cn(
              'rounded-xl border px-3 py-2.5',
              entry.kind === 'error'
                ? 'border-red-500/25 bg-red-500/[0.05]'
                : 'border-border-color bg-bg-secondary/70',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs leading-5">
                <span className="shrink-0 text-text-secondary/75">
                  {formatClockTime(entry.time)}
                </span>
                <span
                  className={cn(
                    'shrink-0 font-semibold',
                    CATEGORY_COLORS[entry.category] || 'text-text-secondary',
                  )}
                >
                  [{entry.category}]
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    entry.kind === 'error'
                      ? 'bg-red-500/15 text-red-500'
                      : 'bg-bg-primary text-text-secondary',
                  )}
                >
                  {entry.kind}
                </span>
              </div>
              <CopyButton
                copied={copiedKey === getDebugEntryKey(entry)}
                copiedLabel={t('debug.copied')}
                label={t('debug.copyEntry')}
                onClick={() => {
                  copy(getDebugEntryKey(entry), entry);
                }}
              />
            </div>
            <div className="mt-1 break-all text-sm leading-6 text-text-primary">
              {entry.message}
            </div>

            {entry.kind === 'error' && (
              <details className="mt-2 rounded-lg border border-red-500/15 bg-bg-primary px-3 py-2 text-[11px] text-text-secondary">
                <summary className="cursor-pointer select-none font-semibold text-text-primary">
                  {entry.error.code} · {entry.error.kind}
                  {' · '}
                  {t('debug.errorDetails.retryable', {
                    value: String(entry.error.retryable),
                  })}
                </summary>
                <div className="mt-2 space-y-2 break-all">
                  <div>{t('debug.errorDetails.source', { value: entry.error.source })}</div>
                  <div>
                    {t('debug.errorDetails.userVisible', {
                      value: String(entry.error.userVisible),
                    })}
                  </div>
                  <div>
                    {t('debug.errorDetails.debugVisible', {
                      value: String(entry.error.debugVisible),
                    })}
                  </div>
                  {entry.error.userMessageKey && (
                    <div>
                      {t('debug.errorDetails.messageKey', {
                        value: entry.error.userMessageKey,
                      })}
                    </div>
                  )}
                  {entry.error.details && (
                    <pre className="whitespace-pre-wrap text-[11px] leading-5 text-text-secondary">
                      {JSON.stringify(entry.error.details, null, 2)}
                    </pre>
                  )}
                  {entry.error.cause?.message && (
                    <div>
                      {t('debug.errorDetails.cause', {
                        value: entry.error.cause.message,
                      })}
                    </div>
                  )}
                  {entry.error.stack && (
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-text-secondary">
                      {entry.error.stack}
                    </pre>
                  )}
                </div>
              </details>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

interface DiagnosticsItemProps {
  snapshot: DebugSnapshotEntry;
  t: TFunction;
}

function DiagnosticsItem({ snapshot, t }: DiagnosticsItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { copiedKey, copy } = useDebugCopyAction();
  const snapshotKey = getDebugSnapshotKey(snapshot);

  return (
    <article className="rounded-xl border border-border-color bg-bg-secondary/70 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-text-primary">
            {getSnapshotLabel(snapshot.key, t)}
          </div>
          <div className="mt-1 text-[11px] text-text-secondary">
            {formatClockTime(snapshot.time)}
          </div>
        </div>
        <CopyButton
          copied={copiedKey === snapshotKey}
          copiedLabel={t('debug.copied')}
          label={t('debug.copyEntry')}
          onClick={() => {
            copy(snapshotKey, snapshot);
          }}
        />
      </div>
      <div className="mt-2 space-y-1">
        {buildSnapshotPreview(snapshot, t).map((line) => (
          <div key={`${snapshot.key}:${line}`} className="text-xs leading-5 text-text-secondary">
            {line}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setIsExpanded((value) => !value)}
        className="mt-2 text-xs font-medium text-accent transition-colors hover:text-accent-hover"
      >
        {isExpanded
          ? t('debug.workspace.diagnostics.hideJson')
          : t('debug.workspace.diagnostics.viewJson')}
      </button>
      {isExpanded && (
        <pre className="mt-2 overflow-auto rounded-lg border border-border-color bg-bg-primary px-3 py-2 text-[11px] leading-5 text-text-secondary">
          {JSON.stringify(snapshot.value, null, 2)}
        </pre>
      )}
    </article>
  );
}

interface DebugDiagnosticsPageProps {
  orderedSnapshots: DebugSnapshotEntry[];
  snapshotCount: number;
  t: TFunction;
}

export function DebugDiagnosticsPage({
  orderedSnapshots,
  snapshotCount,
  t,
}: DebugDiagnosticsPageProps) {
  return (
    <div
      id="debug-page-diagnostics"
      role="tabpanel"
      aria-labelledby="debug-tab-diagnostics"
      className="min-h-0 h-full overflow-y-auto px-3 py-3 sm:px-4"
    >
      <div className="mb-3 text-[11px] text-text-secondary">
        {t('debug.workspace.diagnostics.count', { count: snapshotCount })}
      </div>
      {orderedSnapshots.length === 0 ? (
        <div className="rounded-xl border border-border-color bg-bg-secondary px-4 py-6 text-center text-sm text-text-secondary">
          {t('debug.diagnostics.empty')}
        </div>
      ) : (
        <div className="space-y-2">
          {orderedSnapshots.map((snapshot) => (
            <DiagnosticsItem
              key={getDebugSnapshotKey(snapshot)}
              snapshot={snapshot}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ToolRowProps {
  children: ReactNode;
  label: string;
  secondary?: string;
}

function ToolRow({ children, label, secondary }: ToolRowProps) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border-color bg-bg-secondary/70 px-3 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-text-primary">{label}</div>
        {secondary && (
          <div className="mt-1 text-xs leading-5 text-text-secondary">
            {secondary}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

interface ToolActionButtonProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

function ToolActionButton({ icon, label, onClick }: ToolActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-xl border border-border-color bg-bg-secondary px-3 py-3 text-left text-sm font-medium text-text-primary transition-colors hover:bg-bg-primary"
    >
      <span className="text-text-secondary">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

interface DebugToolsPageProps {
  activeFlagCount: number;
  featureFlags: DebugFeatureFlags;
  t: TFunction;
}

export function DebugToolsPage({
  activeFlagCount,
  featureFlags,
  t,
}: DebugToolsPageProps) {
  return (
    <div
      id="debug-page-tools"
      role="tabpanel"
      aria-labelledby="debug-tab-tools"
      className="min-h-0 h-full overflow-y-auto px-3 py-3 sm:px-4"
    >
      <div className="space-y-4">
        <section>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
            {t('debug.workspace.tools.featuresTitle')}
            {activeFlagCount > 0 ? ` · ${activeFlagCount}` : ''}
          </div>
          <div className="space-y-2">
            <ToolRow
              label={t('debug.features.readerStrictModeSwitch.label')}
              secondary={t('debug.features.readerStrictModeSwitch.description')}
            >
              <Toggle
                checked={featureFlags.readerStrictModeSwitch}
                onChange={(checked) => {
                  setDebugFeatureEnabled('readerStrictModeSwitch', checked);
                }}
                className="mt-1 shrink-0"
              />
            </ToolRow>
            <ToolRow
              label={t('debug.features.readerTelemetry.label')}
              secondary={t('debug.features.readerTelemetry.description')}
            >
              <Toggle
                checked={featureFlags.readerTelemetry}
                onChange={(checked) => {
                  setDebugFeatureEnabled('readerTelemetry', checked);
                }}
                className="mt-1 shrink-0"
              />
            </ToolRow>
          </div>
        </section>

        <section>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
            {t('debug.workspace.tools.actionsTitle')}
          </div>
          <div className="grid gap-2">
            <ToolActionButton
              icon={<ArrowLeft className="h-4 w-4" />}
              label={t('debug.actions.goBack')}
              onClick={() => window.history.back()}
            />
            <ToolActionButton
              icon={<Download className="h-4 w-4" />}
              label={t('debug.actions.installPrompt')}
              onClick={triggerDebugInstallPrompt}
            />
            <ToolActionButton
              icon={<Smartphone className="h-4 w-4" />}
              label={t('debug.actions.iosHint')}
              onClick={triggerDebugIosInstallHint}
            />
            <ToolActionButton
              icon={<RefreshCw className="h-4 w-4" />}
              label={t('debug.actions.updateToast')}
              onClick={triggerDebugUpdateToast}
            />
            <ToolActionButton
              icon={<RotateCcw className="h-4 w-4" />}
              label={t('debug.actions.resetPwa')}
              onClick={triggerDebugResetPwaPrompts}
            />
            <ToolActionButton
              icon={<RotateCcw className="h-4 w-4" />}
              label={t('debug.actions.retryReaderRestore')}
              onClick={triggerDebugRetryReaderRestore}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
