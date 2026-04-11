import { describe, it, expect } from 'vitest';

import type { BookChapter } from '@shared/contracts';

import { DEFAULT_ANALYSIS_PROVIDER_ID } from '../../providers';
import {
  buildRuntimeAnalysisConfig,
  maskApiKey,
  cleanText,
  normalizeBaseUrl,
  validateAnalysisConfig,
  buildAnalysisChunks,
  isChapterAnalysisComplete,
  isOverviewComplete,
  serializeOverview,
  serializeChapterAnalysis,
  buildCharacterGraphPayload,
  AnalysisConfigError,
  ChunkingError,
  type RuntimeAnalysisConfig,
  type RuntimeAnalysisConfigInput,
} from '..';
import type {
  StoredAnalysisOverview,
  StoredChapterAnalysis,
} from '../../runtime/types';

describe('maskApiKey', () => {
  it('returns empty string for empty input', () => {
    expect(maskApiKey('')).toBe('');
  });

  it('masks short keys entirely', () => {
    expect(maskApiKey('abc')).toBe('***');
  });

  it('masks middle of long keys', () => {
    const masked = maskApiKey('sk-1234567890abcdef');
    expect(masked).toContain('sk-1');
    expect(masked).toContain('cdef');
    expect(masked).toContain('*');
  });

  it('handles keys of length 8', () => {
    expect(maskApiKey('12345678')).toBe('********');
  });
});

describe('cleanText', () => {
  it('returns empty for null/undefined', () => {
    expect(cleanText(null)).toBe('');
    expect(cleanText(undefined)).toBe('');
  });

  it('trims whitespace', () => {
    expect(cleanText('  hello  ')).toBe('hello');
  });

  it('collapses whitespace', () => {
    expect(cleanText('a   b\nc')).toBe('a b c');
  });

  it('truncates to maxLength', () => {
    expect(cleanText('abcdef', 3)).toBe('abc');
  });

  it('converts non-string to string', () => {
    expect(cleanText(42)).toBe('42');
  });
});

describe('normalizeBaseUrl', () => {
  it('returns empty for empty input', () => {
    expect(normalizeBaseUrl('')).toBe('');
  });

  it('strips trailing slashes', () => {
    expect(normalizeBaseUrl('http://example.com///')).toBe('http://example.com');
  });

  it('throws for non-http URLs', () => {
    expect(() => normalizeBaseUrl('ftp://example.com')).toThrow(AnalysisConfigError);
  });

  it('accepts https URLs', () => {
    expect(normalizeBaseUrl('https://api.example.com')).toBe('https://api.example.com');
  });
});

describe('validateAnalysisConfig', () => {
  const validConfig: RuntimeAnalysisConfig = {
    providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
    contextSize: 32000,
    providerConfig: {
      apiBaseUrl: 'http://localhost:5000',
      apiKey: 'sk-test12345678',
      modelName: 'gpt-4',
    },
  };

  it('passes for valid config', () => {
    expect(() => validateAnalysisConfig(validConfig)).not.toThrow();
  });

  it('throws for missing config', () => {
    expect(() => {
      // @ts-expect-error intentionally validating runtime guard behavior with invalid input
      validateAnalysisConfig(null);
    }).toThrow(AnalysisConfigError);
  });

  it('throws for empty apiBaseUrl', () => {
    expect(() => validateAnalysisConfig({
      ...validConfig,
      providerConfig: { ...validConfig.providerConfig, apiBaseUrl: '' },
    })).toThrow(AnalysisConfigError);
  });

  it('throws for empty apiKey', () => {
    expect(() => validateAnalysisConfig({
      ...validConfig,
      providerConfig: { ...validConfig.providerConfig, apiKey: '' },
    })).toThrow(AnalysisConfigError);
  });

  it('throws for empty modelName', () => {
    expect(() => validateAnalysisConfig({
      ...validConfig,
      providerConfig: { ...validConfig.providerConfig, modelName: '' },
    })).toThrow(AnalysisConfigError);
  });

  it('throws for small contextSize', () => {
    expect(() => (
      validateAnalysisConfig({ ...validConfig, contextSize: 1000 })
    )).toThrow(AnalysisConfigError);
  });
});

describe('buildRuntimeAnalysisConfig', () => {
  it('throws for invalid providerId', () => {
    expect(() => buildRuntimeAnalysisConfig({
      providerId: 'invalid-provider',
      contextSize: 32000,
      providerConfig: {
        apiBaseUrl: 'http://localhost:5000',
        apiKey: 'token',
        modelName: 'gpt-test',
      },
    })).toThrow(AnalysisConfigError);
  });

  it('accepts nested providerConfig input', () => {
    expect(buildRuntimeAnalysisConfig({
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
      contextSize: 32000,
      providerConfig: {
        apiBaseUrl: 'http://localhost:5000',
        apiKey: 'token',
        modelName: 'gpt-test',
      },
    }).providerConfig.modelName).toBe('gpt-test');
  });

  it('throws for legacy flat config input', () => {
    const legacyInput: RuntimeAnalysisConfigInput & {
      apiBaseUrl: string;
      apiKey: string;
      modelName: string;
    } = {
      providerId: DEFAULT_ANALYSIS_PROVIDER_ID,
      apiBaseUrl: 'http://localhost:5000',
      apiKey: 'token',
      modelName: 'gpt-test',
      contextSize: 32000,
    };

    expect(() => buildRuntimeAnalysisConfig(legacyInput)).toThrow(AnalysisConfigError);
  });
});

describe('buildAnalysisChunks', () => {
  it('creates chunks from chapters', () => {
    const chapters = [
      { chapterIndex: 0, title: 'Ch1', content: 'Short content.' },
      { chapterIndex: 1, title: 'Ch2', content: 'Another chapter.' },
    ];
    const chunks = buildAnalysisChunks(chapters, 32000);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect((chunks[0].chapterIndices as number[])).toContain(0);
  });

  it('throws for too-small context', () => {
    const chapters = [{ chapterIndex: 0, title: 'Ch1', content: 'content' }];
    expect(() => buildAnalysisChunks(chapters, 1000)).toThrow(ChunkingError);
  });

  it('throws when single chapter exceeds budget', () => {
    const chapters = [{
      chapterIndex: 0,
      title: 'Huge',
      content: 'x'.repeat(100000),
    }];
    expect(() => buildAnalysisChunks(chapters, 12000)).toThrow(ChunkingError);
  });

  it('splits multiple chapters into separate chunks when needed', () => {
    const chapters = Array.from({ length: 20 }, (_, i) => ({
      chapterIndex: i,
      title: `Chapter ${i + 1}`,
      content: 'x'.repeat(500),
    }));
    const chunks = buildAnalysisChunks(chapters, 12000);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });
});

describe('isChapterAnalysisComplete', () => {
  it('returns false for undefined', () => {
    expect(isChapterAnalysisComplete(undefined)).toBe(false);
  });

  it('returns false for empty summary', () => {
    const row: StoredChapterAnalysis = {
      id: 1,
      novelId: 1,
      chapterIndex: 0,
      chapterTitle: 'Ch1',
      summary: '',
      keyPoints: [],
      characters: [],
      relationships: [],
      tags: [],
      chunkIndex: 0,
      updatedAt: '',
    };
    expect(isChapterAnalysisComplete(row)).toBe(false);
  });

  it('returns true for valid complete analysis', () => {
    const row: StoredChapterAnalysis = {
      id: 1,
      novelId: 1,
      chapterIndex: 0,
      chapterTitle: 'Ch1',
      summary: 'A valid summary',
      keyPoints: ['point1'],
      characters: [{ name: 'Hero', role: '', description: '', weight: 80 }],
      relationships: [],
      tags: ['action'],
      chunkIndex: 0,
      updatedAt: '',
    };
    expect(isChapterAnalysisComplete(row)).toBe(true);
  });

  it('returns true for analysis with all arrays present (even empty)', () => {
    const row: StoredChapterAnalysis = {
      id: 1,
      novelId: 1,
      chapterIndex: 0,
      chapterTitle: 'Ch1',
      summary: 'Valid',
      keyPoints: [],
      characters: [],
      relationships: [],
      tags: [],
      chunkIndex: 0,
      updatedAt: '',
    };
    expect(isChapterAnalysisComplete(row)).toBe(true);
  });
});

describe('isOverviewComplete', () => {
  it('returns false for undefined', () => {
    expect(isOverviewComplete(undefined, 10)).toBe(false);
  });

  it('returns false when totalChapters <= 0', () => {
    const overview: StoredAnalysisOverview = {
      id: 0,
      novelId: 0,
      bookIntro: '',
      globalSummary: '',
      themes: [],
      characterStats: [],
      relationshipGraph: [],
      totalChapters: 0,
      analyzedChapters: 0,
      updatedAt: '',
    };
    expect(isOverviewComplete(overview, 0)).toBe(false);
  });

  it('returns false for empty bookIntro', () => {
    const overview: StoredAnalysisOverview = {
      id: 1,
      novelId: 1,
      bookIntro: '',
      globalSummary: 'Summary',
      themes: [],
      characterStats: [],
      relationshipGraph: [],
      totalChapters: 10,
      analyzedChapters: 10,
      updatedAt: '',
    };
    expect(isOverviewComplete(overview, 10)).toBe(false);
  });

  it('returns true for valid complete overview', () => {
    const overview: StoredAnalysisOverview = {
      id: 1,
      novelId: 1,
      bookIntro: 'A book about adventure and mystery in a faraway land.',
      globalSummary: 'The story follows multiple characters through a series of events that test their resolve and bring them together.',
      themes: ['adventure', 'mystery'],
      characterStats: [{ name: 'Hero', role: 'protagonist', description: 'The hero', weight: 80, sharePercent: 100, chapters: [0], chapterCount: 1 }],
      relationshipGraph: [],
      totalChapters: 10,
      analyzedChapters: 10,
      updatedAt: '',
    };
    expect(isOverviewComplete(overview, 10)).toBe(true);
  });
});

describe('serializeOverview', () => {
  it('returns null for undefined', () => {
    expect(serializeOverview(undefined)).toBeNull();
  });

  it('serializes with native array fields', () => {
    const overview: StoredAnalysisOverview = {
      id: 1,
      novelId: 1,
      bookIntro: 'Intro',
      globalSummary: 'Summary',
      themes: ['theme1'],
      characterStats: [{ name: 'A', role: 'supporting', description: 'desc', weight: 80, sharePercent: 100, chapters: [0], chapterCount: 1 }],
      relationshipGraph: [],
      totalChapters: 5,
      analyzedChapters: 5,
      updatedAt: '2024-01-01',
    };
    const result = serializeOverview(overview);
    expect(result).not.toBeNull();
    expect(result!.bookIntro).toBe('Intro');
    expect(result!.themes).toEqual(['theme1']);
    expect(Array.isArray(result!.characterStats)).toBe(true);
  });
});

describe('serializeChapterAnalysis', () => {
  it('returns null for undefined', () => {
    expect(serializeChapterAnalysis(undefined)).toBeNull();
  });

  it('serializes with native array fields', () => {
    const row: StoredChapterAnalysis = {
      id: 1,
      novelId: 1,
      chapterIndex: 0,
      chapterTitle: 'Ch1',
      summary: 'Summary',
      keyPoints: ['p1'],
      characters: [],
      relationships: [],
      tags: ['t1'],
      chunkIndex: 0,
      updatedAt: '',
    };
    const result = serializeChapterAnalysis(row);
    expect(result).not.toBeNull();
    expect(result!.chapterTitle).toBe('Ch1');
    expect(result!.keyPoints).toEqual(['p1']);
    expect(result!.tags).toEqual(['t1']);
  });
});

describe('buildCharacterGraphPayload', () => {
  it('returns empty graph for no data', () => {
    const result = buildCharacterGraphPayload([], [], undefined);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect((result.meta as Record<string, unknown>).hasData).toBe(false);
  });

  it('builds graph from chapter analyses', () => {
    const chapters: BookChapter[] = [
      { title: 'Ch1', content: 'content', chapterIndex: 0, wordCount: 100 },
    ];
    const analyses: StoredChapterAnalysis[] = [{
      id: 1,
      novelId: 1,
      chapterIndex: 0,
      chapterTitle: 'Ch1',
      summary: 'Summary',
      keyPoints: ['point'],
      characters: [{ name: 'Alice', role: 'protagonist', description: 'Hero', weight: 80 }],
      relationships: [{ source: 'Alice', target: 'Bob', type: 'ally', description: 'Allies', weight: 60 }],
      tags: ['action'],
      chunkIndex: 0,
      updatedAt: '2024-01-01',
    }];

    const result = buildCharacterGraphPayload(chapters, analyses, undefined);
    expect((result.nodes as unknown[]).length).toBeGreaterThan(0);
    expect((result.meta as Record<string, unknown>).hasData).toBe(true);
  });
});
