import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reparseBookAndRefreshDetail } from '@application/use-cases/book-detail';
import { AppErrorCode, createAppError } from '@shared/errors';
import { reportAppError, setDebugSnapshot } from '@shared/debug';

import { useReaderReparseRecoveryController } from '../useReaderReparseRecoveryController';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@application/use-cases/book-detail', () => ({
  reparseBookAndRefreshDetail: vi.fn(),
}));

vi.mock('@shared/debug', () => ({
  reportAppError: vi.fn(),
  setDebugSnapshot: vi.fn(),
}));

function toFileList(file: File): FileList {
  return {
    0: file,
    length: 1,
    item: (index: number) => (index === 0 ? file : null),
  } as unknown as FileList;
}

describe('useReaderReparseRecoveryController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the novel file type to configure accepted source files', () => {
    const { result } = renderHook(() => useReaderReparseRecoveryController({
      fileType: 'epub',
      novelId: 1,
      onReparsed: vi.fn(),
    }));

    expect(result.current.accept).toBe('.epub');
  });

  it('reparses the selected file and reports success back to the reader', async () => {
    const onReparsed = vi.fn();
    vi.mocked(reparseBookAndRefreshDetail).mockImplementation(async (_novelId, _file, options) => {
      options?.onProgress?.({
        stage: 'chapters',
        progress: 66,
        current: 1,
        total: 1,
        detail: 'chapter-1.xhtml',
      });
    });
    const { result } = renderHook(() => useReaderReparseRecoveryController({
      fileType: 'epub',
      novelId: 42,
      onReparsed,
    }));
    const file = new File(['epub'], 'reader.epub', { type: 'application/epub+zip' });

    await act(async () => {
      await result.current.onFilesSelected(toFileList(file));
    });

    expect(reparseBookAndRefreshDetail).toHaveBeenCalledWith(42, file, expect.objectContaining({
      onProgress: expect.any(Function),
      signal: expect.any(AbortSignal),
    }));
    expect(result.current.actionMessage).toBe('reader.reparse.succeeded');
    expect(result.current.actionError).toBeNull();
    expect(result.current.isReparsing).toBe(false);
    expect(onReparsed).toHaveBeenCalledTimes(1);
    expect(setDebugSnapshot).toHaveBeenCalled();
  });

  it('surfaces import errors without mutating state when no file is selected', async () => {
    const mismatchError = createAppError({
      code: AppErrorCode.BOOK_IMPORT_FAILED,
      kind: 'validation',
      source: 'book-import',
      userMessageKey: 'reader.reparse.fileTypeMismatch',
      debugMessage: 'Selected file type does not match the original import.',
    });
    vi.mocked(reparseBookAndRefreshDetail).mockRejectedValueOnce(mismatchError);
    const { result } = renderHook(() => useReaderReparseRecoveryController({
      fileType: 'epub',
      novelId: 7,
      onReparsed: vi.fn(),
    }));
    const file = new File(['txt'], 'wrong.txt', { type: 'text/plain' });

    await act(async () => {
      await result.current.onFilesSelected(null);
    });

    expect(reparseBookAndRefreshDetail).not.toHaveBeenCalled();
    expect(result.current.actionError).toBeNull();

    await act(async () => {
      await result.current.onFilesSelected(toFileList(file));
    });

    expect(result.current.actionMessage).toBeNull();
    expect(result.current.actionError).toMatchObject({
      code: AppErrorCode.BOOK_IMPORT_FAILED,
      userMessageKey: 'reader.reparse.fileTypeMismatch',
    });
    expect(reportAppError).toHaveBeenCalledWith(mismatchError);
  });
});
