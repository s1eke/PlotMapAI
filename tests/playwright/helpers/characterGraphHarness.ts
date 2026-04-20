import type { Page } from '@playwright/test';

import { expect } from '@playwright/test';

import { disableAnimations } from './appHarness';

export async function assertEmptyState(page: Page): Promise<void> {
  await expect(page.getByText('No character graph is available yet.')).toBeVisible();
}

export async function clickBackToBookDetail(page: Page): Promise<void> {
  const backLink = page.getByRole('link', { name: /back/i }).first();
  await backLink.click();
  await disableAnimations(page);
}

export async function isFullscreenToggleVisible(page: Page): Promise<boolean> {
  return page.locator('[title="Open Fullscreen"]').isVisible().catch(() => false);
}

export async function isRefreshButtonVisible(page: Page): Promise<boolean> {
  return page.locator('[title="Refresh Character Graph"]').isVisible().catch(() => false);
}
