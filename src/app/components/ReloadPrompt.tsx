import { Loader2, RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useTranslation } from 'react-i18next';
import { CACHE_KEYS, storage } from '@infra/storage';
import {
  DEBUG_RESET_PWA_PROMPTS_EVENT,
  DEBUG_SHOW_UPDATE_TOAST_EVENT,
  debugLog,
} from '../debug/service';

const UPDATE_PROMPT_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const TOAST_BACKDROP_TRANSITION = {
  duration: 0.18,
  ease: [0.22, 1, 0.36, 1],
} as const;
const TOAST_CARD_VARIANTS = {
  hidden: {
    opacity: 0,
    y: 18,
    scale: 0.98,
    transition: {
      duration: 0.2,
      ease: [0.32, 0.72, 0, 1],
    },
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 420,
      damping: 34,
      mass: 0.9,
    },
  },
} as const;
const STATUS_SWAP_VARIANTS = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0 },
} as const;

interface UpdatePromptDismissState {
  version: string;
  dismissedAt: number;
}

function isUpdatePromptDismissed(): boolean {
  const parsed = storage.cache.getJson<UpdatePromptDismissState>(CACHE_KEYS.updatePromptDismissed);
  if (!parsed) {
    return false;
  }

  if (
    parsed.version !== __APP_VERSION__ ||
    !Number.isFinite(parsed.dismissedAt) ||
    Date.now() - parsed.dismissedAt >= UPDATE_PROMPT_COOLDOWN_MS
  ) {
    storage.cache.remove(CACHE_KEYS.updatePromptDismissed);
    return false;
  }

  return true;
}

function rememberUpdatePromptDismissal(): void {
  const value: UpdatePromptDismissState = {
    version: __APP_VERSION__,
    dismissedAt: Date.now(),
  };

  storage.cache.set(CACHE_KEYS.updatePromptDismissed, value);
}

function clearUpdatePromptDismissal(): void {
  storage.cache.remove(CACHE_KEYS.updatePromptDismissed);
}

export default function ReloadPrompt() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => isUpdatePromptDismissed());
  const [isUpdating, setIsUpdating] = useState(false);
  const [debugNeedRefresh, setDebugNeedRefresh] = useState(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl: string, registration: ServiceWorkerRegistration | undefined) {
      if (registration) {
        setInterval(() => { registration.update(); }, 60 * 60 * 1000);
      }
    },
  });

  useEffect(() => {
    function handleDebugShowUpdateToast(): void {
      clearUpdatePromptDismissal();
      setDismissed(false);
      setIsUpdating(false);
      setDebugNeedRefresh(true);
    }

    function handleDebugReset(): void {
      clearUpdatePromptDismissal();
      setDismissed(false);
      setIsUpdating(false);
      setDebugNeedRefresh(false);
    }

    window.addEventListener(DEBUG_SHOW_UPDATE_TOAST_EVENT, handleDebugShowUpdateToast);
    window.addEventListener(DEBUG_RESET_PWA_PROMPTS_EVENT, handleDebugReset);

    return () => {
      window.removeEventListener(DEBUG_SHOW_UPDATE_TOAST_EVENT, handleDebugShowUpdateToast);
      window.removeEventListener(DEBUG_RESET_PWA_PROMPTS_EVENT, handleDebugReset);
    };
  }, []);

  const isVisible = (needRefresh || debugNeedRefresh) && !dismissed;

  async function handleUpdate(): Promise<void> {
    setIsUpdating(true);
    clearUpdatePromptDismissal();

    if (debugNeedRefresh && !needRefresh) {
      debugLog('PWA', 'debug update refresh simulated');
      await new Promise(resolve => window.setTimeout(resolve, 900));
      setDebugNeedRefresh(false);
      setDismissed(true);
      setIsUpdating(false);
      return;
    }

    try {
      await updateServiceWorker(true);
      setNeedRefresh(false);
      setDebugNeedRefresh(false);
      setDismissed(true);
      setIsUpdating(false);
    } catch {
      setIsUpdating(false);
    }
  }

  function handleDismiss(): void {
    rememberUpdatePromptDismissal();
    setDismissed(true);
    setDebugNeedRefresh(false);
    setNeedRefresh(false);
  }

  return (
    <AnimatePresence initial={false}>
      {isVisible ? (
        <div className="pointer-events-none fixed inset-x-4 bottom-6 z-50 flex justify-center sm:justify-end">
          <motion.div
            className="pointer-events-auto w-full max-w-sm rounded-2xl border border-border-color/40 bg-bg-secondary/92 px-5 py-4 shadow-2xl ring-1 ring-border-color/20 backdrop-blur-xl dark:bg-brand-800/92"
            variants={TOAST_CARD_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="hidden"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <AnimatePresence initial={false} mode="wait">
                  {isUpdating ? (
                    <motion.div
                      key="updating"
                      variants={STATUS_SWAP_VARIANTS}
                      initial="hidden"
                      animate="visible"
                      exit="hidden"
                      transition={TOAST_BACKDROP_TRANSITION}
                    >
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="refresh"
                      variants={STATUS_SWAP_VARIANTS}
                      initial="hidden"
                      animate="visible"
                      exit="hidden"
                      transition={TOAST_BACKDROP_TRANSITION}
                    >
                      <RefreshCw className="h-5 w-5" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-text-primary">
                      {t('pwa.updateAvailable')}
                    </h2>
                    <p className="mt-1 text-sm text-text-secondary">
                      {t('pwa.updateDescription')}
                    </p>
                  </div>

                  <button
                    onClick={handleDismiss}
                    className="cursor-pointer rounded-lg p-1 text-text-secondary transition-colors hover:bg-muted-bg hover:text-text-primary"
                    aria-label={t('common.actions.close')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={handleUpdate}
                    disabled={isUpdating}
                    className="cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover active:scale-95 disabled:cursor-wait disabled:opacity-70 disabled:active:scale-100"
                  >
                    <AnimatePresence initial={false} mode="wait">
                      <motion.span
                        key={isUpdating ? 'updating-label' : 'reload-label'}
                        className="inline-flex items-center justify-center"
                        variants={STATUS_SWAP_VARIANTS}
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                        transition={TOAST_BACKDROP_TRANSITION}
                      >
                        {isUpdating ? t('pwa.updating') : t('pwa.reload')}
                      </motion.span>
                    </AnimatePresence>
                  </button>

                  <button
                    onClick={handleDismiss}
                    className="cursor-pointer rounded-lg border border-border-color bg-transparent px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-muted-bg"
                  >
                    {t('pwa.later')}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
