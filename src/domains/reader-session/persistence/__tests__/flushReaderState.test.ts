import { describe, expect, it, vi } from 'vitest';

import * as readerSessionStore from '../../store/readerSessionStore';
import { flushReaderStateWithCapture } from '../flushReaderState';

describe('flushReaderStateWithCapture', () => {
  it('invokes runBeforeFlush exactly once before flushPersistence', async () => {
    // 定义一个数组用于记录函数的执行顺序
    const callOrder: string[] = [];

    const persistence = {
      runBeforeFlush: vi.fn(() => {
        callOrder.push('runBeforeFlush');
      }),
    };

    // 使用 vi.spyOn 拦截底层的 flushPersistence 方法
    const flushPersistenceSpy = vi
      .spyOn(readerSessionStore, 'flushPersistence')
      .mockImplementation(async () => {
        callOrder.push('flushPersistence');
      });

    // 触发被测试的方法
    await flushReaderStateWithCapture(persistence);

    // 1. 验证 runBeforeFlush 严谨地只被执行了 1 次
    expect(persistence.runBeforeFlush).toHaveBeenCalledTimes(1);

    // 2. 验证底层的 flushPersistence 也被执行了 1 次
    expect(flushPersistenceSpy).toHaveBeenCalledTimes(1);

    // 3. ✨ 核心断言：验证执行序列，保证 runBeforeFlush 一定发生在 flushPersistence 之前
    expect(callOrder).toEqual(['runBeforeFlush', 'flushPersistence']);

    // 清理 Mock
    flushPersistenceSpy.mockRestore();
  });
});
