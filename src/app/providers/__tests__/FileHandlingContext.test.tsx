import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { FileHandlingProvider, useFileHandling } from '../FileHandlingContext';

interface LaunchParamsLike {
  files: Array<{
    getFile: () => Promise<File>;
  }>;
}

type LaunchConsumer = (launchParams: LaunchParamsLike) => void;

const launchQueueMock = vi.hoisted(() => {
  let consumer: LaunchConsumer | null = null;

  return {
    reset() {
      consumer = null;
    },
    setConsumer: vi.fn((nextConsumer: LaunchConsumer) => {
      consumer = nextConsumer;
    }),
    getConsumer() {
      return consumer;
    },
  };
});

function Probe() {
  const location = useLocation();
  const { pendingLaunchFiles, consumePendingLaunchFiles } = useFileHandling();

  return (
    <div>
      <div data-testid="current-path">{location.pathname}</div>
      <div data-testid="pending-count">{pendingLaunchFiles?.length ?? 0}</div>
      <div data-testid="pending-name">{pendingLaunchFiles?.[0]?.name ?? ''}</div>
      <button type="button" onClick={consumePendingLaunchFiles}>consume</button>
    </div>
  );
}

describe('FileHandlingContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    launchQueueMock.reset();
    Object.defineProperty(window, 'launchQueue', {
      configurable: true,
      writable: true,
      value: {
        setConsumer: launchQueueMock.setConsumer,
      },
    });
  });

  it('registers the launchQueue consumer and queues files for the bookshelf flow', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/novel/1']}>
        <FileHandlingProvider>
          <Routes>
            <Route path="/" element={<Probe />} />
            <Route path="/novel/:id" element={<Probe />} />
          </Routes>
        </FileHandlingProvider>
      </MemoryRouter>,
    );

    expect(launchQueueMock.setConsumer).toHaveBeenCalledTimes(1);
    const consumer = launchQueueMock.getConsumer();
    expect(consumer).not.toBeNull();

    consumer?.({
      files: [
        {
          getFile: async () => new File(['chapter 1'], 'launch-book.txt', { type: 'text/plain' }),
        },
        {
          getFile: async () => new File(['chapter 2'], 'launch-book.epub', { type: 'application/epub+zip' }),
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-path')).toHaveTextContent('/');
    });
    expect(screen.getByTestId('pending-count')).toHaveTextContent('2');
    expect(screen.getByTestId('pending-name')).toHaveTextContent('launch-book.txt');

    await user.click(screen.getByRole('button', { name: 'consume' }));

    expect(screen.getByTestId('pending-count')).toHaveTextContent('0');
    expect(screen.getByTestId('pending-name')).toHaveTextContent('');
  });
});
