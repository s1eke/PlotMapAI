import { initializeAnalysisRuntime } from '@domains/analysis';
import { ensureDefaultPurificationRules, ensureDefaultTocRules } from '@domains/settings';

let initialized = false;
let initializationPromise: Promise<void> | null = null;

export async function initializeApp(): Promise<void> {
  if (initialized) {
    return;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = Promise.all([
    ensureDefaultPurificationRules(),
    ensureDefaultTocRules(),
    initializeAnalysisRuntime(),
  ])
    .then(() => {
      initialized = true;
    })
    .catch((error: unknown) => {
      initializationPromise = null;
      throw error;
    });

  return initializationPromise;
}
