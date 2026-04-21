import type { ReaderPersistenceRuntimeValue } from '@shared/contracts/reader';

import { flushPersistence } from '../store/readerSessionStore';

export async function flushReaderStateWithCapture(
  persistence: Pick<ReaderPersistenceRuntimeValue, 'runBeforeFlush'>,
): Promise<void> {
  // 根据合约，捕获钩子是同步的，因此在进入异步持久化刷新之前，
  // 会话快照是最新的。
  persistence.runBeforeFlush();
  await flushPersistence();
}
