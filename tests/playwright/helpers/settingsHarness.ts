import type { Page } from '@playwright/test';

import { expect } from '@playwright/test';

export type SettingsTab = 'Book Parsing Rules' | 'Purification Rules' | 'AI Analysis Settings';

export async function switchTab(page: Page, tabName: SettingsTab): Promise<void> {
  await page.getByRole('button', { name: tabName }).click();
}

export async function getActiveTabName(page: Page): Promise<string | null> {
  const buttons = page.locator('button').filter({ hasText: /Rules|Settings/i });
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    const classes = await button.getAttribute('class');
    if (classes?.includes('bg-brand-700') || classes?.includes('bg-accent')) {
      return button.innerText();
    }
  }
  return null;
}

export async function assertTabPanelVisible(page: Page, tabName: SettingsTab): Promise<void> {
  await switchTab(page, tabName);
  await expect(page.locator('.glass').first()).toBeVisible();
}
