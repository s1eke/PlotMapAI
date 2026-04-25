import type { Locator, Page } from '@playwright/test';

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

interface RelativeViewportPosition {
  xRatio: number;
  yRatio: number;
}

interface ResponsiveActivationOptions {
  position?: {
    x: number;
    y: number;
  };
  timeout?: number;
}

const RESPONSIVE_CHROME_TOGGLE_CANDIDATES: RelativeViewportPosition[] = [
  { xRatio: 0.5, yRatio: 0.35 },
  { xRatio: 0.5, yRatio: 0.5 },
  { xRatio: 0.5, yRatio: 0.22 },
];

interface ReaderTraceWindow extends Window {
  PlotMapAIReaderTrace?: {
    clear: () => void;
    enable: () => void;
  };
}

async function hasTouchInput(page: Page): Promise<boolean> {
  return page.evaluate(() => navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
}

export async function activateLocatorResponsive(
  page: Page,
  locator: Locator,
  options: ResponsiveActivationOptions = {},
): Promise<void> {
  if (await hasTouchInput(page)) {
    await locator.tap(options);
    return;
  }

  await locator.click(options);
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
    textQuoteExact: string | null;
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
  await activateLocatorResponsive(page, page.getByRole('link', { name: 'Start Reading' }).first());
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
    const reportedBranch = viewport instanceof HTMLElement
      ? viewport.dataset.readerBranch ?? null
      : null;
    let branch: ReaderBranch = 'unknown';

    if (reportedBranch === 'paged' || reportedBranch === 'scroll') {
      branch = reportedBranch;
    } else if (reportedBranch !== 'summary') {
      if (pagedInteractive) {
        branch = 'paged';
      } else if (style?.overflowY === 'auto') {
        branch = 'scroll';
      }
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

export async function waitForPagedViewportPageIndex(
  page: Page,
  expectedPageIndex: number,
  options?: {
    description?: string;
    timeout?: number;
    tolerance?: number;
  },
): Promise<ReaderViewportSnapshot> {
  let snapshot: ReaderViewportSnapshot | null = null;
  const tolerance = options?.tolerance ?? 0;

  await expect.poll(async () => {
    snapshot = await readReaderViewportSnapshot(page);
    return snapshot.branch === 'paged'
      && snapshot.currentPageIndex !== null
      && Math.abs(snapshot.currentPageIndex - expectedPageIndex) <= tolerance;
  }, {
    message: options?.description,
    timeout: options?.timeout ?? 10_000,
  }).toBe(true);

  if (!snapshot) {
    throw new Error('Paged viewport snapshot did not settle at the expected page index.');
  }

  return snapshot;
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
        const transaction = db.transaction(['readerProgress'], 'readonly');
        transaction.onerror = () => reject(transaction.error);
        const store = transaction.objectStore('readerProgress');
        const request = store.get(targetNovelId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result as Record<string, unknown> | undefined);
      });

      if (!record) {
        return null;
      }

      const position = (
        record.position
        && typeof record.position === 'object'
        && !Array.isArray(record.position)
      )
        ? record.position as Record<string, unknown>
        : null;
      const locator = (
        position?.type === 'locator'
        && position.locator
        && typeof position.locator === 'object'
        && !Array.isArray(position.locator)
      )
        ? position.locator as Record<string, unknown>
        : null;
      const projections = (
        record.projections
        && typeof record.projections === 'object'
        && !Array.isArray(record.projections)
      )
        ? record.projections as Record<string, unknown>
        : null;
      let canonicalChapterIndex: number | null = null;
      if (typeof locator?.chapterIndex === 'number') {
        canonicalChapterIndex = locator.chapterIndex;
      } else if (typeof position?.chapterIndex === 'number') {
        canonicalChapterIndex = position.chapterIndex;
      }

      let canonicalEdge: 'start' | 'end' | null = null;
      if (locator?.edge === 'start' || locator?.edge === 'end') {
        canonicalEdge = locator.edge;
      } else if (position?.edge === 'start' || position?.edge === 'end') {
        canonicalEdge = position.edge;
      }

      let persistedPageIndex: number | null = null;
      if (typeof projections?.pagedPageIndex === 'number') {
        persistedPageIndex = projections.pagedPageIndex;
      } else if (typeof locator?.pageIndex === 'number') {
        persistedPageIndex = locator.pageIndex;
      }
      const textQuote = (
        locator?.textQuote
        && typeof locator.textQuote === 'object'
        && !Array.isArray(locator.textQuote)
      )
        ? locator.textQuote as Record<string, unknown>
        : null;

      return {
        canonical: {
          blockIndex: typeof locator?.blockIndex === 'number' ? locator.blockIndex : null,
          chapterIndex: canonicalChapterIndex,
          edge: canonicalEdge,
          kind: typeof locator?.kind === 'string' ? locator.kind : null,
          lineIndex: typeof locator?.lineIndex === 'number' ? locator.lineIndex : null,
          textQuoteExact: typeof textQuote?.exact === 'string' ? textQuote.exact : null,
        },
        chapterProgress: typeof projections?.scrollChapterProgress === 'number'
          ? projections.scrollChapterProgress
          : null,
        contentMode: record.mode === 'scroll' || record.mode === 'paged'
          ? record.mode
          : null,
        pageIndex: persistedPageIndex,
        revision: typeof record.revision === 'number' ? record.revision : null,
        updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null,
        viewMode: 'original',
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
      ? document.querySelector('[data-testid="paged-reader-content-body"]')
      : viewport;

    if (!(container instanceof HTMLElement)) {
      return null;
    }

    const candidates = Array.from(container.querySelectorAll(
      'p, h1, h2, h3, h4, h5, h6, [data-testid="reader-flow-text-fragment"]',
    ));
    const viewportRect = viewport.getBoundingClientRect();
    const visibleTop = viewportRect.top;
    const visibleBottom = viewportRect.bottom;
    const preferredCenter = visibleTop + viewportRect.height * 0.48;

    let fallbackAnchor: VisibleContentAnchor | null = null;
    let bestAnchor: VisibleContentAnchor | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const element of candidates) {
      const rect = element.getBoundingClientRect();
      if (rect.top >= visibleTop && rect.top < visibleBottom && rect.height > 0) {
        const text = (element.textContent ?? '').trim();
        if (text.length === 0) {
          continue;
        }

        const anchor = {
          offsetTop: Math.round(rect.top - visibleTop),
          tagName: element.tagName.toLowerCase(),
          textSnippet: text.slice(0, 80),
        };
        if (!fallbackAnchor) {
          fallbackAnchor = anchor;
        }
        if (text.length >= 40) {
          const centerDistance = Math.abs(rect.top + rect.height / 2 - preferredCenter);
          if (!bestAnchor || centerDistance < bestDistance) {
            bestAnchor = anchor;
            bestDistance = centerDistance;
          }
        }
      }
    }

    return bestAnchor ?? fallbackAnchor;
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

interface TestFilePayload {
  buffer: Buffer;
  mimeType: string;
  name: string;
}

export async function importEpubToDetailPage(
  page: Page,
  file: TestFilePayload,
  title: string,
): Promise<{ novelId: number; title: string }> {
  await page.goto('/');
  await disableAnimations(page);
  await page.getByRole('button', { name: 'Upload' }).first().click();
  await page.locator('input[type="file"][accept=".txt,.epub"]').setInputFiles(file);
  await expect(page.getByRole('link', { name: title })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('link', { name: title }).click();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();

  return {
    novelId: readNovelIdFromUrl(page.url()),
    title,
  };
}

async function clickReaderViewportRelative(
  page: Page,
  position: RelativeViewportPosition,
): Promise<void> {
  const viewport = page.getByTestId('reader-viewport');
  const box = await viewport.boundingBox();
  if (!box) {
    throw new Error('Reader viewport is not visible for relative tap/click interaction.');
  }

  // 阅读器视口用 React onClick 接收移动端兼容点击；Playwright 的 tap 只发 touch 事件，
  // 在这里不会触发显示/隐藏 chrome 或分页区域点击。
  await viewport.click({
    position: {
      x: Math.max(1, Math.min(box.width - 1, Math.round(box.width * position.xRatio))),
      y: Math.max(1, Math.min(box.height - 1, Math.round(box.height * position.yRatio))),
    },
  });
}

async function getFirstVisibleLocator(selectors: string[], page: Page) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      return locator;
    }
  }

  throw new Error(`Could not find any visible element for selectors: ${selectors.join(', ')}`);
}

async function getResponsiveReaderExitControl(page: Page) {
  return getFirstVisibleLocator([
    'button[title="Exit Reader"]:visible',
    '[aria-label="Exit Reader"]:visible',
    'a:has-text("Exit Reader"):visible',
  ], page);
}

async function isLocatorInViewport(locator: Locator): Promise<boolean> {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return rect.width > 0
      && rect.height > 0
      && centerX >= 0
      && centerY >= 0
      && centerX <= window.innerWidth
      && centerY <= window.innerHeight;
  }).catch(() => false);
}

async function waitForResponsiveReaderExitControlInViewport(
  page: Page,
  timeoutMs: number,
): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const control = await getResponsiveReaderExitControl(page).catch(() => null);
    if (control && await isLocatorInViewport(control)) {
      return control;
    }
    await page.waitForTimeout(50);
  }

  return null;
}

export async function hideReaderChrome(page: Page): Promise<void> {
  const exitReaderLink = page.getByRole('link', { name: 'Exit Reader' }).first();
  const isVisible = await exitReaderLink.isVisible().catch(() => false);
  if (!isVisible) {
    return;
  }

  await page.getByTestId('reader-viewport').click({ position: { x: 400, y: 200 } });

  try {
    await expect(exitReaderLink).not.toBeVisible({ timeout: 3_000 });
  } catch {
    await page.getByTestId('reader-viewport').click({ position: { x: 400, y: 200 } });
    await expect(exitReaderLink).not.toBeVisible({ timeout: 5_000 });
  }
}

export async function revealReaderChromeResponsive(page: Page): Promise<void> {
  const exitReaderControl = await waitForResponsiveReaderExitControlInViewport(page, 100);
  if (exitReaderControl) {
    return;
  }

  for (const position of RESPONSIVE_CHROME_TOGGLE_CANDIDATES) {
    await clickReaderViewportRelative(page, position);
    const visibleControl = await waitForResponsiveReaderExitControlInViewport(page, 1_400);
    if (visibleControl) {
      return;
    }
  }

  const exitReaderFallback = await getResponsiveReaderExitControl(page);
  await expect(exitReaderFallback).toBeInViewport({ timeout: 8_000 });
}

export async function hideReaderChromeResponsive(page: Page): Promise<void> {
  const exitReaderControl = await waitForResponsiveReaderExitControlInViewport(page, 100);
  if (!exitReaderControl) {
    return;
  }

  for (const position of RESPONSIVE_CHROME_TOGGLE_CANDIDATES) {
    await clickReaderViewportRelative(page, position);
    const visibleControl = await waitForResponsiveReaderExitControlInViewport(page, 1_000);
    if (!visibleControl) {
      return;
    }
  }

  const exitReaderFallback = await getResponsiveReaderExitControl(page);
  await expect(exitReaderFallback).not.toBeInViewport({ timeout: 8_000 });
}

/**
 * 通过点击阅读器视口的中心区域显现阅读器界面（顶部栏 + 底部工具栏）。
 * 界面初始状态为隐藏（isChromeVisible = false），因此第一次在中心区域（25%–75% x 轴）的点击总会将其切换为可见状态。
 *
 * 等待顶部栏中的“退出阅读”链接进入视口，以便调用者在此函数返回后立即与界面元素交互。
 */
export async function revealReaderChrome(page: Page): Promise<void> {
  // 在视口的水平中心点击 —— 对滚动和分页模式都安全
  // （分页模式：左侧 < 25% 翻上页，右侧 > 75% 翻下页，中心显示/隐藏界面）。
  await page.getByTestId('reader-viewport').click({ position: { x: 400, y: 200 } });
  // 等待顶部栏动画进入视口（framer-motion 弹性动画）。
  await expect(
    page.getByRole('link', { name: 'Exit Reader' }).first(),
  ).toBeInViewport({ timeout: 8_000 });
}

/**
 * 通过真实的阅读器退出控件（移动端返回按钮 / 桌面端退出链接）退出到书籍详情页。
 * 该路径会触发阅读器页面中的退出前刷新逻辑，行为更接近真实用户操作。
 */
export async function exitReaderToDetailPageByUi(page: Page): Promise<void> {
  let didNavigate = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await revealReaderChromeResponsive(page);
    const control = await waitForResponsiveReaderExitControlInViewport(page, 1_500);
    if (!control) {
      continue;
    }

    await activateLocatorResponsive(page, control, { timeout: 8_000 });

    didNavigate = await page.getByRole('link', { name: 'Start Reading' }).first()
      .isVisible()
      .catch(() => false);
    if (!didNavigate) {
      didNavigate = await expect(
        page.getByRole('link', { name: 'Start Reading' }).first(),
      ).toBeVisible({ timeout: 4_000 }).then(() => true).catch(() => false);
    }
    if (didNavigate) {
      break;
    }

    const readerViewportVisible = await page.getByTestId('reader-viewport').isVisible().catch(() => false);
    if (readerViewportVisible) {
      await hideReaderChromeResponsive(page);
    }
  }

  if (!didNavigate) {
    throw new Error('Failed to exit reader via visible Exit Reader control.');
  }

  await disableAnimations(page);
  await expect(page.getByRole('link', { name: 'Start Reading' })).toBeVisible({ timeout: 15_000 });
}

export async function exitAndReopenReaderByUiResponsive(page: Page): Promise<void> {
  await exitReaderToDetailPageByUi(page);
  const startReadingLink = page.getByRole('link', { name: 'Start Reading' }).first();
  await expect(startReadingLink).toBeVisible({ timeout: 15_000 });
  await activateLocatorResponsive(page, startReadingLink);
  await expect(page.getByTestId('reader-viewport')).toBeVisible({ timeout: 30_000 });
  await disableAnimations(page);
}

/**
 * 通过直接导航到书籍详情 URL 退出阅读器。这是一个完整的 SPA 顶层导航（通过哈希路由），因此：
 *  • 避免了“退出阅读”链接可能存在的界面可见性问题，并且
 *  • 促使应用在下一次加载页面时重新读取 localStorage 中的偏好设置。
 */
export async function exitReaderToDetailPage(page: Page): Promise<void> {
  const match = page.url().match(/\/novel\/(\d+)/u);
  if (!match) {
    throw new Error(`Cannot determine novel ID from current URL: ${page.url()}`);
  }
  await page.goto(`/#/novel/${match[1]}`);
  await disableAnimations(page);
  await expect(page.getByRole('link', { name: 'Start Reading' })).toBeVisible({ timeout: 15_000 });
}

/**
 * 通过完整页面加载（page.goto）直接导航到阅读器页面。
 * 这确保了应用会重新读取 localStorage 中的偏好设置，当你修改了设置（例如阅读翻页模式）
 * 且在调用此功能前未刷新页面时，这是必需的。
 */
export async function openReaderDirect(page: Page, novelId: number): Promise<void> {
  // 带哈希 URL 的 page.goto 是同文档导航 —— SPA 应用并未重新加载，
  // 内存中的偏好设置存储也不会从 localStorage 中重新读取。
  // 立即调用 page.reload()，以便应用重新启动并获取最新的偏好设置
  // （例如刚通过 setReaderPreferences 写入的 pageTurnMode: 'slide'）。
  await page.goto(`/#/novel/${novelId}/read`);
  await page.reload();
  await disableAnimations(page);
  // 阅读器的分支（滚动和分页）都使用 reader-viewport 作为容器元素的测试 ID；等待其中任何一个出现即可。
  // 使用 .first() 以避免严格模式错误：在分页模式下，两个测试 ID 可能会同时出现在 DOM 中。
  await expect(
    page.locator('[data-testid="reader-viewport"], [data-testid="paged-reader-interactive"]').first(),
  ).toBeVisible({ timeout: 30_000 });
}

export async function exitAndReopenReader(page: Page): Promise<void> {
  await exitReaderToDetailPage(page);
  // 通过 SPA 导航重新进入，以便阅读器从持久化状态中进行水合。
  await activateLocatorResponsive(page, page.getByRole('link', { name: 'Start Reading' }).first());
  await expect(page.getByTestId('reader-viewport')).toBeVisible({ timeout: 30_000 });
  await disableAnimations(page);
}

/**
 * 在分页模式阅读器中，通过点击右侧导航区域（视口宽度的 75% 以上）前进一页。
 * 这避免了依赖界面工具栏，因为工具栏使用了 framer-motion 的弹性动画，
 * 可能会干扰 Playwright 在分页模式下的点击可操作性检查。
 *
 * 重要提示：仅在阅读器界面隐藏时（初始状态或前一次点击右侧区域后）调用此方法。
 * 如果界面当前可见，点击阅读器视口将隐藏界面而非进行翻页导航。
 */
export async function clickNextPage(page: Page): Promise<void> {
  // 在 1440 像素的视口上 x = 1300 像素 ≈ 90% —— 处于右侧区域内（> 75%）。
  await page.getByTestId('reader-viewport').click({ position: { x: 1300, y: 480 } });
}

export async function clickNextPageResponsive(page: Page): Promise<void> {
  await clickReaderViewportRelative(page, { xRatio: 0.9, yRatio: 0.5 });
}

/**
 * 打开目录侧边栏并根据标题点击章节。
 * 显现阅读器界面，因为顶部栏初始时是隐藏的。
 */
export async function navigateToChapterByTitle(page: Page, chapterTitle: string): Promise<void> {
  await revealReaderChrome(page);
  // DOM 中存在两个“目录”按钮（桌面版顶部栏 + 移动版工具栏）。
  // 使用 .first() 以可靠地选取桌面版顶部栏按钮（DOM 顺序中的第一个）。
  // 显式等待按钮进入视口，以便在尝试点击前让 framer-motion 弹性动画完全稳定。
  const contentsButton = page.getByTitle('Contents').first();
  await expect(contentsButton).toBeInViewport({ timeout: 8_000 });
  // 使用 force: true 绕过 Playwright 的滚动至可视区域步骤。在分页模式且界面可见的情况下，
  // 对 reader-viewport 的滚动事件会触发 onBlockedInteraction，
  // 这会在点击落在工具栏按钮上之前隐藏界面。
  await contentsButton.click({ force: true });
  await page.getByRole('button', { name: chapterTitle }).click();
  // 等待导航到章节后视口保持稳定。
  await expect(page.getByTestId('reader-viewport')).toBeVisible({ timeout: 15_000 });
  // revealReaderChrome() 之前将 isChromeVisible 设置为 true，且在章节选择后保持为 true。
  // 点击视口中心一次以关闭界面（handleContentClick: isChromeVisible=true → setIsChromeVisible(false)），
  // 以便后续依赖未锁定视口状态的交互与断言能够稳定运行。
  await page.getByTestId('reader-viewport').click({ position: { x: 400, y: 200 } });
}

export async function navigateToChapterByTitleResponsive(
  page: Page,
  chapterTitle: string,
): Promise<void> {
  await revealReaderChromeResponsive(page);
  const contentsButton = await getFirstVisibleLocator([
    'button[title="Contents"]:visible',
    '[title="Contents"]:visible',
    '[aria-label="Contents"]:visible',
  ], page);
  await activateLocatorResponsive(page, contentsButton);
  const contentsDialog = page.getByRole('dialog').first();
  await expect(contentsDialog).toBeVisible({ timeout: 8_000 });

  const chapterButton = contentsDialog.getByRole('button', { name: chapterTitle }).first();
  await activateLocatorResponsive(page, chapterButton);

  await expect(contentsDialog).not.toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole('heading', { name: chapterTitle }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('reader-viewport')).toBeVisible({ timeout: 15_000 });
  await hideReaderChromeResponsive(page);
}
