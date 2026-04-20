import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import {
  createDependencyGraphCycleKey,
  isDependencyGraphSourceFile,
} from './dependencyCruiserConfig.mjs';
import { normalizePath } from './repositoryFacts.mjs';

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function getCruiseModules(cruiseResult) {
  if (Array.isArray(cruiseResult?.modules)) {
    return cruiseResult.modules;
  }
  if (Array.isArray(cruiseResult?.output?.modules)) {
    return cruiseResult.output.modules;
  }
  return [];
}

function getLayerName(filePath, layers) {
  return layers.find((layer) => (
    filePath === layer.root || filePath.startsWith(`${layer.root}/`)
  ))?.name ?? null;
}

function getDomainName(filePath) {
  return filePath.match(/^src\/domains\/([^/]+)\//u)?.[1] ?? null;
}

function createLayerIndex(layers) {
  return new Map(layers.map((layer) => [layer.name, layer]));
}

function createAllowedDomainDependencyIndex(dependencyGraph) {
  return new Map(
    dependencyGraph.allowedDomainDependencies.map((entry) => [entry.from, new Set(entry.to)]),
  );
}

function collectDependencyGraphModules(cruiseResult, dependencyGraph) {
  return getCruiseModules(cruiseResult)
    .map((module) => ({
      ...module,
      source: normalizePath(module.source),
    }))
    .filter((module) => isDependencyGraphSourceFile(module.source, dependencyGraph))
    .sort((left, right) => left.source.localeCompare(right.source));
}

function collectLocalDependencyEdges(modules, dependencyGraph) {
  const knownModules = new Set(modules.map((module) => module.source));
  const edges = new Map();

  modules.forEach((module) => {
    module.dependencies.forEach((dependency) => {
      const resolved = dependency.resolved ? normalizePath(dependency.resolved) : null;
      const isLocalSourceDependency = (
        resolved
        && knownModules.has(resolved)
        && isDependencyGraphSourceFile(resolved, dependencyGraph)
      );
      if (!isLocalSourceDependency) {
        return;
      }

      const edgeKey = `${module.source}->${resolved}`;
      if (!edges.has(edgeKey)) {
        edges.set(edgeKey, {
          circular: Boolean(dependency.circular),
          from: module.source,
          to: resolved,
        });
      }
    });
  });

  return [...edges.values()].sort((left, right) => (
    left.from.localeCompare(right.from) || left.to.localeCompare(right.to)
  ));
}

function buildAdjacencyMap(modules, edges) {
  const adjacency = new Map(modules.map((module) => [module.source, []]));

  edges.forEach((edge) => {
    const nextEntries = adjacency.get(edge.from);
    if (!nextEntries) {
      adjacency.set(edge.from, [edge.to]);
      return;
    }
    nextEntries.push(edge.to);
  });

  adjacency.forEach((targets, source) => {
    adjacency.set(source, [...new Set(targets)].sort());
  });

  return adjacency;
}

function findStronglyConnectedComponents(adjacency) {
  let index = 0;
  const indexes = new Map();
  const lowLinks = new Map();
  const stack = [];
  const onStack = new Set();
  const stronglyConnectedComponents = [];

  function strongConnect(node) {
    indexes.set(node, index);
    lowLinks.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);

    for (const dependency of adjacency.get(node) ?? []) {
      if (!indexes.has(dependency)) {
        strongConnect(dependency);
        lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(dependency)));
        continue;
      }
      if (onStack.has(dependency)) {
        lowLinks.set(node, Math.min(lowLinks.get(node), indexes.get(dependency)));
      }
    }

    if (lowLinks.get(node) === indexes.get(node)) {
      const component = [];
      while (stack.length > 0) {
        const current = stack.pop();
        onStack.delete(current);
        component.push(current);
        if (current === node) {
          break;
        }
      }

      const hasSelfReference = (adjacency.get(node) ?? []).includes(node);
      if (component.length > 1 || hasSelfReference) {
        stronglyConnectedComponents.push(component.sort());
      }
    }
  }

  [...adjacency.keys()].sort().forEach((node) => {
    if (!indexes.has(node)) {
      strongConnect(node);
    }
  });

  return stronglyConnectedComponents
    .map((files) => ({
      files,
      key: createDependencyGraphCycleKey(files),
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function summarizeLayerDependencies(edges, layers) {
  const entries = new Map();

  edges.forEach((edge) => {
    const fromLayer = getLayerName(edge.from, layers);
    const toLayer = getLayerName(edge.to, layers);
    if (!fromLayer || !toLayer) {
      return;
    }

    const summaryKey = `${fromLayer}->${toLayer}`;
    entries.set(summaryKey, {
      count: (entries.get(summaryKey)?.count ?? 0) + 1,
      fromLayer,
      toLayer,
    });
  });

  return [...entries.values()].sort((left, right) => (
    left.fromLayer.localeCompare(right.fromLayer)
    || left.toLayer.localeCompare(right.toLayer)
  ));
}

function summarizeDomainDependencies(edges) {
  const entries = new Map();

  edges.forEach((edge) => {
    const fromDomain = getDomainName(edge.from);
    const toDomain = getDomainName(edge.to);
    if (!fromDomain || !toDomain || fromDomain === toDomain) {
      return;
    }

    const summaryKey = `${fromDomain}->${toDomain}`;
    entries.set(summaryKey, {
      count: (entries.get(summaryKey)?.count ?? 0) + 1,
      fromDomain,
      toDomain,
    });
  });

  return [...entries.values()].sort((left, right) => (
    left.fromDomain.localeCompare(right.fromDomain)
    || left.toDomain.localeCompare(right.toDomain)
  ));
}

export function evaluateDependencyGraph(cruiseResult, contract) {
  const { dependencyGraph } = contract;
  const modules = collectDependencyGraphModules(cruiseResult, dependencyGraph);
  const edges = collectLocalDependencyEdges(modules, dependencyGraph);
  const adjacency = buildAdjacencyMap(modules, edges);
  const observedCycles = findStronglyConnectedComponents(adjacency);
  const baselineByKey = new Map(
    dependencyGraph.cycleBaseline.map((entry) => [
      createDependencyGraphCycleKey(entry.files),
      {
        ...entry,
        files: [...entry.files].sort(),
        key: createDependencyGraphCycleKey(entry.files),
      },
    ]),
  );
  const layerIndex = createLayerIndex(contract.layers);
  const allowedDomainDependencies = createAllowedDomainDependencyIndex(dependencyGraph);

  const layerViolations = [];
  const domainViolations = [];

  edges.forEach((edge) => {
    const fromLayer = getLayerName(edge.from, contract.layers);
    const toLayer = getLayerName(edge.to, contract.layers);
    if (
      fromLayer
      && toLayer
      && fromLayer !== toLayer
      && !(layerIndex.get(fromLayer)?.canDependOn ?? []).includes(toLayer)
    ) {
      layerViolations.push({
        from: edge.from,
        fromLayer,
        to: edge.to,
        toLayer,
      });
    }

    const fromDomain = getDomainName(edge.from);
    const toDomain = getDomainName(edge.to);
    if (
      fromDomain
      && toDomain
      && fromDomain !== toDomain
      && !allowedDomainDependencies.get(fromDomain)?.has(toDomain)
    ) {
      domainViolations.push({
        from: edge.from,
        fromDomain,
        to: edge.to,
        toDomain,
      });
    }
  });

  const baselineCycles = observedCycles
    .filter((cycle) => baselineByKey.has(cycle.key))
    .map((cycle) => ({
      ...cycle,
      reason: baselineByKey.get(cycle.key)?.reason ?? '',
    }));
  const newCycles = observedCycles.filter((cycle) => !baselineByKey.has(cycle.key));
  const resolvedBaselineCycles = dependencyGraph.cycleBaseline
    .map((entry) => ({
      ...entry,
      files: [...entry.files].sort(),
      key: createDependencyGraphCycleKey(entry.files),
    }))
    .filter((entry) => !observedCycles.some((cycle) => cycle.key === entry.key));
  const unclassifiedModules = modules
    .map((module) => module.source)
    .filter((source) => getLayerName(source, contract.layers) === null)
    .sort();

  return {
    baselineCycles,
    domainDependencies: summarizeDomainDependencies(edges),
    domainViolations,
    edges,
    generatedAt: new Date().toISOString(),
    layerDependencies: summarizeLayerDependencies(edges, contract.layers),
    layerViolations,
    modules: modules.map((module) => module.source),
    newCycles,
    resolvedBaselineCycles,
    summary: {
      baselineCycleCount: baselineCycles.length,
      domainDependencyCount: summarizeDomainDependencies(edges).length,
      domainViolationCount: domainViolations.length,
      edgeCount: edges.length,
      layerDependencyCount: summarizeLayerDependencies(edges, contract.layers).length,
      layerViolationCount: layerViolations.length,
      moduleCount: modules.length,
      newCycleCount: newCycles.length,
      observedCycleCount: observedCycles.length,
      resolvedBaselineCycleCount: resolvedBaselineCycles.length,
      unclassifiedModuleCount: unclassifiedModules.length,
    },
    unclassifiedModules,
  };
}

function renderSummaryTable(summary) {
  return [
    '<table>',
    '<thead><tr><th>Metric</th><th>Count</th></tr></thead>',
    '<tbody>',
    `<tr><td>Modules</td><td>${summary.moduleCount}</td></tr>`,
    `<tr><td>Edges</td><td>${summary.edgeCount}</td></tr>`,
    `<tr><td>Layer Violations</td><td>${summary.layerViolationCount}</td></tr>`,
    `<tr><td>Domain Violations</td><td>${summary.domainViolationCount}</td></tr>`,
    `<tr><td>Observed Cycles</td><td>${summary.observedCycleCount}</td></tr>`,
    `<tr><td>New Cycles</td><td>${summary.newCycleCount}</td></tr>`,
    `<tr><td>Baseline Cycles</td><td>${summary.baselineCycleCount}</td></tr>`,
    `<tr><td>Resolved Baseline Cycles</td><td>${summary.resolvedBaselineCycleCount}</td></tr>`,
    `<tr><td>Unclassified Modules</td><td>${summary.unclassifiedModuleCount}</td></tr>`,
    '</tbody>',
    '</table>',
  ].join('\n');
}

function renderListSection(title, rows, renderRow, emptyMessage) {
  const content = rows.length === 0
    ? `<p>${escapeHtml(emptyMessage)}</p>`
    : `<ul>${rows.map((row) => `<li>${renderRow(row)}</li>`).join('')}</ul>`;
  return `<section><h2>${escapeHtml(title)}</h2>${content}</section>`;
}

function renderDependencyTable(title, rows, keys, emptyMessage) {
  if (rows.length === 0) {
    return `<section><h2>${escapeHtml(title)}</h2><p>${escapeHtml(emptyMessage)}</p></section>`;
  }

  const headers = Object.keys(keys);
  const body = rows.map((row) => (
    `<tr>${headers.map((header) => `<td>${escapeHtml(String(keys[header](row)))}</td>`).join('')}</tr>`
  )).join('');

  return [
    '<section>',
    `<h2>${escapeHtml(title)}</h2>`,
    '<table>',
    `<thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>`,
    `<tbody>${body}</tbody>`,
    '</table>',
    '</section>',
  ].join('\n');
}

export function renderDependencyGraphReportHtml(report) {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '  <title>PlotMapAI Dependency Graph Report</title>',
    '  <style>',
    '    :root { color-scheme: light; font-family: ui-sans-serif, system-ui, sans-serif; }',
    '    body { margin: 0; padding: 32px; background: #f8fafc; color: #0f172a; }',
    '    main { max-width: 1120px; margin: 0 auto; }',
    '    h1, h2 { margin: 0 0 12px; }',
    '    p { line-height: 1.6; }',
    '    section { margin-top: 24px; padding: 24px; background: white; border: 1px solid #e2e8f0; border-radius: 16px; }',
    '    table { width: 100%; border-collapse: collapse; font-size: 14px; }',
    '    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }',
    '    th { background: #f8fafc; font-weight: 700; }',
    '    ul { margin: 0; padding-left: 20px; }',
    '    code { font-family: ui-monospace, SFMono-Regular, monospace; }',
    '    .muted { color: #475569; }',
    '  </style>',
    '</head>',
    '<body>',
    '<main>',
    '  <h1>PlotMapAI Dependency Graph Report</h1>',
    `  <p class="muted">Generated at ${escapeHtml(report.generatedAt)}</p>`,
    `  ${renderSummaryTable(report.summary)}`,
    renderDependencyTable(
      'Observed Layer Dependencies',
      report.layerDependencies,
      {
        Count: (row) => row.count,
        From: (row) => row.fromLayer,
        To: (row) => row.toLayer,
      },
      'No layer dependencies were observed inside the configured source scope.',
    ),
    renderDependencyTable(
      'Layer Violations',
      report.layerViolations,
      {
        From: (row) => row.from,
        'From Layer': (row) => row.fromLayer,
        To: (row) => row.to,
        'To Layer': (row) => row.toLayer,
      },
      'No layer violations found.',
    ),
    renderDependencyTable(
      'Observed Cross-Domain Dependencies',
      report.domainDependencies,
      {
        Count: (row) => row.count,
        From: (row) => row.fromDomain,
        To: (row) => row.toDomain,
      },
      'No cross-domain dependencies were observed inside src/domains.',
    ),
    renderDependencyTable(
      'Domain Violations',
      report.domainViolations,
      {
        From: (row) => row.from,
        'From Domain': (row) => row.fromDomain,
        To: (row) => row.to,
        'To Domain': (row) => row.toDomain,
      },
      'No domain violations found.',
    ),
    renderListSection(
      'New File-Level Cycles',
      report.newCycles,
      (cycle) => `<code>${cycle.files.map(escapeHtml).join('</code> &rarr; <code>')}</code>`,
      'No new file-level cycles found.',
    ),
    renderListSection(
      'Baseline Cycles',
      report.baselineCycles,
      (cycle) => `${escapeHtml(cycle.reason)}<br /><code>${cycle.files.map(escapeHtml).join('</code> | <code>')}</code>`,
      'No baseline cycles were observed.',
    ),
    renderListSection(
      'Resolved Baseline Cycles',
      report.resolvedBaselineCycles,
      (cycle) => `${escapeHtml(cycle.reason)}<br /><code>${cycle.files.map(escapeHtml).join('</code> | <code>')}</code>`,
      'No baseline cycles were resolved in this run.',
    ),
    renderListSection(
      'Unclassified Modules',
      report.unclassifiedModules,
      (modulePath) => `<code>${escapeHtml(modulePath)}</code>`,
      'All analyzed modules map cleanly to a declared architecture layer.',
    ),
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

export function writeDependencyGraphReports(report, reportPaths) {
  mkdirSync(dirname(reportPaths.json), { recursive: true });
  mkdirSync(dirname(reportPaths.html), { recursive: true });

  writeFileSync(reportPaths.json, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(reportPaths.html, renderDependencyGraphReportHtml(report));
}
