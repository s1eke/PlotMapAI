import { describe, expect, it } from 'vitest';

import type { ReaderRenderCacheRecord as PersistedReaderRenderCacheRecord } from '@infra/db/reader';

import {
  toDomainReaderRenderCacheRecord,
  toPersistedReaderRenderCacheRecord,
} from '../readerRenderCacheMapper';

describe('reader render cache mapper', () => {
  it('maps persisted manifest records into domain cache records', () => {
    const persisted: PersistedReaderRenderCacheRecord = {
      id: 1,
      novelId: 7,
      chapterIndex: 2,
      variantFamily: 'summary-shell',
      storageKind: 'manifest',
      layoutKey: 'summary-shell:base',
      layoutSignature: {
        textWidth: 360,
        pageHeight: 720,
        columnCount: 1,
        columnGap: 0,
        fontSize: 18,
        lineSpacing: 1.6,
        paragraphSpacing: 16,
      },
      contentHash: 'hash',
      tree: null,
      queryManifest: {
        blockCount: 2,
        startLocator: {
          chapterIndex: 2,
          blockIndex: 0,
          kind: 'heading',
          lineIndex: 0,
        },
      },
      updatedAt: '2026-04-01T00:00:00.000Z',
      expiresAt: '2026-04-15T00:00:00.000Z',
    };

    expect(toDomainReaderRenderCacheRecord(persisted)).toMatchObject({
      chapterIndex: 2,
      novelId: 7,
      storageKind: 'manifest',
      tree: null,
      queryManifest: {
        blockCount: 2,
        startLocator: {
          chapterIndex: 2,
          blockIndex: 0,
          kind: 'heading',
          lineIndex: 0,
        },
      },
    });
  });

  it('maps domain cache records into persisted records', () => {
    const persisted = toPersistedReaderRenderCacheRecord({
      chapterIndex: 2,
      contentHash: 'hash',
      layoutKey: 'summary-shell:base',
      layoutSignature: {
        textWidth: 360,
        pageHeight: 720,
        columnCount: 1,
        columnGap: 0,
        fontSize: 18,
        lineSpacing: 1.6,
        paragraphSpacing: 16,
      },
      novelId: 7,
      queryManifest: {
        blockCount: 2,
      },
      storageKind: 'manifest',
      tree: null,
      updatedAt: '2026-04-01T00:00:00.000Z',
      variantFamily: 'summary-shell',
    }, '2026-04-15T00:00:00.000Z');

    expect(persisted).toMatchObject({
      chapterIndex: 2,
      novelId: 7,
      storageKind: 'manifest',
      expiresAt: '2026-04-15T00:00:00.000Z',
      queryManifest: {
        blockCount: 2,
      },
    });
  });
});
