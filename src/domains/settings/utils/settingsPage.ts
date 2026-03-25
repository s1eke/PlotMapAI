import type { TFunction } from 'i18next';
import type { PurificationRule } from '../api/types';

export type SettingsTabId = 'toc' | 'purification' | 'ai';

export interface SettingsFeedbackState {
  type: 'success' | 'error';
  message: string;
}

export interface PurificationRuleGroup {
  name: string;
  rules: PurificationRule[];
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

export function buildActionErrorMessage(prefix: string, error: unknown): string {
  const detail = error instanceof Error && error.message ? error.message : '';
  return detail ? `${prefix}: ${detail}` : prefix;
}

export function groupPurificationRules(
  rules: PurificationRule[],
  ungroupedLabel: string,
): PurificationRuleGroup[] {
  const grouped = rules.reduce<Map<string, PurificationRule[]>>((accumulator, rule) => {
    const groupName = rule.group || ungroupedLabel;
    const existing = accumulator.get(groupName);

    if (existing) {
      existing.push(rule);
      return accumulator;
    }

    accumulator.set(groupName, [rule]);
    return accumulator;
  }, new Map());

  return Array.from(grouped.entries()).map(([name, groupedRules]) => ({
    name,
    rules: groupedRules,
  }));
}

export function mapAiExportError(error: unknown, t: TFunction): string {
  const message = getErrorMessage(error);

  if (message.includes('No AI config')) return t('settings.ai.errorNoConfig');
  if (message.includes('at least 4')) return t('settings.ai.errorPasswordShort');

  return t('settings.ai.errorExport');
}

export function mapAiImportError(error: unknown, t: TFunction): string {
  const message = getErrorMessage(error);

  if (message.includes('Password is required')) return t('settings.ai.errorPasswordRequired');
  if (message.includes('Invalid config file format')) return t('settings.ai.errorFileFormat');
  if (message.includes('Invalid config file structure')) return t('settings.ai.errorFileStructure');
  if (message.includes('Decryption failed')) return t('settings.ai.errorDecryptFailed');
  if (message.includes('not valid JSON')) return t('settings.ai.errorInvalidJson');
  if (message.includes('missing required fields')) return t('settings.ai.errorMissingFields');

  return t('settings.ai.errorImport');
}
