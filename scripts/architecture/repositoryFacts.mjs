import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

export const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DOMAINS_DIRECTORY = 'src/domains';
const DB_SCHEMA_FILES = [
  'src/infra/db/library.ts',
  'src/infra/db/settings.ts',
  'src/infra/db/analysis.ts',
  'src/infra/db/reader.ts',
];

export function normalizePath(filePath) {
  return filePath.replaceAll('\\', '/');
}

function listDirectories(absoluteDirectory) {
  return readdirSync(absoluteDirectory)
    .filter((entry) => statSync(resolve(absoluteDirectory, entry)).isDirectory())
    .sort();
}

function collectSchemaTableNames(source) {
  const tables = new Set();

  for (const match of source.matchAll(/export const [A-Z_]+_DB_SCHEMA = \{([\s\S]*?)\} as const;/g)) {
    const block = match[1];
    for (const propertyMatch of block.matchAll(/^\s*([A-Za-z0-9_]+)\s*:/gm)) {
      tables.add(propertyMatch[1]);
    }
  }

  return tables;
}

export function listDomainNames(rootDirectory = REPOSITORY_ROOT) {
  return listDirectories(resolve(rootDirectory, DOMAINS_DIRECTORY));
}

export function listKnownTables(rootDirectory = REPOSITORY_ROOT) {
  const tables = new Set();

  for (const relativePath of DB_SCHEMA_FILES) {
    const source = readFileSync(resolve(rootDirectory, relativePath), 'utf8');
    for (const tableName of collectSchemaTableNames(source)) {
      tables.add(tableName);
    }
  }

  return [...tables].sort();
}

export function createRepositoryFacts(rootDirectory = REPOSITORY_ROOT) {
  return {
    domainNames: listDomainNames(rootDirectory),
    knownTables: listKnownTables(rootDirectory),
    pathExists(relativePath) {
      return existsSync(resolve(rootDirectory, relativePath));
    },
    rootDirectory,
  };
}
