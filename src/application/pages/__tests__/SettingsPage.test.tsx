import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import SettingsPage from '../settings';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { version?: string }) => (
      options?.version ? `${key} ${options.version}` : key
    ),
  }),
}));

vi.mock('@domains/settings', () => ({
  AiSettingsPanel: () => <div>ai-panel</div>,
  PurificationSettingsPanel: () => <div>purification-panel</div>,
  SettingsTabBar: ({
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
  useAiSettingsManager: () => ({ kind: 'ai' }),
  TocSettingsPanel: () => <div>toc-panel</div>,
  usePurificationSettingsManager: () => ({ kind: 'purification' }),
  useTocSettingsManager: () => ({ kind: 'toc' }),
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
