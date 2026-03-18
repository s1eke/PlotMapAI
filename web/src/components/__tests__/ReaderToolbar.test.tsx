import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ReaderToolbar from '../ReaderToolbar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('ReaderToolbar', () => {
  const defaultProps = {
    fontSize: 16,
    setFontSize: vi.fn(),
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

  it('renders correctly with default props', () => {
    render(<ReaderToolbar {...defaultProps} />);
    expect(screen.getByText('16')).toBeInTheDocument();
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
});
