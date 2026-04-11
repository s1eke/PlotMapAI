import type { Transaction } from 'dexie';

export type MigrationScope = 'db-schema';

export interface MigrationRetireWhen {
  date?: string;
  condition: string;
}

export interface MigrationMetadata {
  version: number;
  scope: MigrationScope;
  description: string;
  retireWhen: MigrationRetireWhen;
}

export interface DbSchemaMigration extends MigrationMetadata {
  scope: 'db-schema';
  stores: Record<string, string>;
  upgrade?: (transaction: Transaction) => Promise<void>;
}
