import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import ReaderToolbar from '../ReaderToolbar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('ReaderToolbar', () => {
  const defaultProps = {
    sliders: {
      fontSize: 16,
      setFontSize: vi.fn(),
      lineSpacing: 1.8,
      setLineSpacing: vi.fn(),
      paragraphSpacing: 16,
      setParagraphSpacing: vi.fn(),
    },
    isTwoColumn: false,
    setIsTwoColumn: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    hasPrev: true,
    hasNext: true,
    navigationMode: 'chapter' as const,
    readerTheme: 'paper',
    setReaderTheme: vi.fn()
  };

  it('keeps the desktop slider popover open while adjusting font size', () => {
    mockMatchMedia(true);
    const setFontSizeSpy = vi.fn();

    function TestToolbar() {
      const [fontSize, setFontSize] = useState(16);

      return (
        <ReaderToolbar
          {...defaultProps}
          sliders={{
            ...defaultProps.sliders,
            fontSize,
            setFontSize: (value) => {
              setFontSizeSpy(value);
              setFontSize(value);
            },
          }}
        />
      );
    }

    render(<TestToolbar />);

    fireEvent.click(screen.getAllByTitle('reader.fontSize')[0]);

    expect(screen.getAllByRole('slider')).toHaveLength(1);

    fireEvent.change(screen.getByRole('slider'), { target: { value: '20' } });

    expect(setFontSizeSpy).toHaveBeenCalledWith(20);
    expect(screen.getByRole('slider')).toBeInTheDocument();
    expect(screen.getAllByText('20px').length).toBeGreaterThanOrEqual(2);
  });

  it('renders correctly with default props', () => {
    render(<ReaderToolbar {...defaultProps} />);
    expect(screen.getAllByText('16px').length).toBeGreaterThanOrEqual(1);
  });

  it('buttons call correct callbacks', () => {
    render(<ReaderToolbar {...defaultProps} />);
    
    // Previous button
    const prevButton = screen.getByTitle('reader.prev');
    fireEvent.click(prevButton);
    expect(defaultProps.onPrev).toHaveBeenCalled();

    // Next button
    const nextButton = screen.getByTitle('reader.next');
    fireEvent.click(nextButton);
    expect(defaultProps.onNext).toHaveBeenCalled();
  });

  it('disables prev/next buttons based on props', () => {
    render(<ReaderToolbar {...defaultProps} hasPrev={false} hasNext={false} />);
    
    expect(screen.getByTitle('reader.prev')).toBeDisabled();
    expect(screen.getByTitle('reader.next')).toBeDisabled();
  });

  it('renders mobile TOC button when onToggleSidebar is provided', () => {
    const onToggleSidebar = vi.fn();
    render(<ReaderToolbar {...defaultProps} onToggleSidebar={onToggleSidebar} isSidebarOpen={false} />);

    const tocButton = screen.getByTitle('reader.contents');
    fireEvent.click(tocButton);
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it('does not render mobile TOC button when onToggleSidebar is omitted', () => {
    render(<ReaderToolbar {...defaultProps} />);

    expect(screen.queryByTitle('reader.contents')).not.toBeInTheDocument();
  });
});
