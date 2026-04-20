import { fileURLToPath, pathToFileURL } from 'url';
import { resolve } from 'path';

import { cruise } from 'dependency-cruiser';

import {
  buildDependencyCruiserOptions,
  buildDependencyCruiserResolveOptions,
  getDependencyCruiserEntryPaths,
  resolveDependencyGraphReportPaths,
} from './architecture/dependencyCruiserConfig.mjs';
import {
  evaluateDependencyGraph,
  writeDependencyGraphReports,
} from './architecture/dependencyGraph.mjs';
import { loadArchitectureContract } from './architecture/contracts.mjs';

function printWarningSection(title, lines) {
  if (lines.length === 0) {
    return;
  }

  console.warn(`Dependency graph warning: ${title}`);
  lines.forEach((line) => {
    console.warn(`- ${line}`);
  });
}

function formatCycle(cycle) {
  return cycle.files.join(' | ');
}

export async function evaluateRepositoryDependencyGraph({
  reportPaths = null,
  rootDirectory = resolve(fileURLToPath(new URL('..', import.meta.url))),
  writeReports = false,
} = {}) {
  const contract = loadArchitectureContract(rootDirectory);
  const cruiseResult = await cruise(
    getDependencyCruiserEntryPaths(rootDirectory, contract),
    buildDependencyCruiserOptions(rootDirectory, contract),
    buildDependencyCruiserResolveOptions(rootDirectory, contract),
  );
  const report = evaluateDependencyGraph(cruiseResult.output, contract);
  const resolvedReportPaths = reportPaths ?? resolveDependencyGraphReportPaths(
    rootDirectory,
    contract.dependencyGraph,
  );

  if (writeReports) {
    writeDependencyGraphReports(report, resolvedReportPaths);
  }

  return {
    contract,
    report,
    reportPaths: resolvedReportPaths,
  };
}

export async function runDependencyGraphCheck(argv = process.argv.slice(2)) {
  const writeReports = argv.includes('--report');
  const { report, reportPaths } = await evaluateRepositoryDependencyGraph({
    writeReports,
  });

  printWarningSection(
    'layer dependency violations',
    report.layerViolations.map(({ from, fromLayer, to, toLayer }) => (
      `${from} -> ${to} (${fromLayer} -> ${toLayer})`
    )),
  );
  printWarningSection(
    'domain dependency violations',
    report.domainViolations.map(({ from, fromDomain, to, toDomain }) => (
      `${from} -> ${to} (${fromDomain} -> ${toDomain})`
    )),
  );
  printWarningSection(
    'new file-level cycles',
    report.newCycles.map((cycle) => formatCycle(cycle)),
  );

  const warningCount =
    report.layerViolations.length
    + report.domainViolations.length
    + report.newCycles.length;

  if (writeReports) {
    console.log(`Dependency graph JSON report: ${reportPaths.json}`);
    console.log(`Dependency graph HTML report: ${reportPaths.html}`);
  }

  if (warningCount === 0) {
    console.log('Dependency graph checks passed.');
    return report;
  }

  throw new Error(`Dependency graph checks found ${warningCount} warning(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDependencyGraphCheck();
}
