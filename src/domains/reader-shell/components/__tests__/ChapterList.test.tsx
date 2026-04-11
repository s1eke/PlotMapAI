import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChapterList from '../ChapterList';

const scrollIntoViewMock = vi.fn();

beforeEach(() => {
  scrollIntoViewMock.mockReset();
  Element.prototype.scrollIntoView = scrollIntoViewMock;
});

describe('ChapterList', () => {
  const chapters = [
    { index: 0, title: 'Chapter 1: The Beginning', wordCount: 1500 },
    { index: 1, title: 'Chapter 2: The Journey', wordCount: 2000 },
    { index: 2, title: 'Chapter 3: The End', wordCount: 1800 },
  ];

  it('scrolls the active chapter into view when the current chapter changes', () => {
    const { rerender } = render(
      <ChapterList chapters={chapters} currentIndex={0} onSelect={() => {}} />,
    );

    scrollIntoViewMock.mockClear();
    rerender(<ChapterList chapters={chapters} currentIndex={2} onSelect={() => {}} />);

    expect(scrollIntoViewMock).toHaveBeenCalled();
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    expect(screen.getByRole('button', { name: /Chapter 3: The End/ })).toHaveAttribute('data-active', 'true');
  });

  it('jumps directly to the active chapter when the sidebar opens', () => {
    const { rerender } = render(
      <ChapterList
        chapters={chapters}
        currentIndex={2}
        onSelect={() => {}}
        isSidebarOpen={false}
      />,
    );

    scrollIntoViewMock.mockClear();
    rerender(
      <ChapterList chapters={chapters} currentIndex={2} onSelect={() => {}} isSidebarOpen />,
    );

    expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
  });

  it('calls onSelect when a chapter is clicked', async () => {
    const onSelect = vi.fn();
    render(<ChapterList chapters={chapters} currentIndex={0} onSelect={onSelect} />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Chapter 2: The Journey'));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('renders an empty state when there are no chapters', () => {
    render(<ChapterList chapters={[]} currentIndex={0} onSelect={() => {}} />);
    expect(screen.getByText('No chapters available')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
