import type {
  AiSettingsManager,
  PurificationSettingsManager,
  SettingsTabId,
  TocSettingsManager,
} from '@domains/settings';

export interface SettingsPageViewModel {
  activeTab: SettingsTabId;
  aiManager: AiSettingsManager;
  appVersion: string;
  purificationManager: PurificationSettingsManager;
  setActiveTab: (nextTab: SettingsTabId) => void;
  tocManager: TocSettingsManager;
}
