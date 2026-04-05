import type { Page } from '@playwright/test';

import { expect } from '@playwright/test';

import {
  RICH_EPUB_FIXTURES,
  type RichEpubFixtureId,
  buildRichEpubFixtureFile,
} from '../fixtures/richEpubFixtures';

type ReaderPageTurnModeLabel = 'Cover' | 'No Animation' | 'Slide' | 'Vertical';

type ReaderPageTurnModeId = 'cover' | 'none' | 'slide' | 'scroll';

interface ReaderPreferenceSnapshot {
  version: 1;
  appTheme: 'light';
  fontSize: number;
  lineSpacing: number;
  pageTurnMode: ReaderPageTurnModeId;
  paragraphSpacing: number;
  readerTheme: 'auto';
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
  pageTurnMode: ReaderPageTurnModeId,
): ReaderPreferenceSnapshot {
  return {
    version: 1,
    appTheme: 'light',
    fontSize: 18,
    lineSpacing: 1.8,
    pageTurnMode,
    paragraphSpacing: 16,
    readerTheme: 'auto',
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

export async function setPageTurnMode(
  page: Page,
  modeLabel: ReaderPageTurnModeLabel,
): Promise<void> {
  const pageTurnMode = toPageTurnModeId(modeLabel);
  const snapshot = createReaderPreferenceSnapshot(pageTurnMode);

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
  await page.reload();

  const target = pageTurnMode === 'scroll'
    ? page.getByTestId('reader-viewport')
    : page.getByTestId('paged-reader-interactive');

  await expect(target).toBeVisible({
    timeout: 30_000,
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

export async function seedPoemChapterContent(page: Page, params: {
  chapterIndex: number;
  novelId: number;
}): Promise<void> {
  await page.evaluate(async ({ chapterIndex, novelId }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('PlotMapAI');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['chapterRichContents'], 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      const store = transaction.objectStore('chapterRichContents');
      const index = store.index('[novelId+chapterIndex]');
      const query = index.openCursor(IDBKeyRange.only([novelId, chapterIndex]));

      query.onsuccess = () => {
        const cursor = query.result;
        if (!cursor) {
          store.add({
            novelId,
            chapterIndex,
            contentRich: [
              {
                type: 'poem',
                lines: [
                  [{ type: 'text', text: 'A brass rain crossed the bridge.' }],
                  [{ type: 'text', text: 'Mara counted the echo twice.' }],
                  [{ type: 'text', text: 'The city answered in lantern blue.' }],
                ],
              },
            ],
            contentPlain: 'A brass rain crossed the bridge.\nMara counted the echo twice.\nThe city answered in lantern blue.',
            contentFormat: 'rich',
            contentVersion: 7,
            importFormatVersion: 3,
            updatedAt: new Date().toISOString(),
          });
          return;
        }

        cursor.update({
          ...cursor.value,
          contentRich: [
            {
              type: 'poem',
              lines: [
                [{ type: 'text', text: 'A brass rain crossed the bridge.' }],
                [{ type: 'text', text: 'Mara counted the echo twice.' }],
                [{ type: 'text', text: 'The city answered in lantern blue.' }],
              ],
            },
          ],
          contentPlain: 'A brass rain crossed the bridge.\nMara counted the echo twice.\nThe city answered in lantern blue.',
          contentFormat: 'rich',
          contentVersion: 7,
          importFormatVersion: 3,
          updatedAt: new Date().toISOString(),
        });
      };
      query.onerror = () => reject(query.error);
    });

    db.close();
  }, params);
}
