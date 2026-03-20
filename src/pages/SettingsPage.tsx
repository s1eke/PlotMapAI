import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2, Lock, Plus, Save, Shield, Trash2, Upload, Wifi } from 'lucide-react';
import { settingsApi } from '../api/settings';
import type {
  AiProviderSettings,
  AiProviderSettingsPayload,
  PurificationRule,
  TocRule,
} from '../api/settings';
import Modal from '../components/Modal';
import PurificationRuleModal from '../components/PurificationRuleModal';
import RuleCard from '../components/RuleCard';
import TocRuleModal from '../components/TocRuleModal';

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'toc' | 'purification' | 'ai'>('toc');

  const [tocRules, setTocRules] = useState<TocRule[]>([]);
  const [isTocLoading, setIsTocLoading] = useState(false);
  const [isAddTocOpen, setIsAddTocOpen] = useState(false);
  const [editingTocRule, setEditingTocRule] = useState<TocRule | null>(null);

  const [purificationRules, setPurificationRules] = useState<PurificationRule[]>([]);
  const [isPurificationLoading, setIsPurificationLoading] = useState(false);
  const [isAddPurificationOpen, setIsAddPurificationOpen] = useState(false);
  const [editingPurificationRule, setEditingPurificationRule] = useState<PurificationRule | null>(null);
  const [isClearingPurification, setIsClearingPurification] = useState(false);
  const [isClearPurificationModalOpen, setIsClearPurificationModalOpen] = useState(false);

  const [aiSettings, setAiSettings] = useState<AiProviderSettings | null>(null);
  const [aiForm, setAiForm] = useState<AiProviderSettingsPayload>({
    apiBaseUrl: '',
    apiKey: '',
    modelName: '',
    contextSize: 32000,
    keepExistingApiKey: true,
  });
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isAiSaving, setIsAiSaving] = useState(false);
  const [isAiTesting, setIsAiTesting] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [isExportAiOpen, setIsExportAiOpen] = useState(false);
  const [isImportAiOpen, setIsImportAiOpen] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [isExportingAi, setIsExportingAi] = useState(false);
  const [isImportingAi, setIsImportingAi] = useState(false);
  const [exportAiMsg, setExportAiMsg] = useState<string | null>(null);
  const [importAiMsg, setImportAiMsg] = useState<string | null>(null);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const tocInputRef = useRef<HTMLInputElement>(null);
  const aiFileRef = useRef<HTMLInputElement>(null);

  const fetchTocRules = async () => {
    setIsTocLoading(true);
    try {
      const data = await settingsApi.getTocRules();
      setTocRules(data);
    } catch (err) {
      console.error('Failed to load TOC rules', err);
    } finally {
      setIsTocLoading(false);
    }
  };

  const fetchPurificationRules = async () => {
    setIsPurificationLoading(true);
    try {
      const data = await settingsApi.getPurificationRules();
      setPurificationRules(data);
    } catch (err) {
      console.error('Failed to load purification rules', err);
    } finally {
      setIsPurificationLoading(false);
    }
  };

  const syncAiForm = (data: AiProviderSettings) => {
    setAiForm({
      apiBaseUrl: data.apiBaseUrl,
      apiKey: '',
      modelName: data.modelName,
      contextSize: data.contextSize,
      keepExistingApiKey: data.hasApiKey,
    });
  };

  const fetchAiSettings = async () => {
    setIsAiLoading(true);
    try {
      const data = await settingsApi.getAiProviderSettings();
      setAiSettings(data);
      syncAiForm(data);
    } catch (err) {
      console.error('Failed to load AI settings', err);
      setAiMessage(t('settings.ai.loadFailed'));
    } finally {
      setIsAiLoading(false);
    }
  };

  useEffect(() => {
    fetchTocRules();
    fetchPurificationRules();
    fetchAiSettings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveTocRule = async (data: Partial<TocRule>) => {
    try {
      if (editingTocRule) {
        await settingsApi.updateTocRule(editingTocRule.id, data);
      } else {
        await settingsApi.createTocRule(data as Omit<TocRule, 'id' | 'isDefault'>);
      }
      await fetchTocRules();
    } catch {
      alert(t('settings.common.updateFailed'));
    }
  };

  const handleToggleTocRule = async (id: number, isEnabled: boolean) => {
    setTocRules((prev) => prev.map((rule) => (rule.id === id ? { ...rule, isEnabled } : rule)));
    try {
      await settingsApi.updateTocRule(id, { isEnabled });
    } catch {
      setTocRules((prev) => prev.map((rule) => (rule.id === id ? { ...rule, isEnabled: !isEnabled } : rule)));
      alert(t('settings.common.updateFailed'));
    }
  };

  const handleDeleteTocRule = async (id: number) => {
    if (!confirm(t('settings.toc.deleteConfirm') || 'Are you sure you want to delete this rule?')) return;
    try {
      await settingsApi.deleteTocRule(id);
      setTocRules((prev) => prev.filter((rule) => rule.id !== id));
    } catch {
      alert(t('settings.common.deleteFailed'));
    }
  };

  const handleUploadTocYaml = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) return;
    const file = event.target.files[0];
    setIsTocLoading(true);
    try {
      await settingsApi.uploadTocRulesYaml(file);
      await fetchTocRules();
    } catch (err) {
      alert(`${t('settings.common.uploadFailed')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsTocLoading(false);
      if (tocInputRef.current) tocInputRef.current.value = '';
    }
  };

  const handleExportTocYaml = async () => {
    try {
      const content = await settingsApi.exportTocRulesYaml();
      downloadFile(content, 'toc-rules.yaml', 'text/yaml');
    } catch (err) {
      alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSavePurificationRule = async (data: Partial<PurificationRule>) => {
    try {
      if (editingPurificationRule) {
        await settingsApi.updatePurificationRule(editingPurificationRule.id, data);
      } else {
        await settingsApi.createPurificationRule(data);
      }
      await fetchPurificationRules();
    } catch {
      alert(t('settings.common.updateFailed'));
    }
  };

  const handleTogglePurificationRule = async (id: number, isEnabled: boolean) => {
    setPurificationRules((prev) => prev.map((rule) => (rule.id === id ? { ...rule, isEnabled } : rule)));
    try {
      await settingsApi.updatePurificationRule(id, { isEnabled });
    } catch {
      setPurificationRules((prev) => prev.map((rule) => (rule.id === id ? { ...rule, isEnabled: !isEnabled } : rule)));
      alert(t('settings.common.updateFailed'));
    }
  };

  const handleDeletePurificationRule = async (id: number) => {
    if (!confirm(t('settings.purification.deleteConfirm'))) return;
    try {
      await settingsApi.deletePurificationRule(id);
      setPurificationRules((prev) => prev.filter((rule) => rule.id !== id));
    } catch {
      alert(t('settings.common.deleteFailed'));
    }
  };

  const handleClearPurificationRules = async () => {
    setIsClearingPurification(true);
    try {
      await settingsApi.clearAllPurificationRules();
      setPurificationRules([]);
    } catch {
      alert(t('settings.common.deleteFailed'));
    } finally {
      setIsClearingPurification(false);
      setIsClearPurificationModalOpen(false);
    }
  };

  const handleUploadPurificationYaml = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) return;
    const file = event.target.files[0];
    setIsPurificationLoading(true);
    try {
      await settingsApi.uploadPurificationRulesYaml(file);
      await fetchPurificationRules();
    } catch (err) {
      alert(`${t('settings.common.uploadFailed')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsPurificationLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExportPurificationYaml = async () => {
    try {
      const content = await settingsApi.exportPurificationRulesYaml();
      downloadFile(content, 'purification-rules.yaml', 'text/yaml');
    } catch (err) {
      alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleAiFieldChange = <K extends keyof AiProviderSettingsPayload>(key: K, value: AiProviderSettingsPayload[K]) => {
    setAiMessage(null);
    setAiForm((prev) => ({ ...prev, [key]: value }));
  };

  const buildAiPayload = (): AiProviderSettingsPayload => {
    const apiKey = aiForm.apiKey?.trim() ?? '';

    return {
      apiBaseUrl: aiForm.apiBaseUrl.trim(),
      apiKey,
      modelName: aiForm.modelName.trim(),
      contextSize: Number(aiForm.contextSize),
      keepExistingApiKey: apiKey ? false : Boolean(aiSettings?.hasApiKey),
    };
  };

  const handleSaveAiSettings = async () => {
    setIsAiSaving(true);
    setAiMessage(null);
    try {
      const data = await settingsApi.updateAiProviderSettings(buildAiPayload());
      setAiSettings(data);
      syncAiForm(data);
      setAiMessage(t('settings.ai.saveSuccess'));
    } catch (err) {
      setAiMessage(err instanceof Error ? err.message : t('settings.ai.saveFailed'));
    } finally {
      setIsAiSaving(false);
    }
  };

  const handleTestAiSettings = async () => {
    setIsAiTesting(true);
    setAiMessage(null);
    try {
      const result = await settingsApi.testAiProviderSettings(buildAiPayload());
      setAiMessage(`${result.message} ${result.preview ? t('settings.ai.testPreviewPrefix', { preview: result.preview }) : ''}`.trim());
    } catch (err) {
      setAiMessage(err instanceof Error ? err.message : t('settings.ai.testFailed'));
    } finally {
      setIsAiTesting(false);
    }
  };

  const handleExportAiConfig = async () => {
    if (exportPassword.length < 4) return;
    setIsExportingAi(true);
    setExportAiMsg(null);
    try {
      const content = await settingsApi.exportAiConfig(exportPassword);
      downloadFile(content, 'plotmapai-ai-config.enc', 'application/octet-stream');
      setExportAiMsg(t('settings.ai.exportSuccess'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setExportAiMsg(
        msg.includes('No AI config') ? t('settings.ai.errorNoConfig') :
        msg.includes('at least 4') ? t('settings.ai.errorPasswordShort') :
        t('settings.ai.errorExport'),
      );
    } finally {
      setIsExportingAi(false);
    }
  };

  const handleAiFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) return;
    setPendingImportFile(event.target.files[0]);
    setImportPassword('');
    setImportAiMsg(null);
    setIsImportAiOpen(true);
    if (aiFileRef.current) aiFileRef.current.value = '';
  };

  const handleConfirmImportAi = async () => {
    if (!pendingImportFile || importPassword.length < 4) return;
    setIsImportingAi(true);
    setImportAiMsg(null);
    try {
      await settingsApi.importAiConfig(pendingImportFile, importPassword);
      setIsImportAiOpen(false);
      setImportPassword('');
      setPendingImportFile(null);
      setAiMessage(t('settings.ai.importSuccess'));
      await fetchAiSettings();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setImportAiMsg(
        msg.includes('Password is required') ? t('settings.ai.errorPasswordRequired') :
        msg.includes('Invalid config file format') ? t('settings.ai.errorFileFormat') :
        msg.includes('Invalid config file structure') ? t('settings.ai.errorFileStructure') :
        msg.includes('Decryption failed') ? t('settings.ai.errorDecryptFailed') :
        msg.includes('not valid JSON') ? t('settings.ai.errorInvalidJson') :
        msg.includes('missing required fields') ? t('settings.ai.errorMissingFields') :
        t('settings.ai.errorImport'),
      );
    } finally {
      setIsImportingAi(false);
    }
  };

  const groupedPurificationRules = purificationRules.reduce((acc: Record<string, PurificationRule[]>, rule) => {
    const groupName = rule.group || t('settings.purification.ungrouped');
    if (!acc[groupName]) acc[groupName] = [];
    acc[groupName].push(rule);
    return acc;
  }, {} as Record<string, PurificationRule[]>);

  return (
    <div className="flex-1 flex flex-col p-6 max-w-5xl mx-auto w-full">
      <h1 className="text-3xl font-bold text-text-primary tracking-tight mb-8">{t('settings.title')}</h1>

      <div className="flex flex-wrap space-x-1 glass p-1 rounded-xl mb-8 w-fit shrink-0 gap-2">
        <button
          onClick={() => setActiveTab('toc')}
          className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'toc'
            ? 'bg-brand-700 shadow text-white'
            : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
          }`}
        >
          {t('settings.tocRules')}
        </button>
        <button
          onClick={() => setActiveTab('purification')}
          className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'purification'
            ? 'bg-brand-700 shadow text-white'
            : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
          }`}
        >
          {t('settings.purificationRules')}
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'ai'
            ? 'bg-brand-700 shadow text-white'
            : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
          }`}
        >
          {t('settings.ai.tab')}
        </button>
      </div>

      <div className="flex-1 glass border border-white/5 shadow-sm rounded-2xl p-6 md:p-8">
        {activeTab === 'toc' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-text-primary">{t('settings.toc.title')}</h2>
                <p className="text-text-secondary text-sm mt-1">{t('settings.toc.subtitle')}</p>
              </div>
              <div className="shrink-0 flex items-center gap-3">
                <input
                  type="file"
                  ref={tocInputRef}
                  onChange={handleUploadTocYaml}
                  accept=".yaml,.yml"
                  className="hidden"
                />
                <button
                  onClick={() => tocInputRef.current?.click()}
                  className="px-4 py-2 border border-white/10 rounded-lg hover:bg-white/5 text-text-primary transition-colors flex items-center gap-2 text-sm"
                >
                  <Upload className="w-4 h-4" /> {t('settings.common.import')}
                </button>
                <button
                  onClick={handleExportTocYaml}
                  className="px-4 py-2 border border-white/10 rounded-lg hover:bg-white/5 text-text-primary transition-colors flex items-center gap-2 text-sm"
                >
                  <Download className="w-4 h-4" /> {t('settings.common.export')}
                </button>
                <button
                  onClick={() => {
                    setEditingTocRule(null);
                    setIsAddTocOpen(true);
                  }}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                >
                  <Plus className="w-4 h-4" /> {t('settings.toc.addRule')}
                </button>
              </div>
            </div>

            {isTocLoading ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
            ) : (
              <div className="space-y-8">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-text-primary border-l-4 border-accent pl-3 flex items-center gap-2">
                    {t('settings.tocRules')}
                    <span className="text-xs font-normal text-text-secondary bg-white/5 px-2 py-0.5 rounded-full">{tocRules.length}</span>
                  </h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {tocRules.map((rule) => (
                      <RuleCard
                        key={rule.id}
                        name={rule.name}
                        pattern={rule.rule}
                        isEnabled={rule.isEnabled}
                        priority={rule.priority}
                        isDefault={rule.isDefault}
                        isCustom={!rule.isDefault}
                        onToggle={(checked) => handleToggleTocRule(rule.id, checked)}
                        onEdit={() => {
                          setEditingTocRule(rule);
                          setIsAddTocOpen(true);
                        }}
                        onDelete={() => handleDeleteTocRule(rule.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'purification' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-text-primary">{t('settings.purification.title')}</h2>
                <p className="text-text-secondary text-sm mt-1">{t('settings.purification.subtitle')}</p>
              </div>
              <div className="shrink-0 flex items-center gap-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleUploadPurificationYaml}
                  accept=".yaml,.yml"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 border border-white/10 rounded-lg hover:bg-white/5 text-text-primary transition-colors flex items-center gap-2 text-sm"
                >
                  <Upload className="w-4 h-4" /> {t('settings.common.import')}
                </button>
                <button
                  onClick={handleExportPurificationYaml}
                  className="px-4 py-2 border border-white/10 rounded-lg hover:bg-white/5 text-text-primary transition-colors flex items-center gap-2 text-sm"
                >
                  <Download className="w-4 h-4" /> {t('settings.common.export')}
                </button>
                <button
                  onClick={() => {
                    setEditingPurificationRule(null);
                    setIsAddPurificationOpen(true);
                  }}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                >
                  <Plus className="w-4 h-4" /> {t('settings.purification.addRule')}
                </button>
                {purificationRules.length > 0 && (
                  <button
                    onClick={() => setIsClearPurificationModalOpen(true)}
                    className="px-4 py-2 border border-red-500/30 hover:bg-red-500/10 text-red-400 rounded-lg transition-colors flex items-center gap-2 text-sm"
                  >
                    <Trash2 className="w-4 h-4" /> {t('settings.purification.clearAll')}
                  </button>
                )}
              </div>
            </div>

            {isPurificationLoading ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
            ) : Object.keys(groupedPurificationRules).length === 0 ? (
              <div className="py-12 text-center text-text-secondary border border-dashed border-white/10 rounded-xl">
                {t('settings.purification.noRules')}
              </div>
            ) : (
              <div className="space-y-8">
                {Object.entries(groupedPurificationRules).map(([group, rules]) => (
                  <div key={group} className="space-y-4">
                    <h3 className="text-lg font-semibold text-text-primary border-l-4 border-accent pl-3 flex items-center gap-2">
                      {group}
                      <span className="text-xs font-normal text-text-secondary bg-white/5 px-2 py-0.5 rounded-full">{rules.length}</span>
                    </h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {rules.map((rule) => (
                        <RuleCard
                          key={rule.id}
                          name={rule.name}
                          pattern={rule.pattern}
                          isEnabled={rule.isEnabled}
                          priority={rule.order}
                          type={rule.isRegex ? 'regex' : 'text'}
                          scopes={[
                            rule.scopeTitle ? 'Title' : '',
                            rule.scopeContent ? 'Content' : '',
                          ].filter(Boolean)}
                          onToggle={(checked) => handleTogglePurificationRule(rule.id, checked)}
                          onEdit={() => {
                            setEditingPurificationRule(rule);
                            setIsAddPurificationOpen(true);
                          }}
                          onDelete={() => handleDeletePurificationRule(rule.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-text-primary">{t('settings.ai.title')}</h2>
                <p className="text-sm text-text-secondary mt-1">{t('settings.ai.subtitle')}</p>
              </div>
              <div className="shrink-0 flex items-center gap-3">
                <input
                  type="file"
                  ref={aiFileRef}
                  onChange={handleAiFileSelected}
                  accept=".enc,.json"
                  className="hidden"
                />
                <button
                  onClick={() => aiFileRef.current?.click()}
                  className="px-4 py-2 border border-white/10 rounded-lg hover:bg-white/5 text-text-primary transition-colors flex items-center gap-2 text-sm"
                >
                  <Upload className="w-4 h-4" /> {t('settings.common.import')}
                </button>
                <button
                  onClick={() => { setExportPassword(''); setExportAiMsg(null); setIsExportAiOpen(true); }}
                  disabled={!aiSettings?.hasApiKey}
                  className="px-4 py-2 border border-white/10 rounded-lg hover:bg-white/5 text-text-primary transition-colors flex items-center gap-2 text-sm disabled:opacity-40"
                  title={!aiSettings?.hasApiKey ? t('settings.ai.apiTokenPlaceholderEmpty') : ''}
                >
                  <Download className="w-4 h-4" /> {t('settings.common.export')}
                </button>
              </div>
            </div>

            {isAiLoading ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-2xl border border-border-color/20 bg-muted-bg/40 p-5">
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-accent mt-0.5" />
                    <div className="space-y-2 text-sm text-text-secondary leading-6">
                      <p>{t('settings.ai.securityTitle')}</p>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>{t('settings.ai.securityItem1')}</li>
                        <li>{t('settings.ai.securityItem2')}</li>
                        <li>{t('settings.ai.securityItem3')}</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-text-primary">{t('settings.ai.apiBaseUrlLabel')}</span>
                    <input
                      value={aiForm.apiBaseUrl}
                      onChange={(event) => handleAiFieldChange('apiBaseUrl', event.target.value)}
                      placeholder="https://api.openai.com/v1"
                      className="w-full rounded-xl border border-border-color/20 bg-muted-bg/50 px-4 py-3 text-text-primary outline-none focus:border-accent"
                    />
                  </label>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-text-primary">{t('settings.ai.modelNameLabel')}</span>
                      <input
                        value={aiForm.modelName}
                        onChange={(event) => handleAiFieldChange('modelName', event.target.value)}
                        placeholder="gpt-4.1-mini"
                        className="w-full rounded-xl border border-border-color/20 bg-muted-bg/50 px-4 py-3 text-text-primary outline-none focus:border-accent"
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-medium text-text-primary">{t('settings.ai.contextSizeLabel')}</span>
                      <input
                        type="number"
                        min={12000}
                        step={1000}
                        value={aiForm.contextSize}
                        onChange={(event) => handleAiFieldChange('contextSize', Number(event.target.value))}
                        className="w-full rounded-xl border border-border-color/20 bg-muted-bg/50 px-4 py-3 text-text-primary outline-none focus:border-accent"
                      />
                    </label>
                  </div>

                  <label className="space-y-2">
                    <span className="text-sm font-medium text-text-primary">{t('settings.ai.apiTokenLabel')}</span>
                    <input
                      type="password"
                      value={aiForm.apiKey}
                      onChange={(event) => handleAiFieldChange('apiKey', event.target.value)}
                      placeholder={aiSettings?.hasApiKey ? t('settings.ai.apiTokenPlaceholderKeep') : t('settings.ai.apiTokenPlaceholderEmpty')}
                      className="w-full rounded-xl border border-border-color/20 bg-muted-bg/50 px-4 py-3 text-text-primary outline-none focus:border-accent"
                    />
                    {aiSettings?.hasApiKey && (
                      <p className="text-xs text-text-secondary">{t('settings.ai.savedTokenLabel', { maskedApiKey: aiSettings.maskedApiKey })}</p>
                    )}
                  </label>
                </div>

                {aiMessage && (
                  <div className="rounded-xl border border-border-color/20 bg-muted-bg/40 px-4 py-3 text-sm text-text-secondary leading-6">
                    {aiMessage}
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleSaveAiSettings}
                    disabled={isAiSaving}
                    className="px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white transition-colors flex items-center gap-2 disabled:opacity-60"
                  >
                    {isAiSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {t('settings.ai.saveButton')}
                  </button>
                  <button
                    onClick={handleTestAiSettings}
                    disabled={isAiTesting}
                    className="px-4 py-2.5 rounded-xl border border-border-color/20 hover:bg-white/5 text-text-primary transition-colors flex items-center gap-2 disabled:opacity-60"
                  >
                    {isAiTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                    {t('settings.ai.testButton')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <TocRuleModal
        isOpen={isAddTocOpen}
        onClose={() => setIsAddTocOpen(false)}
        onSave={handleSaveTocRule}
        rule={editingTocRule}
      />

      <PurificationRuleModal
        isOpen={isAddPurificationOpen}
        onClose={() => setIsAddPurificationOpen(false)}
        onSave={handleSavePurificationRule}
        rule={editingPurificationRule}
      />

      <Modal
        isOpen={isClearPurificationModalOpen}
        onClose={() => !isClearingPurification && setIsClearPurificationModalOpen(false)}
        title={t('settings.purification.clearAllTitle')}
      >
        <div className="flex flex-col gap-6">
          <p className="text-text-primary">{t('settings.purification.clearAllConfirm', { count: purificationRules.length })}</p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setIsClearPurificationModalOpen(false)}
              disabled={isClearingPurification}
              className="px-4 py-2 rounded-lg font-medium hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              {t('common.actions.cancel')}
            </button>
            <button
              onClick={handleClearPurificationRules}
              disabled={isClearingPurification}
              className="px-4 py-2 rounded-lg font-medium bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isClearingPurification && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('settings.purification.clearAll')}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isExportAiOpen}
        onClose={() => { setIsExportAiOpen(false); setExportPassword(''); setExportAiMsg(null); }}
        title={t('settings.ai.exportTitle')}
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-3 rounded-xl bg-muted-bg/40 border border-border-color/20 p-4">
            <Lock className="w-5 h-5 text-accent mt-0.5 shrink-0" />
            <p className="text-sm text-text-secondary leading-6">{t('settings.ai.exportHint')}</p>
          </div>
          <label className="space-y-2">
            <span className="text-sm font-medium text-text-primary">{t('settings.ai.passwordLabel')}</span>
            <input
              type="password"
              value={exportPassword}
              onChange={(e) => { setExportPassword(e.target.value); setExportAiMsg(null); }}
              placeholder={t('settings.ai.passwordPlaceholder')}
              className="w-full rounded-xl border border-border-color/20 bg-muted-bg/50 px-4 py-3 text-text-primary outline-none focus:border-accent"
              onKeyDown={(e) => e.key === 'Enter' && exportPassword.length >= 4 && handleExportAiConfig()}
            />
          </label>
          {exportAiMsg && (
            <div className="rounded-lg border border-border-color/20 bg-muted-bg/40 px-3 py-2 text-sm text-text-secondary">
              {exportAiMsg}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setIsExportAiOpen(false); setExportPassword(''); setExportAiMsg(null); }}
              className="px-4 py-2 rounded-lg font-medium hover:bg-white/10 transition-colors"
            >
              {t('common.actions.cancel')}
            </button>
            <button
              onClick={handleExportAiConfig}
              disabled={exportPassword.length < 4 || isExportingAi}
              className="px-4 py-2 rounded-lg font-medium bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isExportingAi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {t('settings.ai.exportButton')}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isImportAiOpen}
        onClose={() => { setIsImportAiOpen(false); setImportPassword(''); setImportAiMsg(null); setPendingImportFile(null); }}
        title={t('settings.ai.importTitle')}
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-3 rounded-xl bg-muted-bg/40 border border-border-color/20 p-4">
            <Lock className="w-5 h-5 text-accent mt-0.5 shrink-0" />
            <p className="text-sm text-text-secondary leading-6">{t('settings.ai.importHint')}</p>
          </div>
          {pendingImportFile && (
            <div className="text-sm text-text-secondary">
              {t('settings.ai.selectedFile')}: <span className="text-text-primary font-medium">{pendingImportFile.name}</span>
            </div>
          )}
          <label className="space-y-2">
            <span className="text-sm font-medium text-text-primary">{t('settings.ai.passwordLabel')}</span>
            <input
              type="password"
              value={importPassword}
              onChange={(e) => { setImportPassword(e.target.value); setImportAiMsg(null); }}
              placeholder={t('settings.ai.passwordPlaceholder')}
              className="w-full rounded-xl border border-border-color/20 bg-muted-bg/50 px-4 py-3 text-text-primary outline-none focus:border-accent"
              onKeyDown={(e) => e.key === 'Enter' && importPassword.length >= 4 && handleConfirmImportAi()}
            />
          </label>
          {importAiMsg && (
            <div className="rounded-lg border border-border-color/20 bg-muted-bg/40 px-3 py-2 text-sm text-text-secondary">
              {importAiMsg}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setIsImportAiOpen(false); setImportPassword(''); setImportAiMsg(null); setPendingImportFile(null); }}
              className="px-4 py-2 rounded-lg font-medium hover:bg-white/10 transition-colors"
            >
              {t('common.actions.cancel')}
            </button>
            <button
              onClick={handleConfirmImportAi}
              disabled={!pendingImportFile || importPassword.length < 4 || isImportingAi}
              className="px-4 py-2 rounded-lg font-medium bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isImportingAi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {t('settings.ai.importButton')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
