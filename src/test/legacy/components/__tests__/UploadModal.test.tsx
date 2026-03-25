import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UploadModal from '../UploadModal';
import { novelsApi } from '../../api/novels';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../api/novels', () => ({
  novelsApi: {
    upload: vi.fn(),
  },
}));

describe('UploadModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(novelsApi.upload).mockResolvedValue({ id: 1, title: 'Test' } as never);
  });

  function getFileInput(): HTMLInputElement {
    return document.body.querySelector('input[type="file"]') as HTMLInputElement;
  }

  it('rejects unsupported file types before calling upload', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<UploadModal isOpen={true} onClose={() => {}} onSuccess={() => {}} />);

    await user.upload(getFileInput(), new File(['data'], 'novel.pdf', { type: 'application/pdf' }));

    expect(await screen.findByText('bookshelf.invalidType')).toBeInTheDocument();
    expect(novelsApi.upload).not.toHaveBeenCalled();
  });

  it('rejects files larger than the configured size limit', async () => {
    const user = userEvent.setup();
    render(<UploadModal isOpen={true} onClose={() => {}} onSuccess={() => {}} />);
    const file = new File(['small'], 'novel.txt', { type: 'text/plain' });

    Object.defineProperty(file, 'size', { value: 101 * 1024 * 1024 });
    await user.upload(getFileInput(), file);

    expect(await screen.findByText('bookshelf.sizeLimit')).toBeInTheDocument();
    expect(novelsApi.upload).not.toHaveBeenCalled();
  });

  it('uploads a supported file and triggers success callbacks', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<UploadModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />);
    const file = new File(['chapter 1'], 'novel.txt', { type: 'text/plain' });

    await user.upload(getFileInput(), file);

    await waitFor(() => {
      expect(novelsApi.upload).toHaveBeenCalledWith(file);
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows upload errors from the API without closing the modal', async () => {
    vi.mocked(novelsApi.upload).mockRejectedValueOnce(new Error('upload failed'));
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<UploadModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />);

    await user.upload(getFileInput(), new File(['chapter 1'], 'novel.txt', { type: 'text/plain' }));

    expect(await screen.findByText('upload failed')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
