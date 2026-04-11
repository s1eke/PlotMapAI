import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { novelRepository } from '@domains/library';

import BookshelfPage from '../bookshelf';

const fileHandlingMock = vi.hoisted(() => ({
  consumePendingLaunchFiles: vi.fn(),
  pendingLaunchFiles: null as File[] | null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@domains/library', () => ({
  BookCard: ({ novel }: { novel: { title: string } }) => (
    <div data-testid="book-card">{novel.title}</div>
  ),
  novelRepository: {
    list: vi.fn(),
  },
}));

vi.mock('@app/providers/FileHandlingContext', () => ({
  useFileHandling: () => fileHandlingMock,
}));

vi.mock('../../components/UploadModal', () => ({
  default: ({
    initialFiles,
    isOpen,
    onClose,
    onInitialFilesHandled,
    onSuccess,
  }: {
    initialFiles?: File[] | null;
    isOpen: boolean;
    onClose: () => void;
    onInitialFilesHandled?: () => void;
    onSuccess: () => void;
  }) => {
    if (!isOpen) {
      return null;
    }

    return (
      <div data-testid="upload-modal">
        <div data-testid="upload-modal-initial-files">
          {initialFiles?.map((file) => file.name).join(',') ?? ''}
        </div>
        <button type="button" onClick={onSuccess}>
          mock-upload-success
        </button>
        <button type="button" onClick={onClose}>
          mock-upload-close
        </button>
        <button type="button" onClick={onInitialFilesHandled}>
          mock-upload-consume
        </button>
      </div>
    );
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <BookshelfPage />
    </MemoryRouter>,
  );
}

describe('application BookshelfPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileHandlingMock.pendingLaunchFiles = null;
  });

  it('refreshes the bookshelf after a successful import', async () => {
    vi.mocked(novelRepository.list).mockResolvedValueOnce([]);
    vi.mocked(novelRepository.list).mockResolvedValueOnce([
      {
        author: '',
        chapterCount: 4,
        createdAt: new Date().toISOString(),
        description: '',
        fileType: 'txt',
        hasCover: false,
        id: 1,
        originalEncoding: 'utf-8',
        originalFilename: 'uploaded.txt',
        tags: [],
        title: 'Uploaded Novel',
        totalWords: 1200,
      },
    ]);
    const user = userEvent.setup();

    renderPage();

    expect(await screen.findByText('bookshelf.noBooks')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'common.actions.upload' })[0]);
    expect(await screen.findByTestId('upload-modal')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'mock-upload-success' }));

    await waitFor(() => {
      expect(novelRepository.list).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByTestId('book-card')).toHaveTextContent('Uploaded Novel');
  });

  it('opens the upload modal for launch files and lets the page consume them', async () => {
    vi.mocked(novelRepository.list).mockResolvedValue([]);
    fileHandlingMock.pendingLaunchFiles = [
      new File(['chapter 1'], 'launch-book.txt', { type: 'text/plain' }),
    ];
    const user = userEvent.setup();

    renderPage();

    expect(await screen.findByTestId('upload-modal')).toBeInTheDocument();
    expect(screen.getByTestId('upload-modal-initial-files')).toHaveTextContent('launch-book.txt');

    await user.click(screen.getByRole('button', { name: 'mock-upload-consume' }));

    expect(fileHandlingMock.consumePendingLaunchFiles).toHaveBeenCalledTimes(1);
  });
});
