import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
    pageTurnMode: 'scroll' as const,
    setPageTurnMode: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    hasPrev: true,
    hasNext: true,
    navigationMode: 'chapter' as const,
    readerTheme: 'paper',
    headerBgClassName: 'bg-[#f4ecd8]',
    textClassName: 'text-[#5b4636]',
    setReaderTheme: vi.fn(),
    onCloseSidebar: vi.fn(),
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

    fireEvent.click(screen.getByTitle('reader.prev'));
    expect(defaultProps.onPrev).toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('reader.next'));
    expect(defaultProps.onNext).toHaveBeenCalled();
  });

  it('disables prev/next buttons based on props', () => {
    render(<ReaderToolbar {...defaultProps} hasPrev={false} hasNext={false} />);

    expect(screen.getByTitle('reader.prev')).toBeDisabled();
    expect(screen.getByTitle('reader.next')).toBeDisabled();
  });

  it('renders mobile TOC button when onToggleSidebar is provided', () => {
    const onToggleSidebar = vi.fn();
    render(
      <ReaderToolbar
        {...defaultProps}
        onToggleSidebar={onToggleSidebar}
        isSidebarOpen={false}
      />,
    );

    const tocButton = screen.getByTitle('reader.contents');
    fireEvent.click(tocButton);
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it('uses the TOC button as a close toggle when the sidebar is already open', () => {
    mockMatchMedia(false);
    const onToggleSidebar = vi.fn();
    const onCloseSidebar = vi.fn();

    render(
      <ReaderToolbar
        {...defaultProps}
        onToggleSidebar={onToggleSidebar}
        onCloseSidebar={onCloseSidebar}
        isSidebarOpen
      />,
    );

    fireEvent.click(screen.getByTitle('reader.contents'));

    expect(onCloseSidebar).toHaveBeenCalledTimes(1);
    expect(onToggleSidebar).not.toHaveBeenCalled();
  });

  it('opens the mobile page-turn menu and applies the selected mode', () => {
    mockMatchMedia(false);
    const setPageTurnMode = vi.fn();

    render(
      <ReaderToolbar
        {...defaultProps}
        pageTurnMode="scroll"
        setPageTurnMode={setPageTurnMode}
      />,
    );

    fireEvent.click(screen.getByTitle('reader.pageTurnMode'));
    fireEvent.click(screen.getByTitle('reader.pageTurnModes.slide'));

    expect(setPageTurnMode).toHaveBeenCalledWith('slide');
  });

  it('closes the open sidebar before showing the mobile page-turn menu', () => {
    mockMatchMedia(false);
    const onCloseSidebar = vi.fn();

    render(
      <ReaderToolbar
        {...defaultProps}
        isSidebarOpen
        onCloseSidebar={onCloseSidebar}
      />,
    );

    fireEvent.click(screen.getByTitle('reader.pageTurnMode'));

    expect(onCloseSidebar).toHaveBeenCalledTimes(1);
    expect(screen.getByTitle('reader.pageTurnModes.scroll')).toBeInTheDocument();
  });

  it('maps desktop single and two-column buttons to scroll and cover', () => {
    mockMatchMedia(true);
    const setPageTurnMode = vi.fn();

    render(
      <ReaderToolbar
        {...defaultProps}
        pageTurnMode="cover"
        setPageTurnMode={setPageTurnMode}
      />,
    );

    fireEvent.click(screen.getByTitle('reader.singleColumn'));
    fireEvent.click(screen.getByTitle('reader.twoColumn'));

    expect(setPageTurnMode).toHaveBeenNthCalledWith(1, 'scroll');
    expect(setPageTurnMode).toHaveBeenNthCalledWith(2, 'cover');
  });

  it('does not render mobile TOC button when onToggleSidebar is omitted', () => {
    render(<ReaderToolbar {...defaultProps} />);

    expect(screen.queryByTitle('reader.contents')).not.toBeInTheDocument();
  });

  it('disables pointer interaction when hidden', () => {
    const { container } = render(<ReaderToolbar {...defaultProps} hidden />);

    expect(container.querySelectorAll('.pointer-events-none')).toHaveLength(2);
  });
});
