import type { ReactElement } from 'react';

import { useTranslation } from 'react-i18next';

import {
  AiSettingsPanel,
  PurificationSettingsPanel,
  SettingsTabBar,
  TocSettingsPanel,
} from '@domains/settings';

import type { SettingsPageViewModel } from './types';

interface SettingsScreenProps {
  viewModel: SettingsPageViewModel;
}

export default function SettingsScreen({
  viewModel,
}: SettingsScreenProps): ReactElement {
  const { t } = useTranslation();

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
          activeTab={viewModel.activeTab}
          onChange={viewModel.setActiveTab}
          items={[
            { id: 'toc', label: t('settings.tocRules') },
            { id: 'purification', label: t('settings.purificationRules') },
            { id: 'ai', label: t('settings.ai.tab') },
          ]}
        />
      </div>

      <div className="glass flex-1 rounded-2xl border border-white/5 p-4 shadow-sm sm:p-6 md:p-8">
        {viewModel.activeTab === 'toc' && <TocSettingsPanel manager={viewModel.tocManager} />}
        {viewModel.activeTab === 'purification' && (
          <PurificationSettingsPanel manager={viewModel.purificationManager} />
        )}
        {viewModel.activeTab === 'ai' && <AiSettingsPanel manager={viewModel.aiManager} />}
      </div>

      {viewModel.appVersion ? (
        <p className="mt-6 text-center text-xs text-text-secondary sm:text-right">
          {t('settings.versionLabel', { version: viewModel.appVersion })}
        </p>
      ) : null}
    </div>
  );
}
