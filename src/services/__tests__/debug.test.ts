import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('debug', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('isDebugMode returns false when VITE_DEBUG is not set', async () => {
    vi.stubEnv('VITE_DEBUG', '');
    const mod = await import('../debug');
    expect(mod.isDebugMode()).toBe(false);
  });

  it('isDebugMode returns true when VITE_DEBUG is "true"', async () => {
    vi.stubEnv('VITE_DEBUG', 'true');
    const mod = await import('../debug');
    expect(mod.isDebugMode()).toBe(true);
  });

  it('debugLog is a no-op when not in debug mode', async () => {
    vi.stubEnv('VITE_DEBUG', '');
    const mod = await import('../debug');
    const spy = vi.spyOn(console, 'log');
    mod.debugLog('Test', 'should not log');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('debugLog adds entries and notifies listeners when in debug mode', async () => {
    vi.stubEnv('VITE_DEBUG', 'true');
    const mod = await import('../debug');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mod.clearLogs();

    const listener = vi.fn();
    const unsub = mod.debugSubscribe(listener);

    mod.debugLog('TestCategory', 'hello', 'world');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({
      category: 'TestCategory',
      message: 'hello world',
    });

    const logs = mod.getRecentLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].category).toBe('TestCategory');

    unsub();
    mod.debugLog('TestCategory', 'after unsub');
    expect(listener).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });

  it('clearLogs removes all entries', async () => {
    vi.stubEnv('VITE_DEBUG', 'true');
    const mod = await import('../debug');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mod.clearLogs();
    mod.debugLog('A', '1');
    mod.debugLog('B', '2');
    expect(mod.getRecentLogs().length).toBe(2);
    mod.clearLogs();
    expect(mod.getRecentLogs().length).toBe(0);
    spy.mockRestore();
  });

  it('MAX_LOGS is exported and is a positive number', async () => {
    vi.stubEnv('VITE_DEBUG', '');
    const mod = await import('../debug');
    expect(mod.MAX_LOGS).toBeGreaterThan(0);
  });

  it('registerDebugHelpers exposes window debug methods in debug mode', async () => {
    vi.stubEnv('VITE_DEBUG', 'true');
    const mod = await import('../debug');
    const cleanup = mod.registerDebugHelpers();

    expect(window.PlotMapAIDebug).toBeDefined();
    expect(typeof window.PlotMapAIDebug?.showInstallPrompt).toBe('function');
    expect(typeof window.PlotMapAIDebug?.showUpdateToast).toBe('function');

    cleanup();

    expect(window.PlotMapAIDebug).toBeUndefined();
  });
});
