import type { SerializedAppError, ToAppErrorContext } from '@shared/errors';

import { serializeAppError, toAppError } from '@shared/errors';

const isDebug = import.meta.env.VITE_DEBUG === 'true';

export const MAX_LOGS = 500;

export interface DebugFeatureFlags {
  readerStrictModeSwitch: boolean;
  readerTelemetry: boolean;
}

export interface DebugLogEntry {
  kind: 'log';
  time: number;
  category: string;
  message: string;
}

export interface DebugErrorEntry {
  kind: 'error';
  time: number;
  category: string;
  message: string;
  error: SerializedAppError;
}

export type DebugEntry = DebugLogEntry | DebugErrorEntry;

export interface DebugSnapshotEntry<TValue = unknown> {
  key: string;
  time: number;
  value: TValue;
}

type LogListener = (entry: DebugEntry) => void;
type FeatureListener = (flags: DebugFeatureFlags) => void;
type SnapshotListener = (
  entries: DebugSnapshotEntry[],
  updatedKey: string | null,
) => void;

const logs: DebugEntry[] = [];
const listeners = new Set<LogListener>();
const featureListeners = new Set<FeatureListener>();
const snapshotEntries = new Map<string, DebugSnapshotEntry>();
const snapshotListeners = new Set<SnapshotListener>();
const debugFeatureFlags: DebugFeatureFlags = {
  readerStrictModeSwitch: false,
  readerTelemetry: false,
};

export function isDebugMode(): boolean {
  return isDebug;
}

function pushEntry(entry: DebugEntry): void {
  logs.push(entry);
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS);
  }

  for (const listener of listeners) {
    listener(entry);
  }
}

export function debugLog(category: string, message: string, ...args: unknown[]): void {
  if (!isDebug) {
    return;
  }

  const entry: DebugLogEntry = {
    kind: 'log',
    time: Date.now(),
    category,
    message: args.length > 0
      ? `${message} ${args
        .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
        .join(' ')}`
      : message,
  };
  pushEntry(entry);
}

export function reportAppError(error: unknown, context: ToAppErrorContext = {}) {
  const normalized = toAppError(error, context);
  if (!normalized.debugVisible) {
    return normalized;
  }

  const entry: DebugErrorEntry = {
    kind: 'error',
    time: Date.now(),
    category: normalized.source,
    message: normalized.debugMessage,
    error: serializeAppError(normalized),
  };
  pushEntry(entry);
  return normalized;
}

export function debugSubscribe(listener: LogListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRecentLogs(): DebugEntry[] {
  return [...logs];
}

export function clearLogs(): void {
  logs.length = 0;
}

function notifySnapshotListeners(updatedKey: string | null): void {
  const entries = getDebugSnapshots();
  for (const listener of snapshotListeners) {
    listener(entries, updatedKey);
  }
}

export function setDebugSnapshot<TValue>(key: string, value: TValue): void {
  if (!isDebug) {
    return;
  }

  snapshotEntries.set(key, {
    key,
    time: Date.now(),
    value,
  });
  notifySnapshotListeners(key);
}

export function getDebugSnapshot<TValue = unknown>(
  key: string,
): DebugSnapshotEntry<TValue> | null {
  const entry = snapshotEntries.get(key);
  if (!entry) {
    return null;
  }

  return {
    key: entry.key,
    time: entry.time,
    value: entry.value as TValue,
  };
}

export function getDebugSnapshots(): DebugSnapshotEntry[] {
  return Array.from(snapshotEntries.values())
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((entry) => ({
      key: entry.key,
      time: entry.time,
      value: entry.value,
    }));
}

export function clearDebugSnapshots(): void {
  if (snapshotEntries.size === 0) {
    return;
  }

  snapshotEntries.clear();
  notifySnapshotListeners(null);
}

export function debugSnapshotSubscribe(listener: SnapshotListener): () => void {
  snapshotListeners.add(listener);
  return () => {
    snapshotListeners.delete(listener);
  };
}

function notifyFeatureListeners(): void {
  const snapshot = getDebugFeatureFlags();
  for (const listener of featureListeners) {
    listener(snapshot);
  }
}

export function getDebugFeatureFlags(): DebugFeatureFlags {
  return {
    ...debugFeatureFlags,
  };
}

export function isDebugFeatureEnabled(flag: keyof DebugFeatureFlags): boolean {
  return isDebug && debugFeatureFlags[flag];
}

export function setDebugFeatureEnabled(flag: keyof DebugFeatureFlags, enabled: boolean): void {
  if (debugFeatureFlags[flag] === enabled) {
    return;
  }

  debugFeatureFlags[flag] = enabled;
  notifyFeatureListeners();
  debugLog('Debug', `feature ${flag} ${enabled ? 'enabled' : 'disabled'}`);
}

export function debugFeatureSubscribe(listener: FeatureListener): () => void {
  featureListeners.add(listener);
  return () => {
    featureListeners.delete(listener);
  };
}
