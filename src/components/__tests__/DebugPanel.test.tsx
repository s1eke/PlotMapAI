import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DebugPanel from '../DebugPanel';

const debugTest = vi.hoisted(() => {
  let logs: Array<{ time: number; category: string; message: string }> = [];
  let subscriber: ((entry: { time: number; category: string; message: string }) => void) | null = null;

  return {
    clearMock: vi.fn(() => {
      logs = [];
    }),
    getLogs: () => [...logs],
    setLogs(nextLogs: Array<{ time: number; category: string; message: string }>) {
      logs = [...nextLogs];
    },
    subscribe(callback: (entry: { time: number; category: string; message: string }) => void) {
      subscriber = callback;
      return () => {
        if (subscriber === callback) subscriber = null;
      };
    },
    emit(entry: { time: number; category: string; message: string }) {
      logs = [...logs, entry];
      subscriber?.(entry);
    },
  };
});

vi.mock('../../services/debug', () => {
  return {
    debugSubscribe: debugTest.subscribe,
    getRecentLogs: debugTest.getLogs,
    clearLogs: debugTest.clearMock,
    MAX_LOGS: 500,
  };
});

describe('DebugPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    debugTest.setLogs([]);
  });

  it('renders existing logs and appends live log entries from the subscription', async () => {
    debugTest.setLogs([{ time: 1, category: 'Reader', message: 'initial log' }]);
    const user = userEvent.setup();

    render(<DebugPanel />);
    await user.click(screen.getByTitle('Debug Panel'));

    expect(screen.getByText('initial log')).toBeInTheDocument();

    debugTest.emit({ time: 2, category: 'AI', message: 'live log' });
    expect(await screen.findByText('live log')).toBeInTheDocument();
  });

  it('clears logs through the panel action', async () => {
    debugTest.setLogs([{ time: 1, category: 'Reader', message: 'stale log' }]);
    const user = userEvent.setup();

    render(<DebugPanel />);
    await user.click(screen.getByTitle('Debug Panel'));
    expect(screen.getByText('stale log')).toBeInTheDocument();

    await user.click(screen.getByTitle('Clear logs'));

    expect(screen.getByText('No logs yet')).toBeInTheDocument();
  });
});
