import { useCallback, useState } from 'react';

export function useSidebarDrag() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const toggleSidebar = useCallback(() => setIsSidebarOpen((prev) => !prev), []);

  return {
    isSidebarOpen,
    setIsSidebarOpen,
    toggleSidebar,
  };
}
