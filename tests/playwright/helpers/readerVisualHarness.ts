import type { Page } from '@playwright/test';

import { expect } from '@playwright/test';

import {
  RICH_EPUB_FIXTURES,
  type RichEpubFixtureId,
  buildRichEpubFixtureFile,
} from '../fixtures/richEpubFixtures';

type ReaderPageTurnModeLabel = 'Cover' | 'No Animation' | 'Slide' | 'Vertical';

type ReaderPageTurnModeId = 'cover' | 'none' | 'slide' | 'scroll';
type ReaderThemeId = 'auto' | 'paper' | 'parchment' | 'green' | 'night';
type ReaderBranch = 'paged' | 'scroll' | 'unknown';

interface ReaderTraceWindow extends Window {
  PlotMapAIReaderTrace?: {
    clear: () => void;
    enable: () => void;
  };
}

interface SeedRichInlineText {
  marks?: Array<'bold' | 'italic' | 'underline' | 'strike' | 'sup' | 'sub'>;
  text: string;
  type: 'text';
}

interface SeedRichInlineLineBreak {
  type: 'lineBreak';
}

interface SeedRichInlineLink {
  children: SeedRichInline[];
  href: string;
  type: 'link';
}

type SeedRichInline =
  | SeedRichInlineLineBreak
  | SeedRichInlineLink
  | SeedRichInlineText;

interface SeedRichHeadingBlock {
  align?: 'left' | 'center' | 'right';
  anchorId?: string;
  children: SeedRichInline[];
  level: 1 | 2 | 3 | 4 | 5 | 6;
  type: 'heading';
}

interface SeedRichParagraphBlock {
  align?: 'left' | 'center' | 'right';
  anchorId?: string;
  children: SeedRichInline[];
  indent?: number;
  type: 'paragraph';
}

interface SeedRichBlockquoteBlock {
  children: SeedRichBlock[];
  type: 'blockquote';
}

interface SeedRichListBlock {
  items: SeedRichBlock[][];
  ordered: boolean;
  type: 'list';
}

interface SeedRichImageBlock {
  align?: 'left' | 'center' | 'right';
  alt?: string;
  anchorId?: string;
  caption?: SeedRichInline[];
  key: string;
  type: 'image';
}

interface SeedRichHorizontalRuleBlock {
  anchorId?: string;
  type: 'hr';
}

interface SeedRichPoemBlock {
  anchorId?: string;
  lines: SeedRichInline[][];
  type: 'poem';
}

interface SeedRichTableCell {
  children: SeedRichInline[];
}

interface SeedRichTableBlock {
  anchorId?: string;
  rows: SeedRichTableCell[][];
  type: 'table';
}

interface SeedRichUnsupportedBlock {
  fallbackText: string;
  originalTag?: string;
  type: 'unsupported';
}

type SeedRichBlock =
  | SeedRichBlockquoteBlock
  | SeedRichHeadingBlock
  | SeedRichHorizontalRuleBlock
  | SeedRichImageBlock
  | SeedRichListBlock
  | SeedRichParagraphBlock
  | SeedRichPoemBlock
  | SeedRichTableBlock
  | SeedRichUnsupportedBlock;

interface ReaderPreferenceSnapshot {
  version: 1;
  appTheme: 'light';
  fontSize: number;
  lineSpacing: number;
  pageTurnMode: ReaderPageTurnModeId;
  paragraphSpacing: number;
  readerTheme: ReaderThemeId;
}

interface ReaderPreferenceOverrides {
  fontSize?: number;
  lineSpacing?: number;
  pageTurnMode?: ReaderPageTurnModeId;
  paragraphSpacing?: number;
  readerTheme?: ReaderThemeId;
}

export interface ReaderViewportSnapshot {
  branch: ReaderBranch;
  clientHeight: number | null;
  currentPage: number | null;
  currentPageIndex: number | null;
  hasPagedInteractive: boolean;
  maxScrollTop: number | null;
  overflowY: string | null;
  pageCount: number | null;
  pageIndicator: string | null;
  scrollHeight: number | null;
  scrollProgress: number | null;
  scrollTop: number | null;
}

export interface PersistedReadingProgressSnapshot {
  canonical: {
    blockIndex: number | null;
    chapterIndex: number | null;
    edge: 'start' | 'end' | null;
    kind: string | null;
    lineIndex: number | null;
  };
  chapterProgress: number | null;
  contentMode: 'scroll' | 'paged' | null;
  pageIndex: number | null;
  revision: number | null;
  updatedAt: string | null;
  viewMode: 'original' | 'summary' | null;
}

interface SeedChapterRichContentParams {
  chapterIndex: number;
  contentVersion?: number;
  importFormatVersion?: number;
  novelId: number;
  plainText: string;
  richBlocks: SeedRichBlock[];
}

function readNovelIdFromUrl(url: string): number {
  const match = url.match(/\/novel\/(\d+)/u);
  if (!match) {
    throw new Error(`Unable to resolve novel id from url: ${url}`);
  }

  return Number(match[1]);
}

function toPageTurnModeId(modeLabel: ReaderPageTurnModeLabel): ReaderPageTurnModeId {
  switch (modeLabel) {
    case 'Cover':
      return 'cover';
    case 'No Animation':
      return 'none';
    case 'Slide':
      return 'slide';
    case 'Vertical':
      return 'scroll';
    default:
      return 'scroll';
  }
}

function createReaderPreferenceSnapshot(
  overrides: ReaderPreferenceOverrides = {},
): ReaderPreferenceSnapshot {
  return {
    version: 1,
    appTheme: 'light',
    fontSize: overrides.fontSize ?? 18,
    lineSpacing: overrides.lineSpacing ?? 1.8,
    pageTurnMode: overrides.pageTurnMode ?? 'scroll',
    paragraphSpacing: overrides.paragraphSpacing ?? 16,
    readerTheme: overrides.readerTheme ?? 'auto',
  };
}

export async function disableAnimations(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *,
      *::before,
      *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
      }
    `,
  });
}

export async function importFixtureToDetailPage(
  page: Page,
  fixtureId: RichEpubFixtureId,
): Promise<{ novelId: number; title: string }> {
  const fixture = RICH_EPUB_FIXTURES[fixtureId];
  await page.goto('/');
  await disableAnimations(page);
  await page.getByRole('button', { name: 'Upload' }).first().click();
  await page.locator('input[type="file"][accept=".txt,.epub"]').setInputFiles(
    await buildRichEpubFixtureFile(fixtureId),
  );
  await expect(page.getByRole('link', { name: fixture.title })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('link', { name: fixture.title }).click();
  await expect(page.getByRole('heading', { name: fixture.title, level: 1 })).toBeVisible();

  return {
    novelId: readNovelIdFromUrl(page.url()),
    title: fixture.title,
  };
}

export async function openReaderFromDetailPage(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Start Reading' }).click();
  await expect(page.getByTestId('reader-viewport')).toBeVisible({
    timeout: 30_000,
  });
}

export async function enableReaderTrace(
  page: Page,
  initialBranch: 'scroll' | 'paged' = 'scroll',
): Promise<void> {
  const nextUrl = new URL(page.url());
  nextUrl.searchParams.set('readerTrace', '1');
  await page.goto(nextUrl.toString());
  await disableAnimations(page);
  await waitForReaderBranch(page, initialBranch);
  await page.evaluate(() => {
    const traceWindow = window as ReaderTraceWindow;
    traceWindow.PlotMapAIReaderTrace?.clear();
    traceWindow.PlotMapAIReaderTrace?.enable();
  });
}

export async function readReaderViewportSnapshot(page: Page): Promise<ReaderViewportSnapshot> {
  return page.evaluate(() => {
    const pagedInteractive = document.querySelector('[data-testid="paged-reader-interactive"]');
    const viewport = document.querySelector('[data-testid="reader-viewport"]');
    const style = viewport instanceof HTMLElement ? window.getComputedStyle(viewport) : null;
    let branch: ReaderBranch = 'unknown';

    if (pagedInteractive) {
      branch = 'paged';
    } else if (style?.overflowY === 'auto') {
      branch = 'scroll';
    }

    const scrollTop = viewport instanceof HTMLElement ? viewport.scrollTop : null;
    const scrollHeight = viewport instanceof HTMLElement ? viewport.scrollHeight : null;
    const clientHeight = viewport instanceof HTMLElement ? viewport.clientHeight : null;
    const maxScrollTop = (
      typeof scrollHeight === 'number'
      && typeof clientHeight === 'number'
    )
      ? Math.max(0, scrollHeight - clientHeight)
      : null;
    const scrollProgress = (
      typeof scrollTop === 'number'
      && typeof maxScrollTop === 'number'
      && maxScrollTop > 0
    )
      ? scrollTop / maxScrollTop
      : null;

    let pageIndicator: string | null = null;
    const pageFrame = document.querySelector('[data-testid="paged-reader-page-frame"]');
    const chapterWrapper = pageFrame instanceof HTMLElement ? pageFrame.firstElementChild : null;
    const header = chapterWrapper instanceof HTMLElement ? chapterWrapper.firstElementChild : null;
    if (header instanceof HTMLElement) {
      const indicatorText = Array.from(header.querySelectorAll('div'))
        .map((element) => element.textContent?.trim() ?? '')
        .find((text) => /^\d+\s*\/\s*\d+$/u.test(text));
      pageIndicator = indicatorText ?? null;
    }

    const pageMatch = pageIndicator?.match(/^(\d+)\s*\/\s*(\d+)$/u) ?? null;
    const currentPage = pageMatch ? Number(pageMatch[1]) : null;
    const pageCount = pageMatch ? Number(pageMatch[2]) : null;

    return {
      branch,
      clientHeight,
      currentPage,
      currentPageIndex: currentPage === null ? null : currentPage - 1,
      hasPagedInteractive: Boolean(pagedInteractive),
      maxScrollTop,
      overflowY: style?.overflowY ?? null,
      pageCount,
      pageIndicator,
      scrollHeight,
      scrollProgress,
      scrollTop,
    } satisfies ReaderViewportSnapshot;
  });
}

export async function waitForReaderBranch(
  page: Page,
  branch: Exclude<ReaderBranch, 'unknown'>,
  options?: {
    timeout?: number;
  },
): Promise<ReaderViewportSnapshot> {
  await expect.poll(async () => {
    const snapshot = await readReaderViewportSnapshot(page);
    return snapshot.branch;
  }, {
    timeout: options?.timeout ?? 30_000,
  }).toBe(branch);

  const stabilizedSnapshot = await readReaderViewportSnapshot(page);
  if (stabilizedSnapshot.branch !== branch) {
    throw new Error(`Expected reader branch ${branch}, but it did not stabilize.`);
  }

  return stabilizedSnapshot;
}

export async function readPersistedReadingProgress(
  page: Page,
  novelId: number,
): Promise<PersistedReadingProgressSnapshot | null> {
  return page.evaluate(async (targetNovelId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('PlotMapAI');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      const record = await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
        const transaction = db.transaction(['readingProgress'], 'readonly');
        transaction.onerror = () => reject(transaction.error);
        const store = transaction.objectStore('readingProgress');
        const request = store.index('novelId').get(targetNovelId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result as Record<string, unknown> | undefined);
      });

      if (!record) {
        return null;
      }

      const canonical = (
        record.canonical
        && typeof record.canonical === 'object'
        && !Array.isArray(record.canonical)
      )
        ? record.canonical as Record<string, unknown>
        : null;

      return {
        canonical: {
          blockIndex: typeof canonical?.blockIndex === 'number' ? canonical.blockIndex : null,
          chapterIndex: typeof canonical?.chapterIndex === 'number' ? canonical.chapterIndex : null,
          edge: canonical?.edge === 'start' || canonical?.edge === 'end' ? canonical.edge : null,
          kind: typeof canonical?.kind === 'string' ? canonical.kind : null,
          lineIndex: typeof canonical?.lineIndex === 'number' ? canonical.lineIndex : null,
        },
        chapterProgress: typeof record.chapterProgress === 'number' ? record.chapterProgress : null,
        contentMode: record.contentMode === 'scroll' || record.contentMode === 'paged'
          ? record.contentMode
          : null,
        pageIndex: typeof record.pageIndex === 'number' ? record.pageIndex : null,
        revision: typeof record.revision === 'number' ? record.revision : null,
        updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null,
        viewMode: record.viewMode === 'original' || record.viewMode === 'summary'
          ? record.viewMode
          : null,
      } satisfies PersistedReadingProgressSnapshot;
    } finally {
      db.close();
    }
  }, novelId);
}

export async function waitForPersistedReadingProgress(
  page: Page,
  novelId: number,
  predicate: (snapshot: PersistedReadingProgressSnapshot | null) => boolean = (snapshot) => (
    snapshot !== null
  ),
  options?: {
    description?: string;
    timeout?: number;
  },
): Promise<PersistedReadingProgressSnapshot> {
  let matchingSnapshot: PersistedReadingProgressSnapshot | null = null;

  await expect.poll(async () => {
    const snapshot = await readPersistedReadingProgress(page, novelId);
    if (predicate(snapshot) && snapshot) {
      matchingSnapshot = snapshot;
      return true;
    }

    return false;
  }, {
    message: options?.description,
    timeout: options?.timeout ?? 10_000,
  }).toBe(true);

  if (!matchingSnapshot) {
    throw new Error('Persisted reading progress did not satisfy the expected condition.');
  }

  return matchingSnapshot;
}

export async function waitForReaderViewportImages(
  page: Page,
  minimumCount = 1,
): Promise<void> {
  const viewportImages = page.getByTestId('reader-viewport').locator('img');

  await expect.poll(async () => viewportImages.count()).toBeGreaterThanOrEqual(minimumCount);
  await expect.poll(async () => viewportImages.evaluateAll((images) => {
    return images.every((image) => {
      return image instanceof HTMLImageElement
        && image.complete
        && image.naturalWidth > 0
        && image.naturalHeight > 0;
    });
  })).toBe(true);
}

export async function setReaderPreferences(
  page: Page,
  overrides: ReaderPreferenceOverrides,
  options?: {
    reload?: boolean;
    waitForReader?: boolean;
  },
): Promise<void> {
  const snapshot = createReaderPreferenceSnapshot(overrides);
  await page.evaluate(async (nextSnapshot) => {
    window.localStorage.setItem('reader-preferences', JSON.stringify(nextSnapshot));
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('PlotMapAI');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['appSettings'], 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      transaction.objectStore('appSettings').put({
        key: 'reader.preferences',
        value: nextSnapshot,
        updatedAt: new Date().toISOString(),
      });
    });

    db.close();
  }, snapshot);

  if (!options?.reload) {
    return;
  }

  await page.reload();
  await disableAnimations(page);

  if (options.waitForReader) {
    const target = snapshot.pageTurnMode === 'scroll'
      ? page.getByTestId('reader-viewport')
      : page.getByTestId('paged-reader-interactive');

    await expect(target).toBeVisible({
      timeout: 30_000,
    });
  }
}

export async function setPageTurnMode(
  page: Page,
  modeLabel: ReaderPageTurnModeLabel,
): Promise<void> {
  await setReaderPreferences(page, {
    pageTurnMode: toPageTurnModeId(modeLabel),
  }, {
    reload: true,
    waitForReader: true,
  });
}

export async function seedChapterRichContent(
  page: Page,
  params: SeedChapterRichContentParams,
): Promise<void> {
  await page.evaluate(async (nextContent) => {
    function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('PlotMapAI');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['chapterRichContents'], 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      async function writeRichContent(): Promise<void> {
        const store = transaction.objectStore('chapterRichContents');
        const existingKey = await requestToPromise(
          store.index('[novelId+chapterIndex]').getKey([
            nextContent.novelId,
            nextContent.chapterIndex,
          ]),
        );

        if (typeof existingKey === 'number') {
          store.delete(existingKey);
        }

        store.put({
          novelId: nextContent.novelId,
          chapterIndex: nextContent.chapterIndex,
          contentRich: nextContent.richBlocks,
          contentPlain: nextContent.plainText,
          contentFormat: 'rich',
          contentVersion: nextContent.contentVersion ?? 4,
          importFormatVersion: nextContent.importFormatVersion ?? 1,
          updatedAt: new Date().toISOString(),
        });
      }

      writeRichContent().catch(reject);
    });

    db.close();
  }, params);
}

export interface VisibleContentAnchor {
  offsetTop: number;
  tagName: string;
  textSnippet: string;
}

export async function readVisibleContentAnchor(page: Page): Promise<VisibleContentAnchor | null> {
  return page.evaluate(() => {
    const viewport = document.querySelector('[data-testid="reader-viewport"]');
    if (!(viewport instanceof HTMLElement)) {
      return null;
    }

    const isPaged = Boolean(document.querySelector('[data-testid="paged-reader-interactive"]'));
    const container = isPaged
      ? document.querySelector('[data-testid="paged-reader-page-frame"]')
      : viewport;

    if (!(container instanceof HTMLElement)) {
      return null;
    }

    const candidates = Array.from(container.querySelectorAll('p, h1, h2, h3, h4, h5, h6'));
    const viewportRect = viewport.getBoundingClientRect();
    const visibleTop = viewportRect.top;
    const visibleBottom = viewportRect.bottom;

    for (const element of candidates) {
      const rect = element.getBoundingClientRect();
      if (rect.top >= visibleTop && rect.top < visibleBottom && rect.height > 0) {
        const text = (element.textContent ?? '').trim();
        if (text.length === 0) {
          continue;
        }

        return {
          offsetTop: Math.round(rect.top - visibleTop),
          tagName: element.tagName.toLowerCase(),
          textSnippet: text.slice(0, 80),
        };
      }
    }

    return null;
  });
}

export async function seedChapterAnalysis(page: Page, params: {
  chapterIndex: number;
  chapterTitle: string;
  novelId: number;
}): Promise<void> {
  await page.evaluate(async ({ chapterIndex, chapterTitle, novelId }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('PlotMapAI');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['chapterAnalyses'], 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      const store = transaction.objectStore('chapterAnalyses');
      store.put({
        id: 1,
        novelId,
        chapterIndex,
        chapterTitle,
        summary: 'Mara keeps the bridge watch while the city echoes back a warning.',
        keyPoints: [
          'Mara arrives before dawn.',
          'A hidden signal answers from beneath the bridge.',
        ],
        characters: [
          {
            name: 'Mara',
            role: 'Lead',
            description: 'A bridge watcher who reads the city by sound.',
            weight: 10,
          },
        ],
        relationships: [
          {
            source: 'Mara',
            target: 'The City',
            type: 'Signal',
            description: 'The city responds to Mara through echo and timing.',
            weight: 8,
          },
        ],
        tags: ['vigil', 'signal'],
        chunkIndex: 0,
        updatedAt: new Date().toISOString(),
      });
    });

    db.close();
  }, params);
}
