/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react';

import { createContext, useContext, useEffect, useEffectEvent, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { appPaths } from '@app/router/paths';
import { debugLog, reportAppError } from '@shared/debug';
import { AppErrorCode } from '@shared/errors';

interface FileHandleLike {
  getFile: () => Promise<File>;
}

interface LaunchParamsLike {
  files: FileHandleLike[];
}

interface LaunchQueueLike {
  setConsumer: (consumer: (launchParams: LaunchParamsLike) => void) => void;
}

interface FileHandlingContextValue {
  pendingLaunchFiles: File[] | null;
  consumePendingLaunchFiles: () => void;
}

const FileHandlingContext = createContext<FileHandlingContextValue | undefined>(undefined);

function getLaunchQueue(): LaunchQueueLike | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return (window as Window & { launchQueue?: LaunchQueueLike }).launchQueue ?? null;
}

export function FileHandlingProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [pendingLaunchBatches, setPendingLaunchBatches] = useState<File[][]>([]);

  const handleLaunch = useEffectEvent(async (launchParams: LaunchParamsLike) => {
    if (launchParams.files.length === 0) {
      debugLog('PWA', 'File Handling API launch ignored because no files were provided');
      return;
    }

    try {
      const files = await Promise.all(launchParams.files.map((fileHandle) => fileHandle.getFile()));
      if (files.length === 0) {
        return;
      }

      debugLog('PWA', `Received ${files.length} file(s) via File Handling API`, files.map((file) => file.name));
      setPendingLaunchBatches((current) => [...current, files]);

      if (location.pathname !== appPaths.bookshelf()) {
        navigate(appPaths.bookshelf());
      }
    } catch (error) {
      reportAppError(error, {
        code: AppErrorCode.BOOK_IMPORT_FAILED,
        kind: 'execution',
        source: 'book-import',
        userMessageKey: 'bookshelf.uploadFailed',
        retryable: true,
        details: {
          phase: 'file-handler-launch',
        },
      });
    }
  });

  useEffect(() => {
    const launchQueue = getLaunchQueue();
    if (!launchQueue) {
      return;
    }

    debugLog('PWA', 'File Handling API consumer registered');
    launchQueue.setConsumer((launchParams) => {
      handleLaunch(launchParams);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- handleLaunch comes from useEffectEvent
  }, []);

  const value = useMemo<FileHandlingContextValue>(() => ({
    pendingLaunchFiles: pendingLaunchBatches[0] ?? null,
    consumePendingLaunchFiles: () => {
      setPendingLaunchBatches((current) => current.slice(1));
    },
  }), [pendingLaunchBatches]);

  return (
    <FileHandlingContext.Provider value={value}>
      {children}
    </FileHandlingContext.Provider>
  );
}

export function useFileHandling() {
  const context = useContext(FileHandlingContext);
  if (context === undefined) {
    throw new Error('useFileHandling must be used within a FileHandlingProvider');
  }
  return context;
}
