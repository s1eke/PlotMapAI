import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { appPaths } from '@app/router/paths';

interface UseReaderMobileBackParams {
  isSidebarOpen: boolean;
  closeSidebar: () => void;
  novelId: number;
}

interface UseReaderMobileBackResult {
  handleMobileBack: () => void;
}

function getHistoryIndex(): number {
  if (typeof window === 'undefined') {
    return 0;
  }

  const state = window.history.state as { idx?: number } | null;
  return typeof state?.idx === 'number' ? state.idx : 0;
}

export function useReaderMobileBack({
  isSidebarOpen,
  closeSidebar,
  novelId,
}: UseReaderMobileBackParams): UseReaderMobileBackResult {
  const navigate = useNavigate();

  const handleMobileBack = useCallback(() => {
    if (isSidebarOpen) {
      closeSidebar();
      return;
    }

    if (getHistoryIndex() > 0) {
      navigate(-1);
      return;
    }

    navigate(appPaths.novel(novelId), { replace: true });
  }, [closeSidebar, isSidebarOpen, navigate, novelId]);

  return {
    handleMobileBack,
  };
}
