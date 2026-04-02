import type {
  ReaderLayoutSignatureRecord,
  ReaderRenderCacheRecord as PersistedReaderRenderCacheRecord,
  ReaderRenderQueryManifestRecord,
} from '@infra/db/reader';

import type {
  ReaderLayoutSignature,
  ReaderLocator,
  ReaderRenderQueryManifest,
  StaticChapterRenderTree,
} from './readerLayout';
import type {
  ReaderRenderCacheRecord as DomainReaderRenderCacheRecord,
} from './readerRenderCache';

function toReaderLocator(record?: import('@infra/db/reader').ReaderLocatorRecord | null): ReaderLocator | null | undefined {
  if (record === null) {
    return null;
  }
  if (!record) {
    return undefined;
  }

  return {
    chapterIndex: record.chapterIndex,
    blockIndex: record.blockIndex,
    kind: record.kind,
    lineIndex: record.lineIndex,
    startCursor: record.startCursor ? { ...record.startCursor } : undefined,
    endCursor: record.endCursor ? { ...record.endCursor } : undefined,
    edge: record.edge,
  };
}

function toReaderLocatorRecord(locator?: ReaderLocator | null): import('@infra/db/reader').ReaderLocatorRecord | null | undefined {
  if (locator === null) {
    return null;
  }
  if (!locator) {
    return undefined;
  }

  return {
    chapterIndex: locator.chapterIndex,
    blockIndex: locator.blockIndex,
    kind: locator.kind,
    lineIndex: locator.lineIndex,
    startCursor: locator.startCursor ? { ...locator.startCursor } : undefined,
    endCursor: locator.endCursor ? { ...locator.endCursor } : undefined,
    edge: locator.edge,
  };
}

function toReaderLayoutSignature(record: ReaderLayoutSignatureRecord): ReaderLayoutSignature {
  return { ...record };
}

function toReaderLayoutSignatureRecord(
  signature: ReaderLayoutSignature,
): ReaderLayoutSignatureRecord {
  return { ...signature };
}

function toReaderRenderQueryManifest(
  record: ReaderRenderQueryManifestRecord,
): ReaderRenderQueryManifest {
  return {
    blockCount: record.blockCount,
    lineCount: record.lineCount,
    pageCount: record.pageCount,
    totalHeight: record.totalHeight,
    startLocator: toReaderLocator(record.startLocator),
    endLocator: toReaderLocator(record.endLocator),
  };
}

function toReaderRenderQueryManifestRecord(
  manifest: ReaderRenderQueryManifest,
): ReaderRenderQueryManifestRecord {
  return {
    blockCount: manifest.blockCount,
    lineCount: manifest.lineCount,
    pageCount: manifest.pageCount,
    totalHeight: manifest.totalHeight,
    startLocator: toReaderLocatorRecord(manifest.startLocator),
    endLocator: toReaderLocatorRecord(manifest.endLocator),
  };
}

export function toDomainReaderRenderCacheRecord<
  TTree extends StaticChapterRenderTree,
>(
  persisted: PersistedReaderRenderCacheRecord,
): DomainReaderRenderCacheRecord<TTree> {
  const storageKind = persisted.storageKind === 'manifest' || !persisted.tree
    ? 'manifest'
    : 'render-tree';

  if (storageKind === 'manifest') {
    const record: DomainReaderRenderCacheRecord<TTree> = {
      chapterIndex: persisted.chapterIndex,
      contentHash: persisted.contentHash,
      layoutKey: persisted.layoutKey,
      layoutSignature: toReaderLayoutSignature(persisted.layoutSignature),
      novelId: persisted.novelId,
      queryManifest: toReaderRenderQueryManifest(persisted.queryManifest),
      storageKind,
      tree: null,
      updatedAt: persisted.updatedAt,
      variantFamily: persisted.variantFamily,
    };
    return record;
  }

  const record: DomainReaderRenderCacheRecord<TTree> = {
    chapterIndex: persisted.chapterIndex,
    contentHash: persisted.contentHash,
    layoutKey: persisted.layoutKey,
    layoutSignature: toReaderLayoutSignature(persisted.layoutSignature),
    novelId: persisted.novelId,
    queryManifest: toReaderRenderQueryManifest(persisted.queryManifest),
    storageKind,
    tree: persisted.tree as TTree,
    updatedAt: persisted.updatedAt,
    variantFamily: persisted.variantFamily,
  };
  return record;
}

export function toPersistedReaderRenderCacheRecord<
  TTree extends StaticChapterRenderTree,
>(
  entry: DomainReaderRenderCacheRecord<TTree>,
  expiresAt: string,
): Omit<PersistedReaderRenderCacheRecord, 'id'> {
  return {
    novelId: entry.novelId,
    chapterIndex: entry.chapterIndex,
    variantFamily: entry.variantFamily,
    layoutKey: entry.layoutKey,
    layoutSignature: toReaderLayoutSignatureRecord(entry.layoutSignature),
    contentHash: entry.contentHash,
    storageKind: entry.storageKind,
    tree: entry.tree,
    queryManifest: toReaderRenderQueryManifestRecord(entry.queryManifest),
    expiresAt,
    updatedAt: entry.updatedAt,
  };
}
