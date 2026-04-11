import type { SettingsPageViewModel } from './types';

import { useState } from 'react';

import {
  type AiSettingsManagerActions,
  useAiSettingsManager,
  usePurificationSettingsManager,
  useTocSettingsManager,
  type SettingsTabId,
} from '@domains/settings';
import {
  exportAiProviderSettings,
  importAiProviderSettings,
  saveAiProviderSettings,
  testAiProviderSettings,
} from '@application/use-cases/aiSettings';

const AI_SETTINGS_MANAGER_ACTIONS: AiSettingsManagerActions = {
  exportAiProviderSettings,
  importAiProviderSettings,
  saveAiProviderSettings,
  testAiProviderSettings,
};

export function useSettingsPageViewModel(): SettingsPageViewModel {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('toc');
  const tocManager = useTocSettingsManager();
  const purificationManager = usePurificationSettingsManager();
  const aiManager = useAiSettingsManager(AI_SETTINGS_MANAGER_ACTIONS);

  return {
    activeTab,
    aiManager,
    appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '',
    purificationManager,
    setActiveTab,
    tocManager,
  };
}
