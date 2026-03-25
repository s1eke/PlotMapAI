import { translateAppError } from '@shared/errors';
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

export function getTranslatedErrorMessage(error: unknown, t: TFunction, fallbackKey: string): string {
  return translateAppError(error, t, fallbackKey, {
    kind: 'execution',
    source: 'settings',
  });
}

export function buildActionErrorMessage(
  prefix: string,
  error: unknown,
  t: TFunction,
  fallbackKey: string,
): string {
  const detail = getTranslatedErrorMessage(error, t, fallbackKey);
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
