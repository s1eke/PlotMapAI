import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import Toggle from './Toggle';
import { Loader2 } from 'lucide-react';
import type { PurificationRule } from '../api/settings/types';

interface PurificationRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (rule: Partial<PurificationRule>) => Promise<void>;
  rule: PurificationRule | null;
}

export default function PurificationRuleModal({ isOpen, onClose, onSave, rule }: PurificationRuleModalProps) {
  const { t } = useTranslation();
  const defaultGroup = t('settings.purification.defaultGroup');
  const [formData, setFormData] = useState<Partial<PurificationRule>>({
    name: '',
    group: defaultGroup,
    pattern: '',
    replacement: '',
    isRegex: true,
    isEnabled: true,
    order: 10,
    scopeTitle: true,
    scopeContent: true,
    bookScope: '',
    excludeBookScope: '',
    timeoutMs: 3000,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (rule) {
      setFormData(rule);
    } else {
      setFormData({
        name: '',
        group: defaultGroup,
        pattern: '',
        replacement: '',
        isRegex: true,
        isEnabled: true,
        order: 10,
        scopeTitle: true,
        scopeContent: true,
        bookScope: '',
        excludeBookScope: '',
        timeoutMs: 3000,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rule, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={rule ? t('settings.purification.editRule') : t('settings.purification.addRule')}
    >
      <form onSubmit={handleSubmit} className="space-y-5 py-2 max-h-[70vh] overflow-y-auto custom-scrollbar">
        {/* Basic Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary px-1">{t('settings.purification.ruleName')}</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-muted-bg border border-white/10 rounded-xl px-4 py-2.5 text-text-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all"
              placeholder={t('settings.purification.namePlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary px-1">{t('settings.purification.group')}</label>
            <input
              type="text"
              required
              value={formData.group}
              onChange={e => setFormData({ ...formData, group: e.target.value })}
              className="w-full bg-muted-bg border border-white/10 rounded-xl px-4 py-2.5 text-text-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all"
              placeholder={t('settings.purification.groupPlaceholder')}
            />
          </div>
        </div>

        {/* Pattern */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-primary px-1">{t('settings.purification.pattern')}</label>
          <textarea
            required
            value={formData.pattern}
            onChange={e => setFormData({ ...formData, pattern: e.target.value })}
            className="w-full bg-muted-bg border border-white/10 rounded-xl px-4 py-2.5 text-text-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all font-mono text-sm h-24 resize-none"
            placeholder={t('settings.purification.patternPlaceholder')}
          />
        </div>

        {/* Replacement */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <label className="text-sm font-medium text-text-primary">{t('settings.purification.replacement')}</label>
            {formData.replacement?.startsWith('@js:') && (
              <span className="text-[10px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-lg font-medium">
                {t('settings.purification.jsSecurityBadge')}
              </span>
            )}
          </div>
          <textarea
            value={formData.replacement}
            onChange={e => setFormData({ ...formData, replacement: e.target.value })}
            className="w-full bg-muted-bg border border-white/10 rounded-xl px-4 py-2.5 text-text-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all font-mono text-sm h-24 resize-none"
            placeholder={t('settings.purification.replacementPlaceholder')}
          />
          {formData.replacement?.startsWith('@js:') && (
            <p className="text-xs text-text-secondary px-1">{t('settings.purification.jsSecurityNote')}</p>
          )}
        </div>

        {/* Switches */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-muted-bg/50 p-4 rounded-xl border border-white/5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-primary">{t('settings.purification.useRegex')}</span>
            <Toggle checked={formData.isRegex || false} onChange={checked => setFormData({ ...formData, isRegex: checked })} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-primary">{t('settings.purification.isEnabled')}</span>
            <Toggle checked={formData.isEnabled || false} onChange={checked => setFormData({ ...formData, isEnabled: checked })} />
          </div>
        </div>

        {/* Scopes */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-primary px-1">{t('settings.purification.scope')}</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={formData.scopeTitle}
                onChange={e => setFormData({ ...formData, scopeTitle: e.target.checked })}
                className="w-4 h-4 rounded border-white/20 bg-white/5 text-accent focus:ring-accent focus:ring-offset-0"
              />
              <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">{t('settings.purification.scopeTitle')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={formData.scopeContent}
                onChange={e => setFormData({ ...formData, scopeContent: e.target.checked })}
                className="w-4 h-4 rounded border-white/20 bg-white/5 text-accent focus:ring-accent focus:ring-offset-0"
              />
              <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">{t('settings.purification.scopeContent')}</span>
            </label>
          </div>
        </div>

        {/* Book Scopes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary px-1">{t('settings.purification.bookScope')}</label>
            <input
              type="text"
              value={formData.bookScope}
              onChange={e => setFormData({ ...formData, bookScope: e.target.value })}
              className="w-full bg-muted-bg border border-white/10 rounded-xl px-4 py-2.5 text-text-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all"
              placeholder={t('settings.purification.bookScopePlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary px-1">{t('settings.purification.excludeBookScope')}</label>
            <input
              type="text"
              value={formData.excludeBookScope}
              onChange={e => setFormData({ ...formData, excludeBookScope: e.target.value })}
              className="w-full bg-muted-bg border border-white/10 rounded-xl px-4 py-2.5 text-text-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all"
              placeholder={t('settings.purification.excludeBookScopePlaceholder')}
            />
          </div>
        </div>

        {/* Order & Timeout */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary px-1">{t('settings.purification.order')}</label>
            <input
              type="number"
              min="1"
              max="20"
              value={formData.order}
              onChange={e => setFormData({ ...formData, order: parseInt(e.target.value) })}
              className="w-full bg-muted-bg border border-white/10 rounded-xl px-4 py-2.5 text-text-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary px-1">{t('settings.purification.timeout')} (ms)</label>
            <input
              type="number"
              value={formData.timeoutMs}
              onChange={e => setFormData({ ...formData, timeoutMs: parseInt(e.target.value) })}
              className="w-full bg-muted-bg border border-white/10 rounded-xl px-4 py-2.5 text-text-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-4 border-t border-white/5 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 border border-white/10 rounded-xl hover:bg-white/5 text-text-primary transition-all text-sm font-medium"
          >
            {t('common.actions.cancel')}
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 bg-brand-700 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl transition-all shadow-lg shadow-brand-900/20 text-sm font-medium flex items-center gap-2"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {rule ? t('common.actions.save') : t('common.actions.add')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
