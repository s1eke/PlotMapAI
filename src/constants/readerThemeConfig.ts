export interface ThemeDisplayConfig {
  id: string;
  color: string;
  labelKey: string;
}

export const READER_THEME_DISPLAY: ThemeDisplayConfig[] = [
  { id: 'auto', color: 'transparent', labelKey: 'reader.bgPresets.auto' },
  { id: 'paper', color: '#ffffff', labelKey: 'reader.bgPresets.paper' },
  { id: 'parchment', color: '#f4ecd8', labelKey: 'reader.bgPresets.parchment' },
  { id: 'green', color: '#c7edcc', labelKey: 'reader.bgPresets.green' },
  { id: 'night', color: '#1a1a1a', labelKey: 'reader.bgPresets.night' },
];
