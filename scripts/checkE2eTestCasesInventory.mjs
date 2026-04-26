import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { relative, resolve, sep } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const DOC_PATH = 'docs/e2e-test-cases-inventory.md';
const TEST_ROOT = 'tests/playwright';
const GENERATED_FROM_TEXT = 'This file is generated from `tests/playwright/**/*.spec.ts` and `tests/playwright/**/*.manual.spec.ts`. Do not edit it manually.';

const CATEGORY_ORDER = [
  'Smoke',
  'Edge',
  'Flow',
  'Restore',
  'Behavior',
  'Visual',
  'Manual',
];

const CATEGORY_LABELS = {
  Smoke: '冒烟测试',
  Edge: '边界与空状态',
  Flow: '业务主流程',
  Restore: '阅读会话恢复',
  Behavior: '功能交互',
  Visual: '视觉回归',
  Manual: '手工复现',
};

function normalizePath(filePath) {
  return filePath.split(sep).join('/');
}

async function collectSpecFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return collectSpecFiles(entryPath);
    }
    if (entry.isFile() && (entry.name.endsWith('.spec.ts') || entry.name.endsWith('.manual.spec.ts'))) {
      return [entryPath];
    }
    return [];
  }));

  return nestedFiles.flat().sort((left, right) => (
    normalizePath(left).localeCompare(normalizePath(right))
  ));
}

function findNearestDescribeTitle(source, index) {
  const describePattern = /test\.describe\s*\(\s*(['"`])([^'"`]+)\1/g;
  let nearestTitle = '';
  let match = describePattern.exec(source);

  while (match && match.index < index) {
    nearestTitle = match[2].trim();
    match = describePattern.exec(source);
  }

  return nearestTitle;
}

export function parsePlaywrightTestCases(source, filePath) {
  const relativeFilePath = normalizePath(filePath);
  const testPattern = /(?:^|[^\w.])test(?:\.(?:only|skip|fixme|slow))?\s*\(\s*(['"`])([^'"`]+)\1/gm;
  const cases = [];
  const unnumberedTests = [];
  let match = testPattern.exec(source);

  while (match) {
    const title = match[2].trim();
    const tcMatch = title.match(/^(TC-\d{3})\s+(.+)$/);
    const describeTitle = findNearestDescribeTitle(source, match.index);

    if (tcMatch) {
      cases.push({
        category: inferCategory(relativeFilePath),
        describeTitle,
        filePath: relativeFilePath,
        id: tcMatch[1],
        projects: inferProjects(relativeFilePath),
        title: tcMatch[2].trim(),
      });
    } else {
      unnumberedTests.push({
        describeTitle,
        filePath: relativeFilePath,
        title,
      });
    }

    match = testPattern.exec(source);
  }

  return {
    cases,
    unnumberedTests,
  };
}

export async function loadE2eTestCases(rootDirectory) {
  const testRoot = resolve(rootDirectory, TEST_ROOT);
  const files = await collectSpecFiles(testRoot);
  const parsedFiles = files.map((filePath) => parsePlaywrightTestCases(
    readFileSync(filePath, 'utf8'),
    relative(rootDirectory, filePath),
  ));

  return {
    cases: parsedFiles.flatMap((parsedFile) => parsedFile.cases)
      .sort((left, right) => left.id.localeCompare(right.id)),
    unnumberedTests: parsedFiles.flatMap((parsedFile) => parsedFile.unnumberedTests),
  };
}

function inferCategory(filePath) {
  if (filePath.includes('/manual/')) {
    return 'Manual';
  }
  if (filePath.includes('/smoke/')) {
    return 'Smoke';
  }
  if (filePath.includes('/edge/')) {
    return 'Edge';
  }
  if (filePath.includes('/visual/')) {
    return 'Visual';
  }
  if (filePath.includes('SessionRestore.spec.ts')) {
    return 'Restore';
  }
  if (filePath.includes('/flow/')) {
    return 'Flow';
  }
  return 'Behavior';
}

function inferProjects(filePath) {
  if (filePath.endsWith('.manual.spec.ts') || filePath.includes('/manual/')) {
    return ['manual'];
  }

  const projects = [];
  if (!filePath.endsWith('flow/mobileReaderSessionRestore.spec.ts')) {
    projects.push('chromium');
  }
  if (filePath.includes('/smoke/') || filePath.includes('/flow/')) {
    projects.push('mobile-chromium');
  }

  return projects;
}

function parseCaseNumber(id) {
  return Number.parseInt(id.slice('TC-'.length), 10);
}

function countBy(values, getKey) {
  return values.reduce((counts, value) => {
    const key = getKey(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map());
}

export function validateE2eTestCasesInventory({ cases, unnumberedTests }) {
  const issues = [];
  const countsById = countBy(cases, (testCase) => testCase.id);
  const duplicateIds = [...countsById.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id);

  duplicateIds.forEach((id) => {
    const paths = cases
      .filter((testCase) => testCase.id === id)
      .map((testCase) => testCase.filePath)
      .join(', ');
    issues.push(`Duplicate E2E test case id ${id}: ${paths}`);
  });

  unnumberedTests.forEach((testCase) => {
    issues.push(`Playwright test is missing TC-xxx prefix: ${testCase.filePath} "${testCase.title}"`);
  });

  const caseNumbers = [...new Set(cases.map((testCase) => parseCaseNumber(testCase.id)))]
    .sort((left, right) => left - right);
  if (caseNumbers.length > 0) {
    const maxCaseNumber = caseNumbers[caseNumbers.length - 1];
    for (let expectedCaseNumber = 1; expectedCaseNumber <= maxCaseNumber; expectedCaseNumber += 1) {
      if (!caseNumbers.includes(expectedCaseNumber)) {
        issues.push(`Missing E2E test case id TC-${String(expectedCaseNumber).padStart(3, '0')}.`);
      }
    }
  }

  cases.forEach((testCase) => {
    if (!CATEGORY_ORDER.includes(testCase.category)) {
      issues.push(`${testCase.id} has unknown category: ${testCase.category}`);
    }
    if (testCase.projects.length === 0) {
      issues.push(`${testCase.id} has no Playwright project coverage.`);
    }
  });

  return issues;
}

function appendSummary(lines, cases) {
  const automatedCount = cases.filter((testCase) => !testCase.projects.includes('manual')).length;
  const manualCount = cases.length - automatedCount;
  lines.push('## 总览', '');
  lines.push(`- 用例定义总数：${cases.length}`);
  lines.push(`- 自动运行：${automatedCount}`);
  lines.push(`- 手工复现：${manualCount}`);
  lines.push('- 统计口径：每个 `test("TC-xxx ...")` 算一条用例；同一用例在多个 Playwright project 中执行时不额外编号。');
  lines.push('', '| 分类 | 数量 |');
  lines.push('|------|------:|');
  CATEGORY_ORDER.forEach((category) => {
    const count = cases.filter((testCase) => testCase.category === category).length;
    if (count > 0) {
      lines.push(`| ${CATEGORY_LABELS[category]} | ${count} |`);
    }
  });
}

function appendProjectCoverage(lines, cases) {
  const projectNames = ['chromium', 'mobile-chromium', 'manual'];
  lines.push('', '## Project 覆盖', '');
  lines.push('| Project | 用例数 | 说明 |');
  lines.push('|------|------:|------|');
  projectNames.forEach((projectName) => {
    const count = cases.filter((testCase) => testCase.projects.includes(projectName)).length;
    const description = projectName === 'manual'
      ? '默认 Playwright 配置忽略，需要手工按需运行'
      : '由 `playwright.config.ts` 自动匹配执行';
    lines.push(`| \`${projectName}\` | ${count} | ${description} |`);
  });
}

function appendCases(lines, cases) {
  lines.push('', '## 全量用例清单', '');
  CATEGORY_ORDER.forEach((category) => {
    const categoryCases = cases.filter((testCase) => testCase.category === category);
    if (categoryCases.length === 0) {
      return;
    }

    lines.push(`### ${CATEGORY_LABELS[category]}`, '');
    lines.push('| 编号 | 用例 | Describe | Project | 来源 |');
    lines.push('|------|------|------|------|------|');
    categoryCases.forEach((testCase) => {
      const source = `[${testCase.filePath.replace(`${TEST_ROOT}/`, '')}](../${testCase.filePath})`;
      lines.push(`| \`${testCase.id}\` | ${testCase.title} | ${testCase.describeTitle || '-'} | ${testCase.projects.map((project) => `\`${project}\``).join(', ')} | ${source} |`);
    });
    lines.push('');
  });
}

export function renderE2eTestCasesInventoryDocument(cases) {
  const lines = [
    '# E2E 测试用例清单（Playwright）',
    '',
    GENERATED_FROM_TEXT,
    '',
    '这份文档从 Playwright 测试定义自动生成，用于追踪端到端测试覆盖面、编号连续性和 project 执行范围。',
    '',
  ];

  appendSummary(lines, cases);
  appendProjectCoverage(lines, cases);
  appendCases(lines, cases);

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

export function compareE2eTestCasesInventoryDocument(cases, actualDocument) {
  const expectedDocument = renderE2eTestCasesInventoryDocument(cases);
  return {
    actualDocument,
    expectedDocument,
    isInSync: actualDocument === expectedDocument,
  };
}

function printWarningSection(title, lines) {
  if (lines.length === 0) {
    return;
  }

  console.warn(`E2E test inventory warning: ${title}`);
  lines.forEach((line) => {
    console.warn(`- ${line}`);
  });
}

export async function runE2eTestCasesInventoryCheck(argv = process.argv.slice(2)) {
  const rootDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const inventory = await loadE2eTestCases(rootDirectory);
  const inventoryIssues = validateE2eTestCasesInventory(inventory);
  const documentPath = resolve(rootDirectory, DOC_PATH);
  const actualDocument = existsSync(documentPath) ? readFileSync(documentPath, 'utf8') : '';
  const docComparison = compareE2eTestCasesInventoryDocument(inventory.cases, actualDocument);
  const warningCount = inventoryIssues.length + (docComparison.isInSync ? 0 : 1);

  printWarningSection('invalid test case inventory', inventoryIssues);
  printWarningSection(
    'test case inventory documentation drift',
    docComparison.isInSync ? [] : [`${DOC_PATH} is out of sync with ${TEST_ROOT}`],
  );

  if (argv.includes('--print-document')) {
    process.stdout.write(docComparison.expectedDocument);
    return {
      docComparison,
      inventory,
      inventoryIssues,
    };
  }

  if (argv.includes('--write-document')) {
    writeFileSync(documentPath, docComparison.expectedDocument);
    console.log(`Wrote ${DOC_PATH}.`);
    return {
      docComparison: {
        ...docComparison,
        actualDocument: docComparison.expectedDocument,
        isInSync: true,
      },
      inventory,
      inventoryIssues,
    };
  }

  if (warningCount === 0) {
    console.log('E2E test case inventory checks passed.');
    return {
      docComparison,
      inventory,
      inventoryIssues,
    };
  }

  throw new Error(`E2E test case inventory checks found ${warningCount} warning(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runE2eTestCasesInventoryCheck();
}
