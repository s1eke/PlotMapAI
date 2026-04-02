import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppErrorCode, createAppError } from '@shared/errors';
import UploadModal from '../UploadModal';
import { bookImportApi } from '../../api/bookImportApi';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../api/bookImportApi', () => ({
  bookImportApi: {
    importBook: vi.fn(),
  },
}));

describe('UploadModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const importedBook = { id: 1, title: 'Test' };
    vi.mocked(bookImportApi.importBook).mockResolvedValue(importedBook as never);
  });

  function getFileInput(): HTMLInputElement {
    return document.body.querySelector('input[type="file"]') as HTMLInputElement;
  }

  it('rejects unsupported file types before calling upload', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<UploadModal isOpen onClose={() => {}} onSuccess={() => {}} />);

    await user.upload(getFileInput(), new File(['data'], 'novel.pdf', { type: 'application/pdf' }));

    expect(await screen.findByText('bookshelf.invalidType')).toBeInTheDocument();
    expect(bookImportApi.importBook).not.toHaveBeenCalled();
  });

  it('rejects files larger than the configured size limit', async () => {
    const user = userEvent.setup();
    render(<UploadModal isOpen onClose={() => {}} onSuccess={() => {}} />);
    const file = new File(['small'], 'novel.txt', { type: 'text/plain' });

    Object.defineProperty(file, 'size', { value: 101 * 1024 * 1024 });
    await user.upload(getFileInput(), file);

    expect(await screen.findByText('bookshelf.sizeLimit')).toBeInTheDocument();
    expect(bookImportApi.importBook).not.toHaveBeenCalled();
  });

  it('uploads a supported file and triggers success callbacks', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<UploadModal isOpen onClose={onClose} onSuccess={onSuccess} />);
    const file = new File(['chapter 1'], 'novel.txt', { type: 'text/plain' });

    await user.upload(getFileInput(), file);

    await waitFor(() => {
      expect(bookImportApi.importBook).toHaveBeenCalledWith(
        file,
        expect.objectContaining({
          onProgress: expect.any(Function),
          signal: expect.any(AbortSignal),
        }),
      );
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('supports selecting and importing multiple books in one batch', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<UploadModal isOpen onClose={onClose} onSuccess={onSuccess} />);
    const firstFile = new File(['chapter 1'], 'first.txt', { type: 'text/plain' });
    const secondFile = new File(['chapter 2'], 'second.epub', { type: 'application/epub+zip' });
    const input = getFileInput();

    expect(input).toHaveAttribute('multiple');

    await user.upload(input, [firstFile, secondFile]);

    await waitFor(() => {
      expect(bookImportApi.importBook).toHaveBeenCalledTimes(2);
    });
    expect(bookImportApi.importBook).toHaveBeenNthCalledWith(
      1,
      firstFile,
      expect.objectContaining({
        onProgress: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(bookImportApi.importBook).toHaveBeenNthCalledWith(
      2,
      secondFile,
      expect.objectContaining({
        onProgress: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows upload errors from the API without closing the modal', async () => {
    vi.mocked(bookImportApi.importBook).mockRejectedValueOnce(new Error('upload failed'));
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<UploadModal isOpen onClose={onClose} onSuccess={onSuccess} />);

    await user.upload(getFileInput(), new File(['chapter 1'], 'novel.txt', { type: 'text/plain' }));

    expect(await screen.findByText('bookshelf.uploadFailed')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows translated worker unavailable errors from the API', async () => {
    vi.mocked(bookImportApi.importBook).mockRejectedValueOnce(createAppError({
      code: AppErrorCode.WORKER_UNAVAILABLE,
      kind: 'unsupported',
      source: 'book-import',
      userMessageKey: 'errors.WORKER_UNAVAILABLE',
      debugMessage: 'Import worker is unavailable.',
    }));
    const user = userEvent.setup();
    render(<UploadModal isOpen onClose={() => {}} onSuccess={() => {}} />);

    await user.upload(getFileInput(), new File(['chapter 1'], 'novel.txt', { type: 'text/plain' }));

    expect(await screen.findByText('errors.WORKER_UNAVAILABLE')).toBeInTheDocument();
  });

  it('auto-imports files provided by the File Handling API', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const onInitialFilesHandled = vi.fn();
    const initialFile = new File(['chapter 1'], 'launch-book.txt', { type: 'text/plain' });

    render(
      <UploadModal
        isOpen
        onClose={onClose}
        onSuccess={onSuccess}
        initialFiles={[initialFile]}
        onInitialFilesHandled={onInitialFilesHandled}
      />,
    );

    await waitFor(() => {
      expect(bookImportApi.importBook).toHaveBeenCalledWith(
        initialFile,
        expect.objectContaining({
          onProgress: expect.any(Function),
          signal: expect.any(AbortSignal),
        }),
      );
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onInitialFilesHandled).toHaveBeenCalledTimes(1);
  });
});
