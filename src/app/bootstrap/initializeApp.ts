import { initializeApplication } from '@application/use-cases/initializeApplication';

export async function initializeApp(): Promise<void> {
  return initializeApplication();
}
