import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import SettingsPage from '../SettingsPage';
import { settingsApi } from '../../api/settings';

const i18nMock = vi.hoisted(() => ({
  t: (key: string) => key,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: i18nMock.t }),
}));

vi.mock('../../api/settings', () => ({
  settingsApi: {
    getTocRules: vi.fn(),
    createTocRule: vi.fn(),
    updateTocRule: vi.fn(),
    deleteTocRule: vi.fn(),
    uploadTocRulesYaml: vi.fn(),
    exportTocRulesYaml: vi.fn(),
    getPurificationRules: vi.fn(),
    createPurificationRule: vi.fn(),
    updatePurificationRule: vi.fn(),
    deletePurificationRule: vi.fn(),
    clearAllPurificationRules: vi.fn(),
    uploadPurificationRulesYaml: vi.fn(),
    exportPurificationRulesYaml: vi.fn(),
    getAiProviderSettings: vi.fn(),
    updateAiProviderSettings: vi.fn(),
    testAiProviderSettings: vi.fn(),
    exportAiConfig: vi.fn(),
    importAiConfig: vi.fn(),
  },
}));

const tocRules = [
  {
    id: 1,
    name: 'TOC Rule',
    rule: '^Chapter',
    example: 'Chapter 1',
    priority: 10,
    isEnabled: true,
    isDefault: false,
  },
];

const purificationRules = [
  {
    id: 2,
    name: 'Cleanup',
    group: 'General',
    pattern: 'foo',
    replacement: 'bar',
    isRegex: false,
    isEnabled: true,
    order: 2,
    scopeTitle: true,
    scopeContent: true,
    bookScope: '',
    excludeBookScope: '',
    timeoutMs: 3000,
  },
];

const aiSettings = {
  apiBaseUrl: 'https://api.example.com/v1',
  modelName: 'gpt-4.1-mini',
  contextSize: 32000,
  hasApiKey: true,
  maskedApiKey: 'sk-****',
  updatedAt: null,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(settingsApi.getTocRules).mockResolvedValue(tocRules);
    vi.mocked(settingsApi.createTocRule).mockResolvedValue(tocRules[0]);
    vi.mocked(settingsApi.updateTocRule).mockResolvedValue({ ...tocRules[0], isEnabled: false });
    vi.mocked(settingsApi.deleteTocRule).mockResolvedValue({ message: 'deleted' });
    vi.mocked(settingsApi.exportTocRulesYaml).mockResolvedValue('name: TOC Rule');
    vi.mocked(settingsApi.uploadTocRulesYaml).mockResolvedValue(tocRules);
    vi.mocked(settingsApi.getPurificationRules).mockResolvedValue(purificationRules);
    vi.mocked(settingsApi.createPurificationRule).mockResolvedValue(purificationRules[0]);
    vi.mocked(settingsApi.updatePurificationRule).mockResolvedValue(purificationRules[0]);
    vi.mocked(settingsApi.deletePurificationRule).mockResolvedValue({ message: 'deleted' });
    vi.mocked(settingsApi.exportPurificationRulesYaml).mockResolvedValue('name: Cleanup');
    vi.mocked(settingsApi.uploadPurificationRulesYaml).mockResolvedValue(purificationRules);
    vi.mocked(settingsApi.clearAllPurificationRules).mockResolvedValue({ message: 'cleared' });
    vi.mocked(settingsApi.getAiProviderSettings).mockResolvedValue(aiSettings);
    vi.mocked(settingsApi.updateAiProviderSettings).mockResolvedValue(aiSettings);
    vi.mocked(settingsApi.testAiProviderSettings).mockResolvedValue({ message: 'Connection ok', preview: 'pong' });
    vi.mocked(settingsApi.exportAiConfig).mockResolvedValue('encrypted-config');
    vi.mocked(settingsApi.importAiConfig).mockResolvedValue();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('switches between TOC, purification, and AI tabs', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('settings.toc.title')).toBeInTheDocument();
    expect(settingsApi.getTocRules).toHaveBeenCalledTimes(1);
    expect(settingsApi.getPurificationRules).toHaveBeenCalledTimes(1);
    expect(settingsApi.getAiProviderSettings).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'settings.purificationRules' }));
    expect(await screen.findByText('settings.purification.title')).toBeInTheDocument();
    expect(screen.getByText('Cleanup')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'settings.ai.tab' }));
    expect(await screen.findByText('settings.ai.title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'settings.ai.saveButton' })).toBeInTheDocument();
    expect(screen.queryByText('settings.ai.statusTitle')).not.toBeInTheDocument();
    expect(screen.queryByText('settings.ai.backupTitle')).not.toBeInTheDocument();
  });

  it('rolls back a TOC toggle when the update fails and shows inline feedback', async () => {
    vi.mocked(settingsApi.updateTocRule).mockRejectedValueOnce(new Error('toggle failed'));
    const user = userEvent.setup();

    renderPage();

    const toggle = await screen.findByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await user.click(toggle);

    await waitFor(() => {
      expect(settingsApi.updateTocRule).toHaveBeenCalledWith(1, { isEnabled: false });
    });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(await screen.findByRole('alert')).toHaveTextContent('settings.common.updateFailed');
  });

  it('exports and uploads TOC rules through the toolbar actions and refreshes feedback', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    expect(await screen.findByText('settings.toc.title')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'settings.common.moreActions' }));
    await user.click(screen.getByRole('menuitem', { name: 'settings.common.export' }));
    expect(settingsApi.exportTocRulesYaml).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('settings.common.exportSuccess')).toBeInTheDocument();

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['name: Imported'], 'toc-rules.yaml', { type: 'text/yaml' });
    await user.upload(input, file);

    await waitFor(() => {
      expect(settingsApi.uploadTocRulesYaml).toHaveBeenCalledWith(file);
    });
    expect(await screen.findByText('settings.common.importSuccess')).toBeInTheDocument();
    expect(screen.queryByText('settings.common.exportSuccess')).not.toBeInTheDocument();
  });

  it('asks for confirmation before deleting a TOC rule', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('TOC Rule')).toBeInTheDocument();
    await user.click(screen.getByTitle('Delete'));

    expect(screen.getByText('settings.toc.deleteConfirm')).toBeInTheDocument();
    expect(settingsApi.deleteTocRule).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'common.actions.delete' }));

    await waitFor(() => {
      expect(settingsApi.deleteTocRule).toHaveBeenCalledWith(1);
    });
    expect(await screen.findByText('settings.common.deleteSuccess')).toBeInTheDocument();
  });

  it('shows empty states with actions for TOC and purification tabs', async () => {
    vi.mocked(settingsApi.getTocRules).mockResolvedValueOnce([]);
    vi.mocked(settingsApi.getPurificationRules).mockResolvedValueOnce([]);
    const user = userEvent.setup();

    renderPage();

    expect(await screen.findByText('settings.toc.emptyTitle')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'settings.toc.addRule' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'settings.purificationRules' }));

    expect(await screen.findByText('settings.purification.emptyTitle')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'settings.purification.addRule' })).toBeInTheDocument();
  });

  it('opens the TOC and purification rule modals from the header actions', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'settings.toc.addRule' }));
    expect(await screen.findByRole('heading', { name: 'settings.toc.addRule' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'common.actions.cancel' }));

    await user.click(screen.getByRole('button', { name: 'settings.purificationRules' }));
    await user.click(await screen.findByRole('button', { name: 'settings.purification.addRule' }));
    expect(await screen.findByRole('heading', { name: 'settings.purification.addRule' })).toBeInTheDocument();
  });

  it('clears purification rules through a confirmation modal', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'settings.purificationRules' }));
    expect(await screen.findByText('settings.purification.title')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'settings.common.moreActions' }));
    await user.click(screen.getByRole('menuitem', { name: 'settings.purification.clearAll' }));
    expect(screen.getByText('settings.purification.clearAllConfirm')).toBeInTheDocument();

    const clearButtons = screen.getAllByRole('button', { name: 'settings.purification.clearAll' });
    await user.click(clearButtons[clearButtons.length - 1]);

    await waitFor(() => {
      expect(settingsApi.clearAllPurificationRules).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('settings.common.clearSuccess')).toBeInTheDocument();
  });

  it('saves AI settings and surfaces test-connection failures', async () => {
    vi.mocked(settingsApi.updateAiProviderSettings).mockResolvedValueOnce({
      ...aiSettings,
      apiBaseUrl: 'https://api.changed.example/v1',
      modelName: 'gpt-5-mini',
      contextSize: 64000,
      maskedApiKey: 'sk-new',
    });
    vi.mocked(settingsApi.testAiProviderSettings).mockRejectedValueOnce(new Error('connection failed'));
    const user = userEvent.setup();

    renderPage();

    await user.click(screen.getByRole('button', { name: 'settings.ai.tab' }));

    await user.clear(screen.getByLabelText('settings.ai.apiBaseUrlLabel'));
    await user.type(screen.getByLabelText('settings.ai.apiBaseUrlLabel'), 'https://api.changed.example/v1');
    await user.clear(screen.getByLabelText('settings.ai.modelNameLabel'));
    await user.type(screen.getByLabelText('settings.ai.modelNameLabel'), 'gpt-5-mini');
    await user.clear(screen.getByLabelText('settings.ai.contextSizeLabel'));
    await user.type(screen.getByLabelText('settings.ai.contextSizeLabel'), '64000');
    await user.type(screen.getByPlaceholderText('settings.ai.apiTokenPlaceholderKeep'), 'new-key');

    await user.click(screen.getByRole('button', { name: 'settings.ai.saveButton' }));

    await waitFor(() => {
      expect(settingsApi.updateAiProviderSettings).toHaveBeenCalledWith({
        apiBaseUrl: 'https://api.changed.example/v1',
        apiKey: 'new-key',
        modelName: 'gpt-5-mini',
        contextSize: 64000,
        keepExistingApiKey: false,
      });
    });
    expect(await screen.findByText('settings.ai.saveSuccess')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'settings.ai.testButton' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('connection failed');
  });

  it('exports AI config through the backup flow', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'settings.ai.tab' }));
    await user.click(screen.getByRole('button', { name: 'settings.common.moreActions' }));
    await user.click(screen.getByRole('menuitem', { name: 'settings.common.export' }));
    expect(await screen.findByText('settings.ai.exportTitle')).toBeInTheDocument();

    await user.type(screen.getByLabelText('settings.ai.passwordLabel'), 'safe-pass');
    await user.click(screen.getByRole('button', { name: 'settings.ai.exportButton' }));

    await waitFor(() => {
      expect(settingsApi.exportAiConfig).toHaveBeenCalledWith('safe-pass');
    });
    expect(await screen.findByText('settings.ai.exportSuccess')).toBeInTheDocument();
  });

  it('maps AI import errors inside the modal', async () => {
    vi.mocked(settingsApi.importAiConfig).mockRejectedValueOnce(new Error('Decryption failed'));
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.click(screen.getByRole('button', { name: 'settings.ai.tab' }));

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['encrypted'], 'plotmapai-ai-config.enc', { type: 'application/octet-stream' });
    await user.upload(input, file);

    expect(await screen.findByText('settings.ai.importTitle')).toBeInTheDocument();
    await user.type(screen.getByLabelText('settings.ai.passwordLabel'), 'safe-pass');
    await user.click(screen.getByRole('button', { name: 'settings.ai.importButton' }));

    await waitFor(() => {
      expect(settingsApi.importAiConfig).toHaveBeenCalledWith(file, 'safe-pass');
    });
    expect(await screen.findByText('settings.ai.errorDecryptFailed')).toBeInTheDocument();
  });
});
