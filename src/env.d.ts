/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEBUG: string;
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

interface Window {
  PlotMapAIDebug?: DebugPwaTools;
}
