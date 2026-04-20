import type { ReaderMode, RestoreStatus } from '@shared/contracts/reader';
import type { ReaderPageTurnMode } from '@shared/contracts/reader/preferences';

import { CACHE_KEYS, storage } from '@infra/storage';

const READER_TRACE_CAPACITY = 250;
const READER_TRACE_QUERY_PARAM = 'readerTrace';

function isReaderTraceBuildEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_READER_TRACE === 'true'
    || import.meta.env.VITE_DEBUG === 'true';
}

export interface ReaderTraceEvent {
  time: number;
  event: string;
  novelId: number | null;
  chapterIndex: number | null;
  mode: ReaderMode | null;
  pageTurnMode: ReaderPageTurnMode | null;
  restoreStatus: RestoreStatus | null;
  details: Record<string, unknown> | null;
}

export interface ReaderTraceDump {
  capacity: number;
  enabled: boolean;
  generatedAt: number;
  events: ReaderTraceEvent[];
}

export interface ReaderTracePayload {
  chapterIndex?: number | null;
  details?: Record<string, unknown> | null;
  mode?: ReaderMode | null;
  novelId?: number | null;
  pageTurnMode?: ReaderPageTurnMode | null;
  restoreStatus?: RestoreStatus | null;
}

export interface ReaderTraceTools {
  clear: () => void;
  disable: () => void;
  dump: () => ReaderTraceDump;
  enable: () => void;
  getLastDump: () => ReaderTraceDump | null;
  mark: (reason: string, details?: Record<string, unknown>) => void;
}

interface PagedRestoreFlashCandidate {
  chapterIndex: number | null;
  consumed: boolean;
  novelId: number | null;
  targetPage: number;
}

let readerTraceEnabled = false;
let activeReaderTraceNovelId: number | null = null;
let readerTraceEvents: ReaderTraceEvent[] = [];
let pagedRestoreFlashCandidate: PagedRestoreFlashCandidate | null = null;

function getTraceTime(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeTraceValue(value: unknown, depth = 0): unknown {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value;
  }

  if (value === undefined) {
    return null;
  }

  if (depth >= 4) {
    return '[max-depth]';
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeTraceValue(item, depth + 1));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
    };
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        sanitizeTraceValue(nestedValue, depth + 1),
      ]),
    );
  }

  return String(value);
}

function sanitizeTraceDetails(
  details: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!details) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [key, sanitizeTraceValue(value)]),
  );
}

function resetEphemeralTraceState(): void {
  readerTraceEvents = [];
  pagedRestoreFlashCandidate = null;
}

function pushReaderTraceEvent(event: ReaderTraceEvent): void {
  readerTraceEvents = [...readerTraceEvents, event].slice(-READER_TRACE_CAPACITY);
}

function eventHasMatchingChapter(
  event: Pick<ReaderTraceEvent, 'chapterIndex' | 'novelId'>,
  candidate: PagedRestoreFlashCandidate,
): boolean {
  return event.novelId === candidate.novelId && event.chapterIndex === candidate.chapterIndex;
}

function persistLastDumpSnapshot(): void {
  storage.cache.set(CACHE_KEYS.readerTraceLastDump, getReaderTraceDump());
}

function updatePagedRestoreFlashCandidate(event: ReaderTraceEvent): void {
  if (event.event === 'paged_restore_failed' || event.event === 'restore_target_cleared') {
    if (pagedRestoreFlashCandidate && eventHasMatchingChapter(event, pagedRestoreFlashCandidate)) {
      pagedRestoreFlashCandidate = null;
    }
    return;
  }

  if (event.event === 'paged_restore_attempt' || event.event === 'paged_restore_completed') {
    const resolvedTargetPage = event.details?.resolvedTargetPage;
    if (typeof resolvedTargetPage === 'number' && resolvedTargetPage > 0) {
      pagedRestoreFlashCandidate = {
        chapterIndex: event.chapterIndex,
        consumed: false,
        novelId: event.novelId,
        targetPage: resolvedTargetPage,
      };
    }
    return;
  }

  if (event.event !== 'viewport_branch_rendered') {
    return;
  }

  const branch = event.details?.branch;
  const pageIndex = event.details?.pageIndex;

  if (branch !== 'paged' || typeof pageIndex !== 'number' || !pagedRestoreFlashCandidate) {
    return;
  }

  if (!eventHasMatchingChapter(event, pagedRestoreFlashCandidate)) {
    return;
  }

  if (pagedRestoreFlashCandidate.consumed) {
    return;
  }

  pagedRestoreFlashCandidate = {
    ...pagedRestoreFlashCandidate,
    consumed: true,
  };

  if (pageIndex !== 0 || pagedRestoreFlashCandidate.targetPage <= 0) {
    return;
  }

  markReaderTraceSuspect('paged_restore_flash_to_page_zero', {
    chapterIndex: event.chapterIndex,
    novelId: event.novelId,
    details: {
      actualPageIndex: pageIndex,
      expectedTargetPage: pagedRestoreFlashCandidate.targetPage,
    },
  });
}

function recordReaderTraceInternal(
  eventName: string,
  payload?: ReaderTracePayload,
): ReaderTraceEvent | null {
  if (!readerTraceEnabled || !isReaderTraceBuildEnabled()) {
    return null;
  }

  const nextEvent: ReaderTraceEvent = {
    time: getTraceTime(),
    event: eventName,
    novelId: payload?.novelId ?? activeReaderTraceNovelId,
    chapterIndex: payload?.chapterIndex ?? null,
    mode: payload?.mode ?? null,
    pageTurnMode: payload?.pageTurnMode ?? null,
    restoreStatus: payload?.restoreStatus ?? null,
    details: sanitizeTraceDetails(payload?.details),
  };

  pushReaderTraceEvent(nextEvent);
  updatePagedRestoreFlashCandidate(nextEvent);
  return nextEvent;
}

export function isReaderTraceEnabled(): boolean {
  return readerTraceEnabled;
}

export function setReaderTraceEnabled(enabled: boolean): void {
  const nextEnabled = isReaderTraceBuildEnabled() && enabled;
  readerTraceEnabled = nextEnabled;
  storage.cache.set(CACHE_KEYS.readerTraceEnabled, nextEnabled);

  if (!nextEnabled) {
    resetEphemeralTraceState();
  }
}

export function setReaderTraceNovelId(novelId: number | null): void {
  activeReaderTraceNovelId = Number.isFinite(novelId) ? novelId : null;
}

export function syncReaderTraceEnabledFromSearch(search: string): boolean {
  if (!isReaderTraceBuildEnabled()) {
    setReaderTraceEnabled(false);
    return false;
  }

  const searchParams = new URLSearchParams(search);
  const queryValue = searchParams.get(READER_TRACE_QUERY_PARAM);

  if (queryValue === '1') {
    setReaderTraceEnabled(true);
    return true;
  }

  if (queryValue === '0') {
    setReaderTraceEnabled(false);
    return false;
  }

  const persistedEnabled = storage.cache.getJson<boolean>(CACHE_KEYS.readerTraceEnabled) === true;
  setReaderTraceEnabled(persistedEnabled);
  return persistedEnabled;
}

export function recordReaderTrace(eventName: string, payload?: ReaderTracePayload): void {
  recordReaderTraceInternal(eventName, payload);
}

export function markReaderTraceSuspect(
  reason: string,
  payload?: ReaderTracePayload | Record<string, unknown>,
): void {
  if (!readerTraceEnabled) {
    return;
  }

  const hasTracePayloadShape = isPlainObject(payload) && (
    'chapterIndex' in payload
    || 'details' in payload
    || 'mode' in payload
    || 'novelId' in payload
    || 'pageTurnMode' in payload
    || 'restoreStatus' in payload
  );
  const tracePayload = hasTracePayloadShape
    ? payload as ReaderTracePayload
    : {
      details: isPlainObject(payload) ? payload : undefined,
    };
  const mergedDetails = {
    ...(tracePayload.details ?? {}),
    reason,
  };

  recordReaderTraceInternal('suspect', {
    ...tracePayload,
    details: mergedDetails,
  });
  persistLastDumpSnapshot();
}

export function getReaderTraceDump(): ReaderTraceDump {
  return {
    capacity: READER_TRACE_CAPACITY,
    enabled: readerTraceEnabled,
    generatedAt: getTraceTime(),
    events: [...readerTraceEvents],
  };
}

export function getLastReaderTraceDump(): ReaderTraceDump | null {
  return storage.cache.getJson<ReaderTraceDump>(CACHE_KEYS.readerTraceLastDump);
}

export function clearReaderTrace(): void {
  resetEphemeralTraceState();
  storage.cache.remove(CACHE_KEYS.readerTraceLastDump);
}

export function registerReaderTraceTools(): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  if (!isReaderTraceBuildEnabled()) {
    delete window.PlotMapAIReaderTrace;
    return () => undefined;
  }

  const tools: ReaderTraceTools = {
    clear: clearReaderTrace,
    disable: () => {
      setReaderTraceEnabled(false);
    },
    dump: getReaderTraceDump,
    enable: () => {
      setReaderTraceEnabled(true);
    },
    getLastDump: getLastReaderTraceDump,
    mark: (reason, details) => {
      markReaderTraceSuspect(reason, {
        details,
      });
    },
  };

  window.PlotMapAIReaderTrace = tools;

  return () => {
    if (window.PlotMapAIReaderTrace === tools) {
      delete window.PlotMapAIReaderTrace;
    }
  };
}
