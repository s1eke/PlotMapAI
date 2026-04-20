/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEBUG: string;
  readonly VITE_ENABLE_READER_TRACE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;

interface DebugPwaTools {
  showInstallPrompt: () => void;
  showIosInstallHint: () => void;
  showUpdateToast: () => void;
  resetPwaPrompts: () => void;
  retryReaderRestore: () => void;
}

interface ReaderTraceDump {
  capacity: number;
  enabled: boolean;
  generatedAt: number;
  events: Array<{
    chapterIndex: number | null;
    details: Record<string, unknown> | null;
    event: string;
    mode: 'scroll' | 'paged' | 'summary' | null;
    novelId: number | null;
    pageTurnMode: 'scroll' | 'cover' | 'slide' | 'none' | null;
    restoreStatus:
      | 'hydrating'
      | 'loading-chapters'
      | 'loading-chapter'
      | 'restoring-position'
      | 'awaiting-paged-layout'
      | 'ready'
      | 'error'
      | null;
    time: number;
  }>;
}

interface ReaderTraceTools {
  clear: () => void;
  disable: () => void;
  dump: () => ReaderTraceDump;
  enable: () => void;
  getLastDump: () => ReaderTraceDump | null;
  mark: (reason: string, details?: Record<string, unknown>) => void;
}

interface Window {
  PlotMapAIDebug?: DebugPwaTools;
  PlotMapAIReaderTrace?: ReaderTraceTools;
}
