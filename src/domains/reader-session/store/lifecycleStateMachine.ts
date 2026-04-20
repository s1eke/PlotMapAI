import type {
  ReaderLifecycleEvent,
  ReaderSessionState,
} from '@shared/contracts/reader';

interface ReaderLifecycleStateSlice {
  lifecycleLoadKey: ReaderSessionState['lifecycleLoadKey'];
  restoreStatus: ReaderSessionState['restoreStatus'];
}

export function reduceReaderLifecycleState(
  current: ReaderLifecycleStateSlice,
  event: ReaderLifecycleEvent,
): ReaderLifecycleStateSlice {
  switch (event.type) {
    case 'RESET':
      return {
        restoreStatus: 'hydrating',
        lifecycleLoadKey: null,
      };
    case 'NOVEL_OPEN_STARTED':
      return {
        restoreStatus: 'loading-chapters',
        lifecycleLoadKey: null,
      };
    case 'HYDRATE_SUCCEEDED_NO_CHAPTERS':
      return {
        restoreStatus: 'ready',
        lifecycleLoadKey: null,
      };
    case 'HYDRATE_SUCCEEDED_WITH_CHAPTERS':
      return {
        restoreStatus: 'loading-chapter',
        lifecycleLoadKey: current.lifecycleLoadKey,
      };
    case 'HYDRATE_FAILED':
      return {
        restoreStatus: 'error',
        lifecycleLoadKey: null,
      };
    case 'CHAPTER_LOAD_STARTED':
      return {
        restoreStatus: 'loading-chapter',
        lifecycleLoadKey: event.loadKey,
      };
    case 'CHAPTER_LOAD_COMPLETED_NO_RESTORE':
      return {
        restoreStatus: event.awaitingPagedLayout ? 'awaiting-paged-layout' : 'ready',
        lifecycleLoadKey: null,
      };
    case 'CHAPTER_LOAD_COMPLETED_NEEDS_RESTORE':
      return {
        restoreStatus: 'restoring-position',
        lifecycleLoadKey: event.loadKey,
      };
    case 'CHAPTER_LOAD_FAILED':
      return {
        restoreStatus: 'error',
        lifecycleLoadKey: null,
      };
    case 'RESTORE_STARTED':
      return {
        restoreStatus: 'restoring-position',
        lifecycleLoadKey: current.lifecycleLoadKey,
      };
    case 'RESTORE_CLEARED':
      return {
        restoreStatus: 'ready',
        lifecycleLoadKey: null,
      };
    case 'RESTORE_SETTLED': {
      if (event.result === 'failed') {
        return {
          restoreStatus: 'error',
          lifecycleLoadKey: null,
        };
      }

      return {
        restoreStatus: event.awaitingPagedLayout ? 'awaiting-paged-layout' : 'ready',
        lifecycleLoadKey: null,
      };
    }
    case 'PAGED_LAYOUT_READY':
      return {
        restoreStatus: 'ready',
        lifecycleLoadKey: null,
      };
    default:
      return current;
  }
}
