import { resetReaderSessionStoreForTests } from '@domains/reader-session';

export function resetReaderStoresForTests(): void {
  resetReaderSessionStoreForTests();
}
