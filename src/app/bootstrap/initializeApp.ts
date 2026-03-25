import { initializeAnalysisRuntime } from '@domains/analysis';
import { ensureDefaultTocRules } from '@domains/settings';

let initialized = false;

export async function initializeApp(): Promise<void> {
  if (initialized) {
    return;
  }

  initialized = true;
  await Promise.all([
    ensureDefaultTocRules(),
    initializeAnalysisRuntime(),
  ]);
}
