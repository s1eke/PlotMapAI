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
