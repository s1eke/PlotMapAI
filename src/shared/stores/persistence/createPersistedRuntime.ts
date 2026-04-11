import type { StoreApi } from 'zustand/vanilla';

export interface PersistedRuntimePatchOptions {
  bumpRevision?: boolean;
  flush?: boolean;
  persist?: boolean;
  writeCache?: boolean;
}

export type PersistedRuntimeCacheWritePolicy = 'eager' | 'afterPersist';

export interface PersistedRuntime<TState, THydrateOptions = void> {
  flush: () => Promise<void>;
  hydrate: (options?: THydrateOptions) => Promise<TState>;
  patch: (
    partial: Partial<TState>,
    options?: PersistedRuntimePatchOptions,
  ) => TState;
  reset: () => void;
}

interface CreatePersistedRuntimeOptions<TState, THydrateOptions = void> {
  cacheWritePolicy?: PersistedRuntimeCacheWritePolicy;
  createInitialState: () => TState;
  hydrate?: (options: THydrateOptions | undefined) => Promise<Partial<TState> | null | undefined>;
  isEnabled?: () => boolean;
  mergeState?: (current: TState, partial: Partial<TState>) => TState;
  onPersistError?: (error: unknown, state: TState) => void;
  onPersistSuccess?: (state: TState) => void;
  onReset?: () => void;
  onStateChange?: (nextState: TState) => void;
  persist?: (state: TState) => Promise<void>;
  persistDelayMs?: number;
  store: StoreApi<TState>;
  writeCache?: (state: TState) => void;
}

function defaultMergeState<TState>(
  current: TState,
  partial: Partial<TState>,
): TState {
  return {
    ...current,
    ...partial,
  };
}

export function createPersistedRuntime<TState, THydrateOptions = void>({
  cacheWritePolicy = 'eager',
  createInitialState,
  hydrate,
  isEnabled = () => true,
  mergeState = defaultMergeState,
  onPersistError,
  onPersistSuccess,
  onReset,
  onStateChange,
  persist,
  persistDelayMs = 0,
  store,
  writeCache,
}: CreatePersistedRuntimeOptions<TState, THydrateOptions>): PersistedRuntime<
  TState,
  THydrateOptions
> {
  let hydrationPromise: Promise<TState> | null = null;
  let hydrated = false;
  let persistQueue: Promise<void> = Promise.resolve();
  let persistTimerId: number | null = null;
  let pendingPersistWriteCache = true;
  let revision = 0;
  let epoch = 0;

  function clearPersistTimer(): void {
    if (persistTimerId !== null && isEnabled()) {
      window.clearTimeout(persistTimerId);
      persistTimerId = null;
    }
  }

  function writeCacheWithPolicy(
    state: TState,
    options: PersistedRuntimePatchOptions,
    phase: PersistedRuntimeCacheWritePolicy,
  ): void {
    if (options.writeCache === false || cacheWritePolicy !== phase) {
      return;
    }

    writeCache?.(state);
  }

  function notifyPersistSuccess(state: TState): void {
    try {
      onPersistSuccess?.(state);
    } catch {
      // Callbacks are best-effort and should never break the persist queue.
    }
  }

  function notifyPersistError(error: unknown, state: TState): void {
    try {
      onPersistError?.(error, state);
    } catch {
      // Error callbacks are best-effort and should never break the persist queue.
    }
  }

  function enqueuePersistTask(params: {
    epochAtSchedule: number;
    revisionAtSchedule?: number;
    state: TState;
    writeCacheAfterPersist: boolean;
  }): void {
    const {
      epochAtSchedule,
      revisionAtSchedule,
      state,
      writeCacheAfterPersist,
    } = params;

    persistQueue = persistQueue.then(async () => {
      if (!persist) {
        return;
      }
      if (epochAtSchedule !== epoch) {
        return;
      }
      if (typeof revisionAtSchedule === 'number' && revisionAtSchedule !== revision) {
        return;
      }

      try {
        await persist(state);
        if (writeCacheAfterPersist) {
          writeCacheWithPolicy(state, { writeCache: true }, 'afterPersist');
        }
        notifyPersistSuccess(state);
      } catch (error) {
        notifyPersistError(error, state);
      }
    });
  }

  function applyState(
    partial: Partial<TState>,
    options: PersistedRuntimePatchOptions = {},
  ): TState {
    if (options.bumpRevision) {
      revision += 1;
    }

    const nextState = mergeState(store.getState(), partial);
    store.setState(nextState);
    onStateChange?.(nextState);
    writeCacheWithPolicy(nextState, options, 'eager');

    if (!persist || !options.persist || !isEnabled()) {
      return nextState;
    }

    if (options.flush) {
      clearPersistTimer();
      const snapshot = store.getState();
      const epochAtFlush = epoch;
      enqueuePersistTask({
        epochAtSchedule: epochAtFlush,
        state: snapshot,
        writeCacheAfterPersist:
          cacheWritePolicy === 'afterPersist' && options.writeCache !== false,
      });
      return nextState;
    }

    clearPersistTimer();
    pendingPersistWriteCache = options.writeCache !== false;
    persistTimerId = window.setTimeout(() => {
      persistTimerId = null;
      const snapshot = store.getState();
      const epochAtSchedule = epoch;
      const revisionAtSchedule = revision;
      enqueuePersistTask({
        epochAtSchedule,
        revisionAtSchedule,
        state: snapshot,
        writeCacheAfterPersist:
          cacheWritePolicy === 'afterPersist' && pendingPersistWriteCache,
      });
    }, persistDelayMs);

    return nextState;
  }

  async function hydrateRuntime(
    options?: THydrateOptions,
  ): Promise<TState> {
    if (!hydrate || !isEnabled() || hydrated) {
      return store.getState();
    }

    if (hydrationPromise) {
      return hydrationPromise;
    }

    const epochAtStart = epoch;
    const revisionAtStart = revision;
    const runtimeHydrationPromise = (async () => {
      const partial = await hydrate(options);
      if (epochAtStart !== epoch) {
        return store.getState();
      }

      if (partial && revisionAtStart === revision) {
        applyState(partial, {
          persist: false,
        });
      }

      hydrated = true;
      return store.getState();
    })().catch(() => {
      if (epochAtStart === epoch) {
        hydrated = true;
      }
      return store.getState();
    });

    const trackedPromise = runtimeHydrationPromise.finally(() => {
      if (hydrationPromise === trackedPromise) {
        hydrationPromise = null;
      }
    });
    hydrationPromise = trackedPromise;

    return trackedPromise;
  }

  async function flushRuntime(): Promise<void> {
    if (!persist) {
      return;
    }

    if (persistTimerId !== null && isEnabled()) {
      clearPersistTimer();
      const snapshot = store.getState();
      const epochAtFlush = epoch;
      enqueuePersistTask({
        epochAtSchedule: epochAtFlush,
        state: snapshot,
        writeCacheAfterPersist:
          cacheWritePolicy === 'afterPersist' && pendingPersistWriteCache,
      });
    }

    await persistQueue;
  }

  function resetRuntime(): void {
    epoch += 1;
    clearPersistTimer();
    hydrationPromise = null;
    hydrated = false;
    persistQueue = Promise.resolve();
    pendingPersistWriteCache = true;
    revision = 0;
    onReset?.();

    const initialState = createInitialState();
    store.setState(initialState);
    onStateChange?.(initialState);
  }

  return {
    flush: flushRuntime,
    hydrate: hydrateRuntime,
    patch: applyState,
    reset: resetRuntime,
  };
}
