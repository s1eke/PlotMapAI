import type { SettingsPageViewModel } from './types';

import { useState } from 'react';

import {
  usePurificationSettingsManager,
  useTocSettingsManager,
  type SettingsTabId,
} from '@domains/settings';

import { useAiSettingsManager } from './useAiSettingsManager';

export function useSettingsPageViewModel(): SettingsPageViewModel {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('toc');
  const tocManager = useTocSettingsManager();
  const purificationManager = usePurificationSettingsManager();
  const aiManager = useAiSettingsManager();

  return {
    activeTab,
    aiManager,
    appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '',
    purificationManager,
    setActiveTab,
    tocManager,
  };
}
