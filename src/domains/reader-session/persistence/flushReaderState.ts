import type { ReaderPersistenceRuntimeValue } from '@shared/contracts/reader';

import { flushPersistence } from '../store/readerSessionStore';

export async function flushReaderStateWithCapture(
  persistence: Pick<ReaderPersistenceRuntimeValue, 'runBeforeFlush'>,
): Promise<void> {
  // Capture hooks are synchronous by contract so the session snapshot is current
  // before we enter the async persistence flush.
  persistence.runBeforeFlush();
  await flushPersistence();
}
