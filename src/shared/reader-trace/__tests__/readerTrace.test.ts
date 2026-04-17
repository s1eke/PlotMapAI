import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CACHE_KEYS, storage } from '@infra/storage';
import {
  clearReaderTrace,
  getLastReaderTraceDump,
  getReaderTraceDump,
  isReaderTraceEnabled,
  markReaderTraceSuspect,
  recordReaderTrace,
  registerReaderTraceTools,
  setReaderTraceEnabled,
  setReaderTraceNovelId,
  syncReaderTraceEnabledFromSearch,
} from '../index';

describe('readerTrace', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_ENABLE_READER_TRACE', 'true');
    window.localStorage.clear();
    clearReaderTrace();
    setReaderTraceNovelId(null);
    setReaderTraceEnabled(false);
    delete window.PlotMapAIReaderTrace;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clearReaderTrace();
    setReaderTraceNovelId(null);
    setReaderTraceEnabled(false);
    delete window.PlotMapAIReaderTrace;
  });

  it('does not record events while disabled', () => {
    recordReaderTrace('page_turn_mode_requested', {
      chapterIndex: 1,
      mode: 'paged',
    });

    expect(isReaderTraceEnabled()).toBe(false);
    expect(getReaderTraceDump().events).toHaveLength(0);
  });

  it('enables tracing from the readerTrace=1 query flag', () => {
    const enabled = syncReaderTraceEnabledFromSearch('?readerTrace=1');

    expect(enabled).toBe(true);
    expect(isReaderTraceEnabled()).toBe(true);
    expect(storage.cache.getJson<boolean>(CACHE_KEYS.readerTraceEnabled)).toBe(true);
  });

  it('ignores the query flag when the build does not allow reader trace', () => {
    vi.stubEnv('VITE_ENABLE_READER_TRACE', '');
    setReaderTraceEnabled(true);

    const enabled = syncReaderTraceEnabledFromSearch('?readerTrace=1');

    expect(enabled).toBe(false);
    expect(isReaderTraceEnabled()).toBe(false);
    expect(storage.cache.getJson<boolean>(CACHE_KEYS.readerTraceEnabled)).toBe(false);
  });

  it('disables tracing and clears in-memory events from the readerTrace=0 query flag', () => {
    setReaderTraceEnabled(true);
    setReaderTraceNovelId(7);
    recordReaderTrace('mode_switch_started', {
      chapterIndex: 2,
      mode: 'scroll',
    });

    const enabled = syncReaderTraceEnabledFromSearch('?readerTrace=0');

    expect(enabled).toBe(false);
    expect(isReaderTraceEnabled()).toBe(false);
    expect(getReaderTraceDump().events).toHaveLength(0);
  });

  it('keeps only the newest 250 events in the ring buffer', () => {
    setReaderTraceEnabled(true);
    setReaderTraceNovelId(11);

    for (let index = 0; index < 260; index += 1) {
      recordReaderTrace(`event-${index}`, {
        chapterIndex: index,
        mode: 'scroll',
      });
    }

    const dump = getReaderTraceDump();

    expect(dump.events).toHaveLength(250);
    expect(dump.events[0]?.event).toBe('event-10');
    expect(dump.events.at(-1)?.event).toBe('event-259');
  });

  it('persists the latest dump when marking a suspect', () => {
    setReaderTraceEnabled(true);
    setReaderTraceNovelId(3);
    recordReaderTrace('mode_switch_started', {
      chapterIndex: 4,
      mode: 'scroll',
    });

    markReaderTraceSuspect('page_turn_animation_during_restore', {
      chapterIndex: 4,
      mode: 'paged',
      details: {
        nextToken: 2,
      },
    });

    expect(getLastReaderTraceDump()).toEqual(expect.objectContaining({
      enabled: true,
      events: expect.arrayContaining([
        expect.objectContaining({
          event: 'suspect',
          details: expect.objectContaining({
            nextToken: 2,
            reason: 'page_turn_animation_during_restore',
          }),
        }),
      ]),
    }));
  });

  it('auto-marks a flash-to-page-zero suspect when a paged restore resolves to a later page first', () => {
    setReaderTraceEnabled(true);
    setReaderTraceNovelId(9);

    recordReaderTrace('paged_restore_attempt', {
      chapterIndex: 1,
      mode: 'paged',
      details: {
        resolvedTargetPage: 3,
      },
    });
    recordReaderTrace('viewport_branch_rendered', {
      chapterIndex: 1,
      mode: 'paged',
      details: {
        branch: 'paged',
        pageIndex: 0,
      },
    });

    expect(getLastReaderTraceDump()).toEqual(expect.objectContaining({
      events: expect.arrayContaining([
        expect.objectContaining({
          event: 'suspect',
          details: expect.objectContaining({
            actualPageIndex: 0,
            expectedTargetPage: 3,
            reason: 'paged_restore_flash_to_page_zero',
          }),
        }),
      ]),
    }));
  });

  it('registers and cleans up the hidden window trace tools', () => {
    const cleanup = registerReaderTraceTools();

    expect(window.PlotMapAIReaderTrace).toBeDefined();

    window.PlotMapAIReaderTrace?.enable();
    window.PlotMapAIReaderTrace?.mark('manual-checkpoint', {
      phase: 'after-switch',
    });

    expect(window.PlotMapAIReaderTrace?.dump()).toEqual(expect.objectContaining({
      enabled: true,
      events: expect.arrayContaining([
        expect.objectContaining({
          event: 'suspect',
          details: expect.objectContaining({
            phase: 'after-switch',
            reason: 'manual-checkpoint',
          }),
        }),
      ]),
    }));

    cleanup();

    expect(window.PlotMapAIReaderTrace).toBeUndefined();
  });

  it('does not register window trace tools when the build flag is disabled', () => {
    vi.stubEnv('VITE_ENABLE_READER_TRACE', '');

    const cleanup = registerReaderTraceTools();

    expect(window.PlotMapAIReaderTrace).toBeUndefined();

    cleanup();

    expect(window.PlotMapAIReaderTrace).toBeUndefined();
  });
});
