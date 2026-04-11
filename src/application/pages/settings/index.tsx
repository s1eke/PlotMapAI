import type { ReactElement } from 'react';

import SettingsScreen from './SettingsScreen';
import { useSettingsPageViewModel } from './useSettingsPageViewModel';

export default function SettingsPage(): ReactElement {
  const viewModel = useSettingsPageViewModel();

  return <SettingsScreen viewModel={viewModel} />;
}
