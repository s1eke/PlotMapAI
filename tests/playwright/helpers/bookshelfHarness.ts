import type { Page } from '@playwright/test';

import { expect } from '@playwright/test';

import { buildTestEpubFile, TEST_BOOK_TITLE } from '../fixtures/testEpubFile';
import { disableAnimations } from './appHarness';

export async function openUploadModal(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Upload' }).first().click();
  await expect(page.locator('input[type="file"][accept=".txt,.epub"]')).toBeAttached();
}

export async function uploadEpubFile(page: Page): Promise<string> {
  const fileInput = page.locator('input[type="file"][accept=".txt,.epub"]');
  await fileInput.setInputFiles(await buildTestEpubFile());
  await expect(page.getByRole('link', { name: TEST_BOOK_TITLE })).toBeVisible({
    timeout: 30_000,
  });
  return TEST_BOOK_TITLE;
}

export async function uploadFilePayload(
  page: Page,
  payload: { buffer: Buffer; mimeType: string; name: string },
  expectedTitle: string,
): Promise<void> {
  const fileInput = page.locator('input[type="file"][accept=".txt,.epub"]');
  await fileInput.setInputFiles(payload);
  await expect(page.getByRole('link', { name: expectedTitle })).toBeVisible({
    timeout: 30_000,
  });
}

export async function getBookCardCount(page: Page): Promise<number> {
  const grid = page.getByTestId('bookshelf-grid');
  const isVisible = await grid.isVisible().catch(() => false);
  if (!isVisible) {
    return 0;
  }
  return grid.locator('a').count();
}

export async function clickBookCard(page: Page, title: string): Promise<void> {
  await page.getByRole('link', { name: title }).click();
  await disableAnimations(page);
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
}
