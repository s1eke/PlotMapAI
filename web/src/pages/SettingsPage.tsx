import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Upload, RefreshCcw, ShieldAlert } from 'lucide-react';
import { settingsApi } from '../api/settings';
import type { TocRule, PurificationRule } from '../api/settings';
import RuleCard from '../components/RuleCard';
import TocRuleModal from '../components/TocRuleModal';
import PurificationRuleModal from '../components/PurificationRuleModal';

export default function SettingsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'toc' | 'purification'>('toc');

  // TOC Rules State
  const [tocRules, setTocRules] = useState<TocRule[]>([]);
  const [isTocLoading, setIsTocLoading] = useState(false);
  const [isAddTocOpen, setIsAddTocOpen] = useState(false);
  const [editingTocRule, setEditingTocRule] = useState<TocRule | null>(null);

  // Purification Rules State
  const [purificationRules, setPurificationRules] = useState<PurificationRule[]>([]);
  const [isPurificationLoading, setIsPurificationLoading] = useState(false);
  const [isAddPurificationOpen, setIsAddPurificationOpen] = useState(false);
  const [editingPurificationRule, setEditingPurificationRule] = useState<PurificationRule | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    fetchTocRules();
    fetchPurificationRules();
  }, []);

  // Handlers for TOC Rules
  const handleSaveTocRule = async (data: Partial<TocRule>) => {
    try {
      if (editingTocRule) {
        await settingsApi.updateTocRule(editingTocRule.id, data);
      } else {
        await settingsApi.createTocRule(data as Omit<TocRule, 'id' | 'isDefault'>);
      }
      await fetchTocRules();
    } catch (err) {
      alert(t('settings.common.updateFailed'));
    }
  };

  const handleToggleTocRule = async (id: number, isEnabled: boolean) => {
    setTocRules((prev: TocRule[]) => prev.map(r => r.id === id ? { ...r, isEnabled } : r));
    try {
      await settingsApi.updateTocRule(id, { isEnabled });
    } catch (err) {
      setTocRules((prev: TocRule[]) => prev.map(r => r.id === id ? { ...r, isEnabled: !isEnabled } : r));
      alert(t('settings.common.updateFailed'));
    }
  };

  const handleDeleteTocRule = async (id: number) => {
    if (!confirm(t('settings.toc.deleteConfirm') || 'Are you sure you want to delete this rule?')) return;
    try {
      await settingsApi.deleteTocRule(id);
      setTocRules((prev: TocRule[]) => prev.filter(r => r.id !== id));
    } catch (err) {
      alert(t('settings.common.deleteFailed'));
    }
  };

  const handleResetTocRules = async () => {
    if (!confirm(t('settings.toc.resetConfirm'))) return;
    setIsTocLoading(true);
    try {
      await settingsApi.resetTocRules();
      await fetchTocRules();
    } catch (err) {
      alert(t('settings.common.resetFailed'));
      setIsTocLoading(false);
    }
  };

  // Handlers for Purification Rules
  const handleSavePurificationRule = async (data: Partial<PurificationRule>) => {
    try {
      if (editingPurificationRule) {
        await settingsApi.updatePurificationRule(editingPurificationRule.id, data);
      } else {
        await settingsApi.createPurificationRule(data);
      }
      await fetchPurificationRules();
    } catch (err) {
      alert(t('settings.common.updateFailed'));
    }
  };

  const handleTogglePurificationRule = async (id: number, isEnabled: boolean) => {
    setPurificationRules((prev: PurificationRule[]) => prev.map(r => r.id === id ? { ...r, isEnabled } : r));
    try {
      await settingsApi.updatePurificationRule(id, { isEnabled });
    } catch (err) {
      setPurificationRules((prev: PurificationRule[]) => prev.map(r => r.id === id ? { ...r, isEnabled: !isEnabled } : r));
      alert(t('settings.common.updateFailed'));
    }
  };

  const handleDeletePurificationRule = async (id: number) => {
    if (!confirm(t('settings.purification.deleteConfirm'))) return;
    try {
      await settingsApi.deletePurificationRule(id);
      setPurificationRules((prev: PurificationRule[]) => prev.filter(r => r.id !== id));
    } catch (err) {
      alert(t('settings.common.deleteFailed'));
    }
  };

  const handleUploadPurificationJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    setIsPurificationLoading(true);
    try {
      await settingsApi.uploadPurificationRulesJson(file);
      await fetchPurificationRules();
    } catch (err: any) {
      alert(`${t('settings.common.uploadFailed')}: ${err.message}`);
    } finally {
      setIsPurificationLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Group rules by 'group' field
  const groupedPurificationRules = purificationRules.reduce((acc: Record<string, PurificationRule[]>, rule: PurificationRule) => {
    const groupName = rule.group || t('settings.purification.ungrouped');
    if (!acc[groupName]) acc[groupName] = [];
    acc[groupName].push(rule);
    return acc;
  }, {} as Record<string, PurificationRule[]>);

  return (
    <div className="flex-1 flex flex-col p-6 max-w-5xl mx-auto w-full">
      <h1 className="text-3xl font-bold text-text-primary tracking-tight mb-8">{t('settings.title')}</h1>

      {/* Tabs */}
      <div className="flex space-x-1 glass p-1 rounded-xl mb-8 w-fit shrink-0 gap-2">
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
      </div>

      {/* Tab Content */}
      <div className="flex-1 glass border border-white/5 shadow-sm rounded-2xl p-6 md:p-8">

        {/* TOC Rules Tab */}
        {activeTab === 'toc' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-text-primary">{t('settings.toc.title')}</h2>
                <p className="text-text-secondary text-sm mt-1">{t('settings.toc.subtitle')}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleResetTocRules}
                  className="px-4 py-2 border border-white/10 rounded-lg hover:bg-white/5 text-text-primary transition-colors flex items-center gap-2 text-sm"
                >
                  <RefreshCcw className="w-4 h-4" /> {t('settings.toc.resetTitle')}
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {tocRules.map(rule => (
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
            )}
          </div>
        )}

        {/* Purification Rules Tab */}
        {activeTab === 'purification' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-text-primary">{t('settings.purification.title')}</h2>
                <p className="text-text-secondary text-sm mt-1 mb-2">{t('settings.purification.subtitle')}</p>
                <div className="flex items-start gap-2 text-xs text-amber-500/80 bg-amber-500/10 p-2 rounded max-w-lg">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <p>{t('settings.purification.securityNote')}</p>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleUploadPurificationJson}
                  accept=".json"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 border border-white/10 rounded-lg hover:bg-white/5 text-text-primary transition-colors flex items-center gap-2 text-sm"
                >
                  <Upload className="w-4 h-4" /> {t('settings.purification.importJson')}
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
                      {rules.map(rule => (
                        <RuleCard
                          key={rule.id}
                          name={rule.name}
                          pattern={rule.pattern}
                          isEnabled={rule.isEnabled}
                          priority={rule.order}
                          type={rule.isRegex ? 'regex' : 'text'}
                          scopes={[
                            rule.scopeTitle ? 'Title' : '',
                            rule.scopeContent ? 'Content' : ''
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
      </div>

      {/* Modals */}
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
    </div>
  );
}
