export interface ReaderThemeConfig {
  bg: string;
  text: string;
  sidebarBg: string;
  id: string;
}

export const READER_THEMES: Record<string, ReaderThemeConfig> = {
  paper: {
    id: 'paper',
    bg: 'bg-[#ffffff]',
    text: 'text-[#1a1a1a]',
    sidebarBg: 'bg-[#ffffff]'
  },
  parchment: {
    id: 'parchment',
    bg: 'bg-[#f4ecd8]',
    text: 'text-[#5b4636]',
    sidebarBg: 'bg-[#f4ecd8]'
  },
  green: {
    id: 'green',
    bg: 'bg-[#c7edcc]',
    text: 'text-[#2c3e50]',
    sidebarBg: 'bg-[#c7edcc]'
  },
  night: {
    id: 'night',
    bg: 'bg-[#1a1a1a]',
    text: 'text-[#d1d1d1]',
    sidebarBg: 'bg-[#1a1a1a]'
  },
  auto: {
    id: 'auto',
    bg: 'bg-bg-primary',
    text: 'text-text-primary',
    sidebarBg: 'bg-bg-secondary'
  }
};
