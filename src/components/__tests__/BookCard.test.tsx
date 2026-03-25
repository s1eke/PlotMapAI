import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import BookCard from '../BookCard';
import type { NovelView } from '../../api/novels';
import { novelsApi } from '../../api/novels';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../api/novels', () => ({
  novelsApi: {
    getCoverUrl: vi.fn(),
  },
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
    vi.mocked(novelsApi.getCoverUrl).mockResolvedValue('blob:cover');
  });

  it('loads and renders a cover image when the novel has a stored cover', async () => {
    const novel = { ...mockNovel, hasCover: true };
    render(
      <MemoryRouter>
        <BookCard novel={novel} />
      </MemoryRouter>
    );

    expect(await screen.findByRole('img', { name: 'Test Novel' })).toHaveAttribute('src', 'blob:cover');
    expect(novelsApi.getCoverUrl).toHaveBeenCalledWith(1);
    expect(screen.queryByTestId('txt-cover')).not.toBeInTheDocument();
  });

  it('falls back to TxtCover and skips the cover lookup when no cover exists', () => {
    const novel = { ...mockNovel, author: '' };
    render(
      <MemoryRouter>
        <BookCard novel={novel} />
      </MemoryRouter>
    );

    expect(screen.getByTestId('txt-cover')).toHaveTextContent('Test Novel');
    expect(novelsApi.getCoverUrl).not.toHaveBeenCalled();
    expect(screen.queryByText('Test Author')).not.toBeInTheDocument();
  });

  it('links to the novel detail page', () => {
    render(
      <MemoryRouter>
        <BookCard novel={mockNovel} />
      </MemoryRouter>
    );

    expect(screen.getByRole('link')).toHaveAttribute('href', '/novel/1');
  });
});
