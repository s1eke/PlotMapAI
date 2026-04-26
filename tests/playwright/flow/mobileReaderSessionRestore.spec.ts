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
  activateLocatorResponsive,
  clickNextPageResponsive,
  disableAnimations,
  exitAndReopenReaderByUiResponsive,
  exitReaderToDetailPageByUi,
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

const SCROLL_PROGRESS_TOLERANCE = 0.04;
const TOUCH_SCROLL_SETTLE_TIMEOUT_MS = 6_000;

function readNovelIdFromReaderUrl(url: string): number {
  const match = url.match(/\/(?:reader|novel)\/(\d+)/u);
  if (!match) {
    throw new Error(`Unable to resolve novel id from url: ${url}`);
  }

  return Number.parseInt(match[1], 10);
}

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

async function touchScrollViewportByPixels(
  page: Page,
  deltaY: number,
  options: {
    settle?: boolean;
  } = {},
): Promise<ReaderViewportSnapshot> {
  await waitForViewportScrollable(page);
  const viewport = page.getByTestId('reader-viewport');
  const box = await viewport.boundingBox();
  if (!box) {
    throw new Error('Failed to resolve reader viewport bounding box for touch scroll.');
  }

  const direction = Math.sign(deltaY);
  if (direction === 0) {
    return readReaderViewportSnapshot(page);
  }

  const x = box.x + box.width * 0.5;
  const safeTop = box.y + Math.max(24, box.height * 0.18);
  const safeBottom = box.y + Math.min(box.height - 24, box.height * 0.82);
  const maxGestureDistance = Math.max(80, safeBottom - safeTop);
  const gestureDistance = Math.max(80, Math.min(Math.abs(deltaY), maxGestureDistance));
  const startY = direction > 0 ? safeBottom : safeTop;
  const endY = direction > 0 ? startY - gestureDistance : startY + gestureDistance;
  const session = await page.context().newCDPSession(page);

  try {
    await session.send('Input.dispatchTouchEvent', {
      touchPoints: [{ force: 0.5, id: 1, radiusX: 5, radiusY: 5, x, y: startY }],
      type: 'touchStart',
    });

    const steps = 8;
    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps;
      await session.send('Input.dispatchTouchEvent', {
        touchPoints: [{
          force: 0.5,
          id: 1,
          radiusX: 5,
          radiusY: 5,
          x,
          y: startY + (endY - startY) * ratio,
        }],
        type: 'touchMove',
      });
      await page.waitForTimeout(16);
    }

    await session.send('Input.dispatchTouchEvent', {
      touchPoints: [],
      type: 'touchEnd',
    });
  } finally {
    await session.detach();
  }

  if (options.settle === false) {
    await page.waitForTimeout(80);
    return readReaderViewportSnapshot(page);
  }

  return waitForViewportScrollSettled(page, `Wait for touch scroll by ${deltaY} settling`);
}

function isScrollProgressWithinTolerance(
  actual: number | null,
  expected: number,
  tolerance = SCROLL_PROGRESS_TOLERANCE,
): actual is number {
  return typeof actual === 'number' && Math.abs(actual - expected) <= tolerance;
}

async function scrollViewportByPixels(page: Page, deltaY: number): Promise<void> {
  await touchScrollViewportByPixels(page, deltaY);
}

async function scrollViewportToProgressByTouchAndWait(
  page: Page,
  progress: number,
): Promise<ReaderViewportSnapshot> {
  await waitForViewportScrollable(page);
  let snapshot = await readReaderViewportSnapshot(page);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const currentProgress = snapshot.scrollProgress ?? 0;
    const hasReachedTarget = isScrollProgressWithinTolerance(currentProgress, progress, 0.03);
    if (hasReachedTarget) {
      return waitForViewportScrollSettled(page, `Wait for touch scroll settling near ${progress}`);
    }

    const remainingProgress = Math.abs(progress - currentProgress);
    const maxScrollTop = snapshot.maxScrollTop ?? 0;
    const direction = currentProgress < progress ? 1 : -1;
    const deltaY = Math.max(
      90,
      Math.min(
        720,
        Math.round(maxScrollTop * Math.min(remainingProgress, 0.16)),
      ),
    );

    snapshot = await touchScrollViewportByPixels(page, direction * deltaY, { settle: false });
  }

  throw new Error(
    `Expected touch scroll viewport to reach progress≈${progress.toFixed(4)}`
    + `, lastViewport=${JSON.stringify(snapshot)}`,
  );
}

async function scrollViewportToProgress(page: Page, progress: number): Promise<void> {
  await scrollViewportToProgressByTouchAndWait(page, progress);
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
    timeout: TOUCH_SCROLL_SETTLE_TIMEOUT_MS,
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

function requireMapAdmittedNumber(snippet: string, context: string): number {
  const match = snippet.match(/map admitted (\d+)\./u);
  if (!match) {
    throw new Error(`${context}: failed to read map-admitted paragraph number from '${snippet}'.`);
  }

  return Number(match[1]);
}

function buildMultiChapterPassageSnippet(chapterIndex: number, blockIndex: number): string {
  return `Passage ${chapterIndex + 1} unfolded across the landscape ${blockIndex}. `
    + 'The lantern-lit avenue folded into a';
}

function buildPersistedCanonicalSnippet(
  progress: PersistedReadingProgressSnapshot,
  context: string,
): string {
  const textQuote = progress.canonical.textQuoteExact?.replaceAll(/\s+/gu, ' ').trim();
  if (textQuote) {
    return textQuote;
  }

  const { blockIndex, chapterIndex } = progress.canonical;
  if (typeof chapterIndex !== 'number' || typeof blockIndex !== 'number') {
    throw new Error(`${context}: expected a concrete canonical text position.`);
  }

  return buildMultiChapterPassageSnippet(chapterIndex, blockIndex);
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

async function readScrollReadingAnchorOrThrow(
  page: Page,
  description: string,
): Promise<VisibleContentAnchor> {
  let anchor: VisibleContentAnchor | null = null;

  await expect.poll(async () => {
    anchor = await page.getByTestId('reader-viewport').evaluate((element) => {
      const viewport = element as HTMLElement;
      const viewportRect = viewport.getBoundingClientRect();
      const readingY = viewportRect.top + viewportRect.height * 0.3;
      const candidates = Array.from(viewport.querySelectorAll(
        'p, h1, h2, h3, h4, h5, h6, [data-testid="reader-flow-text-fragment"]',
      ));
      let best: { distance: number; value: VisibleContentAnchor } | null = null;

      for (const candidate of candidates) {
        if (!(candidate instanceof HTMLElement)) {
          continue;
        }
        const rect = candidate.getBoundingClientRect();
        if (rect.height <= 0 || rect.bottom < viewportRect.top || rect.top > viewportRect.bottom) {
          continue;
        }
        const text = (candidate.textContent ?? '').trim();
        if (text.length < 40) {
          continue;
        }
        const centerY = rect.top + rect.height / 2;
        const value: VisibleContentAnchor = {
          offsetTop: Math.round(rect.top - viewportRect.top),
          tagName: candidate.tagName.toLowerCase(),
          textSnippet: text.slice(0, 80),
        };
        const distance = Math.abs(centerY - readingY);
        if (!best || distance < best.distance) {
          best = { distance, value };
        }
      }

      return best?.value ?? null;
    });
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
      const preferredCenter = visibleTop + viewportRect.height * 0.48;
      const candidates = Array.from(
        viewport.querySelectorAll('p, div, li, span, h1, h2, h3, h4, h5, h6'),
      );
      const matches: Array<{ distance: number; text: string }> = [];

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
          const centerY = rect.top + rect.height / 2;
          matches.push({
            distance: Math.abs(centerY - preferredCenter),
            text: match[0],
          });
        }
      }

      matches.sort((left, right) => left.distance - right.distance);
      return matches[0]?.text ?? null;
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
  const viewportSnapshot = contentMode === 'scroll'
    ? await waitForViewportScrollSettled(page, `capture ${contentMode} marker viewport settled`)
    : null;
  const persisted = await waitForPersistedReadingProgress(
    page,
    novelId,
    (snapshot) => snapshot !== null && snapshot.contentMode === contentMode,
    { description: `capture ${contentMode} marker`, timeout: 15_000 },
  );
  const anchor = contentMode === 'scroll'
    ? await readScrollReadingAnchorOrThrow(page, `capture ${contentMode} marker anchor`)
    : await readVisibleAnchorOrThrow(page, `capture ${contentMode} marker anchor`);

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

function serializeProgressSnapshot(snapshot: PersistedReadingProgressSnapshot): string {
  return JSON.stringify({
    blockIndex: snapshot.canonical.blockIndex,
    chapterIndex: snapshot.canonical.chapterIndex,
    chapterProgress: snapshot.chapterProgress,
    contentMode: snapshot.contentMode,
    lineIndex: snapshot.canonical.lineIndex,
    pageIndex: snapshot.pageIndex,
    revision: snapshot.revision,
    textQuoteExact: snapshot.canonical.textQuoteExact,
    updatedAt: snapshot.updatedAt,
  });
}

async function waitForSettledPersistedReadingProgress(
  page: Page,
  novelId: number,
  predicate: (snapshot: PersistedReadingProgressSnapshot | null) => boolean,
  options: {
    description: string;
    timeout?: number;
  },
): Promise<PersistedReadingProgressSnapshot> {
  let latestMatch: PersistedReadingProgressSnapshot | null = null;
  let stableKey: string | null = null;
  let stableSince = 0;
  const stableDurationMs = 350;

  await expect.poll(async () => {
    const snapshot = await readPersistedReadingProgress(page, novelId);
    if (!snapshot || !predicate(snapshot)) {
      latestMatch = null;
      stableKey = null;
      stableSince = 0;
      return false;
    }

    latestMatch = snapshot;
    const nextKey = serializeProgressSnapshot(snapshot);
    const now = Date.now();
    if (nextKey !== stableKey) {
      stableKey = nextKey;
      stableSince = now;
      return false;
    }

    return now - stableSince >= stableDurationMs;
  }, {
    message: options.description,
    timeout: options.timeout ?? 15_000,
  }).toBe(true);

  if (!latestMatch) {
    throw new Error(`${options.description}: persisted progress did not settle.`);
  }

  return latestMatch;
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
  const normalizeText = (value: string) => value.replaceAll(/\s+/gu, ' ').trim();
  const expectedSnippet = normalizeText(snippet);

  await expectViewportContainsAnySnippet(page, [expectedSnippet], `Expected viewport to contain visible snippet: ${expectedSnippet}`);
}

async function expectViewportContainsAnySnippet(
  page: Page,
  snippets: string[],
  message: string,
): Promise<void> {
  const normalizeText = (value: string) => value.replaceAll(/\s+/gu, ' ').trim();
  const expectedSnippets = snippets.map(normalizeText).filter(Boolean);

  await expect.poll(async () => page.getByTestId('reader-viewport').evaluate(
    (element, expectedValues) => {
      const viewport = element as HTMLElement;
      const viewportRect = viewport.getBoundingClientRect();
      const candidates = Array.from(viewport.querySelectorAll(
        'p, h1, h2, h3, h4, h5, h6, [data-testid="reader-flow-text-fragment"]',
      ));
      const visibleTexts: string[] = [];

      return candidates.some((candidate) => {
        if (!(candidate instanceof HTMLElement)) {
          return false;
        }
        const rect = candidate.getBoundingClientRect();
        const intersectsViewport = rect.height > 0
          && rect.bottom > viewportRect.top
          && rect.top < viewportRect.bottom;
        if (!intersectsViewport) {
          return false;
        }

        const text = (candidate.textContent ?? candidate.innerText)
          .replaceAll(/\s+/gu, ' ')
          .trim();
        visibleTexts.push(text);
        return expectedValues.some((expected) => text.includes(expected));
      }) || expectedValues.some((expected) => (
        visibleTexts.join(' ').replaceAll(/\s+/gu, ' ').trim().includes(expected)
      ));
    },
    expectedSnippets,
  ), {
    timeout: 15_000,
    message,
  }).toBe(true);
}

async function expectViewportContainsNearbyPassage(
  page: Page,
  snippet: string,
  tolerance: number,
): Promise<void> {
  const match = snippet.match(/Passage (\d+) unfolded across the landscape (\d+)\./u);
  if (!match) {
    await expectViewportContainsSnippet(page, snippet);
    return;
  }

  const chapterNumber = Number(match[1]);
  const passageNumber = Number(match[2]);
  const nearbySnippets: string[] = [];
  for (
    let nextPassageNumber = Math.max(1, passageNumber - tolerance);
    nextPassageNumber <= passageNumber + tolerance;
    nextPassageNumber += 1
  ) {
    nearbySnippets.push(
      buildMultiChapterPassageSnippet(chapterNumber - 1, nextPassageNumber),
    );
  }

  await expectViewportContainsAnySnippet(
    page,
    nearbySnippets,
    `Expected viewport to contain passage near: ${snippet}`,
  );
}

async function waitForReaderRestoreIdle(page: Page, description: string): Promise<void> {
  await expect(
    page.getByRole('status', { name: 'Loading reader content' }),
    description,
  ).toHaveCount(0, { timeout: 15_000 });
}

async function expectViewportNotContainsSnippet(page: Page, snippet: string): Promise<void> {
  const isVisible = await page.getByTestId('reader-viewport').getByText(snippet, { exact: false }).first()
    .isVisible()
    .catch(() => false);
  expect(isVisible).toBe(false);
}

async function expectViewportDoesNotShowSnippet(page: Page, snippet: string): Promise<void> {
  await expect(
    page.getByTestId('reader-viewport').getByText(snippet, { exact: false }).first(),
  ).not.toBeInViewport({ timeout: 5_000 });
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
  await expect(pageTurnButton).toBeInViewport({ timeout: 8_000 });
  await activateLocatorResponsive(page, pageTurnButton);

  const modeButton = page.locator(`button[title="${targetModeLabel}"]:visible`).first();
  await expect(modeButton).toBeVisible({ timeout: 8_000 });
  await expect(modeButton).toBeInViewport({ timeout: 8_000 });
  await activateLocatorResponsive(page, modeButton);
  await waitForReaderBranch(page, branch);
  await waitForReaderRestoreIdle(page, `Reader restore idle after switching to ${branch}`);
  await hideReaderChromeResponsive(page);
}

async function openBookFromBookshelf(page: Page, title: string): Promise<void> {
  const backLink = page.getByRole('link', { name: 'Back' }).first();
  if (await backLink.isVisible().catch(() => false)) {
    await activateLocatorResponsive(page, backLink);
  } else {
    await page.goto('/');
  }
  await disableAnimations(page);
  await activateLocatorResponsive(page, page.getByRole('link', { name: title }).first());
  await disableAnimations(page);
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible({ timeout: 15_000 });
}

async function runScrollRestoreRound(
  page: Page,
  novelId: number,
  round: number,
  targetProgress: number,
  previousMarker?: ReadingMarker,
): Promise<ReadingMarker> {
  let viewportSnapshot = await scrollViewportToProgressByTouchAndWait(page, targetProgress);

  if (previousMarker) {
    const previousScrollProgress = requireScrollProgress(previousMarker, `TC-001 round ${round - 1} marker`);
    const extraScrollSteps = [360, 360, 360, 360, 360, 360];
    for (let attempt = 0; attempt < extraScrollSteps.length; attempt += 1) {
      if (
        viewportSnapshot.scrollProgress !== null
        && viewportSnapshot.scrollProgress > previousScrollProgress + 0.08
      ) {
        break;
      }
      viewportSnapshot = await touchScrollViewportByPixels(page, extraScrollSteps[attempt]);
    }

    expect(viewportSnapshot.scrollProgress).not.toBeNull();
    expect(viewportSnapshot.scrollProgress!).toBeGreaterThan(
      previousScrollProgress + 0.08,
    );
  }

  expect(viewportSnapshot.scrollProgress).not.toBeNull();
  const expectedExitProgress = viewportSnapshot.scrollProgress!;
  const persistedBeforeExit = await waitForPersistedReadingProgress(
    page,
    novelId,
    (snapshot) => snapshot !== null
      && snapshot.contentMode === 'scroll'
      && isScrollProgressWithinTolerance(snapshot.chapterProgress ?? null, expectedExitProgress),
    {
      description: `TC-001 round ${round} scroll progress persisted before exit`,
      timeout: 15_000,
    },
  );
  expect(persistedBeforeExit.chapterProgress).not.toBeNull();
  const savedProgressBeforeExit = expectedExitProgress;
  const anchorSnippetBeforeExit = await readLongBookVisibleParagraphSnippet(
    page,
    `TC-001 round ${round} capture visible paragraph`,
  );

  await exitReaderToDetailPageByUi(page);
  await expect(
    page.getByRole('link', { name: 'Start Reading' }).first(),
    `TC-001 round ${round} detail page visible before reopen`,
  ).toBeVisible({ timeout: 15_000 });
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

  await exitAndReopenReaderByUiResponsive(page);
  await waitForReaderBranch(page, 'paged');
  await expectPagedMarkerRestored(page, novelId, marker, `TC-002 round ${round} paged progress restored`);
  await expectViewportContainsSnippet(page, marker.anchorSnippet);

  return marker;
}

test.describe('移动端阅读会话恢复', () => {
  test('TC-005 滚动模式下退出重进，阅读记录恢复正常', async ({ page }) => {
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

    const novelId = readNovelIdFromReaderUrl(page.url());

    const roundOneMarker = await runScrollRestoreRound(page, novelId, 1, 0.22);
    const roundTwoMarker = await runScrollRestoreRound(
      page,
      novelId,
      2,
      0.42,
      roundOneMarker,
    );
    const roundThreeMarker = await runScrollRestoreRound(
      page,
      novelId,
      3,
      0.62,
      roundTwoMarker,
    );

    expect(requireScrollProgress(roundTwoMarker, 'TC-001 round 2 marker')).toBeGreaterThan(
      requireScrollProgress(roundOneMarker, 'TC-001 round 1 marker'),
    );
    expect(requireScrollProgress(roundThreeMarker, 'TC-001 round 3 marker')).toBeGreaterThan(
      requireScrollProgress(roundTwoMarker, 'TC-001 round 2 marker'),
    );
  });

  test('TC-006 翻页模式下退出重进，阅读记录恢复正常', async ({ page }) => {
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
    await scrollViewportByPixels(page, 260);
    await waitForPersistedReadingProgress(
      page,
      novelId,
      (snapshot) => snapshot !== null
        && snapshot.contentMode === 'scroll'
        && snapshot.canonical.chapterIndex === 1,
      { description: 'toc jumped chapter remains active after touch scroll', timeout: 15_000 },
    );
    const marker = await captureMarker(page, novelId, 'scroll');

    expect(marker.chapterIndex).toBe(1);

    await exitReaderToDetailPageByUi(page);
    const exitProgress = await waitForSettledPersistedReadingProgress(
      page,
      novelId,
      (snapshot) => snapshot !== null
        && snapshot.contentMode === 'scroll'
        && snapshot.canonical.chapterIndex === 1
        && typeof snapshot.canonical.blockIndex === 'number',
      { description: 'jumped chapter persisted after exit', timeout: 15_000 },
    );
    const restoredSnippet = buildPersistedCanonicalSnippet(exitProgress, 'TC-007');

    const startReadingLink = page.getByRole('link', { name: 'Start Reading' }).first();
    await expect(startReadingLink).toBeVisible({ timeout: 15_000 });
    await activateLocatorResponsive(page, startReadingLink);
    await expect(page.getByTestId('reader-viewport')).toBeVisible({ timeout: 30_000 });
    await disableAnimations(page);
    await waitForReaderBranch(page, 'scroll');
    await waitForPersistedReadingProgress(
      page,
      novelId,
      (snapshot) => snapshot !== null
        && snapshot.contentMode === 'scroll'
        && snapshot.canonical.chapterIndex === 1,
      { description: 'jumped chapter restored', timeout: 15_000 },
    );

    await expectViewportContainsNearbyPassage(page, restoredSnippet, 3);
  });

  test('TC-008 刷新页面后，阅读记录恢复正常', async ({ page }) => {
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

  test('TC-009 不同书籍之间的阅读记录互不影响', async ({ page }) => {
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
    await exitReaderToDetailPageByUi(page);

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
    await exitReaderToDetailPageByUi(page);

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

  test('TC-010 同一章节内切换阅读方式后，阅读内容位置应连续', async ({ page }) => {
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
    const scrollSnippet = await readLongBookVisibleParagraphSnippet(
      page,
      'TC-012 capture initial scroll paragraph',
    );
    const scrollParagraphNumber = requireMapAdmittedNumber(scrollSnippet, 'TC-012 initial scroll');

    await switchReaderBranch(page, 'paged');
    await expectViewportContainsSnippet(page, scrollSnippet);
    await advancePagedPages(page, 3);
    await waitForPagedProgress(page, novelId, 3, 'paged progress persisted for continuity');
    const pagedMarker = await captureMarker(page, novelId, 'paged');
    const pagedSnippet = await readLongBookVisibleParagraphSnippet(
      page,
      'TC-012 capture advanced paged paragraph',
    );
    const pagedParagraphNumber = requireMapAdmittedNumber(pagedSnippet, 'TC-012 advanced paged');
    expect(pagedParagraphNumber).toBeGreaterThan(scrollParagraphNumber + 2);

    await switchReaderBranch(page, 'scroll');
    const restoredFromPagedSnippet = await readLongBookVisibleParagraphSnippet(
      page,
      'TC-012 capture restored scroll paragraph after paged switch',
    );
    const restoredFromPagedParagraphNumber = requireMapAdmittedNumber(
      restoredFromPagedSnippet,
      'TC-012 restored scroll after paged switch',
    );
    expect(restoredFromPagedParagraphNumber).toBeGreaterThanOrEqual(pagedParagraphNumber - 2);
    expect(restoredFromPagedParagraphNumber).toBeGreaterThan(scrollParagraphNumber + 2);
    await expectViewportDoesNotShowSnippet(page, scrollSnippet);
    const restoredFromPagedMarker = await captureMarker(page, novelId, 'scroll');
    await scrollViewportByPixels(page, 420);
    await waitForScrollProgress(page, novelId, 0.18, 'final scroll persisted for continuity');
    const finalMarker = await captureMarker(page, novelId, 'scroll');
    const finalSnippet = await readLongBookVisibleParagraphSnippet(
      page,
      'TC-012 capture final scroll paragraph',
    );
    const finalParagraphNumber = requireMapAdmittedNumber(finalSnippet, 'TC-012 final scroll');

    expect(scrollMarker.chapterIndex).toBe(0);
    expect(pagedMarker.chapterIndex).toBe(0);
    expect(restoredFromPagedMarker.chapterIndex).toBe(0);
    expect(restoredFromPagedMarker.contentMode).toBe('scroll');
    expect(finalMarker.chapterIndex).toBe(0);

    await exitAndReopenReaderByUiResponsive(page);
    await waitForReaderBranch(page, 'scroll');
    await waitForScrollProgress(page, novelId, 0.18, 'final scroll restored for continuity');

    const reopenedSnippet = await readLongBookVisibleParagraphSnippet(
      page,
      'TC-012 capture reopened final scroll paragraph',
    );
    expect(
      requireMapAdmittedNumber(reopenedSnippet, 'TC-012 reopened final scroll'),
    ).toBeGreaterThanOrEqual(finalParagraphNumber - 2);
  });
});
