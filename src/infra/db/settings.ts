import type { EntityTable } from 'dexie';
import type {
  PurificationExecutionStage,
  PurificationTargetScope,
} from '@shared/text-processing';

export interface TocRuleRecord {
  id: number;
  name: string;
  rule: string;
  example: string;
  serialNumber: number;
  enable: boolean;
  isDefault: boolean;
  createdAt: string;
}

export interface PurificationRuleRecord {
  id: number;
  externalId: number | null;
  name: string;
  group: string;
  pattern: string;
  replacement: string;
  isRegex: boolean;
  isEnabled: boolean;
  order: number;
  targetScope: PurificationTargetScope;
  executionStage: PurificationExecutionStage;
  ruleVersion: number;
  scopeTitle?: boolean;
  scopeContent?: boolean;
  bookScope: string;
  excludeBookScope: string;
  exclusiveGroup: string;
  isDefault: boolean;
  timeoutMs: number;
  createdAt: string;
}

export interface AppSettingRecord {
  key: string;
  value: unknown;
  updatedAt: string;
}

export const SETTINGS_DB_SCHEMA = {
  tocRules: '++id, serialNumber, enable',
  purificationRules: '++id, order, isEnabled',
  appSettings: 'key, updatedAt',
} as const;

export interface SettingsTables {
  tocRules: EntityTable<TocRuleRecord, 'id'>;
  purificationRules: EntityTable<PurificationRuleRecord, 'id'>;
  appSettings: EntityTable<AppSettingRecord, 'key'>;
}
