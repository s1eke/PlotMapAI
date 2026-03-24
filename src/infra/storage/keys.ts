export const APP_SETTING_KEYS = {
  aiConfig: 'app.aiConfig',
  appTheme: 'app.theme',
  readerTheme: 'reader.theme',
  readerFontSize: 'reader.fontSize',
  readerLineSpacing: 'reader.lineSpacing',
  readerParagraphSpacing: 'reader.paragraphSpacing',
} as const;

export const CACHE_KEYS = {
  theme: 'theme',
  readerTheme: 'readerTheme',
  readerFontSize: 'readerFontSize',
  readerLineSpacing: 'readerLineSpacing',
  readerParagraphSpacing: 'readerParagraphSpacing',
  installPromptDismissedAt: 'plotmapai_install_prompt_dismissed_at',
  updatePromptDismissed: 'plotmapai_update_prompt_dismissed',
  readerState: (novelId: number) => `reader-state:${novelId}`,
} as const;

export const LEGACY_CACHE_KEYS = {
  aiConfig: 'plotmapai_ai_config',
} as const;

export const SECURE_KEYS = {
  aiApiKey: 'plotmapai_secure_ai_api_key',
} as const;

export const LEGACY_SECURE_KEYS = {
  aiApiKey: 'plotmapai_encrypted_api_key',
} as const;

export const DEVICE_KEY_STORAGE_KEY = 'plotmapai_device_key';
