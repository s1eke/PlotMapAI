import { resetReaderSessionStoreForTests } from '@domains/reader/hooks/sessionStore';

export function resetReaderStoresForTests(): void {
  resetReaderSessionStoreForTests();
}
