import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface UseReaderMobileBackParams {
  closeImageViewer?: () => void;
  fallbackHref: string;
  isImageViewerOpen?: boolean;
  isSidebarOpen: boolean;
  closeSidebar: () => void;
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
  closeImageViewer,
  fallbackHref,
  isImageViewerOpen = false,
  isSidebarOpen,
  closeSidebar,
}: UseReaderMobileBackParams): UseReaderMobileBackResult {
  const navigate = useNavigate();

  const handleMobileBack = useCallback(() => {
    if (isImageViewerOpen) {
      closeImageViewer?.();
      return;
    }

    if (isSidebarOpen) {
      closeSidebar();
      return;
    }

    if (getHistoryIndex() > 0) {
      navigate(-1);
      return;
    }

    navigate(fallbackHref, { replace: true });
  }, [closeImageViewer, closeSidebar, fallbackHref, isImageViewerOpen, isSidebarOpen, navigate]);

  return {
    handleMobileBack,
  };
}
