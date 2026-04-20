import type { Page } from '@playwright/test';

import { expect } from '@playwright/test';

import { buildTestEpubFile, TEST_BOOK_TITLE } from '../fixtures/testEpubFile';

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

export async function navigateToBookshelf(page: Page): Promise<void> {
  await page.goto('/');
  await disableAnimations(page);
}

export async function navigateToSettings(page: Page): Promise<void> {
  await page.goto('/#/settings');
  await disableAnimations(page);
}

export async function navigateToBookDetail(
  page: Page,
  novelId: number,
): Promise<void> {
  await page.goto(`/#/novel/${novelId}`);
  await disableAnimations(page);
}

export async function navigateToReader(
  page: Page,
  novelId: number,
): Promise<void> {
  await page.goto(`/#/novel/${novelId}/read`);
  await disableAnimations(page);
}

export async function navigateToCharacterGraph(
  page: Page,
  novelId: number,
): Promise<void> {
  await page.goto(`/#/novel/${novelId}/graph`);
  await disableAnimations(page);
}

function readNovelIdFromUrl(url: string): number {
  const match = url.match(/\/novel\/(\d+)/u);
  if (!match) {
    throw new Error(`Unable to resolve novel id from url: ${url}`);
  }
  return Number(match[1]);
}

export async function importTestBook(
  page: Page,
): Promise<{ novelId: number; title: string }> {
  await page.goto('/');
  await disableAnimations(page);
  await page.getByRole('button', { name: 'Upload' }).first().click();
  await page.locator('input[type="file"][accept=".txt,.epub"]').setInputFiles(
    await buildTestEpubFile(),
  );
  await expect(page.getByRole('link', { name: TEST_BOOK_TITLE })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('link', { name: TEST_BOOK_TITLE }).click();
  await expect(page.getByRole('heading', { name: TEST_BOOK_TITLE, level: 1 })).toBeVisible();

  return {
    novelId: readNovelIdFromUrl(page.url()),
    title: TEST_BOOK_TITLE,
  };
}

export async function assertHeaderVisible(page: Page): Promise<void> {
  await expect(page.locator('header').first()).toBeVisible();
  await expect(page.getByText('PlotMapAI').first()).toBeVisible();
}

export async function assertHeaderHidden(page: Page): Promise<void> {
  // The reader has its own <motion.header> (ReaderTopBar), so we check
  // the app-level navigation header is absent by looking for app chrome links.
  await expect(page.getByText('PlotMapAI').first()).not.toBeVisible();
}
