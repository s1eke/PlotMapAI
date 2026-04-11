export const APP_SETTING_KEYS = {
  aiConfig: 'app.aiConfig',
  readerPreferences: 'reader.preferences',
} as const;

export const CACHE_KEYS = {
  readerPreferences: 'reader-preferences',
  installPromptDismissedAt: 'plotmapai_install_prompt_dismissed_at',
  updatePromptDismissed: 'plotmapai_update_prompt_dismissed',
  readerBootstrap: (novelId: number) => `reader-bootstrap:${novelId}`,
} as const;

export const SECURE_KEYS = {
  aiApiKey: 'plotmapai_secure_ai_api_key',
} as const;

export const DEVICE_KEY_STORAGE_KEY = 'plotmapai_device_key';
