import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import Modal from '@shared/components/Modal';
import type { TocRule } from '../api/types';

interface TocRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<TocRule>) => Promise<void>;
  rule: TocRule | null;
}

export default function TocRuleModal({ isOpen, onClose, onSave, rule }: TocRuleModalProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Partial<TocRule>>({
    name: '',
    rule: '',
    example: '',
    priority: 10,
    isEnabled: true
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (rule) {
      setFormData({
        name: rule.name,
        rule: rule.rule,
        example: rule.example,
        priority: rule.priority,
        isEnabled: rule.isEnabled
      });
    } else {
      setFormData({
        name: '',
        rule: '',
        example: '',
        priority: 10,
        isEnabled: true
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
      title={rule ? t('settings.toc.editRule') : t('settings.toc.addRule')}
    >
      <form onSubmit={handleSubmit} className="space-y-5 py-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-primary px-1">{t('settings.toc.ruleName')}</label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            className="w-full bg-muted-bg border border-white/10 rounded-xl px-4 py-2.5 text-text-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all"
            placeholder={t('settings.toc.namePlaceholder')}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-text-primary px-1">{t('settings.toc.regex')}</label>
          <textarea
            required
            value={formData.rule}
            onChange={e => setFormData({ ...formData, rule: e.target.value })}
            className="w-full bg-muted-bg border border-white/10 rounded-xl px-4 py-2.5 text-text-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all font-mono text-sm h-24 resize-none"
            placeholder={t('settings.toc.regexPlaceholder')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary px-1">{t('settings.toc.priority')}</label>
            <input
              type="number"
              min="0"
              max="100"
              value={formData.priority}
              onChange={e => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
              className="w-full bg-muted-bg border border-white/10 rounded-xl px-4 py-2.5 text-text-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary px-1">{t('settings.toc.status')}</label>
            <select
              value={formData.isEnabled ? 'true' : 'false'}
              onChange={e => setFormData({ ...formData, isEnabled: e.target.value === 'true' })}
              className="w-full bg-muted-bg border border-white/10 rounded-xl px-4 py-2.5 text-text-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all"
            >
              <option value="true">{t('settings.common.enabled')}</option>
              <option value="false">{t('settings.common.disabled')}</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-text-primary px-1">{t('settings.toc.example')}</label>
          <input
            type="text"
            value={formData.example}
            onChange={e => setFormData({ ...formData, example: e.target.value })}
            className="w-full bg-muted-bg border border-white/10 rounded-xl px-4 py-2.5 text-text-primary focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all"
            placeholder={t('settings.toc.examplePlaceholder')}
          />
        </div>

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
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : rule ? t('common.actions.save') : t('common.actions.add')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
