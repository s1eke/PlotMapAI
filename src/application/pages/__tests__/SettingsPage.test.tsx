import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import SettingsPage from '../SettingsPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { version?: string }) => (
      options?.version ? `${key} ${options.version}` : key
    ),
  }),
}));

vi.mock('@domains/settings/hooks/useTocSettingsManager', () => ({
  useTocSettingsManager: () => ({ kind: 'toc' }),
}));

vi.mock('@domains/settings/hooks/usePurificationSettingsManager', () => ({
  usePurificationSettingsManager: () => ({ kind: 'purification' }),
}));

vi.mock('../../hooks/useAiSettingsManager', () => ({
  useAiSettingsManager: () => ({ kind: 'ai' }),
}));

vi.mock('@domains/settings/components/settings/SettingsTabBar', () => ({
  default: ({
    activeTab,
    items,
    onChange,
  }: {
    activeTab: string;
    items: Array<{ id: string; label: string }>;
    onChange: (nextTab: 'ai' | 'purification' | 'toc') => void;
  }) => (
    <div>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={item.id === activeTab}
          onClick={() => onChange(item.id as 'ai' | 'purification' | 'toc')}
        >
          {item.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@domains/settings/components/settings/TocSettingsPanel', () => ({
  default: () => <div>toc-panel</div>,
}));

vi.mock('@domains/settings/components/settings/PurificationSettingsPanel', () => ({
  default: () => <div>purification-panel</div>,
}));

vi.mock('@domains/settings/components/settings/AiSettingsPanel', () => ({
  default: () => <div>ai-panel</div>,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

describe('application SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('__APP_VERSION__', '1.1.0-test');
  });

  it('switches between the application-owned settings tabs', async () => {
    const user = userEvent.setup();

    renderPage();

    expect(screen.getByText('toc-panel')).toBeInTheDocument();
    expect(screen.getByText('settings.versionLabel 1.1.0-test')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'settings.purificationRules' }));
    expect(screen.getByText('purification-panel')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'settings.ai.tab' }));
    expect(screen.getByText('ai-panel')).toBeInTheDocument();
  });
});
