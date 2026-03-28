import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import AiSettingsPanel from '../components/settings/AiSettingsPanel';
import PurificationSettingsPanel from '../components/settings/PurificationSettingsPanel';
import SettingsTabBar from '../components/settings/SettingsTabBar';
import TocSettingsPanel from '../components/settings/TocSettingsPanel';
import { useAiSettingsManager } from '../hooks/useAiSettingsManager';
import { usePurificationSettingsManager } from '../hooks/usePurificationSettingsManager';
import { useTocSettingsManager } from '../hooks/useTocSettingsManager';
import type { SettingsTabId } from '../utils/settingsPage';

export default function SettingsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTabId>('toc');

  const tocManager = useTocSettingsManager();
  const purificationManager = usePurificationSettingsManager();
  const aiManager = useAiSettingsManager();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col p-4 sm:p-6">
      <div className="space-y-2 mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">{t('settings.title')}</h1>
        <p className="text-sm sm:text-base text-text-secondary max-w-3xl leading-6">
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

      <div className="flex-1 glass border border-white/5 shadow-sm rounded-2xl p-4 sm:p-6 md:p-8">
        {activeTab === 'toc' && <TocSettingsPanel manager={tocManager} />}
        {activeTab === 'purification' && <PurificationSettingsPanel manager={purificationManager} />}
        {activeTab === 'ai' && <AiSettingsPanel manager={aiManager} />}
      </div>
    </div>
  );
}
