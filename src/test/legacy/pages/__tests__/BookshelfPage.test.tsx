import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import BookshelfPage from '../BookshelfPage';
import { novelsApi } from '../../api/novels';

const i18nMock = vi.hoisted(() => ({
  t: (key: string) => key,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: i18nMock.t }),
}));

vi.mock('../../api/novels', () => ({
  novelsApi: {
    list: vi.fn(),
  },
}));

vi.mock('../../components/BookCard', () => ({
  default: ({ novel }: { novel: { title: string } }) => <div data-testid="book-card">{novel.title}</div>,
}));

vi.mock('../../components/UploadModal', () => ({
  default: ({
    isOpen,
    onSuccess,
    onClose,
  }: {
    isOpen: boolean;
    onSuccess: () => void;
    onClose: () => void;
  }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="upload-modal">
        <button type="button" onClick={onSuccess}>mock-upload-success</button>
        <button type="button" onClick={onClose}>mock-upload-close</button>
      </div>
    );
  },
}));

describe('BookshelfPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading spinner while novels are being fetched', () => {
    vi.mocked(novelsApi.list).mockReturnValue(new Promise(() => undefined));
    const { container } = render(
      <MemoryRouter>
        <BookshelfPage />
      </MemoryRouter>
    );

    expect(novelsApi.list).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders the empty state when the bookshelf has no novels', async () => {
    vi.mocked(novelsApi.list).mockResolvedValue([]);
    render(
      <MemoryRouter>
        <BookshelfPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('bookshelf.noBooks')).toBeInTheDocument();
    expect(screen.queryByTestId('book-card')).not.toBeInTheDocument();
  });

  it('retries loading after a failed fetch', async () => {
    vi.mocked(novelsApi.list).mockRejectedValue(new Error('load failed'));
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <BookshelfPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('load failed')).toBeInTheDocument();
    vi.mocked(novelsApi.list).mockResolvedValueOnce([]);
    await user.click(screen.getByRole('button', { name: 'bookshelf.tryAgain' }));

    await waitFor(() => {
      expect(novelsApi.list).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('bookshelf.noBooks')).toBeInTheDocument();
  });

  it('refreshes the list after a successful upload callback', async () => {
    vi.mocked(novelsApi.list).mockResolvedValue([]);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <BookshelfPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('bookshelf.noBooks')).toBeInTheDocument();
    vi.mocked(novelsApi.list).mockResolvedValueOnce([
      {
        id: 1,
        title: 'Uploaded Novel',
        author: '',
        description: '',
        tags: [],
        fileType: 'txt',
        hasCover: false,
        originalFilename: 'uploaded.txt',
        originalEncoding: 'utf-8',
        totalWords: 1200,
        chapterCount: 4,
        createdAt: new Date().toISOString(),
      },
    ]);
    await user.click(screen.getAllByRole('button', { name: 'common.actions.upload' })[0]);
    expect(await screen.findByTestId('upload-modal')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'mock-upload-success' }));

    await waitFor(() => {
      expect(novelsApi.list).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByTestId('book-card')).toHaveTextContent('Uploaded Novel');
  });
});
