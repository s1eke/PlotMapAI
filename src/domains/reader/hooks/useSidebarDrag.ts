import { useState, useCallback, useRef } from 'react';

export function useSidebarDrag() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const dragRef = useRef({ startY: 0, dragging: false });
  const [dragOffset, setDragOffset] = useState(0);

  const toggleSidebar = useCallback(() => setIsSidebarOpen(prev => !prev), []);

  const handleDragStart = useCallback((e: React.TouchEvent) => {
    if (window.matchMedia('(min-width: 768px)').matches) return;
    dragRef.current = { startY: e.touches[0].clientY, dragging: true };
    setDragOffset(0);
  }, []);

  const handleDragMove = useCallback((e: React.TouchEvent) => {
    if (!dragRef.current.dragging) return;
    const delta = e.touches[0].clientY - dragRef.current.startY;
    setDragOffset(Math.max(0, delta));
  }, []);

  const handleDragEnd = useCallback(() => {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    if (dragOffset > window.innerHeight * 0.2) {
      setIsSidebarOpen(false);
    }
    setDragOffset(0);
  }, [dragOffset]);

  return {
    isSidebarOpen,
    setIsSidebarOpen,
    toggleSidebar,
    dragOffset,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
  };
}
