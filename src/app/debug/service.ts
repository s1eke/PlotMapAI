import {
  serializeAppError,
  toAppError,
  type SerializedAppError,
  type ToAppErrorContext,
} from '@shared/errors';

const isDebug = import.meta.env.VITE_DEBUG === 'true';
export const MAX_LOGS = 500;
export const DEBUG_SHOW_INSTALL_PROMPT_EVENT = 'plotmapai:debug:show-install-prompt';
export const DEBUG_SHOW_IOS_INSTALL_HINT_EVENT = 'plotmapai:debug:show-ios-install-hint';
export const DEBUG_SHOW_UPDATE_TOAST_EVENT = 'plotmapai:debug:show-update-toast';
export const DEBUG_RESET_PWA_PROMPTS_EVENT = 'plotmapai:debug:reset-pwa-prompts';

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

export interface DebugPwaTools {
  showInstallPrompt: () => void;
  showIosInstallHint: () => void;
  showUpdateToast: () => void;
  resetPwaPrompts: () => void;
}

type LogListener = (entry: DebugEntry) => void;

const logs: DebugEntry[] = [];
const listeners = new Set<LogListener>();

export function isDebugMode(): boolean {
  return isDebug;
}

function pushEntry(entry: DebugEntry): void {
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
  for (const fn of listeners) fn(entry);
}

export function debugLog(category: string, message: string, ...args: unknown[]): void {
  if (!isDebug) return;
  const entry: DebugLogEntry = {
    kind: 'log',
    time: Date.now(),
    category,
    message: args.length > 0 ? `${message} ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}` : message,
  };
  pushEntry(entry);
  console.log(`[PlotMapAI][${category}]`, message, ...args);
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
  if (isDebug) {
    console.error(`[PlotMapAI][${normalized.source}]`, normalized);
  }
  return normalized;
}

export function debugSubscribe(listener: LogListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getRecentLogs(): DebugEntry[] {
  return [...logs];
}

export function clearLogs(): void {
  logs.length = 0;
}

function dispatchDebugEvent(eventName: string, message: string): void {
  if (!isDebug || typeof window === 'undefined') {
    return;
  }

  debugLog('PWA', message);
  window.dispatchEvent(new CustomEvent(eventName));
}

export function triggerDebugInstallPrompt(): void {
  dispatchDebugEvent(DEBUG_SHOW_INSTALL_PROMPT_EVENT, 'manual install prompt triggered');
}

export function triggerDebugIosInstallHint(): void {
  dispatchDebugEvent(DEBUG_SHOW_IOS_INSTALL_HINT_EVENT, 'manual iOS install hint triggered');
}

export function triggerDebugUpdateToast(): void {
  dispatchDebugEvent(DEBUG_SHOW_UPDATE_TOAST_EVENT, 'manual update toast triggered');
}

export function triggerDebugResetPwaPrompts(): void {
  dispatchDebugEvent(DEBUG_RESET_PWA_PROMPTS_EVENT, 'manual PWA prompt reset triggered');
}

export function registerDebugHelpers(): () => void {
  if (!isDebug || typeof window === 'undefined') {
    return () => undefined;
  }

  const tools: DebugPwaTools = {
    showInstallPrompt: triggerDebugInstallPrompt,
    showIosInstallHint: triggerDebugIosInstallHint,
    showUpdateToast: triggerDebugUpdateToast,
    resetPwaPrompts: triggerDebugResetPwaPrompts,
  };

  window.PlotMapAIDebug = tools;
  debugLog('PWA', 'window.PlotMapAIDebug registered');

  return () => {
    if (window.PlotMapAIDebug === tools) {
      delete window.PlotMapAIDebug;
    }
  };
}
