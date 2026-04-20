import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import DebugLauncher from './DebugLauncher';
import DebugWorkspace from './DebugWorkspace';
import {
  type DebugWorkspacePageId,
} from './debugPanelShared';
import { useDebugPanelState } from './useDebugPanelState';

export default function DebugPanel() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [activePage, setActivePage] = useState<DebugWorkspacePageId>('logs');
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const logListRef = useRef<HTMLDivElement | null>(null);
  const panelState = useDebugPanelState({
    activePage,
    isOpen,
    logListRef,
  });

  const handleOpen = useCallback(() => {
    setActivePage('logs');
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <>
      <DebugLauncher
        buttonRef={buttonRef}
        count={panelState.logCount}
        onOpen={handleOpen}
        title={t('debug.panelTitle')}
      />
      {isOpen && (
        <DebugWorkspace
          activeFlagCount={panelState.activeFlagCount}
          activePage={activePage}
          buttonRef={buttonRef}
          errorLogs={panelState.errorLogs}
          errorCount={panelState.errorCount}
          featureFlags={panelState.featureFlags}
          logCount={panelState.logCount}
          logListRef={logListRef}
          logs={panelState.logs}
          onChangePage={setActivePage}
          onClear={panelState.handleClear}
          onClose={handleClose}
          onLogScroll={panelState.handleLogScroll}
          orderedSnapshots={panelState.orderedSnapshots}
          snapshotCount={panelState.snapshotCount}
        />
      )}
    </>
  );
}
