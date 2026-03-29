export { aiConfigApi, getAiConfig, resetDeviceKeyForTesting } from './api/aiConfig';
export { purificationRulesApi } from './api/purificationRules';
export { tocRulesApi } from './api/tocRules';
export type {
  AiProviderSettings,
  AiProviderSettingsPayload,
  PurificationRule,
  TocRule,
} from './api/types';
export { ensureDefaultPurificationRules } from './services/defaultPurificationRules';
export { ensureDefaultTocRules } from './services/defaultTocRules';
export { purify } from './services/purifier';

export function loadSettingsPage() {
  return import('./pages/SettingsPage');
}
