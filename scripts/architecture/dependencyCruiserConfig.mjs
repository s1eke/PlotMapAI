import { extname, resolve } from 'path';

import { loadArchitectureContract } from './contracts.mjs';
import { REPOSITORY_ROOT, normalizePath } from './repositoryFacts.mjs';

export const DEFAULT_DEPENDENCY_CRUISER_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
];

export function normalizeDependencyGraphCycleFiles(files) {
  return [...new Set(files.map((filePath) => normalizePath(filePath)))].sort();
}

export function createDependencyGraphCycleKey(files) {
  return normalizeDependencyGraphCycleFiles(files).join('|');
}

export function getDependencyGraphContract(
  contract = loadArchitectureContract(REPOSITORY_ROOT),
) {
  return contract.dependencyGraph;
}

export function isDependencyGraphSourceFile(filePath, dependencyGraph) {
  const normalizedPath = normalizePath(filePath);
  return (
    dependencyGraph.sourceDirectories.some((directory) => (
      normalizedPath === directory || normalizedPath.startsWith(`${directory}/`)
    ))
    && dependencyGraph.fileExtensions.includes(extname(normalizedPath))
    && !(new RegExp(dependencyGraph.excludePathPattern).test(normalizedPath))
  );
}

export function resolveDependencyGraphReportPaths(rootDirectory, dependencyGraph) {
  return {
    html: resolve(rootDirectory, dependencyGraph.reports.html),
    json: resolve(rootDirectory, dependencyGraph.reports.json),
  };
}

export function buildDependencyCruiserOptions(
  rootDirectory = REPOSITORY_ROOT,
  contract = loadArchitectureContract(rootDirectory),
) {
  const dependencyGraph = getDependencyGraphContract(contract);
  return {
    baseDir: rootDirectory,
    exclude: {
      path: dependencyGraph.excludePathPattern,
    },
    includeOnly: dependencyGraph.includeOnly,
    parser: 'tsc',
    tsConfig: {
      fileName: dependencyGraph.tsConfig,
    },
    tsPreCompilationDeps: true,
  };
}

export function buildDependencyCruiserResolveOptions(
  rootDirectory = REPOSITORY_ROOT,
  contract = loadArchitectureContract(rootDirectory),
) {
  const dependencyGraph = getDependencyGraphContract(contract);
  return {
    extensions: [...new Set([
      ...dependencyGraph.fileExtensions,
      ...DEFAULT_DEPENDENCY_CRUISER_EXTENSIONS,
    ])],
  };
}

export function getDependencyCruiserEntryPaths(
  rootDirectory = REPOSITORY_ROOT,
  contract = loadArchitectureContract(rootDirectory),
) {
  return [...getDependencyGraphContract(contract).sourceDirectories];
}
