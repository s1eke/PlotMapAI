import { debugLog, isDebugMode } from '@shared/debug';

export const DEBUG_SHOW_INSTALL_PROMPT_EVENT = 'plotmapai:debug:show-install-prompt';
export const DEBUG_SHOW_IOS_INSTALL_HINT_EVENT = 'plotmapai:debug:show-ios-install-hint';
export const DEBUG_SHOW_UPDATE_TOAST_EVENT = 'plotmapai:debug:show-update-toast';
export const DEBUG_RESET_PWA_PROMPTS_EVENT = 'plotmapai:debug:reset-pwa-prompts';
export const DEBUG_RETRY_READER_RESTORE_EVENT = 'plotmapai:debug:retry-reader-restore';

export interface DebugPwaTools {
  showInstallPrompt: () => void;
  showIosInstallHint: () => void;
  showUpdateToast: () => void;
  resetPwaPrompts: () => void;
  retryReaderRestore: () => void;
}

function dispatchDebugEvent(eventName: string, message: string): void {
  if (!isDebugMode() || typeof window === 'undefined') {
    return;
  }

  debugLog('PWA', message);
  window.dispatchEvent(new CustomEvent(eventName));
}

export function triggerDebugInstallPrompt(): void {
  dispatchDebugEvent(DEBUG_SHOW_INSTALL_PROMPT_EVENT, 'manual install prompt triggered');
}

export function triggerDebugIosInstallHint(): void {
  dispatchDebugEvent(DEBUG_SHOW_IOS_INSTALL_HINT_EVENT, 'manual iOS install hint triggered');
}

export function triggerDebugUpdateToast(): void {
  dispatchDebugEvent(DEBUG_SHOW_UPDATE_TOAST_EVENT, 'manual update toast triggered');
}

export function triggerDebugResetPwaPrompts(): void {
  dispatchDebugEvent(DEBUG_RESET_PWA_PROMPTS_EVENT, 'manual PWA prompt reset triggered');
}

export function triggerDebugRetryReaderRestore(): void {
  dispatchDebugEvent(DEBUG_RETRY_READER_RESTORE_EVENT, 'manual reader restore retry triggered');
}

export function registerPwaDebugTools(): () => void {
  if (!isDebugMode() || typeof window === 'undefined') {
    return () => undefined;
  }

  const tools: DebugPwaTools = {
    showInstallPrompt: triggerDebugInstallPrompt,
    showIosInstallHint: triggerDebugIosInstallHint,
    showUpdateToast: triggerDebugUpdateToast,
    resetPwaPrompts: triggerDebugResetPwaPrompts,
    retryReaderRestore: triggerDebugRetryReaderRestore,
  };

  window.PlotMapAIDebug = tools;
  debugLog('PWA', 'window.PlotMapAIDebug registered');

  return () => {
    if (window.PlotMapAIDebug === tools) {
      delete window.PlotMapAIDebug;
    }
  };
}
