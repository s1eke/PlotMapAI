export {
  DEBUG_RESET_PWA_PROMPTS_EVENT,
  DEBUG_RETRY_READER_RESTORE_EVENT,
  DEBUG_SHOW_INSTALL_PROMPT_EVENT,
  DEBUG_SHOW_IOS_INSTALL_HINT_EVENT,
  DEBUG_SHOW_UPDATE_TOAST_EVENT,
  registerPwaDebugTools,
  triggerDebugInstallPrompt,
  triggerDebugIosInstallHint,
  triggerDebugResetPwaPrompts,
  triggerDebugRetryReaderRestore,
  triggerDebugUpdateToast,
} from '@shared/pwa/pwaDebugTools';

export type { DebugPwaTools } from '@shared/pwa/pwaDebugTools';
