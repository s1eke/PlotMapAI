import type { Page, TestInfo } from '@playwright/test';

import { expect, test } from '@playwright/test';

import {
  disableAnimations,
  enableReaderTrace,
  importFixtureToDetailPage,
  openReaderFromDetailPage,
  readPersistedReadingProgress,
  readReaderViewportSnapshot,
  setReaderPreferences,
  waitForPersistedReadingProgress,
  waitForReaderBranch,
  type PersistedReadingProgressSnapshot,
  type ReaderViewportSnapshot,
} from './helpers/readerVisualHarness';

const ROUND_TRIP_ITERATIONS = 6;
const BASELINE_SCROLL_PROGRESS_CANDIDATES = [0.45, 0.72, 0.9] as const;
const PROGRESS_TOLERANCE = 0.05;

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
  const problemEvent = events.find((event) => {
    return event.event === 'mode_switch_error' || event.event === 'suspect';
  });

  if (!problemEvent) {
    return;
  }

  await attachReaderDiagnostics(page, testInfo, 'reader-mode-switch-trace-problem.json', {
    iteration,
    novelId,
    problemEvent,
    stage,
  });
  const reason = typeof problemEvent.details?.reason === 'string'
    ? ` (${problemEvent.details.reason})`
    : '';
  throw new Error(`Reader trace reported ${problemEvent.event ?? 'unknown'} during ${stage}${reason}.`);
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

async function expectScrollProgressNearBaseline(
  page: Page,
  baselineProgress: number,
): Promise<ReaderViewportSnapshot> {
  let snapshot: ReaderViewportSnapshot | null = null;
  await expect.poll(async () => {
    snapshot = await readReaderViewportSnapshot(page);
    return isProgressWithinTolerance(snapshot.scrollProgress, baselineProgress);
  }, {
    timeout: 10_000,
  }).toBe(true);

  if (!snapshot) {
    throw new Error('Scroll progress snapshot did not stabilize near the baseline.');
  }

  return snapshot;
}

async function waitForScrollProgressPersistence(
  page: Page,
  novelId: number,
  baselineProgress: number,
): Promise<PersistedReadingProgressSnapshot> {
  return waitForPersistedReadingProgress(
    page,
    novelId,
    (snapshot) => {
      return snapshot?.contentMode === 'scroll'
        && snapshot.pageIndex === null
        && isProgressWithinTolerance(snapshot.chapterProgress, baselineProgress);
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

test.describe('reader mode switch regression', () => {
  test('keeps location stable across repeated scroll and paged round-trips', async ({
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
    const initialBaselineProgress =
      initialPersistedProgress.chapterProgress
      ?? scrolledBaselineSnapshot.scrollProgress
      ?? selectedBaselineCandidate;
    await page.reload();
    await disableAnimations(page);
    await waitForReaderBranch(page, 'scroll');
    await expect.poll(async () => {
      const restoredBaselineSnapshot = await readReaderViewportSnapshot(page);
      return restoredBaselineSnapshot.scrollProgress !== null;
    }, {
      timeout: 10_000,
    }).toBe(true);
    const restoredBaselineSnapshot = await readReaderViewportSnapshot(page);
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
    const baselineProgress =
      baselinePersistedProgress.chapterProgress
      ?? restoredBaselineSnapshot.scrollProgress
      ?? initialBaselineProgress;
    expect(baselinePersistedProgress.canonical.chapterIndex).toBe(0);
    expect(baselineProgress).toBeGreaterThan(0.35);
    expect(baselineProgress).toBeLessThan(0.98);
    await resetReaderTrace(page);

    for (let iteration = 0; iteration < ROUND_TRIP_ITERATIONS; iteration += 1) {
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

      await assertNoTraceProblems(page, testInfo, novelId, iteration, 'paged');

      await clickToolbarMode(page, 'Single Column');
      await waitForReaderBranch(page, 'scroll');
      let scrollSnapshot: ReaderViewportSnapshot;
      try {
        scrollSnapshot = await expectScrollProgressNearBaseline(page, baselineProgress);
      } catch (error) {
        const currentScrollSnapshot = await readReaderViewportSnapshot(page);
        const persistedProgress = await readPersistedReadingProgress(page, novelId);
        await attachReaderDiagnostics(page, testInfo, 'reader-mode-switch-scroll-viewport.json', {
          baselineProgress,
          currentScrollSnapshot,
          errorMessage: error instanceof Error ? error.message : String(error),
          iteration,
          novelId,
          persistedProgress,
          stage: 'scroll-viewport',
        });
        throw new Error(
          'Scroll viewport did not return near baseline. ' +
          `Expected ${baselineProgress}, received ${currentScrollSnapshot.scrollProgress}. ` +
          `Persisted chapterProgress=${persistedProgress?.chapterProgress ?? 'null'}.`,
        );
      }
      const scrollPersistedProgress = await waitForScrollProgressPersistence(
        page,
        novelId,
        baselineProgress,
      );

      if (!isProgressWithinTolerance(scrollSnapshot.scrollProgress, baselineProgress)) {
        await attachReaderDiagnostics(page, testInfo, 'reader-mode-switch-scroll-restore.json', {
          baselineProgress,
          iteration,
          novelId,
          scrollPersistedProgress,
          scrollSnapshot,
          stage: 'scroll',
        });
        throw new Error(
          `Scroll progress drifted beyond tolerance: expected ${baselineProgress}, received ${scrollSnapshot.scrollProgress}.`,
        );
      }

      expect(scrollPersistedProgress.contentMode).toBe('scroll');
      expect(scrollPersistedProgress.pageIndex).toBeNull();
      await assertNoTraceProblems(page, testInfo, novelId, iteration, 'scroll');
    }

    await page.reload();
    await disableAnimations(page);
    await waitForReaderBranch(page, 'scroll');
    let reloadedSnapshot: ReaderViewportSnapshot;
    try {
      reloadedSnapshot = await expectScrollProgressNearBaseline(page, baselineProgress);
    } catch (error) {
      const currentReloadedSnapshot = await readReaderViewportSnapshot(page);
      const persistedProgress = await readPersistedReadingProgress(page, novelId);
      await attachReaderDiagnostics(page, testInfo, 'reader-mode-switch-reload-viewport.json', {
        baselineProgress,
        currentReloadedSnapshot,
        errorMessage: error instanceof Error ? error.message : String(error),
        novelId,
        persistedProgress,
        stage: 'reload-viewport',
      });
      throw new Error(
        'Reloaded scroll viewport did not return near baseline. ' +
        `Expected ${baselineProgress}, received ${currentReloadedSnapshot.scrollProgress}. ` +
        `Persisted chapterProgress=${persistedProgress?.chapterProgress ?? 'null'}.`,
      );
    }
    const reloadedPersistedProgress = await waitForScrollProgressPersistence(
      page,
      novelId,
      baselineProgress,
    );

    if (!isProgressWithinTolerance(reloadedSnapshot.scrollProgress, baselineProgress)) {
      await attachReaderDiagnostics(page, testInfo, 'reader-mode-switch-reload-restore.json', {
        baselineProgress,
        novelId,
        reloadedPersistedProgress,
        reloadedSnapshot,
        stage: 'reload',
      });
      throw new Error(
        `Reloaded scroll progress drifted beyond tolerance: expected ${baselineProgress}, received ${reloadedSnapshot.scrollProgress}.`,
      );
    }

    expect(reloadedPersistedProgress.contentMode).toBe('scroll');
    expect(reloadedPersistedProgress.pageIndex).toBeNull();
    expect(reloadedPersistedProgress.canonical.chapterIndex).toBe(0);
  });
});
