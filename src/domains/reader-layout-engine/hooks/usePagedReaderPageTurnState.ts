import { useCallback, useState } from 'react';
import type { NavigationDirection } from './pagedReaderControllerTypes';

interface PagedReaderPageTurnState {
  pageTurnDirection: NavigationDirection;
  pageTurnToken: number;
  recordAnimatedPageTurn: (direction: NavigationDirection) => void;
}

export function usePagedReaderPageTurnState(): PagedReaderPageTurnState {
  const [pageTurnState, setPageTurnState] = useState<{
    direction: NavigationDirection;
    token: number;
  }>({
    direction: 'next',
    token: 0,
  });
  const recordAnimatedPageTurn = useCallback((direction: NavigationDirection) => {
    setPageTurnState((previous) => ({
      direction,
      token: previous.token + 1,
    }));
  }, []);

  return {
    pageTurnDirection: pageTurnState.direction,
    pageTurnToken: pageTurnState.token,
    recordAnimatedPageTurn,
  };
}
