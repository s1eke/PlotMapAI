// @vitest-environment node

import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { describe, expect, it } from 'vitest';

import {
  evaluateDependencyGraph,
  renderDependencyGraphReportHtml,
  writeDependencyGraphReports,
} from '../dependencyGraph.mjs';

function createContract() {
  return {
    dependencyGraph: {
      allowedDomainDependencies: [
        {
          from: 'reader-content',
          to: ['reader-media'],
        },
      ],
      cycleBaseline: [
        {
          files: [
            'src/domains/library/a.ts',
            'src/domains/library/b.ts',
          ],
          reason: 'Legacy library SCC baseline.',
        },
        {
          files: [
            'src/domains/book-import/legacyA.ts',
            'src/domains/book-import/legacyB.ts',
          ],
          reason: 'Resolved legacy SCC baseline.',
        },
      ],
      excludePathPattern: '(^|/)(__tests__|test)(/|$)',
      fileExtensions: ['.ts', '.tsx'],
      reports: {
        html: 'dist/analysis/dependency-graph-report.html',
        json: 'dist/analysis/dependency-graph-report.json',
      },
      sourceDirectories: ['src'],
    },
    layers: [
      { name: 'app', root: 'src/app', canDependOn: ['application', 'domains', 'shared', 'infra'] },
      { name: 'application', root: 'src/application', canDependOn: ['domains', 'shared', 'infra'] },
      { name: 'domains', root: 'src/domains', canDependOn: ['shared', 'infra'] },
      { name: 'shared', root: 'src/shared', canDependOn: ['infra'] },
      { name: 'infra', root: 'src/infra', canDependOn: ['shared'] },
    ],
  };
}

function createCruiseResult() {
  return {
    modules: [
      {
        source: 'src/application/useThing.ts',
        dependencies: [
          { resolved: 'src/app/router/paths.ts' },
        ],
      },
      {
        source: 'src/app/router/paths.ts',
        dependencies: [],
      },
      {
        source: 'src/domains/reader-shell/useShell.ts',
        dependencies: [
          { resolved: 'src/domains/reader-content/index.ts' },
        ],
      },
      {
        source: 'src/domains/reader-content/index.ts',
        dependencies: [
          { resolved: 'src/domains/reader-media/index.ts' },
        ],
      },
      {
        source: 'src/domains/reader-media/index.ts',
        dependencies: [],
      },
      {
        source: 'src/domains/library/a.ts',
        dependencies: [
          { circular: true, resolved: 'src/domains/library/b.ts' },
        ],
      },
      {
        source: 'src/domains/library/b.ts',
        dependencies: [
          { circular: true, resolved: 'src/domains/library/a.ts' },
        ],
      },
      {
        source: 'src/shared/cycleA.ts',
        dependencies: [
          { circular: true, resolved: 'src/shared/cycleB.ts' },
        ],
      },
      {
        source: 'src/shared/cycleB.ts',
        dependencies: [
          { circular: true, resolved: 'src/shared/cycleA.ts' },
        ],
      },
      {
        source: 'src/misc/tool.ts',
        dependencies: [],
      },
    ],
  };
}

describe('dependencyGraph', () => {
  it('reports layer violations, domain violations, baseline cycles, new cycles, and resolved baseline cycles', () => {
    const report = evaluateDependencyGraph(createCruiseResult(), createContract());

    expect(report.layerViolations).toEqual([
      expect.objectContaining({
        from: 'src/application/useThing.ts',
        fromLayer: 'application',
        to: 'src/app/router/paths.ts',
        toLayer: 'app',
      }),
    ]);
    expect(report.domainViolations).toEqual([
      expect.objectContaining({
        from: 'src/domains/reader-shell/useShell.ts',
        fromDomain: 'reader-shell',
        to: 'src/domains/reader-content/index.ts',
        toDomain: 'reader-content',
      }),
    ]);
    expect(report.baselineCycles).toEqual([
      expect.objectContaining({
        files: [
          'src/domains/library/a.ts',
          'src/domains/library/b.ts',
        ],
        reason: 'Legacy library SCC baseline.',
      }),
    ]);
    expect(report.newCycles).toEqual([
      expect.objectContaining({
        files: [
          'src/shared/cycleA.ts',
          'src/shared/cycleB.ts',
        ],
      }),
    ]);
    expect(report.resolvedBaselineCycles).toEqual([
      expect.objectContaining({
        files: [
          'src/domains/book-import/legacyA.ts',
          'src/domains/book-import/legacyB.ts',
        ],
        reason: 'Resolved legacy SCC baseline.',
      }),
    ]);
    expect(report.unclassifiedModules).toEqual([
      'src/misc/tool.ts',
    ]);
  });

  it('renders an HTML report with the expected sections', () => {
    const report = evaluateDependencyGraph(createCruiseResult(), createContract());
    const html = renderDependencyGraphReportHtml(report);

    expect(html).toContain('PlotMapAI Dependency Graph Report');
    expect(html).toContain('Layer Violations');
    expect(html).toContain('Domain Violations');
    expect(html).toContain('New File-Level Cycles');
    expect(html).toContain('Resolved Baseline Cycles');
  });

  it('writes JSON and HTML reports to disk', () => {
    const report = evaluateDependencyGraph(createCruiseResult(), createContract());
    const directory = mkdtempSync(join(tmpdir(), 'plotmapai-dependency-graph-'));
    const reportPaths = {
      html: join(directory, 'dependency-graph-report.html'),
      json: join(directory, 'dependency-graph-report.json'),
    };

    try {
      writeDependencyGraphReports(report, reportPaths);

      const writtenJson = JSON.parse(readFileSync(reportPaths.json, 'utf8'));
      const writtenHtml = readFileSync(reportPaths.html, 'utf8');
      expect(writtenJson.summary).toMatchObject({
        layerViolationCount: 1,
        domainViolationCount: 1,
        newCycleCount: 1,
      });
      expect(writtenHtml).toContain('Observed Cross-Domain Dependencies');
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
