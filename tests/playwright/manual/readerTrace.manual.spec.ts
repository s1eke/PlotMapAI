import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import {
  importFixtureToDetailPage,
  openReaderFromDetailPage,
} from '../helpers/readerVisualHarness';

const MANUAL_TRACE_FLAG = process.env.PLAYWRIGHT_MANUAL_READER_TRACE === '1';
const TRACE_ITERATIONS = Number.parseInt(
  process.env.PLAYWRIGHT_READER_TRACE_ITERATIONS ?? '50',
  10,
);

interface ReaderTraceWindow extends Window {
  PlotMapAIReaderTrace?: {
    clear: () => void;
    dump: () => unknown;
    enable: () => void;
    getLastDump: () => {
      events?: Array<{
        details?: {
          reason?: unknown;
        } | null;
      }>;
    } | null;
  };
}

async function enableReaderTrace(page: Page): Promise<void> {
  const nextUrl = new URL(page.url());
  nextUrl.searchParams.set('readerTrace', '1');
  await page.goto(nextUrl.toString());
  await expect(page.getByTestId('reader-viewport')).toBeVisible({
    timeout: 30_000,
  });
  await page.evaluate(() => {
    const traceWindow = window as ReaderTraceWindow;
    traceWindow.PlotMapAIReaderTrace?.clear();
    traceWindow.PlotMapAIReaderTrace?.enable();
  });
}

async function clickToolbarMode(
  page: Page,
  title: 'Single Column' | 'Two Columns',
): Promise<void> {
  const targetButton = page.locator(`button[title="${title}"]`).first();
  await expect(targetButton).toBeAttached();
  await targetButton.evaluate((element: HTMLButtonElement) => {
    element.click();
  });
  await page.waitForTimeout(150);
}

async function readBranchState(page: Page) {
  return page.evaluate(() => {
    const pagedInteractive = document.querySelector('[data-testid="paged-reader-interactive"]');
    const viewport = document.querySelector('[data-testid="reader-viewport"]');
    const style = viewport instanceof HTMLElement ? window.getComputedStyle(viewport) : null;
    let branch: 'paged' | 'scroll' | 'unknown' = 'unknown';

    if (pagedInteractive) {
      branch = 'paged';
    } else if (style?.overflowY === 'auto') {
      branch = 'scroll';
    }

    return {
      branch,
      hasPagedInteractive: Boolean(pagedInteractive),
      overflowY: style?.overflowY ?? null,
    };
  });
}

async function readTraceDump(page: Page) {
  return page.evaluate(() => ({
    current: (window as ReaderTraceWindow).PlotMapAIReaderTrace?.dump() ?? null,
    last: (window as ReaderTraceWindow).PlotMapAIReaderTrace?.getLastDump() ?? null,
  }));
}

test.describe('阅读追踪手工复现', () => {
  test.skip(!MANUAL_TRACE_FLAG, '设置 PLAYWRIGHT_MANUAL_READER_TRACE=1 以运行此手工复现。');

  test('TC-041 当翻页与滚动分支不一致时捕获追踪产物', async ({ page }, testInfo) => {
    await importFixtureToDetailPage(page, 'pagedRich');
    await openReaderFromDetailPage(page);
    await enableReaderTrace(page);

    for (let iteration = 0; iteration < TRACE_ITERATIONS; iteration += 1) {
      await clickToolbarMode(page, 'Two Columns');
      const pagedState = await readBranchState(page);
      if (pagedState.branch !== 'paged') {
        const dump = await readTraceDump(page);
        await testInfo.attach('reader-trace-mismatch.json', {
          body: JSON.stringify({
            dump,
            expectedBranch: 'paged',
            iteration,
            observed: pagedState,
          }, null, 2),
          contentType: 'application/json',
        });
        throw new Error(`Expected paged branch, received ${pagedState.branch}.`);
      }

      await clickToolbarMode(page, 'Single Column');
      const scrollState = await readBranchState(page);
      if (scrollState.branch !== 'scroll') {
        const dump = await readTraceDump(page);
        await testInfo.attach('reader-trace-mismatch.json', {
          body: JSON.stringify({
            dump,
            expectedBranch: 'scroll',
            iteration,
            observed: scrollState,
          }, null, 2),
          contentType: 'application/json',
        });
        throw new Error(`Expected scroll branch, received ${scrollState.branch}.`);
      }

      const dump = await readTraceDump(page);
      const latestSuspect = dump.last?.events?.at(-1)?.details?.reason;
      if (typeof latestSuspect === 'string') {
        await testInfo.attach('reader-trace-suspect.json', {
          body: JSON.stringify({
            dump,
            iteration,
            suspect: latestSuspect,
          }, null, 2),
          contentType: 'application/json',
        });
        throw new Error(`Reader trace recorded suspect: ${latestSuspect}`);
      }
    }
  });
});
