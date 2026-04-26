import type { Page, TestInfo } from '@playwright/test';

import { expect, test } from '@playwright/test';

import {
  disableAnimations,
  enableReaderTrace,
  exitAndReopenReader,
  importFixtureToDetailPage,
  navigateToChapterByTitle,
  openReaderFromDetailPage,
  readPersistedReadingProgress,
  readReaderViewportSnapshot,
  readVisibleContentAnchor,
  setReaderPreferences,
  waitForPersistedReadingProgress,
  waitForReaderBranch,
  type PersistedReadingProgressSnapshot,
  type ReaderViewportSnapshot,
  type VisibleContentAnchor,
} from '../helpers/readerVisualHarness';
import { SCROLL_READING_ANCHOR_RATIO } from '../../../src/shared/utils/readerPosition';

const ROUND_TRIP_ITERATIONS = 6;
const BASELINE_SCROLL_PROGRESS_CANDIDATES = [0.45, 0.72, 0.9] as const;
const PROGRESS_TOLERANCE = 0.05;
const CANONICAL_BLOCK_INDEX_TOLERANCE = 16;

const KNOWN_SAFE_TRACE_EVENTS = new Set([
  'mode_switch_started',
  'mode_switch_target_resolved',
  'mode_switch_finished',
  'page_turn_mode_requested',
  'restore_target_set',
  'restore_target_cleared',
  'paged_restore_attempt',
  'paged_restore_pending',
  'paged_restore_completed',
  'paged_page_index_changed',
  'paged_page_turn_token_incremented',
  'viewport_branch_rendered',
]);

const KNOWN_PROBLEM_TRACE_EVENTS = new Set([
  'mode_switch_error',
  'suspect',
  'mode_switch_rollback',
  'paged_restore_failed',
]);

interface ReaderTraceEventSnapshot {
  details?: {
    reason?: unknown;
  } | null;
  event?: string;
}

interface ReaderTraceDumpSnapshot {
  current: {
    events?: ReaderTraceEventSnapshot[];
  } | null;
  last: {
    events?: ReaderTraceEventSnapshot[];
  } | null;
}

function isProgressWithinTolerance(
  actual: number | null,
  expected: number,
  tolerance = PROGRESS_TOLERANCE,
): actual is number {
  return typeof actual === 'number' && Math.abs(actual - expected) <= tolerance;
}

function getViewportReadingProgress(snapshot: ReaderViewportSnapshot | null): number | null {
  if (
    !snapshot
    || typeof snapshot.scrollTop !== 'number'
    || typeof snapshot.clientHeight !== 'number'
    || typeof snapshot.maxScrollTop !== 'number'
    || snapshot.maxScrollTop <= 0
  ) {
    return null;
  }

  return Math.max(0, Math.min(1, (
    snapshot.scrollTop + snapshot.clientHeight * SCROLL_READING_ANCHOR_RATIO
  ) / snapshot.maxScrollTop));
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

async function readTraceDump(page: Page): Promise<ReaderTraceDumpSnapshot> {
  return page.evaluate(() => ({
    current: (window as Window & {
      PlotMapAIReaderTrace?: {
        dump: () => unknown;
        getLastDump: () => unknown;
      };
    }).PlotMapAIReaderTrace?.dump() ?? null,
    last: (window as Window & {
      PlotMapAIReaderTrace?: {
        dump: () => unknown;
        getLastDump: () => unknown;
      };
    }).PlotMapAIReaderTrace?.getLastDump() ?? null,
  })) as Promise<ReaderTraceDumpSnapshot>;
}

async function resetReaderTrace(page: Page): Promise<void> {
  await page.evaluate(() => {
    const traceWindow = window as Window & {
      PlotMapAIReaderTrace?: {
        clear: () => void;
        enable: () => void;
      };
    };
    traceWindow.PlotMapAIReaderTrace?.clear();
    traceWindow.PlotMapAIReaderTrace?.enable();
  });
}

async function attachReaderDiagnostics(
  page: Page,
  testInfo: TestInfo,
  name: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const [traceDump, persistedProgress, viewportSnapshot] = await Promise.all([
    readTraceDump(page),
    readPersistedReadingProgress(page, payload.novelId as number),
    readReaderViewportSnapshot(page),
  ]);

  await testInfo.attach(name, {
    body: JSON.stringify({
      ...payload,
      persistedProgress,
      traceDump,
      viewportSnapshot,
    }, null, 2),
    contentType: 'application/json',
  });
}

async function assertNoTraceProblems(
  page: Page,
  testInfo: TestInfo,
  novelId: number,
  iteration: number,
  stage: string,
): Promise<void> {
  const dump = await readTraceDump(page);
  const events = dump.current?.events ?? [];

  for (const event of events) {
    const eventName = event.event ?? '';

    if (KNOWN_SAFE_TRACE_EVENTS.has(eventName)) {
      continue;
    }

    const isKnownProblem = KNOWN_PROBLEM_TRACE_EVENTS.has(eventName);
    const label = isKnownProblem ? eventName : `unknown_trace_event(${eventName})`;

    await attachReaderDiagnostics(page, testInfo, 'reader-mode-switch-trace-problem.json', {
      iteration,
      novelId,
      problemEvent: event,
      stage,
    });
    const reason = typeof event.details?.reason === 'string'
      ? ` (${event.details.reason})`
      : '';
    throw new Error(`Reader trace reported ${label} during ${stage}${reason}.`);
  }
}

async function scrollReaderViewportToProgress(
  page: Page,
  progress: number,
): Promise<ReaderViewportSnapshot> {
  const viewport = page.getByTestId('reader-viewport');
  await viewport.evaluate((element, nextProgress) => {
    const target = element;
    const maxScrollTop = Math.max(0, target.scrollHeight - target.clientHeight);
    target.scrollTop = Math.round(maxScrollTop * nextProgress);
    target.dispatchEvent(new Event('scroll'));
  }, progress);

  let snapshot: ReaderViewportSnapshot | null = null;
  await expect.poll(async () => {
    snapshot = await readReaderViewportSnapshot(page);
    return snapshot.scrollProgress !== null
      && Math.abs(snapshot.scrollProgress - progress) <= 0.02;
  }, {
    timeout: 10_000,
  }).toBe(true);

  if (!snapshot) {
    throw new Error('Scroll viewport snapshot did not stabilize.');
  }

  return snapshot;
}

async function expectReadingProgressNearBaseline(
  page: Page,
  baselineProgress: number,
): Promise<ReaderViewportSnapshot> {
  let snapshot: ReaderViewportSnapshot | null = null;
  await expect.poll(async () => {
    snapshot = await readReaderViewportSnapshot(page);
    return isProgressWithinTolerance(
      getViewportReadingProgress(snapshot),
      baselineProgress,
      0.08,
    );
  }, {
    timeout: 10_000,
  }).toBe(true);

  if (!snapshot) {
    throw new Error('Reader viewport snapshot did not stabilize near the reading baseline.');
  }

  return snapshot;
}

async function waitForScrollProgressPersistence(
  page: Page,
  novelId: number,
  baselineProgress: number,
  previousRevision?: number,
): Promise<PersistedReadingProgressSnapshot> {
  return waitForPersistedReadingProgress(
    page,
    novelId,
    (snapshot) => {
      return snapshot?.contentMode === 'scroll'
        && snapshot.pageIndex === null
        && isProgressWithinTolerance(snapshot.chapterProgress, baselineProgress)
        && (
          previousRevision === undefined
          || (
            typeof snapshot.revision === 'number'
            && snapshot.revision > previousRevision
          )
        );
    },
    {
      description: 'waiting for scroll-mode reading progress to match the baseline',
      timeout: 10_000,
    },
  );
}

async function waitForScrollPersistenceUpdate(
  page: Page,
  novelId: number,
  previousRevision: number,
  description: string,
): Promise<PersistedReadingProgressSnapshot> {
  return waitForPersistedReadingProgress(
    page,
    novelId,
    (snapshot) => {
      return snapshot?.contentMode === 'scroll'
        && snapshot.pageIndex === null
        && typeof snapshot.chapterProgress === 'number'
        && typeof snapshot.revision === 'number'
        && snapshot.revision > previousRevision;
    },
    {
      description,
      timeout: 10_000,
    },
  );
}

async function waitForPagedProgressPersistence(
  page: Page,
  novelId: number,
): Promise<PersistedReadingProgressSnapshot> {
  return waitForPersistedReadingProgress(
    page,
    novelId,
    (snapshot) => {
      return snapshot?.contentMode === 'paged'
        && typeof snapshot.pageIndex === 'number';
    },
    {
      description: 'waiting for paged-mode reading progress to persist',
      timeout: 10_000,
    },
  );
}

async function waitForPagedViewportSnapshot(
  page: Page,
  expectedPageIndex: number,
): Promise<ReaderViewportSnapshot> {
  let snapshot: ReaderViewportSnapshot | null = null;

  await expect.poll(async () => {
    snapshot = await readReaderViewportSnapshot(page);
    return snapshot.branch === 'paged'
      && snapshot.currentPageIndex === expectedPageIndex;
  }, {
    timeout: 10_000,
  }).toBe(true);

  if (!snapshot) {
    throw new Error('Paged viewport snapshot did not settle.');
  }

  return snapshot;
}

function assertCanonicalNearBaseline(
  actual: PersistedReadingProgressSnapshot['canonical'],
  baseline: PersistedReadingProgressSnapshot['canonical'],
  context: string,
): void {
  if (typeof actual.blockIndex !== 'number') {
    throw new Error(`${context}: canonical.blockIndex is not a number (got ${actual.blockIndex}).`);
  }

  if (typeof baseline.blockIndex !== 'number') {
    throw new Error(`${context}: baseline canonical.blockIndex is not a number.`);
  }

  const drift = Math.abs(actual.blockIndex - baseline.blockIndex);
  if (drift > CANONICAL_BLOCK_INDEX_TOLERANCE) {
    throw new Error(
      `${context}: canonical.blockIndex drifted by ${drift} blocks ` +
      `(baseline=${baseline.blockIndex}, actual=${actual.blockIndex}, ` +
      `tolerance=±${CANONICAL_BLOCK_INDEX_TOLERANCE}).`,
    );
  }

  if (actual.kind !== baseline.kind) {
    throw new Error(
      `${context}: canonical.kind changed from '${baseline.kind}' to '${actual.kind}'.`,
    );
  }
}

function assertContentAnchorStable(
  actual: VisibleContentAnchor | null,
  baseline: VisibleContentAnchor,
  context: string,
): void {
  if (!actual) {
    throw new Error(`${context}: no visible content anchor found.`);
  }

  const baselinePrefix = baseline.textSnippet.slice(0, 40);
  if (!actual.textSnippet.includes(baselinePrefix)) {
    throw new Error(
      `${context}: visible content changed. ` +
      `Baseline starts with '${baselinePrefix}', ` +
      `actual='${actual.textSnippet}'.`,
    );
  }
}

async function selectPagedRoundTripBaseline(
  page: Page,
  novelId: number,
  testInfo: TestInfo,
): Promise<number> {
  const candidateResults: Array<Record<string, unknown>> = [];

  for (const candidateProgress of BASELINE_SCROLL_PROGRESS_CANDIDATES) {
    const previousPersistedProgress = await readPersistedReadingProgress(page, novelId);
    await scrollReaderViewportToProgress(page, candidateProgress);
    const scrollPersistedProgress = await waitForScrollPersistenceUpdate(
      page,
      novelId,
      previousPersistedProgress?.revision ?? 0,
      'waiting for the scroll baseline candidate to persist',
    );

    await clickToolbarMode(page, 'Two Columns');
    await waitForReaderBranch(page, 'paged');
    const pagedPersistedProgress = await waitForPagedProgressPersistence(page, novelId);
    const pagedSnapshot = await waitForPagedViewportSnapshot(
      page,
      pagedPersistedProgress.pageIndex ?? 0,
    );
    const landsBeyondFirstPage = (
      pagedSnapshot.pageCount !== null
      && pagedSnapshot.pageCount > 1
      && pagedSnapshot.currentPageIndex !== null
      && pagedSnapshot.currentPageIndex > 0
      && pagedPersistedProgress.pageIndex !== null
      && pagedPersistedProgress.pageIndex > 0
    );
    candidateResults.push({
      candidateProgress,
      landsBeyondFirstPage,
      pagedPersistedProgress,
      pagedSnapshot,
      scrollPersistedProgress,
    });

    await clickToolbarMode(page, 'Single Column');
    await waitForReaderBranch(page, 'scroll');

    if (landsBeyondFirstPage) {
      return candidateProgress;
    }
  }

  await attachReaderDiagnostics(page, testInfo, 'reader-mode-switch-baseline-selection.json', {
    candidateProgresses: BASELINE_SCROLL_PROGRESS_CANDIDATES,
    candidateResults,
    novelId,
    stage: 'baseline-selection',
  });
  throw new Error(
    'Unable to select a scroll baseline that restores beyond the first paged page. ' +
    `Tried ${BASELINE_SCROLL_PROGRESS_CANDIDATES.join(', ')}. ` +
    `Results=${JSON.stringify(candidateResults)}.`,
  );
}

test.describe('阅读模式切换回归', () => {
  test('TC-025 多次滚动与翻页往返切换后位置保持稳定', async ({
    page,
  }, testInfo) => {
    test.slow();

    const { novelId } = await importFixtureToDetailPage(page, 'pagedRich');
    await setReaderPreferences(page, {
      pageTurnMode: 'scroll',
    });
    await openReaderFromDetailPage(page);
    await enableReaderTrace(page);

    const selectedBaselineCandidate = await selectPagedRoundTripBaseline(page, novelId, testInfo);
    await resetReaderTrace(page);
    const previousPersistedProgress = await readPersistedReadingProgress(page, novelId);
    const scrolledBaselineSnapshot = await scrollReaderViewportToProgress(
      page,
      selectedBaselineCandidate,
    );
    const initialPersistedProgress = await waitForScrollPersistenceUpdate(
      page,
      novelId,
      previousPersistedProgress?.revision ?? 0,
      'waiting for the scroll baseline to persist before reload',
    );
    expect(scrolledBaselineSnapshot.scrollProgress).not.toBeNull();
    const initialViewportProgress =
      getViewportReadingProgress(scrolledBaselineSnapshot)
      ?? selectedBaselineCandidate;
    const initialChapterProgress =
      initialPersistedProgress.chapterProgress
      ?? initialViewportProgress;

    // --- First reload: assert viewport restores near the pre-reload baseline ---
    await page.reload();
    await disableAnimations(page);
    await waitForReaderBranch(page, 'scroll');

    try {
      await expectReadingProgressNearBaseline(
        page,
        initialViewportProgress,
      );
    } catch (error) {
      const currentSnapshot = await readReaderViewportSnapshot(page);
      await attachReaderDiagnostics(page, testInfo, 'reader-mode-switch-first-reload.json', {
        errorMessage: error instanceof Error ? error.message : String(error),
        initialViewportProgress,
        currentSnapshot,
        novelId,
        stage: 'first-reload-viewport',
      });
      throw new Error(
        'First reload did not restore near the pre-reload baseline. ' +
        `Expected ≈${initialViewportProgress}, received ${currentSnapshot.scrollProgress}.`,
      );
    }

    const baselinePersistedProgress = await waitForPersistedReadingProgress(
      page,
      novelId,
      (snapshot) => {
        return snapshot?.contentMode === 'scroll'
          && snapshot.pageIndex === null
          && typeof snapshot.chapterProgress === 'number';
      },
      {
        description: 'waiting for durable scroll-mode reading progress after reload',
        timeout: 10_000,
      },
    );
    const baselineChapterProgress =
      baselinePersistedProgress.chapterProgress
      ?? initialChapterProgress;
    expect(baselinePersistedProgress.canonical.chapterIndex).toBe(0);
    expect(baselineChapterProgress).toBeGreaterThan(0.35);
    expect(baselineChapterProgress).toBeLessThan(0.98);

    // Assert first-reload progress matches pre-reload within tolerance
    expect(
      isProgressWithinTolerance(baselineChapterProgress, initialChapterProgress),
    ).toBe(true);

    // --- Capture canonical baseline & content anchor ---
    const baselineCanonical = baselinePersistedProgress.canonical;
    expect(typeof baselineCanonical.blockIndex).toBe('number');
    expect(baselineCanonical.blockIndex).toBeGreaterThan(0);

    const baselineAnchor = await readVisibleContentAnchor(page);
    expect(baselineAnchor).not.toBeNull();

    let lastRevision = baselinePersistedProgress.revision ?? 0;
    await resetReaderTrace(page);

    // --- Round-trip iterations ---
    for (let iteration = 0; iteration < ROUND_TRIP_ITERATIONS; iteration += 1) {
      // --- Paged phase ---
      await clickToolbarMode(page, 'Two Columns');
      await waitForReaderBranch(page, 'paged');
      let pagedPersistedProgress: PersistedReadingProgressSnapshot;
      try {
        pagedPersistedProgress = await waitForPagedProgressPersistence(page, novelId);
      } catch (error) {
        const currentPagedSnapshot = await readReaderViewportSnapshot(page);
        const traceDump = await readTraceDump(page);
        const persistedProgress = await readPersistedReadingProgress(page, novelId);
        await attachReaderDiagnostics(page, testInfo, 'reader-mode-switch-paged-persistence.json', {
          errorMessage: error instanceof Error ? error.message : String(error),
          currentPagedSnapshot,
          iteration,
          novelId,
          persistedProgress,
          stage: 'paged-persistence',
          traceEvents: traceDump.current?.events ?? [],
        });
        const traceEventSummary = (traceDump.current?.events ?? [])
          .map((event) => event.event ?? 'unknown')
          .join(', ');
        throw new Error(
          'Paged-mode reading progress did not persist. ' +
          `Viewport page=${currentPagedSnapshot.pageIndicator ?? 'unknown'}, ` +
          `persisted contentMode=${persistedProgress?.contentMode ?? 'null'}, ` +
          `persisted pageIndex=${persistedProgress?.pageIndex ?? 'null'}, ` +
          `trace events=[${traceEventSummary || 'none'}].`,
        );
      }
      const pagedSnapshot = await waitForPagedViewportSnapshot(
        page,
        pagedPersistedProgress.pageIndex ?? 0,
      );

      if (
        pagedSnapshot.pageCount === null
        || pagedSnapshot.pageCount <= 1
        || pagedSnapshot.currentPageIndex === null
        || pagedSnapshot.currentPageIndex <= 0
        || pagedPersistedProgress.pageIndex === null
        || pagedPersistedProgress.pageIndex <= 0
      ) {
        await attachReaderDiagnostics(page, testInfo, 'reader-mode-switch-paged-branch.json', {
          iteration,
          novelId,
          pagedPersistedProgress,
          pagedSnapshot,
          stage: 'paged',
        });
        throw new Error(
          `Expected paged restore to land beyond the first page, received ${pagedSnapshot.pageIndicator ?? 'unknown'}.`,
        );
      }

      // Canonical position must stay near baseline in paged mode
      assertCanonicalNearBaseline(
        pagedPersistedProgress.canonical,
        baselineCanonical,
        `iteration ${iteration} paged`,
      );

      // Revision must advance monotonically
      expect(pagedPersistedProgress.revision).toBeGreaterThan(lastRevision);
      lastRevision = pagedPersistedProgress.revision ?? lastRevision;

      await assertNoTraceProblems(page, testInfo, novelId, iteration, 'paged');

      // --- Scroll phase ---
      await clickToolbarMode(page, 'Single Column');
      await waitForReaderBranch(page, 'scroll');
      let scrollSnapshot: ReaderViewportSnapshot;
      try {
        scrollSnapshot = await expectReadingProgressNearBaseline(page, initialViewportProgress);
      } catch (error) {
        const currentScrollSnapshot = await readReaderViewportSnapshot(page);
        const persistedProgress = await readPersistedReadingProgress(page, novelId);
        await attachReaderDiagnostics(page, testInfo, 'reader-mode-switch-scroll-viewport.json', {
          baselineProgress: initialViewportProgress,
          currentScrollSnapshot,
          errorMessage: error instanceof Error ? error.message : String(error),
          iteration,
          novelId,
          persistedProgress,
          stage: 'scroll-viewport',
        });
        throw new Error(
          'Scroll viewport did not return near baseline. ' +
          `Expected ${initialViewportProgress}, received ${currentScrollSnapshot.scrollProgress}. ` +
          `Persisted chapterProgress=${persistedProgress?.chapterProgress ?? 'null'}.`,
        );
      }
      const scrollPersistedProgress = await waitForScrollProgressPersistence(
        page,
        novelId,
        baselineChapterProgress,
      );

      if (!isProgressWithinTolerance(
        getViewportReadingProgress(scrollSnapshot),
        initialViewportProgress,
        0.08,
      )) {
        await attachReaderDiagnostics(page, testInfo, 'reader-mode-switch-scroll-restore.json', {
          baselineProgress: initialViewportProgress,
          iteration,
          novelId,
          scrollPersistedProgress,
          scrollSnapshot,
          stage: 'scroll',
        });
        throw new Error(
          `Scroll progress drifted beyond tolerance: expected ${initialViewportProgress}, received ${scrollSnapshot.scrollProgress}.`,
        );
      }

      // Canonical position must stay near baseline in scroll mode
      assertCanonicalNearBaseline(
        scrollPersistedProgress.canonical,
        baselineCanonical,
        `iteration ${iteration} scroll`,
      );

      // Content anchor must match baseline
      const iterationAnchor = await readVisibleContentAnchor(page);
      assertContentAnchorStable(
        iterationAnchor,
        baselineAnchor!,
        `iteration ${iteration} scroll`,
      );

      // Revision must advance monotonically
      expect(scrollPersistedProgress.revision).toBeGreaterThan(lastRevision);
      lastRevision = scrollPersistedProgress.revision ?? lastRevision;

      expect(scrollPersistedProgress.contentMode).toBe('scroll');
      expect(scrollPersistedProgress.pageIndex).toBeNull();
      await assertNoTraceProblems(page, testInfo, novelId, iteration, 'scroll');
    }

    // --- Final reload ---
    await page.reload();
    await disableAnimations(page);
    await waitForReaderBranch(page, 'scroll');
    let reloadedSnapshot: ReaderViewportSnapshot;
    try {
      reloadedSnapshot = await expectReadingProgressNearBaseline(page, initialViewportProgress);
    } catch (error) {
      const currentReloadedSnapshot = await readReaderViewportSnapshot(page);
      const persistedProgress = await readPersistedReadingProgress(page, novelId);
      await attachReaderDiagnostics(page, testInfo, 'reader-mode-switch-reload-viewport.json', {
        baselineProgress: initialViewportProgress,
        currentReloadedSnapshot,
        errorMessage: error instanceof Error ? error.message : String(error),
        novelId,
        persistedProgress,
        stage: 'reload-viewport',
      });
      throw new Error(
        'Reloaded scroll viewport did not return near baseline. ' +
        `Expected ${initialViewportProgress}, received ${currentReloadedSnapshot.scrollProgress}. ` +
        `Persisted chapterProgress=${persistedProgress?.chapterProgress ?? 'null'}.`,
      );
    }
    const reloadedPersistedProgress = await waitForScrollProgressPersistence(
      page,
      novelId,
      baselineChapterProgress,
    );

    if (!isProgressWithinTolerance(
      getViewportReadingProgress(reloadedSnapshot),
      initialViewportProgress,
      0.08,
    )) {
      await attachReaderDiagnostics(page, testInfo, 'reader-mode-switch-reload-restore.json', {
        baselineProgress: initialViewportProgress,
        novelId,
        reloadedPersistedProgress,
        reloadedSnapshot,
        stage: 'reload',
      });
      throw new Error(
        `Reloaded scroll progress drifted beyond tolerance: expected ${initialViewportProgress}, received ${reloadedSnapshot.scrollProgress}.`,
      );
    }

    expect(reloadedPersistedProgress.contentMode).toBe('scroll');
    expect(reloadedPersistedProgress.pageIndex).toBeNull();
    expect(reloadedPersistedProgress.canonical.chapterIndex).toBe(0);

    // Canonical must still match baseline after final reload
    assertCanonicalNearBaseline(
      reloadedPersistedProgress.canonical,
      baselineCanonical,
      'final reload',
    );

    // Content anchor must still match after final reload
    const reloadedAnchor = await readVisibleContentAnchor(page);
    assertContentAnchorStable(reloadedAnchor, baselineAnchor!, 'final reload');

    await exitAndReopenReader(page);
    await waitForReaderBranch(page, 'scroll');
    const reopenedPersistedProgress = await waitForPersistedReadingProgress(
      page,
      novelId,
      (snapshot) => {
        return snapshot?.contentMode === 'scroll'
          && snapshot.pageIndex === null
          && typeof snapshot.canonical.blockIndex === 'number';
      },
      {
        description: 'waiting for scroll-mode reading progress after exit and reopen',
        timeout: 10_000,
      },
    );
    const reopenedScrollSnapshot = await readReaderViewportSnapshot(page);
    expect(reopenedScrollSnapshot.branch).toBe('scroll');
    assertCanonicalNearBaseline(
      reopenedPersistedProgress.canonical,
      baselineCanonical,
      'final exit-reopen',
    );
    const reopenedAnchor = await readVisibleContentAnchor(page);
    assertContentAnchorStable(reopenedAnchor, baselineAnchor!, 'final exit-reopen');
  });

  test('TC-026 多章节翻页模式显示全书页码并保留章节内页码数据', async ({
    page,
  }) => {
    const { novelId } = await importFixtureToDetailPage(page, 'multiChapterRich');
    await openReaderFromDetailPage(page);
    await waitForReaderBranch(page, 'scroll');

    await navigateToChapterByTitle(page, 'chapter-2.xhtml');
    await waitForPersistedReadingProgress(
      page,
      novelId,
      (snapshot) => snapshot?.canonical.chapterIndex === 1,
      {
        description: 'waiting for chapter 2 after TOC navigation',
        timeout: 12_000,
      },
    );

    await clickToolbarMode(page, 'Two Columns');
    await waitForReaderBranch(page, 'paged');
    await waitForPagedProgressPersistence(page, novelId);

    await expect.poll(async () => {
      const snapshot = await readReaderViewportSnapshot(page);
      return snapshot.branch === 'paged'
        && snapshot.currentPageIndex !== null
        && snapshot.pageCount !== null
        && snapshot.indicatorPageIndex !== null
        && snapshot.indicatorPageCount !== null
        && snapshot.indicatorPageCount > snapshot.pageCount
        && snapshot.indicatorPageIndex > snapshot.currentPageIndex;
    }, {
      message: 'full-book page indicator should be ahead of chapter-local page data in chapter 2',
      timeout: 15_000,
    }).toBe(true);
  });

  test('TC-027 在章节边界处可正确恢复位置', async ({
    page,
  }, testInfo) => {
    test.slow();

    const { novelId } = await importFixtureToDetailPage(page, 'pagedRich');
    await setReaderPreferences(page, {
      pageTurnMode: 'scroll',
    });
    await openReaderFromDetailPage(page);
    await enableReaderTrace(page);

    // Scroll to near-end of the chapter
    const nearEndProgress = 0.95;
    await scrollReaderViewportToProgress(page, nearEndProgress);
    const nearEndPersisted = await waitForPersistedReadingProgress(
      page,
      novelId,
      (snapshot) => {
        return snapshot?.contentMode === 'scroll'
          && typeof snapshot.chapterProgress === 'number'
          && snapshot.chapterProgress > 0.85;
      },
      {
        description: 'waiting for near-end scroll progress to persist',
        timeout: 10_000,
      },
    );
    expect(nearEndPersisted.chapterProgress).toBeGreaterThan(0.85);
    const nearEndCanonical = nearEndPersisted.canonical;
    const nearEndAnchor = await readVisibleContentAnchor(page);
    expect(nearEndAnchor).not.toBeNull();

    await resetReaderTrace(page);

    // --- Switch to paged: should land on the last page ---
    await clickToolbarMode(page, 'Two Columns');
    await waitForReaderBranch(page, 'paged');
    const pagedPersisted = await waitForPagedProgressPersistence(page, novelId);
    const pagedSnapshot = await waitForPagedViewportSnapshot(
      page,
      pagedPersisted.pageIndex ?? 0,
    );

    // Must be on the last (or near-last) page
    expect(pagedSnapshot.currentPageIndex).toBeGreaterThan(0);
    if (pagedSnapshot.pageCount !== null && pagedSnapshot.currentPageIndex !== null) {
      expect(pagedSnapshot.currentPageIndex).toBeGreaterThanOrEqual(pagedSnapshot.pageCount - 2);
    }

    // Canonical should be near the end
    assertCanonicalNearBaseline(
      pagedPersisted.canonical,
      nearEndCanonical,
      'chapter-boundary paged',
    );

    await assertNoTraceProblems(page, testInfo, novelId, 0, 'chapter-boundary-paged');

    // --- Switch back to scroll: should restore near-end ---
    await clickToolbarMode(page, 'Single Column');
    await waitForReaderBranch(page, 'scroll');

    const scrollPersisted = await waitForPersistedReadingProgress(
      page,
      novelId,
      (snapshot) => {
        return snapshot?.contentMode === 'scroll'
          && typeof snapshot.chapterProgress === 'number'
          && snapshot.chapterProgress > 0.80;
      },
      {
        description: 'waiting for near-end scroll progress after paged round-trip',
        timeout: 10_000,
      },
    );

    expect(scrollPersisted.chapterProgress).toBeGreaterThan(0.80);
    assertCanonicalNearBaseline(
      scrollPersisted.canonical,
      nearEndCanonical,
      'chapter-boundary scroll',
    );

    const scrollAnchor = await readVisibleContentAnchor(page);
    if (nearEndAnchor) {
      assertContentAnchorStable(scrollAnchor, nearEndAnchor, 'chapter-boundary scroll');
    }

    await assertNoTraceProblems(page, testInfo, novelId, 0, 'chapter-boundary-scroll');
  });

  test('TC-028 封面翻页模式下位置保持稳定', async ({
    page,
  }, testInfo) => {
    test.slow();

    const { novelId } = await importFixtureToDetailPage(page, 'pagedRich');
    await setReaderPreferences(page, {
      pageTurnMode: 'cover',
    });
    await openReaderFromDetailPage(page);
    await enableReaderTrace(page, 'paged');

    // In cover mode the reader starts in paged branch. Switch to scroll to
    // perform the baseline selection, then switch back.
    await clickToolbarMode(page, 'Single Column');
    await waitForReaderBranch(page, 'scroll');

    const selectedBaselineCandidate = await selectPagedRoundTripBaseline(page, novelId, testInfo);
    await resetReaderTrace(page);
    const previousPersistedProgress = await readPersistedReadingProgress(page, novelId);
    await scrollReaderViewportToProgress(page, selectedBaselineCandidate);
    const initialPersistedProgress = await waitForScrollPersistenceUpdate(
      page,
      novelId,
      previousPersistedProgress?.revision ?? 0,
      'waiting for the cover-mode scroll baseline to persist before reload',
    );
    const initialViewportSnapshot = await readReaderViewportSnapshot(page);
    const initialViewportProgress =
      getViewportReadingProgress(initialViewportSnapshot)
      ?? selectedBaselineCandidate;
    const initialChapterProgress =
      initialPersistedProgress.chapterProgress
      ?? initialViewportProgress;

    await page.reload();
    await disableAnimations(page);
    // The last persisted contentMode was scroll, so reload restores scroll.
    await waitForReaderBranch(page, 'scroll');
    await expectReadingProgressNearBaseline(page, initialViewportProgress);

    const baselinePersistedProgress = await waitForPersistedReadingProgress(
      page,
      novelId,
      (snapshot) => {
        return snapshot?.contentMode === 'scroll'
          && snapshot.pageIndex === null
          && typeof snapshot.chapterProgress === 'number';
      },
      {
        description: 'waiting for durable cover-mode reading progress after reload',
        timeout: 10_000,
      },
    );
    const baselineChapterProgress =
      baselinePersistedProgress.chapterProgress
      ?? initialChapterProgress;
    const baselineCanonical = baselinePersistedProgress.canonical;
    expect(typeof baselineCanonical.blockIndex).toBe('number');
    expect(baselineCanonical.blockIndex).toBeGreaterThan(0);

    const baselineAnchor = await readVisibleContentAnchor(page);
    expect(baselineAnchor).not.toBeNull();

    let lastRevision = baselinePersistedProgress.revision ?? 0;
    await resetReaderTrace(page);

    const COVER_MODE_ITERATIONS = 3;

    for (let iteration = 0; iteration < COVER_MODE_ITERATIONS; iteration += 1) {
      // --- Paged phase ---
      await clickToolbarMode(page, 'Two Columns');
      await waitForReaderBranch(page, 'paged');
      const pagedPersistedProgress = await waitForPagedProgressPersistence(page, novelId);
      const pagedSnapshot = await waitForPagedViewportSnapshot(
        page,
        pagedPersistedProgress.pageIndex ?? 0,
      );

      if (
        pagedSnapshot.pageCount === null
        || pagedSnapshot.pageCount <= 1
        || pagedSnapshot.currentPageIndex === null
        || pagedSnapshot.currentPageIndex <= 0
      ) {
        await attachReaderDiagnostics(page, testInfo, 'reader-cover-mode-paged-branch.json', {
          iteration,
          novelId,
          pagedPersistedProgress,
          pagedSnapshot,
          stage: 'cover-paged',
        });
        throw new Error(
          `Cover mode: expected paged restore beyond first page, received ${pagedSnapshot.pageIndicator ?? 'unknown'}.`,
        );
      }

      assertCanonicalNearBaseline(
        pagedPersistedProgress.canonical,
        baselineCanonical,
        `cover iteration ${iteration} paged`,
      );

      expect(pagedPersistedProgress.revision).toBeGreaterThan(lastRevision);
      lastRevision = pagedPersistedProgress.revision ?? lastRevision;

      await assertNoTraceProblems(page, testInfo, novelId, iteration, 'cover-paged');

      // --- Scroll phase ---
      await clickToolbarMode(page, 'Single Column');
      await waitForReaderBranch(page, 'scroll');
      await expectReadingProgressNearBaseline(page, initialViewportProgress);
      const scrollPersistedProgress = await waitForScrollProgressPersistence(
        page,
        novelId,
        baselineChapterProgress,
      );

      assertCanonicalNearBaseline(
        scrollPersistedProgress.canonical,
        baselineCanonical,
        `cover iteration ${iteration} scroll`,
      );

      const iterationAnchor = await readVisibleContentAnchor(page);
      assertContentAnchorStable(
        iterationAnchor,
        baselineAnchor!,
        `cover iteration ${iteration} scroll`,
      );

      expect(scrollPersistedProgress.revision).toBeGreaterThan(lastRevision);
      lastRevision = scrollPersistedProgress.revision ?? lastRevision;

      expect(scrollPersistedProgress.contentMode).toBe('scroll');
      expect(scrollPersistedProgress.pageIndex).toBeNull();
      await assertNoTraceProblems(page, testInfo, novelId, iteration, 'cover-scroll');
    }
  });
});
