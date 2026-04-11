import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import BookCard from '../BookCard';
import { useNovelCoverResource } from '../../hooks/useNovelCoverResource';
import type { NovelView } from '../../novelRepository';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../hooks/useNovelCoverResource', () => ({
  useNovelCoverResource: vi.fn(),
}));

vi.mock('../TxtCover', () => ({
  default: ({ title }: { title: string }) => <div data-testid="txt-cover">{title}</div>,
}));

const mockNovel: NovelView = {
  id: 1,
  title: 'Test Novel',
  author: 'Test Author',
  description: 'A test novel',
  tags: ['fiction'],
  fileType: 'txt',
  hasCover: false,
  originalFilename: 'test.txt',
  originalEncoding: 'utf-8',
  totalWords: 5000,
  chapterCount: 10,
  createdAt: new Date().toISOString(),
};

describe('BookCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNovelCoverResource).mockReturnValue('blob:cover');
  });

  it('loads and renders a cover image when the novel has a stored cover', async () => {
    const novel = { ...mockNovel, hasCover: true };
    render(
      <MemoryRouter>
        <BookCard detailHref="/novel/1" novel={novel} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('img', { name: 'Test Novel' })).toHaveAttribute('src', 'blob:cover');
    expect(useNovelCoverResource).toHaveBeenCalledWith(1, true);
    expect(screen.queryByTestId('txt-cover')).not.toBeInTheDocument();
  });

  it('falls back to TxtCover and skips the cover lookup when no cover exists', () => {
    const novel = { ...mockNovel, author: '' };
    render(
      <MemoryRouter>
        <BookCard detailHref="/novel/1" novel={novel} />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('txt-cover')).toHaveTextContent('Test Novel');
    expect(useNovelCoverResource).toHaveBeenCalledWith(1, false);
    expect(screen.queryByText('Test Author')).not.toBeInTheDocument();
  });

  it('links to the novel detail page', () => {
    render(
      <MemoryRouter>
        <BookCard detailHref="/novel/1" novel={mockNovel} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link')).toHaveAttribute('href', '/novel/1');
  });

  it('uses touch-friendly mobile classes while keeping the desktop hover overlay available', () => {
    render(
      <MemoryRouter>
        <BookCard detailHref="/novel/1" novel={mockNovel} />
      </MemoryRouter>,
    );

    const link = screen.getByRole('link');
    expect(link.className).toContain('touch-manipulation');
    expect(link.className).toContain('active:scale-[0.98]');

    const title = screen.getByRole('heading', { name: 'Test Novel' });
    expect(title.className).toContain('line-clamp-2');
    expect(title.className).toContain('sm:line-clamp-1');

    const overlay = screen.getByText('common.actions.viewDetails').parentElement;
    expect(overlay?.className).toContain('hidden');
    expect(overlay?.className).toContain('md:flex');
  });
});
