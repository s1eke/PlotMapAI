import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import Toggle from './Toggle';
import { ShieldAlert, Info } from 'lucide-react';
import type { PurificationRule } from '../api/settings';

interface PurificationRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (rule: Partial<PurificationRule>) => Promise<void>;
  rule: PurificationRule | null;
}

export default function PurificationRuleModal({ isOpen, onClose, onSave, rule }: PurificationRuleModalProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Partial<PurificationRule>>({
    name: '',
    group: '净化',
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
        group: '净化',
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
      <form onSubmit={handleSubmit} className="space-y-5 max-h-[70vh] overflow-y-auto px-1 pr-2 custom-scrollbar">
        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('settings.purification.ruleName')}</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              placeholder="#广告 替换#JS"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('settings.purification.group')}</label>
            <input
              type="text"
              required
              value={formData.group}
              onChange={e => setFormData({ ...formData, group: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              placeholder="净化"
            />
          </div>
        </div>

        {/* Pattern & Replacement */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('settings.purification.pattern')}</label>
          <textarea
            required
            value={formData.pattern}
            onChange={e => setFormData({ ...formData, pattern: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary font-mono h-24 focus:outline-none focus:border-accent"
            placeholder="正则表达式..."
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('settings.purification.replacement')}</label>
            {formData.replacement?.startsWith('@js:') && (
              <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" /> SECURITY: WHITELIST ONLY
              </span>
            )}
          </div>
          <textarea
            value={formData.replacement}
            onChange={e => setFormData({ ...formData, replacement: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary font-mono h-24 focus:outline-none focus:border-accent"
            placeholder="替换内容 (支持 @js: 预设函数)..."
          />
          {formData.replacement?.startsWith('@js:') && (
             <p className="text-[10px] text-text-secondary opacity-60 flex items-center gap-1">
                <Info className="w-3 h-3" /> Only whitelisted functions (fullwidth, halfwidth, strip, etc.) are allowed.
             </p>
          )}
        </div>

        {/* Switches */}
        <div className="grid grid-cols-2 gap-6 bg-white/5 p-4 rounded-xl border border-white/5">
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
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('settings.purification.scope')}</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input 
                type="checkbox" 
                checked={formData.scopeTitle} 
                onChange={e => setFormData({...formData, scopeTitle: e.target.checked})}
                className="w-4 h-4 rounded border-white/20 bg-white/5 text-accent focus:ring-accent focus:ring-offset-0"
              />
              <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">{t('settings.purification.scopeTitle')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input 
                type="checkbox" 
                checked={formData.scopeContent} 
                onChange={e => setFormData({...formData, scopeContent: e.target.checked})}
                className="w-4 h-4 rounded border-white/20 bg-white/5 text-accent focus:ring-accent focus:ring-offset-0"
              />
              <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">{t('settings.purification.scopeContent')}</span>
            </label>
          </div>
        </div>

        {/* Advanced Scoping */}
        <div className="grid grid-cols-2 gap-4 pt-2">
           <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('settings.purification.bookScope')}</label>
              <input
                type="text"
                value={formData.bookScope}
                onChange={e => setFormData({ ...formData, bookScope: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                placeholder="包含书名..."
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('settings.purification.excludeBookScope')}</label>
              <input
                type="text"
                value={formData.excludeBookScope}
                onChange={e => setFormData({ ...formData, excludeBookScope: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                placeholder="排除书名..."
              />
            </div>
        </div>

        {/* Order & Timeout */}
        <div className="grid grid-cols-2 gap-4">
           <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('settings.purification.order')} (1-20)</label>
              <input
                type="number"
                min="1"
                max="20"
                value={formData.order}
                onChange={e => setFormData({ ...formData, order: parseInt(e.target.value) })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('settings.purification.timeout')} (ms)</label>
              <input
                type="number"
                value={formData.timeoutMs}
                onChange={e => setFormData({ ...formData, timeoutMs: parseInt(e.target.value) })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
        </div>

        <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-white/5">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 border border-white/10 rounded-xl hover:bg-white/5 transition-colors text-sm text-text-secondary"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 bg-accent hover:bg-accent-hover text-white rounded-xl transition-all font-medium shadow-lg shadow-accent/20 disabled:opacity-50 flex items-center gap-2 text-sm"
          >
            {isSubmitting && <ShieldAlert className="w-4 h-4 animate-pulse" />}
            {rule ? t('common.save') : t('common.add')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
