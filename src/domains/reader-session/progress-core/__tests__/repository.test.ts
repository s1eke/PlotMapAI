import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '@infra/db';

import {
  deleteReaderProgressSnapshot,
  readReaderProgressSnapshot,
  replaceReaderProgressSnapshot,
} from '../repository';

describe('reader progress core repository', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('returns null when no snapshot exists', async () => {
    await expect(readReaderProgressSnapshot(7)).resolves.toBeNull();
  });

  it('writes and reads a precise locator snapshot', async () => {
    await replaceReaderProgressSnapshot(7, {
      mode: 'paged',
      activeChapterIndex: 3,
      position: {
        type: 'locator',
        locator: {
          chapterIndex: 3,
          chapterKey: 'epub:ch3:chapter3.xhtml',
          blockIndex: 8,
          blockKey: 'anchor:intro',
          anchorId: 'intro',
          kind: 'text',
          lineIndex: 1,
          pageIndex: 5,
          textQuote: {
            exact: 'opening line',
          },
          blockTextHash: 'hash-block',
          contentVersion: 2,
          importFormatVersion: 1,
          contentHash: 'hash-content',
        },
      },
      projections: {
        paged: {
          pageIndex: 5,
          capturedAt: '2026-04-24T00:00:00.000Z',
          sourceMode: 'paged',
          basisCanonicalFingerprint: 'canonical-a',
          layoutKey: 'layout-a',
        },
        scroll: {
          chapterProgress: 0.58,
          capturedAt: '2026-04-24T00:00:00.000Z',
          sourceMode: 'paged',
          basisCanonicalFingerprint: 'canonical-a',
        },
        global: {
          globalPageIndex: 42,
          globalScrollOffset: 8192.25,
          capturedAt: '2026-04-24T00:00:00.000Z',
          sourceMode: 'paged',
          basisCanonicalFingerprint: 'canonical-a',
          layoutKey: 'layout-a',
        },
      },
      captureQuality: 'precise',
      capturedAt: '2026-04-24T00:00:00.000Z',
      sourceMode: 'paged',
      resolverVersion: 1,
    });

    await expect(readReaderProgressSnapshot(7)).resolves.toMatchObject({
      novelId: 7,
      revision: 1,
      snapshot: {
        mode: 'paged',
        activeChapterIndex: 3,
        position: {
          type: 'locator',
          locator: {
            chapterIndex: 3,
            chapterKey: 'epub:ch3:chapter3.xhtml',
            blockIndex: 8,
            blockKey: 'anchor:intro',
            anchorId: 'intro',
            kind: 'text',
            lineIndex: 1,
            pageIndex: 5,
            textQuote: {
              exact: 'opening line',
            },
            blockTextHash: 'hash-block',
            contentVersion: 2,
            importFormatVersion: 1,
            contentHash: 'hash-content',
          },
        },
        projections: {
          paged: {
            pageIndex: 5,
            capturedAt: '2026-04-24T00:00:00.000Z',
            sourceMode: 'paged',
            basisCanonicalFingerprint: 'canonical-a',
            layoutKey: 'layout-a',
          },
          scroll: {
            chapterProgress: 0.58,
            capturedAt: '2026-04-24T00:00:00.000Z',
            sourceMode: 'paged',
            basisCanonicalFingerprint: 'canonical-a',
          },
          global: {
            globalPageIndex: 42,
            globalScrollOffset: 8192.25,
            capturedAt: '2026-04-24T00:00:00.000Z',
            sourceMode: 'paged',
            basisCanonicalFingerprint: 'canonical-a',
            layoutKey: 'layout-a',
          },
        },
        captureQuality: 'precise',
        capturedAt: '2026-04-24T00:00:00.000Z',
        sourceMode: 'paged',
        resolverVersion: 1,
      },
    });
  });

  it('normalizes approximate chapter-edge snapshots and increments revision', async () => {
    await replaceReaderProgressSnapshot(11, {
      mode: 'scroll',
      activeChapterIndex: 5,
      position: {
        type: 'chapter-edge',
        chapterIndex: 5,
        edge: 'start',
      },
      projections: {
        paged: {
          pageIndex: 4.9,
        },
        scroll: {
          chapterProgress: 1.4,
        },
      },
      captureQuality: 'approximate',
    });
    await replaceReaderProgressSnapshot(11, {
      mode: 'scroll',
      activeChapterIndex: 5,
      position: {
        type: 'chapter-edge',
        chapterIndex: 5,
        edge: 'end',
      },
      projections: {
        scroll: {
          chapterProgress: -1,
        },
      },
      captureQuality: 'approximate',
    });

    await expect(readReaderProgressSnapshot(11)).resolves.toEqual({
      novelId: 11,
      revision: 2,
      snapshot: {
        mode: 'scroll',
        activeChapterIndex: 5,
        position: {
          type: 'chapter-edge',
          chapterIndex: 5,
          edge: 'end',
        },
        projections: {
          scroll: {
            chapterProgress: 0,
          },
        },
        captureQuality: 'approximate',
      },
      updatedAt: expect.any(String),
    });
  });

  it('deletes snapshots by novel id', async () => {
    await replaceReaderProgressSnapshot(19, {
      mode: 'scroll',
      activeChapterIndex: 2,
      position: {
        type: 'chapter-edge',
        chapterIndex: 2,
        edge: 'start',
      },
      captureQuality: 'approximate',
    });

    await deleteReaderProgressSnapshot(19);

    await expect(readReaderProgressSnapshot(19)).resolves.toBeNull();
  });
});
