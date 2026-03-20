import { Download, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEBUG_RESET_PWA_PROMPTS_EVENT,
  DEBUG_SHOW_INSTALL_PROMPT_EVENT,
  DEBUG_SHOW_IOS_INSTALL_HINT_EVENT,
  debugLog,
} from '../services/debug';

const INSTALL_PROMPT_DISMISS_KEY = 'plotmapai_install_prompt_dismissed_at';
const INSTALL_PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

function isStandaloneMode(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }

  return Boolean((navigator as NavigatorWithStandalone).standalone);
}

function isIosLikeDevice(): boolean {
  const userAgent = navigator.userAgent;

  return /iPad|iPhone|iPod/.test(userAgent) || (userAgent.includes('Mac') && 'ontouchend' in document);
}

function isInstallPromptDismissed(): boolean {
  const raw = localStorage.getItem(INSTALL_PROMPT_DISMISS_KEY);

  if (!raw) {
    return false;
  }

  const dismissedAt = Number(raw);

  if (!Number.isFinite(dismissedAt)) {
    localStorage.removeItem(INSTALL_PROMPT_DISMISS_KEY);
    return false;
  }

  if (Date.now() - dismissedAt < INSTALL_PROMPT_COOLDOWN_MS) {
    return true;
  }

  localStorage.removeItem(INSTALL_PROMPT_DISMISS_KEY);
  return false;
}

function rememberInstallPromptDismissal(): void {
  localStorage.setItem(INSTALL_PROMPT_DISMISS_KEY, String(Date.now()));
}

function clearInstallPromptDismissal(): void {
  localStorage.removeItem(INSTALL_PROMPT_DISMISS_KEY);
}

function createDebugInstallPromptEvent(): BeforeInstallPromptEvent {
  return {
    prompt: async () => {
      debugLog('PWA', 'debug install prompt action invoked');
    },
    userChoice: Promise.resolve({
      outcome: 'accepted',
      platform: 'debug',
    }),
  } as BeforeInstallPromptEvent;
}

export default function InstallPrompt() {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(() => !isStandaloneMode() && isIosLikeDevice() && !isInstallPromptDismissed());
  const [dismissed, setDismissed] = useState(() => isInstallPromptDismissed());

  useEffect(() => {
    if (isStandaloneMode()) {
      return undefined;
    }

    function handleBeforeInstallPrompt(event: Event): void {
      const installEvent = event as BeforeInstallPromptEvent;
      installEvent.preventDefault();
      setDeferredPrompt(installEvent);

      if (!isInstallPromptDismissed()) {
        setDismissed(false);
      }
    }

    function handleAppInstalled(): void {
      clearInstallPromptDismissal();
      setDeferredPrompt(null);
      setShowIosHint(false);
      setDismissed(true);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    function handleDebugShowInstallPrompt(): void {
      clearInstallPromptDismissal();
      setShowIosHint(false);
      setDeferredPrompt(createDebugInstallPromptEvent());
      setDismissed(false);
    }

    function handleDebugShowIosInstallHint(): void {
      clearInstallPromptDismissal();
      setDeferredPrompt(null);
      setShowIosHint(true);
      setDismissed(false);
    }

    function handleDebugReset(): void {
      clearInstallPromptDismissal();
      setDeferredPrompt(null);
      setShowIosHint(!isStandaloneMode() && isIosLikeDevice());
      setDismissed(false);
    }

    window.addEventListener(DEBUG_SHOW_INSTALL_PROMPT_EVENT, handleDebugShowInstallPrompt);
    window.addEventListener(DEBUG_SHOW_IOS_INSTALL_HINT_EVENT, handleDebugShowIosInstallHint);
    window.addEventListener(DEBUG_RESET_PWA_PROMPTS_EVENT, handleDebugReset);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener(DEBUG_SHOW_INSTALL_PROMPT_EVENT, handleDebugShowInstallPrompt);
      window.removeEventListener(DEBUG_SHOW_IOS_INSTALL_HINT_EVENT, handleDebugShowIosInstallHint);
      window.removeEventListener(DEBUG_RESET_PWA_PROMPTS_EVENT, handleDebugReset);
    };
  }, []);

  if (dismissed || (!deferredPrompt && !showIosHint)) {
    return null;
  }

  async function handleInstall(): Promise<void> {
    if (!deferredPrompt) {
      return;
    }

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice.catch(() => undefined);

    if (choice?.outcome === 'dismissed') {
      rememberInstallPromptDismissal();
    } else {
      clearInstallPromptDismissal();
    }

    setDeferredPrompt(null);
    setDismissed(true);
  }

  function handleDismiss(): void {
    rememberInstallPromptDismissal();
    setDismissed(true);
  }

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-6 z-50 flex justify-center">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-border-color/40 bg-bg-secondary/90 px-5 py-4 shadow-2xl backdrop-blur-xl dark:bg-brand-800/90">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            {deferredPrompt ? <Download className="h-5 w-5" /> : <Share2 className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-text-primary">
              {t('pwa.installTitle')}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              {deferredPrompt ? t('pwa.installDescription') : t('pwa.installIosHint')}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {deferredPrompt ? (
                <button
                  onClick={handleInstall}
                  className="cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover active:scale-95"
                >
                  {t('pwa.install')}
                </button>
              ) : null}
              <button
                onClick={handleDismiss}
                className="cursor-pointer rounded-lg border border-border-color bg-transparent px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-muted-bg"
              >
                {t('common.actions.close')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
