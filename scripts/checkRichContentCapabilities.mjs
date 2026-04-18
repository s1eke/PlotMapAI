import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const DOC_PATH = 'docs/epub-rich-content-support-matrix.md';
const REGISTRY_PATH = 'src/shared/contracts/rich-content-capabilities.ts';
const GENERATED_FROM_TEXT = 'This file is generated from `src/shared/contracts/rich-content-capabilities.ts`. Do not edit it manually.';

function appendBulletList(lines, values) {
  values.forEach((value) => {
    lines.push(`- ${value}`);
  });
}

function appendCapabilityTable(lines, capabilities) {
  lines.push('| 能力项 | 典型来源标签/语义 | 支持级别 | 导入阶段目标表示 | Reader 消费目标 | Analysis 投影策略 | 降级规则 | 备注 |');
  lines.push('|------|------|------|------|------|------|------|------|');
  capabilities.forEach((capability) => {
    lines.push(
      `| \`${capability.id}\` | ${capability.sourceSignals.join('、')} | \`${capability.supportLevel}\` | ${capability.importTarget} | ${capability.readerTarget} | ${capability.analysisStrategy} | ${capability.downgradeRule} | ${capability.notes} |`,
    );
  });
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonEmptyStringArray(value) {
  return Array.isArray(value)
    && value.length > 0
    && value.every((entry) => isNonEmptyString(entry));
}

function validateCoverageEntries(entries, validEntries, label) {
  if (entries === undefined) {
    return [];
  }
  if (!Array.isArray(entries)) {
    return [`${label} must be an array when provided.`];
  }

  return entries
    .filter((entry) => !validEntries.includes(entry))
    .map((entry) => `${label} references an unknown value: ${entry}`);
}

export function validateRichContentCapabilitiesRegistry(registryModule) {
  const issues = [];
  const {
    RICH_BLOCK_TYPES,
    RICH_CONTENT_CAPABILITIES,
    RICH_CONTENT_CAPABILITY_KINDS,
    RICH_CONTENT_DOWNGRADE_STRATEGIES,
    RICH_CONTENT_IMPLEMENTATION_STATES,
    RICH_CONTENT_SUPPORT_LEVELS,
    RICH_INLINE_TYPES,
    RICH_MARKS,
    RICH_READER_CONTEXT_VARIANTS,
    RICH_READER_INLINE_VARIANTS,
    RICH_READER_LEAF_VARIANTS,
    RICH_TEXT_ALIGNS,
  } = registryModule;

  const ids = new Set();
  RICH_CONTENT_CAPABILITIES.forEach((capability, index) => {
    const label = `RICH_CONTENT_CAPABILITIES[${index}]`;
    if (!isNonEmptyString(capability.id)) {
      issues.push(`${label}.id must be a non-empty string.`);
    } else if (ids.has(capability.id)) {
      issues.push(`RICH_CONTENT_CAPABILITIES contains a duplicate id: ${capability.id}`);
    } else {
      ids.add(capability.id);
    }

    if (!RICH_CONTENT_CAPABILITY_KINDS.includes(capability.kind)) {
      issues.push(`${label}.kind references an unknown capability kind: ${capability.kind}`);
    }
    if (!RICH_CONTENT_SUPPORT_LEVELS.includes(capability.supportLevel)) {
      issues.push(`${label}.supportLevel references an unknown support level: ${capability.supportLevel}`);
    }
    if (!isNonEmptyStringArray(capability.sourceSignals)) {
      issues.push(`${label}.sourceSignals must be a non-empty array of strings.`);
    }
    ['importTarget', 'readerTarget', 'analysisStrategy', 'downgradeRule', 'notes'].forEach((field) => {
      if (!isNonEmptyString(capability[field])) {
        issues.push(`${label}.${field} must be a non-empty string.`);
      }
    });

    ['import', 'reader', 'analysis'].forEach((stage) => {
      if (!RICH_CONTENT_IMPLEMENTATION_STATES.includes(capability.implementationState[stage])) {
        issues.push(`${label}.implementationState.${stage} references an unknown implementation state: ${capability.implementationState[stage]}`);
      }
    });

    if (capability.supportLevel === 'P2' && !isNonEmptyString(capability.downgradeRule)) {
      issues.push(`${label}.downgradeRule must be present for P2 capabilities.`);
    }

    if (capability.implementationState.import === 'downgrade_only') {
      if (!capability.downgradeTargets) {
        issues.push(
          `${label} (${capability.id}).downgradeTargets must be present when import is downgrade_only.`,
        );
      } else if (
        !RICH_CONTENT_DOWNGRADE_STRATEGIES.includes(capability.downgradeTargets.strategy)
      ) {
        issues.push(
          `${label}.downgradeTargets.strategy references an unknown downgrade strategy: ${capability.downgradeTargets.strategy}`,
        );
      }
    }

    if (capability.astTargets) {
      issues.push(
        ...validateCoverageEntries(capability.astTargets.blockTypes, RICH_BLOCK_TYPES, `${label}.astTargets.blockTypes`),
        ...validateCoverageEntries(capability.astTargets.inlineTypes, RICH_INLINE_TYPES, `${label}.astTargets.inlineTypes`),
        ...validateCoverageEntries(capability.astTargets.marks, RICH_MARKS, `${label}.astTargets.marks`),
        ...validateCoverageEntries(capability.astTargets.aligns, RICH_TEXT_ALIGNS, `${label}.astTargets.aligns`),
      );
    }

    if (capability.downgradeTargets) {
      issues.push(
        ...validateCoverageEntries(capability.downgradeTargets.blockTypes, RICH_BLOCK_TYPES, `${label}.downgradeTargets.blockTypes`),
        ...validateCoverageEntries(capability.downgradeTargets.inlineTypes, RICH_INLINE_TYPES, `${label}.downgradeTargets.inlineTypes`),
      );
    }

    if (capability.readerCoverage) {
      issues.push(
        ...validateCoverageEntries(capability.readerCoverage.sourceBlockTypes, RICH_BLOCK_TYPES, `${label}.readerCoverage.sourceBlockTypes`),
        ...validateCoverageEntries(capability.readerCoverage.inlineVariants, RICH_READER_INLINE_VARIANTS, `${label}.readerCoverage.inlineVariants`),
        ...validateCoverageEntries(capability.readerCoverage.leafVariants, RICH_READER_LEAF_VARIANTS, `${label}.readerCoverage.leafVariants`),
        ...validateCoverageEntries(capability.readerCoverage.contextVariants, RICH_READER_CONTEXT_VARIANTS, `${label}.readerCoverage.contextVariants`),
      );
    }
  });

  return issues;
}

export function renderRichContentSupportMatrixDocument(registryModule) {
  const {
    RICH_CONTENT_CAPABILITIES,
    RICH_CONTENT_SUPPORT_LEVELS,
    RICH_CONTENT_SUPPORT_MATRIX_META,
  } = registryModule;
  const lines = [
    `# ${RICH_CONTENT_SUPPORT_MATRIX_META.title}`,
    '',
    GENERATED_FROM_TEXT,
    '',
  ];

  RICH_CONTENT_SUPPORT_MATRIX_META.intro.forEach((paragraph) => {
    lines.push(paragraph, '');
  });

  appendBulletList(
    lines,
    RICH_CONTENT_SUPPORT_MATRIX_META.definitionFields.map((field) => `${field.label}：${field.description}`),
  );

  RICH_CONTENT_SUPPORT_LEVELS.forEach((supportLevel) => {
    lines.push('', `## ${RICH_CONTENT_SUPPORT_MATRIX_META.sectionTitles[supportLevel]}`, '');
    appendCapabilityTable(
      lines,
      RICH_CONTENT_CAPABILITIES.filter((capability) => capability.supportLevel === supportLevel),
    );
  });

  lines.push(
    '',
    '## 非目标',
    '',
    RICH_CONTENT_SUPPORT_MATRIX_META.nonGoalsIntro,
    '',
    '明确不以以下能力为目标：',
    '',
  );
  appendBulletList(lines, RICH_CONTENT_SUPPORT_MATRIX_META.nonGoals);
  lines.push('', RICH_CONTENT_SUPPORT_MATRIX_META.nonGoalsOutro);

  return `${lines.join('\n')}\n`;
}

export function compareRichContentSupportMatrixDocument(registryModule, actualDocument) {
  const expectedDocument = renderRichContentSupportMatrixDocument(registryModule);
  return {
    actualDocument,
    expectedDocument,
    isInSync: actualDocument === expectedDocument,
  };
}

export async function loadRichContentCapabilitiesModule(rootDirectory) {
  const moduleUrl = pathToFileURL(resolve(rootDirectory, REGISTRY_PATH)).href;
  return import(moduleUrl);
}

function printWarningSection(title, lines) {
  if (lines.length === 0) {
    return;
  }

  console.warn(`Rich-content capability warning: ${title}`);
  lines.forEach((line) => {
    console.warn(`- ${line}`);
  });
}

export async function runRichContentCapabilitiesCheck(argv = process.argv.slice(2)) {
  const rootDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const registryModule = await loadRichContentCapabilitiesModule(rootDirectory);
  const registryIssues = validateRichContentCapabilitiesRegistry(registryModule);
  const docComparison = compareRichContentSupportMatrixDocument(
    registryModule,
    readFileSync(resolve(rootDirectory, DOC_PATH), 'utf8'),
  );
  const warningCount = registryIssues.length + (docComparison.isInSync ? 0 : 1);

  printWarningSection('invalid registry entries', registryIssues);
  printWarningSection(
    'support matrix documentation drift',
    docComparison.isInSync
      ? []
      : [`${DOC_PATH} is out of sync with ${REGISTRY_PATH}`],
  );

  if (argv.includes('--print-document')) {
    process.stdout.write(docComparison.expectedDocument);
    return {
      docComparison,
      registryIssues,
    };
  }

  if (warningCount === 0) {
    console.log('Rich-content capability checks passed.');
    return {
      docComparison,
      registryIssues,
    };
  }

  throw new Error(`Rich-content capability checks found ${warningCount} warning(s).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runRichContentCapabilitiesCheck();
}
