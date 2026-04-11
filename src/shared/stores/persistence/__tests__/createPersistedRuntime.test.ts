import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';

import { createPersistedRuntime } from '../createPersistedRuntime';

interface TestState {
  value: number;
}

function createTestStore(initial: TestState): ReturnType<typeof createStore<TestState>> {
  return createStore<TestState>()(() => initial);
}

describe('createPersistedRuntime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onPersistError and avoids cache writes when afterPersist commit fails', async () => {
    const store = createTestStore({ value: 0 });
    const writeCache = vi.fn();
    const onPersistError = vi.fn();
    const persist = vi.fn(async () => {
      throw new Error('write failed');
    });

    const runtime = createPersistedRuntime<TestState>({
      cacheWritePolicy: 'afterPersist',
      createInitialState: () => ({ value: 0 }),
      onPersistError,
      persist,
      persistDelayMs: 10,
      store,
      writeCache,
    });

    runtime.patch({ value: 1 }, {
      bumpRevision: true,
      persist: true,
    });

    expect(writeCache).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10);
    await runtime.flush();

    expect(persist).toHaveBeenCalledTimes(1);
    expect(onPersistError).toHaveBeenCalledTimes(1);
    expect(writeCache).not.toHaveBeenCalled();
  });

  it('writes cache only after successful persist when cacheWritePolicy is afterPersist', async () => {
    const store = createTestStore({ value: 0 });
    const writeCache = vi.fn();
    const onPersistSuccess = vi.fn();
    const persist = vi.fn(async () => undefined);

    const runtime = createPersistedRuntime<TestState>({
      cacheWritePolicy: 'afterPersist',
      createInitialState: () => ({ value: 0 }),
      onPersistSuccess,
      persist,
      persistDelayMs: 10,
      store,
      writeCache,
    });

    runtime.patch({ value: 2 }, {
      bumpRevision: true,
      persist: true,
    });

    expect(writeCache).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10);
    await runtime.flush();

    expect(persist).toHaveBeenCalledTimes(1);
    expect(onPersistSuccess).toHaveBeenCalledTimes(1);
    expect(writeCache).toHaveBeenCalledTimes(1);
    expect(writeCache).toHaveBeenLastCalledWith({ value: 2 });
  });

  it('keeps eager cache behavior by default for compatibility', () => {
    const store = createTestStore({ value: 0 });
    const writeCache = vi.fn();

    const runtime = createPersistedRuntime<TestState>({
      createInitialState: () => ({ value: 0 }),
      store,
      writeCache,
    });

    runtime.patch({ value: 3 }, {
      persist: false,
    });

    expect(writeCache).toHaveBeenCalledTimes(1);
    expect(writeCache).toHaveBeenCalledWith({ value: 3 });
  });
});
