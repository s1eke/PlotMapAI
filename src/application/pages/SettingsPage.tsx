import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import AiSettingsPanel from '@domains/settings/components/settings/AiSettingsPanel';
import PurificationSettingsPanel from '@domains/settings/components/settings/PurificationSettingsPanel';
import SettingsTabBar from '@domains/settings/components/settings/SettingsTabBar';
import TocSettingsPanel from '@domains/settings/components/settings/TocSettingsPanel';
import { usePurificationSettingsManager } from '@domains/settings/hooks/usePurificationSettingsManager';
import { useTocSettingsManager } from '@domains/settings/hooks/useTocSettingsManager';
import type { SettingsTabId } from '@domains/settings/utils/settingsPage';

import { useAiSettingsManager } from '../hooks/useAiSettingsManager';

export default function SettingsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTabId>('toc');
  const appVersion = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';

  const tocManager = useTocSettingsManager();
  const purificationManager = usePurificationSettingsManager();
  const aiManager = useAiSettingsManager();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col p-4 sm:p-6">
      <div className="mb-6 space-y-2 sm:mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">{t('settings.title')}</h1>
        <p className="max-w-3xl text-sm leading-6 text-text-secondary sm:text-base">
          {t('settings.subtitle')}
        </p>
      </div>

      <div className="mb-8">
        <SettingsTabBar
          activeTab={activeTab}
          onChange={setActiveTab}
          items={[
            { id: 'toc', label: t('settings.tocRules') },
            { id: 'purification', label: t('settings.purificationRules') },
            { id: 'ai', label: t('settings.ai.tab') },
          ]}
        />
      </div>

      <div className="glass flex-1 rounded-2xl border border-white/5 p-4 shadow-sm sm:p-6 md:p-8">
        {activeTab === 'toc' && <TocSettingsPanel manager={tocManager} />}
        {activeTab === 'purification' && <PurificationSettingsPanel manager={purificationManager} />}
        {activeTab === 'ai' && <AiSettingsPanel manager={aiManager} />}
      </div>

      {appVersion ? (
        <p className="mt-6 text-center text-xs text-text-secondary sm:text-right">
          {t('settings.versionLabel', { version: appVersion })}
        </p>
      ) : null}
    </div>
  );
}
