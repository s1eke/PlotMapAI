import type { Page } from '@playwright/test';

import { expect } from '@playwright/test';

import { disableAnimations } from './appHarness';

export async function getBookTitle(page: Page): Promise<string> {
  return page.getByRole('heading', { level: 1 }).innerText();
}

export async function clickStartReading(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Start Reading' }).click();
  await disableAnimations(page);
  await expect(page.getByTestId('reader-viewport')).toBeVisible({ timeout: 30_000 });
}

export async function clickViewCharacterGraph(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Character Graph' }).click();
  await disableAnimations(page);
}

export async function clickDeleteBook(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Delete Book' }).click();
  await expect(page.locator('[role="dialog"]')).toBeVisible();
}

export async function confirmDelete(page: Page): Promise<void> {
  const dialog = page.locator('[role="dialog"]');
  await dialog.getByRole('button', { name: /delete/i }).click();
}

export async function cancelDelete(page: Page): Promise<void> {
  const dialog = page.locator('[role="dialog"]');
  await dialog.getByRole('button', { name: /cancel/i }).click();
  await expect(dialog).not.toBeVisible();
}

export async function clickBackToBookshelf(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Back' }).first().click();
  await disableAnimations(page);
  await expect(page.getByTestId('bookshelf-scroll-container')).toBeVisible();
}
