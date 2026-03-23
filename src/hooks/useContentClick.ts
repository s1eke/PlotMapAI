import { useState, useCallback } from 'react';

export function useContentClick(
  isPagedMode: boolean,
  handlePrev: () => void,
  handleNext: () => void,
) {
  const [isChromeVisible, setIsChromeVisible] = useState(false);

  const handleContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPagedMode) {
      setIsChromeVisible(prev => !prev);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;

    if (ratio < 0.25) {
      handlePrev();
    } else if (ratio > 0.75) {
      handleNext();
    } else {
      setIsChromeVisible(prev => !prev);
    }
  }, [isPagedMode, handlePrev, handleNext]);

  return {
    isChromeVisible,
    setIsChromeVisible,
    handleContentClick,
  };
}
