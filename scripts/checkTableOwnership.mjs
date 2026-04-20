import { readdirSync, readFileSync, statSync } from 'fs';
import { extname, relative, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import { loadTableOwnershipContract } from './architecture/contracts.mjs';
import { normalizePath } from './architecture/repositoryFacts.mjs';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const SOURCE_ROOT = 'src';
const DOC_PATH = 'docs/db-table-ownership.md';
const SAFE_DB_MEMBERS = new Set(['close', 'isOpen', 'open', 'transaction']);
const DB_PROPERTY_ACCESS = /\bdb\.([A-Za-z0-9_]+)\b/g;
const TRANSACTION_TABLE_ACCESS = /\btransaction\.table(?:<[\s\S]*?>)?\(\s*['"]([A-Za-z0-9_]+)['"]\s*\)/g;

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

function stripTypeQueries(source) {
  return source.replace(/\btypeof\s+db\.[A-Za-z0-9_]+/g, '');
}

export function shouldIncludeOwnershipFile(filePath) {
  return (
    filePath.startsWith(`${SOURCE_ROOT}/`)
    && SOURCE_EXTENSIONS.has(extname(filePath))
    && !filePath.includes('/__tests__/')
    && !filePath.startsWith('src/test/')
  );
}

function walkDirectory(rootDirectory, currentDirectory = rootDirectory) {
  const entries = readdirSync(currentDirectory).sort();
  const results = [];

  for (const entry of entries) {
    const absolutePath = resolve(currentDirectory, entry);
    const entryStats = statSync(absolutePath);
    if (entryStats.isDirectory()) {
      results.push(...walkDirectory(rootDirectory, absolutePath));
      continue;
    }

    results.push(normalizePath(relative(rootDirectory, absolutePath)));
  }

  return results;
}

function escapeRegexCharacter(character) {
  return character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegExp(pattern) {
  let result = '^';

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    const nextCharacter = pattern[index + 1];
    const thirdCharacter = pattern[index + 2];

    if (character === '*' && nextCharacter === '*') {
      if (thirdCharacter === '/') {
        result += '(?:.*/)?';
        index += 2;
      } else {
        result += '.*';
        index += 1;
      }
      continue;
    }

    if (character === '*') {
      result += '[^/]*';
      continue;
    }

    if (character === '?') {
      result += '[^/]';
      continue;
    }

    result += escapeRegexCharacter(character);
  }

  result += '$';
  return new RegExp(result);
}

function matchesAnyPattern(filePath, patterns) {
  return patterns.some((pattern) => globToRegExp(pattern).test(filePath));
}

export function findTableAccesses(source, knownTables) {
  const normalizedSource = stripTypeQueries(stripComments(source));
  const tableAccesses = new Map();
  const unknownTableReferences = new Map();

  for (const match of normalizedSource.matchAll(DB_PROPERTY_ACCESS)) {
    const memberName = match[1];
    if (knownTables.has(memberName)) {
      tableAccesses.set(`db:${memberName}`, {
        access: `db.${memberName}`,
        kind: 'db-property',
        tableName: memberName,
      });
      continue;
    }

    if (!SAFE_DB_MEMBERS.has(memberName)) {
      unknownTableReferences.set(`db:${memberName}`, {
        access: `db.${memberName}`,
        kind: 'db-property',
        tableName: memberName,
      });
    }
  }

  for (const match of normalizedSource.matchAll(TRANSACTION_TABLE_ACCESS)) {
    const tableName = match[1];
    if (knownTables.has(tableName)) {
      tableAccesses.set(`transaction:${tableName}`, {
        access: `transaction.table('${tableName}')`,
        kind: 'transaction-table',
        tableName,
      });
      continue;
    }

    unknownTableReferences.set(`transaction:${tableName}`, {
      access: `transaction.table('${tableName}')`,
      kind: 'transaction-table',
      tableName,
    });
  }

  return {
    tableAccesses: [...tableAccesses.values()],
    unknownTableReferences: [...unknownTableReferences.values()],
  };
}

function buildTableIndex(contract) {
  return new Map(contract.tables.map((entry) => [entry.name, entry]));
}

export function evaluateTableOwnership(files, contract) {
  const knownTables = new Set(contract.tables.map((entry) => entry.name));
  const tablesByName = buildTableIndex(contract);
  const invalidAccesses = [];
  const unknownTableReferences = [];

  Object.entries(files).forEach(([filePath, source]) => {
    if (!shouldIncludeOwnershipFile(filePath)) {
      return;
    }

    const accessResult = findTableAccesses(source, knownTables);
    accessResult.unknownTableReferences.forEach((reference) => {
      unknownTableReferences.push({
        filePath,
        ...reference,
      });
    });

    accessResult.tableAccesses.forEach((access) => {
      const table = tablesByName.get(access.tableName);
      if (!table) {
        return;
      }

      const isAllowed = (
        matchesAnyPattern(filePath, table.allowedDirectAccessPaths)
        || matchesAnyPattern(filePath, table.allowedApplicationPaths)
      );
      if (!isAllowed) {
        invalidAccesses.push({
          access: access.access,
          filePath,
          kind: access.kind,
          ownerDomain: table.ownerDomain,
          tableName: access.tableName,
        });
      }
    });
  });

  return {
    invalidAccesses: invalidAccesses.sort((left, right) => (
      left.filePath.localeCompare(right.filePath)
      || left.tableName.localeCompare(right.tableName)
      || left.kind.localeCompare(right.kind)
    )),
    unknownTableReferences: unknownTableReferences.sort((left, right) => (
      left.filePath.localeCompare(right.filePath)
      || left.tableName.localeCompare(right.tableName)
      || left.kind.localeCompare(right.kind)
    )),
  };
}

export function renderTableOwnershipDocument(contract) {
  const lines = [
    '# DB Table Ownership',
    '',
    'This file is generated from `scripts/architecture/contracts/table-ownership.json`. Do not edit it manually.',
    '',
    '这份文档定义 Dexie 表的 owner、允许访问层级，以及跨域时必须经过的公开出口。',
    '',
    '## Ownership Matrix',
    '',
    '| Table | Owner | Allowed Direct Access | Public API |',
    '|------|------|------|------|',
  ];

  contract.tables.forEach((table) => {
    lines.push(
      `| \`${table.name}\` | \`@domains/${table.ownerDomain}\` | ${table.allowedDirectAccessSummary} | ${table.publicApi.map((entry) => `\`${entry}\``).join(', ')} |`,
    );
  });

  lines.push(
    '',
    '## Data Model Notes',
    '',
  );
  contract.dataModelNotes.forEach((note) => {
    lines.push(`- ${note}`);
  });

  lines.push(
    '',
    '## Rules',
    '',
  );
  contract.rules.forEach((rule) => {
    lines.push(`- ${rule}`);
  });

  lines.push(
    '',
    '## Current Cross-Domain Exits',
    '',
  );
  contract.crossDomainExits.forEach((entry) => {
    lines.push(`- ${entry.label}： \`${entry.api}\``);
  });

  return `${lines.join('\n')}\n`;
}

export function compareTableOwnershipDocument(contract, actualDocument) {
  const expectedDocument = renderTableOwnershipDocument(contract);
  return {
    actualDocument,
    expectedDocument,
    isInSync: actualDocument === expectedDocument,
  };
}

function collectOwnershipFiles(rootDirectory, requestedPaths = []) {
  const requested = new Set(
    requestedPaths
      .map((filePath) => normalizePath(filePath))
      .filter((filePath) => shouldIncludeOwnershipFile(filePath)),
  );
  const discoveredPaths = requested.size > 0
    ? [...requested]
    : walkDirectory(rootDirectory, resolve(rootDirectory, SOURCE_ROOT))
      .filter((filePath) => shouldIncludeOwnershipFile(filePath));

  return Object.fromEntries(discoveredPaths.map((filePath) => [
    filePath,
    readFileSync(resolve(rootDirectory, filePath), 'utf8'),
  ]));
}

function printWarningSection(title, lines) {
  if (lines.length === 0) {
    return;
  }

  console.warn(`Table ownership warning: ${title}`);
  lines.forEach((line) => {
    console.warn(`- ${line}`);
  });
}

export function runTableOwnershipCheck(
  argv = process.argv.slice(2),
) {
  const rootDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const contract = loadTableOwnershipContract(rootDirectory);
  const files = collectOwnershipFiles(rootDirectory, argv);
  const evaluation = evaluateTableOwnership(files, contract);
  const docComparison = compareTableOwnershipDocument(
    contract,
    readFileSync(resolve(rootDirectory, DOC_PATH), 'utf8'),
  );
  const warningCount = (
    evaluation.invalidAccesses.length
    + evaluation.unknownTableReferences.length
    + (docComparison.isInSync ? 0 : 1)
  );

  printWarningSection(
    'files accessing tables outside the declared ownership contract',
    evaluation.invalidAccesses.map(({ access, filePath, ownerDomain, tableName }) => (
      `${filePath} -> ${access} (owner: @domains/${ownerDomain}, table: ${tableName})`
    )),
  );
  printWarningSection(
    'unknown table references',
    evaluation.unknownTableReferences.map(({ access, filePath }) => `${filePath} -> ${access}`),
  );
  printWarningSection(
    'db ownership documentation drift',
    docComparison.isInSync
      ? []
      : [
        `${DOC_PATH} is out of sync with scripts/architecture/contracts/table-ownership.json`,
      ],
  );

  if (warningCount === 0) {
    console.log('Table ownership checks passed.');
    return {
      ...evaluation,
      docComparison,
    };
  }

  throw new Error(`Table ownership checks found ${warningCount} warning(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runTableOwnershipCheck();
}
