import type { Transaction } from 'dexie';
import type {
  ReaderPretextMetricsRecord as PersistedReaderPretextMetricsRecord,
  ReaderTextMetricSignatureRecord,
} from '@infra/db/reader';
import type {
  ReaderLayoutSignature,
  ReaderTextLayoutEngine,
  ReaderTextLineStats,
  ReaderTextPrepareOptions,
  ReaderTypographyMetrics,
} from '../layout/readerLayout';

import { db } from '@infra/db';

import { browserReaderTextLayoutEngine } from '../measurement/readerTextMeasurement';

export const READER_PRETEXT_METRICS_VERSION = 1;
export const READER_PRETEXT_METRICS_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const READER_PRETEXT_METRICS_PERSISTED_LIMIT = 720;
const READER_PRETEXT_METRICS_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
let lastReaderPretextMetricsCleanupAt = 0;

type ReaderPretextContentFormat = PersistedReaderPretextMetricsRecord['contentFormat'];

export interface ReaderTextMetricSignature extends ReaderTextMetricSignatureRecord {
  bodyFont: string;
  headingFont: string;
}

export interface ReaderPretextMetricsBundle {
  chapterIndex: number;
  contentFormat: ReaderPretextContentFormat;
  contentHash: string;
  contentVersion: number;
  entries: Map<string, ReaderTextLineStats>;
  novelId: number;
  signature: ReaderTextMetricSignature;
  signatureKey: string;
  updatedAt: string;
}

export interface CachedPretextTextLayoutEngine {
  createBundle: () => ReaderPretextMetricsBundle;
  hasChanges: () => boolean;
  textLayoutEngine: ReaderTextLayoutEngine;
}

function getReaderPretextMetricsTimestampMs(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function createReaderPretextMetricsExpiresAt(updatedAt: string): string {
  return new Date(
    getReaderPretextMetricsTimestampMs(updatedAt) + READER_PRETEXT_METRICS_TTL_MS,
  ).toISOString();
}

function isPersistedReaderPretextMetricsExpired(
  entry: PersistedReaderPretextMetricsRecord,
  now = Date.now(),
): boolean {
  return getReaderPretextMetricsTimestampMs(entry.expiresAt) <= now;
}

async function cleanupExpiredReaderPretextMetricsIfNeeded(now = Date.now()): Promise<void> {
  if (now - lastReaderPretextMetricsCleanupAt < READER_PRETEXT_METRICS_CLEANUP_INTERVAL_MS) {
    return;
  }

  lastReaderPretextMetricsCleanupAt = now;
  await db.readerPretextMetrics
    .where('expiresAt')
    .belowOrEqual(new Date(now).toISOString())
    .delete();
}

async function prunePersistedReaderPretextMetricsIfNeeded(
  table: typeof db.readerPretextMetrics = db.readerPretextMetrics,
): Promise<void> {
  const overflow = await table.count() - READER_PRETEXT_METRICS_PERSISTED_LIMIT;
  if (overflow <= 0) {
    return;
  }

  const oldestIds = await table.orderBy('updatedAt').limit(overflow).primaryKeys();
  if (oldestIds.length > 0) {
    await table.bulkDelete(oldestIds as number[]);
  }
}

function createStableHash(source: string): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x01000193;
  const uint32Mod = 0x1_0000_0000;

  const normalizeUint32 = (nextValue: number): number => {
    const normalized = nextValue % uint32Mod;
    return normalized >= 0 ? normalized : normalized + uint32Mod;
  };

  for (let index = 0; index < source.length; index += 1) {
    const valueCode = source.charCodeAt(index);
    hashA = normalizeUint32(Math.imul(hashA, 0x01000193) + valueCode);
    hashB = normalizeUint32(Math.imul(hashB, 0x27d4eb2d) + valueCode);
  }

  return `${hashA.toString(16).padStart(8, '0')}${hashB.toString(16).padStart(8, '0')}`;
}

function formatMetricNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : '0.000';
}

export function createReaderTextMetricSignature(params: {
  layoutSignature: ReaderLayoutSignature;
  typography: ReaderTypographyMetrics;
}): ReaderTextMetricSignature {
  return {
    bodyFont: params.typography.bodyFont,
    fontSize: params.layoutSignature.fontSize,
    headingFont: params.typography.headingFont,
    lineSpacing: params.layoutSignature.lineSpacing,
    metricsVersion: READER_PRETEXT_METRICS_VERSION,
    paragraphSpacing: params.layoutSignature.paragraphSpacing,
    richTextStrategyVersion: params.layoutSignature.richTextStrategyVersion,
    textLayoutPolicyKey: params.layoutSignature.textLayoutPolicyKey,
    textLayoutPolicyVersion: params.layoutSignature.textLayoutPolicyVersion,
    textWidth: params.layoutSignature.textWidth,
  };
}

export function serializeReaderTextMetricSignature(
  signature: ReaderTextMetricSignature,
): string {
  return [
    signature.metricsVersion,
    formatMetricNumber(signature.textWidth),
    formatMetricNumber(signature.fontSize),
    formatMetricNumber(signature.lineSpacing),
    formatMetricNumber(signature.paragraphSpacing),
    signature.bodyFont,
    signature.headingFont,
    signature.textLayoutPolicyKey ?? '',
    signature.textLayoutPolicyVersion ?? 0,
    signature.richTextStrategyVersion ?? 0,
  ].join('|');
}

function normalizeStats(stats: ReaderTextLineStats | null | undefined): ReaderTextLineStats | null {
  if (
    !stats
    || !Number.isFinite(stats.lineCount)
    || !Number.isFinite(stats.maxLineWidth)
  ) {
    return null;
  }

  return {
    lineCount: Math.max(0, stats.lineCount),
    maxLineWidth: Math.max(0, stats.maxLineWidth),
  };
}

function serializePrepareOptions(options: ReaderTextPrepareOptions | undefined): string {
  return JSON.stringify(options ?? {});
}

export function createReaderTextLineStatsKey(params: {
  font: string;
  fontSizePx: number;
  maxWidth: number;
  prepareOptions?: ReaderTextPrepareOptions;
  text: string;
}): string {
  return [
    params.font,
    formatMetricNumber(params.fontSizePx),
    formatMetricNumber(params.maxWidth),
    serializePrepareOptions(params.prepareOptions),
    params.text.length,
    createStableHash(params.text),
  ].join('|');
}

function createEmptyBundle(params: {
  chapterIndex: number;
  contentFormat: ReaderPretextContentFormat;
  contentHash: string;
  contentVersion: number;
  novelId: number;
  signature: ReaderTextMetricSignature;
  signatureKey: string;
}): ReaderPretextMetricsBundle {
  return {
    ...params,
    entries: new Map(),
    updatedAt: new Date().toISOString(),
  };
}

function toBundle(
  record: PersistedReaderPretextMetricsRecord,
): ReaderPretextMetricsBundle {
  return {
    chapterIndex: record.chapterIndex,
    contentFormat: record.contentFormat,
    contentHash: record.contentHash,
    contentVersion: record.contentVersion,
    entries: new Map(record.entries.map((entry) => [entry.key, entry.stats])),
    novelId: record.novelId,
    signature: record.signature as ReaderTextMetricSignature,
    signatureKey: record.signatureKey,
    updatedAt: record.updatedAt,
  };
}

export async function loadPretextMetricsBundle(params: {
  chapterIndex: number;
  contentFormat: ReaderPretextContentFormat;
  contentHash: string;
  contentVersion: number;
  novelId: number;
  signature: ReaderTextMetricSignature;
}): Promise<ReaderPretextMetricsBundle> {
  await cleanupExpiredReaderPretextMetricsIfNeeded();

  const signatureKey = serializeReaderTextMetricSignature(params.signature);
  const record = await db.readerPretextMetrics
    .where('[novelId+chapterIndex+signatureKey]')
    .equals([params.novelId, params.chapterIndex, signatureKey])
    .first();
  if (!record) {
    return createEmptyBundle({ ...params, signatureKey });
  }

  if (isPersistedReaderPretextMetricsExpired(record)) {
    await db.readerPretextMetrics.delete(record.id);
    return createEmptyBundle({ ...params, signatureKey });
  }

  if (
    record.contentHash !== params.contentHash
    || record.contentFormat !== params.contentFormat
    || record.contentVersion !== params.contentVersion
  ) {
    return createEmptyBundle({ ...params, signatureKey });
  }

  return toBundle(record);
}

export function createCachedPretextTextLayoutEngine(params: {
  baseEngine?: ReaderTextLayoutEngine;
  bundle: ReaderPretextMetricsBundle;
}): CachedPretextTextLayoutEngine {
  const baseEngine = params.baseEngine ?? browserReaderTextLayoutEngine;
  const entries = new Map(params.bundle.entries);
  let dirty = false;

  return {
    createBundle: () => ({
      ...params.bundle,
      entries: new Map(entries),
      updatedAt: new Date().toISOString(),
    }),
    hasChanges: () => dirty,
    textLayoutEngine: {
      ...baseEngine,
      measureLineStats(measureParams) {
        const key = createReaderTextLineStatsKey(measureParams);
        const cached = entries.get(key);
        if (cached) {
          return { ...cached };
        }

        const measured = normalizeStats(baseEngine.measureLineStats?.(measureParams) ?? null);
        if (!measured) {
          return measured;
        }

        entries.set(key, measured);
        dirty = true;
        return { ...measured };
      },
    },
  };
}

export async function persistPretextMetricsBundle(
  bundle: ReaderPretextMetricsBundle,
): Promise<void> {
  if (bundle.entries.size === 0) {
    return;
  }

  await cleanupExpiredReaderPretextMetricsIfNeeded();

  const updatedAt = new Date().toISOString();
  const record: Omit<PersistedReaderPretextMetricsRecord, 'id'> = {
    chapterIndex: bundle.chapterIndex,
    contentFormat: bundle.contentFormat,
    contentHash: bundle.contentHash,
    contentVersion: bundle.contentVersion,
    entries: Array.from(bundle.entries.entries()).map(([key, stats]) => ({ key, stats })),
    expiresAt: createReaderPretextMetricsExpiresAt(updatedAt),
    novelId: bundle.novelId,
    signature: bundle.signature,
    signatureKey: bundle.signatureKey,
    updatedAt,
  };

  await db.transaction('rw', db.readerPretextMetrics, async () => {
    await db.readerPretextMetrics
      .where('[novelId+chapterIndex+signatureKey]')
      .equals([bundle.novelId, bundle.chapterIndex, bundle.signatureKey])
      .delete();
    await db.readerPretextMetrics.add(record);
    await prunePersistedReaderPretextMetricsIfNeeded(db.readerPretextMetrics);
  });
}

export async function deletePersistedReaderPretextMetrics(
  novelId: number,
  transaction?: Transaction,
): Promise<void> {
  const table = transaction
    ? transaction.table('readerPretextMetrics')
    : db.readerPretextMetrics;

  await table.where('novelId').equals(novelId).delete();
}
