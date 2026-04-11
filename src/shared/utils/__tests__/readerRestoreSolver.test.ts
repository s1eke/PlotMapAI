import { describe, expect, it } from 'vitest';

import {
  restoreStepFailure,
  restoreStepPending,
  restoreStepSuccess,
  runRestoreSolver,
} from '../readerRestoreSolver';

describe('readerRestoreSolver', () => {
  it('returns skipped when no restore target exists', () => {
    const outcome = runRestoreSolver({
      attempts: 1,
      chapterIndex: 3,
      hasTarget: false,
      mode: 'scroll',
      modeMatchesTarget: true,
      parse: () => restoreStepSuccess('parsed'),
      project: () => restoreStepSuccess('projected'),
      execute: () => restoreStepSuccess('executed'),
      buildContext: () => 'context',
    });

    expect(outcome).toMatchObject({
      kind: 'settled',
      result: {
        status: 'skipped',
        reason: 'no_target',
        retryable: false,
        attempts: 1,
        chapterIndex: 3,
        mode: 'scroll',
      },
    });
  });

  it('returns skipped when target mode does not match', () => {
    const outcome = runRestoreSolver({
      attempts: 1,
      chapterIndex: 1,
      hasTarget: true,
      mode: 'paged',
      modeMatchesTarget: false,
      parse: () => restoreStepSuccess('parsed'),
      project: () => restoreStepSuccess('projected'),
      execute: () => restoreStepSuccess('executed'),
      buildContext: () => 'context',
    });

    expect(outcome).toMatchObject({
      kind: 'settled',
      result: {
        status: 'skipped',
        reason: 'mode_mismatch',
        retryable: false,
        mode: 'paged',
      },
    });
  });

  it('returns pending when parse or project or execute is pending', () => {
    const parsePending = runRestoreSolver({
      attempts: 1,
      chapterIndex: 0,
      hasTarget: true,
      mode: 'scroll',
      parse: () => restoreStepPending('container_missing'),
      project: () => restoreStepSuccess('projected'),
      execute: () => restoreStepSuccess('executed'),
      buildContext: () => 'context',
    });
    const projectPending = runRestoreSolver({
      attempts: 1,
      chapterIndex: 0,
      hasTarget: true,
      mode: 'scroll',
      parse: () => restoreStepSuccess('parsed'),
      project: () => restoreStepPending('layout_missing'),
      execute: () => restoreStepSuccess('executed'),
      buildContext: () => 'context',
    });
    const executePending = runRestoreSolver({
      attempts: 1,
      chapterIndex: 0,
      hasTarget: true,
      mode: 'scroll',
      parse: () => restoreStepSuccess('parsed'),
      project: () => restoreStepSuccess('projected'),
      execute: () => restoreStepPending('layout_missing'),
      buildContext: () => 'context',
    });

    expect(parsePending).toEqual({
      kind: 'pending',
      reason: 'container_missing',
      retryable: true,
    });
    expect(projectPending).toEqual({
      kind: 'pending',
      reason: 'layout_missing',
      retryable: true,
    });
    expect(executePending).toEqual({
      kind: 'pending',
      reason: 'layout_missing',
      retryable: true,
    });
  });

  it('returns failed with mapped reason and measuredError', () => {
    const outcome = runRestoreSolver({
      attempts: 2,
      chapterIndex: 8,
      hasTarget: true,
      mode: 'summary',
      parse: () => restoreStepSuccess('parsed'),
      project: () => restoreStepFailure('target_unresolvable', {
        retryable: false,
      }),
      execute: () => restoreStepSuccess('executed'),
      buildContext: () => 'context',
    });

    expect(outcome).toMatchObject({
      kind: 'settled',
      result: {
        status: 'failed',
        reason: 'target_unresolvable',
        retryable: false,
        attempts: 2,
        chapterIndex: 8,
        mode: 'summary',
      },
    });
  });

  it('returns failed when validation exceeds tolerance', () => {
    const outcome = runRestoreSolver({
      attempts: 3,
      chapterIndex: 4,
      hasTarget: true,
      mode: 'scroll',
      parse: () => restoreStepSuccess({ anchor: 12 }),
      project: () => restoreStepSuccess({ expected: 200 }),
      execute: () => restoreStepSuccess({ actual: 205 }),
      validate: (_projected, executed) => {
        const delta = Math.abs(executed.actual - 200);
        return restoreStepFailure('validation_exceeded_tolerance', {
          retryable: true,
          measuredError: {
            metric: 'scroll_px',
            delta,
            tolerance: 2,
            expected: 200,
            actual: executed.actual,
          },
        });
      },
      buildContext: () => 'context',
    });

    expect(outcome).toMatchObject({
      kind: 'settled',
      result: {
        status: 'failed',
        reason: 'validation_exceeded_tolerance',
        retryable: true,
        attempts: 3,
        measuredError: {
          metric: 'scroll_px',
          delta: 5,
          tolerance: 2,
        },
      },
    });
  });

  it('returns completed with measuredError when validation passes', () => {
    const outcome = runRestoreSolver({
      attempts: 1,
      chapterIndex: 2,
      hasTarget: true,
      mode: 'paged',
      parse: () => restoreStepSuccess({ page: 3 }),
      project: () => restoreStepSuccess({ targetPage: 3 }),
      execute: () => restoreStepSuccess({ actualPage: 3 }),
      validate: (_projected, executed) => {
        return restoreStepSuccess({
          metric: 'page_delta',
          delta: Math.abs(executed.actualPage - 3),
          tolerance: 0,
          expected: 3,
          actual: executed.actualPage,
        });
      },
      buildContext: ({ executed }) => ({ pageIndex: executed.actualPage }),
    });

    expect(outcome).toMatchObject({
      kind: 'settled',
      result: {
        status: 'completed',
        reason: 'restored',
        retryable: false,
        chapterIndex: 2,
        mode: 'paged',
        measuredError: {
          metric: 'page_delta',
          delta: 0,
          tolerance: 0,
        },
      },
      context: {
        pageIndex: 3,
      },
    });
  });

  it('maps thrown errors into execution_exception failures', () => {
    const outcome = runRestoreSolver({
      attempts: 1,
      chapterIndex: 5,
      hasTarget: true,
      mode: 'scroll',
      parse: () => {
        throw new Error('boom');
      },
      project: () => restoreStepSuccess('projected'),
      execute: () => restoreStepSuccess('executed'),
      buildContext: () => 'context',
    });

    expect(outcome).toMatchObject({
      kind: 'settled',
      result: {
        status: 'failed',
        reason: 'execution_exception',
        retryable: true,
        chapterIndex: 5,
        mode: 'scroll',
      },
    });
  });
});
