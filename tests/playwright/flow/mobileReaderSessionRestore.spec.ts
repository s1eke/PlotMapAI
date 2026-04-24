import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import {
  buildLongTestEpubFile,
  buildMultiChapterTestEpubFile,
  LONG_BOOK_TITLE,
  MULTI_CHAPTER_BOOK_CHAPTER_TITLES,
  MULTI_CHAPTER_BOOK_TITLE,
} from '../fixtures/testEpubFile';
import {
  clickNextPageResponsive,
  disableAnimations,
  exitAndReopenReader,
  exitReaderToDetailPageByUi,
  exitReaderToDetailPage,
  hideReaderChromeResponsive,
  importEpubToDetailPage,
  navigateToChapterByTitleResponsive,
  openReaderDirect,
  openReaderFromDetailPage,
  readPersistedReadingProgress,
  readReaderViewportSnapshot,
  readVisibleContentAnchor,
  revealReaderChromeResponsive,
  setReaderPreferences,
  type PersistedReadingProgressSnapshot,
  type ReaderViewportSnapshot,
  type VisibleContentAnchor,
  waitForPersistedReadingProgress,
  waitForReaderBranch,
} from '../helpers/readerVisualHarness';

interface ReadingMarker {
  anchorOffsetTop: number | null;
  anchorSnippet: string;
  canonicalBlockIndex: number | null;
  canonicalEdge: 'start' | 'end' | null;
  canonicalKind: string | null;
  canonicalLineIndex: number | null;
  chapterIndex: number | null;
  chapterProgress: number | null;
  contentMode: 'paged' | 'scroll';
  pageIndex: number | null;
  revision: number | null;
  scrollProgress: number | null;
}

const MAX_CROSS_CHAPTER_STEPS = 18;
const SCROLL_PROGRESS_TOLERANCE = 0.04;

async function waitForViewportScrollable(page: Page): Promise<void> {
  await expect.poll(async () => {
    return page.getByTestId('reader-viewport').evaluate((element) => {
      const viewport = element as HTMLElement;
      return Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    });
  }, {
    timeout: 20_000,
    message: 'Expected reader-viewport to have a non-zero scrollable range',
  }).toBeGreaterThan(0);
}

async function scrollViewportToProgress(page: Page, progress: number): Promise<void> {
  await waitForViewportScrollable(page);
  await page.getByTestId('reader-viewport').evaluate((element, nextProgress) => {
    const viewport = element as HTMLElement;
    const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    viewport.scrollTop = Math.round(maxScrollTop * nextProgress);
    viewport.dispatchEvent(new Event('scroll'));
  }, progress);
}

async function scrollViewportByPixels(page: Page, deltaY: number): Promise<void> {
  await waitForViewportScrollable(page);
  await page.getByTestId('reader-viewport').evaluate((element, nextDeltaY) => {
    const viewport = element as HTMLElement;
    viewport.scrollTop += nextDeltaY;
    viewport.dispatchEvent(new Event('scroll'));
  }, deltaY);
}

async function wheelScrollViewportByPixels(page: Page, deltaY: number): Promise<void> {
  await waitForViewportScrollable(page);
  const viewport = page.getByTestId('reader-viewport');
  const box = await viewport.boundingBox();
  if (!box) {
    throw new Error('Failed to resolve reader viewport bounding box for wheel scroll.');
  }

  const x = box.x + box.width * 0.5;
  const y = box.y + Math.min(box.height * 0.55, box.height - 4);
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, deltaY);
}

function isScrollProgressWithinTolerance(
  actual: number | null,
  expected: number,
  tolerance = SCROLL_PROGRESS_TOLERANCE,
): actual is number {
  return typeof actual === 'number' && Math.abs(actual - expected) <= tolerance;
}

async function scrollViewportToProgressByWheelAndWait(
  page: Page,
  progress: number,
): Promise<ReaderViewportSnapshot> {
  await waitForViewportScrollable(page);
  let snapshot = await readReaderViewportSnapshot(page);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const currentProgress = snapshot.scrollProgress ?? 0;
    const hasReachedTarget = currentProgress >= progress - 0.02;
    if (hasReachedTarget) {
      const settledSnapshot = await waitForViewportScrollSettled(
        page,
        `Wait for wheel scroll settling near ${progress}`,
      );
      if ((settledSnapshot.scrollProgress ?? 0) >= progress - 0.02) {
        return settledSnapshot;
      }
      snapshot = settledSnapshot;
      continue;
    }

    const remainingProgress = Math.abs(progress - currentProgress);
    const maxScrollTop = snapshot.maxScrollTop ?? 0;
    const direction = currentProgress < progress ? 1 : -1;
    const deltaY = Math.max(
      100,
      Math.min(
        900,
        Math.round(maxScrollTop * Math.min(remainingProgress, 0.2)),
      ),
    );

    await wheelScrollViewportByPixels(page, direction * deltaY);
    snapshot = await readReaderViewportSnapshot(page);
  }

  throw new Error(
    `Expected wheel scroll viewport to reach progress >= ${Math.max(0, progress - 0.02).toFixed(4)}`
    + `, lastViewport=${JSON.stringify(snapshot)}`,
  );
}

async function waitForViewportScrollSettled(
  page: Page,
  description: string,
): Promise<ReaderViewportSnapshot> {
  let snapshot: ReaderViewportSnapshot | null = null;
  let previousScrollTop: number | null = null;
  let stableFrames = 0;

  await expect.poll(async () => {
    snapshot = await readReaderViewportSnapshot(page);
    const currentScrollTop = snapshot.scrollTop;
    if (typeof currentScrollTop !== 'number') {
      stableFrames = 0;
      previousScrollTop = null;
      return false;
    }

    if (
      previousScrollTop !== null
      && Math.abs(currentScrollTop - previousScrollTop) <= 1
    ) {
      stableFrames += 1;
    } else {
      stableFrames = 0;
    }
    previousScrollTop = currentScrollTop;

    return stableFrames >= 4;
  }, {
    timeout: 5_000,
    message: description,
  }).toBe(true);

  if (!snapshot) {
    throw new Error(`${description}: viewport snapshot missing.`);
  }

  return snapshot;
}

async function waitForViewportScrollProgressNear(
  page: Page,
  expectedProgress: number,
  description: string,
): Promise<ReaderViewportSnapshot> {
  let snapshot: ReaderViewportSnapshot | null = null;
  let stableMatches = 0;
  const requiredStableMatches = 6;
  try {
    await expect.poll(async () => {
      snapshot = await readReaderViewportSnapshot(page);
      if (!isScrollProgressWithinTolerance(snapshot.scrollProgress, expectedProgress)) {
        stableMatches = 0;
        return false;
      }

      stableMatches += 1;
      return stableMatches >= requiredStableMatches;
    }, {
      timeout: 15_000,
      message: description,
    }).toBe(true);
  } catch (error) {
    throw new Error(
      `${description}: expected scrollProgress≈${expectedProgress.toFixed(4)}`
      + `, lastViewport=${JSON.stringify(snapshot)}`,
      { cause: error },
    );
  }

  if (!snapshot) {
    throw new Error(`${description}: viewport snapshot did not stabilize.`);
  }

  return snapshot;
}

async function waitForScrollProgress(
  page: Page,
  novelId: number,
  minimumProgress: number,
  description: string,
) {
  return waitForPersistedReadingProgress(
    page,
    novelId,
    (snapshot) => snapshot !== null
      && snapshot.contentMode === 'scroll'
      && (snapshot.chapterProgress ?? 0) >= minimumProgress,
    { description, timeout: 15_000 },
  );
}

async function waitForPagedProgress(
  page: Page,
  novelId: number,
  minimumPageIndex: number,
  description: string,
) {
  return waitForPersistedReadingProgress(
    page,
    novelId,
    (snapshot) => snapshot !== null
      && snapshot.contentMode === 'paged'
      && (snapshot.pageIndex ?? 0) >= minimumPageIndex,
    { description, timeout: 15_000 },
  );
}

async function waitForExactPagedProgress(
  page: Page,
  novelId: number,
  expectedPageIndex: number,
  description: string,
) {
  return waitForPersistedReadingProgress(
    page,
    novelId,
    (snapshot) => snapshot !== null
      && snapshot.contentMode === 'paged'
      && snapshot.pageIndex === expectedPageIndex,
    { description, timeout: 15_000 },
  );
}

async function waitForConvergedPagedProgressAndViewport(
  page: Page,
  novelId: number,
  description: string,
  expectedPageIndex?: number,
): Promise<{
  progress: NonNullable<Awaited<ReturnType<typeof readPersistedReadingProgress>>>;
  snapshot: Awaited<ReturnType<typeof readReaderViewportSnapshot>>;
}> {
  let progress: Awaited<ReturnType<typeof readPersistedReadingProgress>> = null;
  let snapshot: Awaited<ReturnType<typeof readReaderViewportSnapshot>> | null = null;

  await expect.poll(async () => {
    [snapshot, progress] = await Promise.all([
      readReaderViewportSnapshot(page),
      readPersistedReadingProgress(page, novelId),
    ]);

    if (
      snapshot.branch !== 'paged'
      || snapshot.currentPageIndex === null
      || progress?.contentMode !== 'paged'
      || progress.pageIndex !== snapshot.currentPageIndex
    ) {
      return false;
    }

    if (expectedPageIndex !== undefined && snapshot.currentPageIndex !== expectedPageIndex) {
      return false;
    }

    return true;
  }, {
    message: description,
    timeout: 15_000,
  }).toBe(true);

  if (!snapshot || !progress) {
    throw new Error(`${description}: paged progress/viewport did not converge.`);
  }

  return {
    progress,
    snapshot,
  };
}

function requirePagedPageIndex(marker: ReadingMarker, context: string): number {
  if (typeof marker.pageIndex !== 'number') {
    throw new Error(`${context}: paged marker.pageIndex is not a number.`);
  }

  return marker.pageIndex;
}

function requireScrollProgress(marker: ReadingMarker, context: string): number {
  if (typeof marker.scrollProgress !== 'number') {
    throw new Error(`${context}: marker.scrollProgress is not a number.`);
  }

  return marker.scrollProgress;
}

async function readVisibleAnchorOrThrow(
  page: Page,
  description: string,
): Promise<VisibleContentAnchor> {
  let anchor: Awaited<ReturnType<typeof readVisibleContentAnchor>> = null;

  await expect.poll(async () => {
    anchor = await readVisibleContentAnchor(page);
    return anchor?.textSnippet?.length ? anchor : null;
  }, {
    timeout: 15_000,
    message: description,
  }).not.toBeNull();

  return anchor!;
}

async function readLongBookVisibleParagraphSnippet(
  page: Page,
  description: string,
): Promise<string> {
  let snippet: string | null = null;

  await expect.poll(async () => {
    snippet = await page.getByTestId('reader-viewport').evaluate((element) => {
      const viewport = element as HTMLElement;
      const viewportRect = viewport.getBoundingClientRect();
      const visibleTop = viewportRect.top;
      const visibleBottom = viewportRect.bottom;
      const candidates = Array.from(
        viewport.querySelectorAll('p, div, li, span, h1, h2, h3, h4, h5, h6'),
      );

      for (const candidate of candidates) {
        if (!(candidate instanceof HTMLElement)) {
          continue;
        }
        const rect = candidate.getBoundingClientRect();
        const intersectsViewport = rect.bottom > visibleTop && rect.top < visibleBottom;
        if (!intersectsViewport || rect.height <= 0) {
          continue;
        }

        const text = candidate.innerText.replaceAll(/\s+/gu, ' ').trim();
        if (!text || text.length > 220) {
          continue;
        }
        const match = text.match(/map admitted \d+\./u);
        if (match) {
          return match[0];
        }
      }

      return null;
    });
    return snippet;
  }, {
    timeout: 15_000,
    message: description,
  }).not.toBeNull();

  return snippet!;
}

function buildReadingMarker(params: {
  anchor: VisibleContentAnchor;
  contentMode: 'paged' | 'scroll';
  persisted: PersistedReadingProgressSnapshot;
  viewportSnapshot?: ReaderViewportSnapshot | null;
}): ReadingMarker {
  const {
    anchor,
    contentMode,
    persisted,
    viewportSnapshot,
  } = params;

  return {
    anchorOffsetTop: anchor.offsetTop,
    anchorSnippet: anchor.textSnippet,
    canonicalBlockIndex: persisted.canonical.blockIndex,
    canonicalEdge: persisted.canonical.edge,
    canonicalKind: persisted.canonical.kind,
    canonicalLineIndex: persisted.canonical.lineIndex,
    chapterIndex: persisted.canonical.chapterIndex,
    chapterProgress: persisted.chapterProgress,
    contentMode,
    pageIndex: persisted.pageIndex,
    revision: persisted.revision,
    scrollProgress: viewportSnapshot?.scrollProgress ?? null,
  };
}

async function captureMarker(
  page: Page,
  novelId: number,
  contentMode: 'paged' | 'scroll',
): Promise<ReadingMarker> {
  const anchor = await readVisibleAnchorOrThrow(page, `capture ${contentMode} marker anchor`);
  const persisted = await waitForPersistedReadingProgress(
    page,
    novelId,
    (snapshot) => snapshot !== null && snapshot.contentMode === contentMode,
    { description: `capture ${contentMode} marker`, timeout: 15_000 },
  );
  const viewportSnapshot = contentMode === 'scroll'
    ? await readReaderViewportSnapshot(page)
    : null;

  return buildReadingMarker({
    anchor,
    contentMode,
    persisted,
    viewportSnapshot,
  });
}

async function capturePagedMarker(page: Page, novelId: number): Promise<ReadingMarker> {
  const { progress, snapshot } = await waitForConvergedPagedProgressAndViewport(
    page,
    novelId,
    'capture paged progress/viewport convergence',
  );
  const anchor = await readVisibleAnchorOrThrow(page, 'capture paged marker anchor');

  return buildReadingMarker({
    anchor,
    contentMode: 'paged',
    persisted: {
      ...progress,
      pageIndex: snapshot.currentPageIndex,
    },
    viewportSnapshot: snapshot,
  });
}

async function expectPagedMarkerRestored(
  page: Page,
  novelId: number,
  marker: ReadingMarker,
  description: string,
): Promise<void> {
  const expectedPageIndex = requirePagedPageIndex(marker, description);
  const restoredProgress = await waitForExactPagedProgress(
    page,
    novelId,
    expectedPageIndex,
    `${description} persisted pageIndex=${expectedPageIndex}`,
  );
  const { snapshot: restoredSnapshot } = await waitForConvergedPagedProgressAndViewport(
    page,
    novelId,
    `${description} progress/viewport pageIndex=${expectedPageIndex}`,
    expectedPageIndex,
  );

  expect(restoredProgress.pageIndex).toBe(expectedPageIndex);
  expect(restoredSnapshot.currentPageIndex).toBe(expectedPageIndex);
}

async function expectViewportContainsSnippet(page: Page, snippet: string): Promise<void> {
  await expect(
    page.getByTestId('reader-viewport').getByText(snippet, { exact: false }).first(),
  ).toBeInViewport({ timeout: 15_000 });
}

async function expectViewportNotContainsSnippet(page: Page, snippet: string): Promise<void> {
  const isVisible = await page.getByTestId('reader-viewport').getByText(snippet, { exact: false }).first()
    .isVisible()
    .catch(() => false);
  expect(isVisible).toBe(false);
}

async function advancePagedPages(page: Page, pageCount: number): Promise<void> {
  await hideReaderChromeResponsive(page);
  for (let index = 0; index < pageCount; index += 1) {
    await clickNextPageResponsive(page);
  }
}

async function switchReaderBranch(page: Page, branch: 'paged' | 'scroll'): Promise<void> {
  const targetModeLabel = branch === 'paged' ? 'Slide' : 'Vertical';
  await revealReaderChromeResponsive(page);
  const pageTurnButton = page.locator('button[title="Page Turn"]:visible').first();
  await pageTurnButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });

  const modeButton = page.locator(`button[title="${targetModeLabel}"]:visible`).first();
  await expect(modeButton).toBeVisible({ timeout: 8_000 });
  await modeButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await waitForReaderBranch(page, branch);
  await hideReaderChromeResponsive(page);
}

async function scrollUntilChapterReached(
  page: Page,
  novelId: number,
  targetChapterIndex: number,
): Promise<void> {
  let latestRevision = (await readPersistedReadingProgress(page, novelId))?.revision ?? 0;

  for (let step = 0; step < MAX_CROSS_CHAPTER_STEPS; step += 1) {
    await page.getByTestId('reader-viewport').evaluate((element) => {
      const viewport = element as HTMLElement;
      viewport.scrollTop += Math.max(120, Math.round(viewport.clientHeight * 0.85));
      viewport.dispatchEvent(new Event('scroll'));
    });

    const previousRevision = latestRevision;
    const persisted = await waitForPersistedReadingProgress(
      page,
      novelId,
      (snapshot) => snapshot !== null && (snapshot.revision ?? 0) > previousRevision,
      { description: `advance scroll to chapter ${targetChapterIndex}`, timeout: 15_000 },
    );
    latestRevision = persisted.revision ?? latestRevision;

    if ((persisted.canonical.chapterIndex ?? 0) >= targetChapterIndex) {
      return;
    }
  }

  throw new Error(`Failed to reach chapter index ${targetChapterIndex} in scroll mode.`);
}

async function advancePagedUntilChapterReached(
  page: Page,
  novelId: number,
  targetChapterIndex: number,
): Promise<void> {
  let latestRevision = (await readPersistedReadingProgress(page, novelId))?.revision ?? 0;

  for (let step = 0; step < MAX_CROSS_CHAPTER_STEPS; step += 1) {
    await clickNextPageResponsive(page);
    const previousRevision = latestRevision;
    const persisted = await waitForPersistedReadingProgress(
      page,
      novelId,
      (snapshot) => snapshot !== null && (snapshot.revision ?? 0) > previousRevision,
      { description: `advance paged to chapter ${targetChapterIndex}`, timeout: 15_000 },
    );
    latestRevision = persisted.revision ?? latestRevision;

    if ((persisted.canonical.chapterIndex ?? 0) >= targetChapterIndex) {
      return;
    }
  }

  throw new Error(`Failed to reach chapter index ${targetChapterIndex} in paged mode.`);
}

async function openBookFromBookshelf(page: Page, title: string): Promise<void> {
  await page.goto('/');
  await disableAnimations(page);
  await page.getByRole('link', { name: title }).click();
  await disableAnimations(page);
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible({ timeout: 15_000 });
}

async function reopenFromBookshelf(page: Page, title: string): Promise<void> {
  await exitReaderToDetailPageByUi(page);
  await page.getByRole('link', { name: 'Back' }).first().click();
  await disableAnimations(page);
  await expect(page.getByTestId('bookshelf-scroll-container')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('link', { name: title }).click();
  await disableAnimations(page);
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible({ timeout: 15_000 });
  await openReaderFromDetailPage(page);
}

async function runScrollRestoreRound(
  page: Page,
  round: number,
  targetProgress: number,
  previousMarker?: ReadingMarker,
): Promise<ReadingMarker> {
  let viewportSnapshot = await scrollViewportToProgressByWheelAndWait(page, targetProgress);

  if (previousMarker) {
    const previousScrollProgress = requireScrollProgress(previousMarker, `TC-001 round ${round - 1} marker`);
    const extraScrollSteps = [240, 240, 240, 240];
    for (let attempt = 0; attempt < extraScrollSteps.length; attempt += 1) {
      if (
        viewportSnapshot.scrollProgress !== null
        && viewportSnapshot.scrollProgress > previousScrollProgress + 0.08
      ) {
        break;
      }
      await wheelScrollViewportByPixels(page, extraScrollSteps[attempt]);
      viewportSnapshot = await readReaderViewportSnapshot(page);
    }

    expect(viewportSnapshot.scrollProgress).not.toBeNull();
    expect(viewportSnapshot.scrollProgress!).toBeGreaterThan(
      previousScrollProgress + 0.08,
    );
  }

  expect(viewportSnapshot.scrollProgress).not.toBeNull();
  const expectedExitProgress = viewportSnapshot.scrollProgress!;
  const anchorSnippetBeforeExit = await readLongBookVisibleParagraphSnippet(
    page,
    `TC-001 round ${round} capture visible paragraph`,
  );

  await exitReaderToDetailPageByUi(page);
  await expect(
    page.getByRole('link', { name: 'Start Reading' }).first(),
    `TC-001 round ${round} detail page visible before reopen`,
  ).toBeVisible({ timeout: 15_000 });
  const savedProgressBeforeExit = expectedExitProgress;
  const marker: ReadingMarker = {
    anchorOffsetTop: null,
    anchorSnippet: anchorSnippetBeforeExit,
    canonicalBlockIndex: null,
    canonicalEdge: null,
    canonicalKind: null,
    canonicalLineIndex: null,
    chapterIndex: null,
    chapterProgress: savedProgressBeforeExit,
    contentMode: 'scroll',
    pageIndex: null,
    revision: null,
    scrollProgress: savedProgressBeforeExit,
  };

  if (previousMarker) {
    expect(
      requireScrollProgress(marker, `TC-001 round ${round} marker`),
    ).toBeGreaterThan(requireScrollProgress(previousMarker, `TC-001 round ${round - 1} marker`) + 0.08);
    expect(
      marker.anchorSnippet,
      `TC-001 round ${round} marker should advance to a new visible paragraph`,
    ).not.toBe(previousMarker.anchorSnippet);
  }

  await openReaderFromDetailPage(page);
  await waitForReaderBranch(page, 'scroll');
  const restoredViewportSnapshot = await waitForViewportScrollProgressNear(
    page,
    savedProgressBeforeExit,
    `TC-001 round ${round} viewport scroll restored`,
  );
  await expectViewportContainsSnippet(
    page,
    marker.anchorSnippet,
  );
  expect(
    restoredViewportSnapshot.scrollProgress,
    `TC-001 round ${round} viewport progress`,
  ).not.toBeNull();
  expect(
    Math.abs(restoredViewportSnapshot.scrollProgress! - savedProgressBeforeExit),
    `TC-001 round ${round} viewport progress drift`,
  ).toBeLessThanOrEqual(SCROLL_PROGRESS_TOLERANCE);

  return marker;
}

async function runPagedRestoreRound(
  page: Page,
  novelId: number,
  round: number,
  pageAdvanceCount: number,
  minimumPageIndex: number,
  previousMarker?: ReadingMarker,
): Promise<ReadingMarker> {
  await advancePagedPages(page, pageAdvanceCount);
  await waitForPagedProgress(
    page,
    novelId,
    minimumPageIndex,
    `TC-002 round ${round} paged progress persisted`,
  );
  const marker = await capturePagedMarker(page, novelId);
  const currentPageIndex = requirePagedPageIndex(marker, `TC-002 round ${round} marker`);

  expect(currentPageIndex).toBeGreaterThanOrEqual(minimumPageIndex);
  if (previousMarker) {
    expect(currentPageIndex).toBeGreaterThan(
      requirePagedPageIndex(previousMarker, `TC-002 round ${round - 1} marker`),
    );
  }

  await exitAndReopenReader(page);
  await waitForReaderBranch(page, 'paged');
  await expectPagedMarkerRestored(page, novelId, marker, `TC-002 round ${round} paged progress restored`);
  await expectViewportContainsSnippet(page, marker.anchorSnippet);

  return marker;
}

test.describe('移动端阅读会话恢复', () => {
  test('TC-001 滚动模式下退出重进，阅读记录恢复正常', async ({ page }) => {
    await importEpubToDetailPage(
      page,
      await buildLongTestEpubFile(),
      LONG_BOOK_TITLE,
    );

    await openReaderFromDetailPage(page);
    const enteredAsScroll = await waitForReaderBranch(page, 'scroll', { timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (!enteredAsScroll) {
      await switchReaderBranch(page, 'scroll');
      await waitForReaderBranch(page, 'scroll');
    }

    const roundOneMarker = await runScrollRestoreRound(page, 1, 0.22);
    const roundTwoMarker = await runScrollRestoreRound(
      page,
      2,
      0.42,
      roundOneMarker,
    );
    const roundThreeMarker = await runScrollRestoreRound(
      page,
      3,
      0.78,
      roundTwoMarker,
    );

    expect(requireScrollProgress(roundTwoMarker, 'TC-001 round 2 marker')).toBeGreaterThan(
      requireScrollProgress(roundOneMarker, 'TC-001 round 1 marker'),
    );
    expect(requireScrollProgress(roundThreeMarker, 'TC-001 round 3 marker')).toBeGreaterThan(
      requireScrollProgress(roundTwoMarker, 'TC-001 round 2 marker'),
    );
  });

  test('TC-002 翻页模式下退出重进，阅读记录恢复正常', async ({ page }) => {
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildLongTestEpubFile(),
      LONG_BOOK_TITLE,
    );

    await setReaderPreferences(page, { pageTurnMode: 'slide' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'paged');

    const roundOneMarker = await runPagedRestoreRound(page, novelId, 1, 3, 2);
    const roundTwoMarker = await runPagedRestoreRound(page, novelId, 2, 2, 4, roundOneMarker);
    const roundThreeMarker = await runPagedRestoreRound(page, novelId, 3, 2, 6, roundTwoMarker);

    expect(
      requirePagedPageIndex(roundTwoMarker, 'TC-002 round 2 marker'),
    ).toBeGreaterThan(requirePagedPageIndex(roundOneMarker, 'TC-002 round 1 marker'));
    expect(
      requirePagedPageIndex(roundThreeMarker, 'TC-002 round 3 marker'),
    ).toBeGreaterThan(requirePagedPageIndex(roundTwoMarker, 'TC-002 round 2 marker'));
  });

  test('TC-003 从滚动模式切换到翻页模式后，阅读记录恢复正常', async ({ page }) => {
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildLongTestEpubFile(),
      LONG_BOOK_TITLE,
    );

    await setReaderPreferences(page, { pageTurnMode: 'scroll' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'scroll');

    await scrollViewportToProgress(page, 0.38);
    await waitForScrollProgress(page, novelId, 0.15, 'scroll progress persisted before mode switch');
    await captureMarker(page, novelId, 'scroll');

    await switchReaderBranch(page, 'paged');
    await advancePagedPages(page, 2);
    await waitForPagedProgress(page, novelId, 1, 'paged progress persisted after mode switch');
    const pagedMarker = await capturePagedMarker(page, novelId);

    await exitAndReopenReader(page);
    await waitForReaderBranch(page, 'paged');
    await expectPagedMarkerRestored(page, novelId, pagedMarker, 'paged progress restored after reopen');

    await expectViewportContainsSnippet(page, pagedMarker.anchorSnippet);
  });

  test('TC-004 从翻页模式切换到滚动模式后，阅读记录恢复正常', async ({ page }) => {
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildLongTestEpubFile(),
      LONG_BOOK_TITLE,
    );

    await setReaderPreferences(page, { pageTurnMode: 'slide' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'paged');

    await advancePagedPages(page, 3);
    await waitForPagedProgress(page, novelId, 2, 'paged progress persisted before scroll switch');
    await captureMarker(page, novelId, 'paged');

    await switchReaderBranch(page, 'scroll');
    await scrollViewportByPixels(page, 480);
    await waitForScrollProgress(page, novelId, 0.15, 'scroll progress persisted after mode switch');
    const scrollMarker = await captureMarker(page, novelId, 'scroll');

    await exitAndReopenReader(page);
    await waitForReaderBranch(page, 'scroll');
    await waitForScrollProgress(page, novelId, 0.15, 'scroll progress restored after reopen');

    await expectViewportContainsSnippet(page, scrollMarker.anchorSnippet);
  });

  test('TC-005 滚动模式下跨章节后，阅读记录恢复正常', async ({ page }) => {
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildMultiChapterTestEpubFile(),
      MULTI_CHAPTER_BOOK_TITLE,
    );

    await setReaderPreferences(page, { pageTurnMode: 'scroll' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'scroll');

    await scrollUntilChapterReached(page, novelId, 1);
    await scrollViewportByPixels(page, 120);
    const marker = await captureMarker(page, novelId, 'scroll');

    expect(marker.chapterIndex).toBe(1);

    await exitAndReopenReader(page);
    await waitForReaderBranch(page, 'scroll');
    await waitForPersistedReadingProgress(
      page,
      novelId,
      (snapshot) => snapshot !== null
        && snapshot.contentMode === 'scroll'
        && snapshot.canonical.chapterIndex === 1,
      { description: 'scroll chapter 2 restored', timeout: 15_000 },
    );

    await expectViewportContainsSnippet(page, marker.anchorSnippet);
  });

  test('TC-006 翻页模式下跨章节后，阅读记录恢复正常', async ({ page }) => {
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildMultiChapterTestEpubFile(),
      MULTI_CHAPTER_BOOK_TITLE,
    );

    await setReaderPreferences(page, { pageTurnMode: 'slide' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'paged');

    await advancePagedUntilChapterReached(page, novelId, 1);
    await advancePagedPages(page, 1);
    await waitForPersistedReadingProgress(
      page,
      novelId,
      (snapshot) => snapshot !== null
        && snapshot.contentMode === 'paged'
        && snapshot.canonical.chapterIndex === 1
        && (snapshot.pageIndex ?? 0) >= 1,
      { description: 'paged chapter 2 baseline persisted before capture', timeout: 15_000 },
    );
    const marker = await capturePagedMarker(page, novelId);
    const expectedPageIndex = requirePagedPageIndex(marker, 'TC-006 baseline marker');

    expect(marker.chapterIndex).toBe(1);

    await exitAndReopenReader(page);
    await waitForReaderBranch(page, 'paged');
    await expectPagedMarkerRestored(page, novelId, marker, 'paged chapter 2 restored');

    expect(expectedPageIndex).toBe(requirePagedPageIndex(marker, 'TC-006 restored marker'));
    await expectViewportContainsSnippet(page, marker.anchorSnippet);
  });

  test('TC-007 通过目录跳转章节后，阅读记录恢复正常', async ({ page }) => {
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildMultiChapterTestEpubFile(),
      MULTI_CHAPTER_BOOK_TITLE,
    );

    await setReaderPreferences(page, { pageTurnMode: 'scroll' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'scroll');

    await navigateToChapterByTitleResponsive(page, MULTI_CHAPTER_BOOK_CHAPTER_TITLES[1]);
    await waitForReaderBranch(page, 'scroll');
    await waitForPersistedReadingProgress(
      page,
      novelId,
      (snapshot) => snapshot !== null
        && snapshot.contentMode === 'scroll'
        && snapshot.canonical.chapterIndex === 1,
      { description: 'toc jump persisted to chapter 2', timeout: 15_000 },
    );
    await scrollViewportToProgress(page, 0.3);
    const marker = await captureMarker(page, novelId, 'scroll');

    expect(marker.chapterIndex).toBe(1);

    await exitAndReopenReader(page);
    await waitForReaderBranch(page, 'scroll');
    await waitForPersistedReadingProgress(
      page,
      novelId,
      (snapshot) => snapshot !== null
        && snapshot.contentMode === 'scroll'
        && snapshot.canonical.chapterIndex === 1,
      { description: 'jumped chapter restored', timeout: 15_000 },
    );

    await expectViewportContainsSnippet(page, marker.anchorSnippet);
  });

  test('TC-008 返回书架后重新打开，阅读记录恢复正常', async ({ page }) => {
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildLongTestEpubFile(),
      LONG_BOOK_TITLE,
    );

    await setReaderPreferences(page, { pageTurnMode: 'scroll' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'scroll');

    await scrollViewportToProgress(page, 0.52);
    await waitForScrollProgress(page, novelId, 0.2, 'scroll progress persisted before bookshelf reopen');
    const marker = await captureMarker(page, novelId, 'scroll');

    await reopenFromBookshelf(page, LONG_BOOK_TITLE);
    await waitForReaderBranch(page, 'scroll');
    await waitForScrollProgress(page, novelId, 0.2, 'scroll progress restored after bookshelf reopen');

    await expectViewportContainsSnippet(page, marker.anchorSnippet);
  });

  test('TC-009 刷新页面后，阅读记录恢复正常', async ({ page }) => {
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildLongTestEpubFile(),
      LONG_BOOK_TITLE,
    );

    await setReaderPreferences(page, { pageTurnMode: 'slide' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'paged');

    await advancePagedPages(page, 3);
    await waitForPagedProgress(page, novelId, 2, 'paged progress persisted before reload');
    const marker = await capturePagedMarker(page, novelId);

    await page.reload();
    await disableAnimations(page);
    await waitForReaderBranch(page, 'paged');
    await expectPagedMarkerRestored(page, novelId, marker, 'paged progress restored after reload');

    await expectViewportContainsSnippet(page, marker.anchorSnippet);
  });

  test('TC-010 多次切换阅读方式后，以最后一次阅读位置为准恢复', async ({ page }) => {
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildLongTestEpubFile(),
      LONG_BOOK_TITLE,
    );

    await setReaderPreferences(page, { pageTurnMode: 'scroll' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'scroll');

    await scrollViewportToProgress(page, 0.28);
    await waitForScrollProgress(page, novelId, 0.1, 'first scroll progress persisted');
    await captureMarker(page, novelId, 'scroll');

    await switchReaderBranch(page, 'paged');
    await advancePagedPages(page, 2);
    await waitForPagedProgress(page, novelId, 1, 'paged progress persisted in multi-switch');
    await captureMarker(page, novelId, 'paged');

    await switchReaderBranch(page, 'scroll');
    await scrollViewportByPixels(page, 560);
    await waitForScrollProgress(page, novelId, 0.2, 'final scroll progress persisted');
    const finalMarker = await captureMarker(page, novelId, 'scroll');

    await exitAndReopenReader(page);
    await waitForReaderBranch(page, 'scroll');
    await waitForScrollProgress(page, novelId, 0.2, 'final scroll progress restored');

    await expectViewportContainsSnippet(page, finalMarker.anchorSnippet);
  });

  test('TC-011 不同书籍之间的阅读记录互不影响', async ({ page }) => {
    const firstBook = {
      chapterTitle: 'Corridor A',
      title: 'Long Scroll Register A',
    };
    const secondBook = {
      chapterTitle: 'Corridor B',
      title: 'Long Scroll Register B',
    };

    const { novelId: firstNovelId } = await importEpubToDetailPage(
      page,
      await buildLongTestEpubFile({
        chapterTitle: firstBook.chapterTitle,
        fileName: 'long-scroll-a.epub',
        paragraphPrefix: 'Atlas A corridor landmark',
        title: firstBook.title,
      }),
      firstBook.title,
    );
    await setReaderPreferences(page, { pageTurnMode: 'scroll' });
    await openReaderDirect(page, firstNovelId);
    await waitForReaderBranch(page, 'scroll');
    await scrollViewportToProgress(page, 0.35);
    await waitForScrollProgress(page, firstNovelId, 0.1, 'first novel progress persisted');
    const firstMarker = await captureMarker(page, firstNovelId, 'scroll');
    await exitReaderToDetailPage(page);

    const { novelId: secondNovelId } = await importEpubToDetailPage(
      page,
      await buildLongTestEpubFile({
        chapterTitle: secondBook.chapterTitle,
        fileName: 'long-scroll-b.epub',
        paragraphPrefix: 'Atlas B observatory signal',
        title: secondBook.title,
      }),
      secondBook.title,
    );
    await openReaderDirect(page, secondNovelId);
    await waitForReaderBranch(page, 'scroll');
    await scrollViewportToProgress(page, 0.58);
    await waitForScrollProgress(page, secondNovelId, 0.2, 'second novel progress persisted');
    const secondMarker = await captureMarker(page, secondNovelId, 'scroll');
    await exitReaderToDetailPage(page);

    await openBookFromBookshelf(page, firstBook.title);
    await openReaderFromDetailPage(page);
    await waitForReaderBranch(page, 'scroll');
    await waitForScrollProgress(page, firstNovelId, 0.1, 'first novel restored');
    await expectViewportContainsSnippet(page, firstMarker.anchorSnippet);
    await expectViewportNotContainsSnippet(page, secondMarker.anchorSnippet);

    await openBookFromBookshelf(page, secondBook.title);
    await openReaderFromDetailPage(page);
    await waitForReaderBranch(page, 'scroll');
    await waitForScrollProgress(page, secondNovelId, 0.2, 'second novel restored');
    await expectViewportContainsSnippet(page, secondMarker.anchorSnippet);
    await expectViewportNotContainsSnippet(page, firstMarker.anchorSnippet);
  });

  test('TC-012 同一章节内切换阅读方式后，阅读内容位置应连续', async ({ page }) => {
    const { novelId } = await importEpubToDetailPage(
      page,
      await buildLongTestEpubFile(),
      LONG_BOOK_TITLE,
    );

    await setReaderPreferences(page, { pageTurnMode: 'scroll' });
    await openReaderDirect(page, novelId);
    await waitForReaderBranch(page, 'scroll');

    await scrollViewportToProgress(page, 0.34);
    await waitForScrollProgress(page, novelId, 0.12, 'initial scroll persisted for continuity');
    const scrollMarker = await captureMarker(page, novelId, 'scroll');

    await switchReaderBranch(page, 'paged');
    await expectViewportContainsSnippet(page, scrollMarker.anchorSnippet);
    await advancePagedPages(page, 1);
    await waitForPagedProgress(page, novelId, 1, 'paged progress persisted for continuity');
    const pagedMarker = await captureMarker(page, novelId, 'paged');

    await switchReaderBranch(page, 'scroll');
    await expectViewportContainsSnippet(page, pagedMarker.anchorSnippet);
    await scrollViewportByPixels(page, 420);
    await waitForScrollProgress(page, novelId, 0.18, 'final scroll persisted for continuity');
    const finalMarker = await captureMarker(page, novelId, 'scroll');

    expect(scrollMarker.chapterIndex).toBe(0);
    expect(pagedMarker.chapterIndex).toBe(0);
    expect(finalMarker.chapterIndex).toBe(0);

    await exitAndReopenReader(page);
    await waitForReaderBranch(page, 'scroll');
    await waitForScrollProgress(page, novelId, 0.18, 'final scroll restored for continuity');

    await expectViewportContainsSnippet(page, finalMarker.anchorSnippet);
  });
});
