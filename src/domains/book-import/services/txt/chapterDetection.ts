import type {
  ChapterDetectionRule,
  ChapterDetectionRuleSource,
} from '@shared/text-processing';
import { stripLeadingChapterTitle } from '@shared/text-processing';
import type { DetectedChapter, SplitChapter } from './types';

const MIN_WEAK_CANDIDATE_COUNT = 3;
const MIN_INCREMENTING_RATIO = 0.8;
const MIN_MEDIAN_NON_EMPTY_LINE_SPAN = 6;
const MIN_MEDIAN_CHAR_SPAN = 300;
const MIN_STRONG_SECTION_NON_EMPTY_LINE_SPAN = 3;
const MIN_STRONG_SECTION_CHAR_SPAN = 120;

type HeadingStrength = 'strong' | 'weak';
type WeakHeadingKind = 'arabic_delimited' | 'cjk_delimited' | 'bracketed_number' | 'no_number' | 'other';

interface WeakHeadingMatch {
  kind: WeakHeadingKind;
  ordinal: number;
}

interface CompiledChapterRule {
  pattern: RegExp;
  source: ChapterDetectionRuleSource;
}

interface DetectedHeadingCandidate {
  lineIndex: number;
  title: string;
  lineText: string;
  charStart: number;
  prevNonEmptyLineIndex: number | null;
  nextNonEmptyLineIndex: number | null;
  source: ChapterDetectionRuleSource;
  strength: HeadingStrength;
  weakKind: WeakHeadingKind | null;
  ordinal: number | null;
}

const ARABIC_DELIMITED_PATTERN = /^\s*(\d{1,5})\s*[.、:：,，_—-]\s*\S.*$/;
const CJK_DELIMITED_PATTERN = /^\s*([零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]{1,12})\s*[.、:：,，_—-]\s*\S.*$/u;
const BRACKETED_NUMBER_PATTERN = /^\s*(?:\(|（|\[)\s*(\d{1,5})\s*(?:\)|）|\])\s*\S.*$/;
const NO_NUMBER_PATTERN = /^\s*[Nn][Oo]\.?\s*(\d{1,5})\s+\S.*$/;

const CJK_DIGIT_VALUES: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  壹: 1,
  贰: 2,
  叁: 3,
  肆: 4,
  伍: 5,
  陆: 6,
  柒: 7,
  捌: 8,
  玖: 9,
};

const CJK_UNIT_VALUES: Record<string, number> = {
  十: 10,
  百: 100,
  千: 1000,
  万: 10000,
  拾: 10,
  佰: 100,
  仟: 1000,
};

function splitTextFixed(text: string, chunkSize: number): SplitChapter[] {
  if (!text) {
    return [];
  }

  const chunks: SplitChapter[] = [];
  let remaining = text;
  let chunkIndex = 1;

  while (remaining) {
    if (remaining.length <= chunkSize) {
      chunks.push({ title: `第${chunkIndex}部分`, content: remaining.trim() });
      break;
    }

    let cutPosition = chunkSize;
    let newlinePosition = remaining.lastIndexOf('\n\n', chunkSize);
    if (newlinePosition > chunkSize * 0.5) {
      cutPosition = newlinePosition + 2;
    } else {
      newlinePosition = remaining.lastIndexOf('\n', chunkSize);
      if (newlinePosition > chunkSize * 0.5) {
        cutPosition = newlinePosition + 1;
      }
    }

    chunks.push({ title: `第${chunkIndex}部分`, content: remaining.slice(0, cutPosition).trim() });
    remaining = remaining.slice(cutPosition);
    chunkIndex += 1;
  }

  return chunks;
}

function compileRules(rules: ChapterDetectionRule[]): CompiledChapterRule[] {
  const compiledRules: CompiledChapterRule[] = [];
  for (const rule of rules) {
    if (!rule.rule) {
      continue;
    }
    try {
      compiledRules.push({
        pattern: new RegExp(rule.rule, 'm'),
        source: rule.source ?? 'default',
      });
    } catch {
      continue;
    }
  }

  return compiledRules;
}

function buildLineStarts(lines: string[]): number[] {
  const lineStarts: number[] = [];
  let offset = 0;

  for (let index = 0; index < lines.length; index += 1) {
    lineStarts.push(offset);
    offset += lines[index].length + 1;
  }

  return lineStarts;
}

function buildPrevNonEmptyLineIndices(lines: string[]): Array<number | null> {
  const result: Array<number | null> = new Array(lines.length).fill(null);
  let prevNonEmptyLineIndex: number | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    result[index] = prevNonEmptyLineIndex;
    if (lines[index].trim()) {
      prevNonEmptyLineIndex = index;
    }
  }

  return result;
}

function buildNextNonEmptyLineIndices(lines: string[]): Array<number | null> {
  const result: Array<number | null> = new Array(lines.length).fill(null);
  let nextNonEmptyLineIndex: number | null = null;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    result[index] = nextNonEmptyLineIndex;
    if (lines[index].trim()) {
      nextNonEmptyLineIndex = index;
    }
  }

  return result;
}

function buildNonEmptyLinePrefixCounts(lines: string[]): number[] {
  const prefixCounts: number[] = [0];

  for (const line of lines) {
    prefixCounts.push(prefixCounts[prefixCounts.length - 1] + (line.trim() ? 1 : 0));
  }

  return prefixCounts;
}

function countNonEmptyLinesBetween(
  startLineIndex: number,
  endLineIndex: number,
  prefixCounts: number[],
): number {
  if (endLineIndex <= startLineIndex + 1) {
    return 0;
  }

  return prefixCounts[endLineIndex] - prefixCounts[startLineIndex + 1];
}

function getMedian(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function parseCjkOrdinal(input: string): number | null {
  const text = input.trim();
  if (!text) {
    return null;
  }

  const hasUnit = [...text].some((char) => char in CJK_UNIT_VALUES);
  if (!hasUnit) {
    let digits = '';
    for (const char of text) {
      const value = CJK_DIGIT_VALUES[char];
      if (value === undefined) {
        return null;
      }
      digits += String(value);
    }
    return Number(digits);
  }

  let total = 0;
  let section = 0;
  let currentDigit = 0;

  for (const char of text) {
    const digitValue = CJK_DIGIT_VALUES[char];
    if (digitValue !== undefined) {
      currentDigit = digitValue;
      continue;
    }

    const unitValue = CJK_UNIT_VALUES[char];
    if (unitValue === undefined) {
      return null;
    }

    if (unitValue === 10000) {
      section = (section + (currentDigit || 1)) * unitValue;
      total += section;
      section = 0;
      currentDigit = 0;
      continue;
    }

    section += (currentDigit || 1) * unitValue;
    currentDigit = 0;
  }

  return total + section + currentDigit;
}

function classifyWeakHeading(title: string): WeakHeadingMatch | null {
  const stripped = title.trim();

  const arabicMatch = stripped.match(ARABIC_DELIMITED_PATTERN);
  if (arabicMatch) {
    return {
      kind: 'arabic_delimited',
      ordinal: Number(arabicMatch[1]),
    };
  }

  const cjkMatch = stripped.match(CJK_DELIMITED_PATTERN);
  if (cjkMatch) {
    const ordinal = parseCjkOrdinal(cjkMatch[1]);
    if (ordinal !== null) {
      return {
        kind: 'cjk_delimited',
        ordinal,
      };
    }
  }

  const bracketedMatch = stripped.match(BRACKETED_NUMBER_PATTERN);
  if (bracketedMatch) {
    return {
      kind: 'bracketed_number',
      ordinal: Number(bracketedMatch[1]),
    };
  }

  const noNumberMatch = stripped.match(NO_NUMBER_PATTERN);
  if (noNumberMatch) {
    return {
      kind: 'no_number',
      ordinal: Number(noNumberMatch[1]),
    };
  }

  return null;
}

function selectMatchingRule(
  lineText: string,
  compiledRules: CompiledChapterRule[],
): CompiledChapterRule | null {
  let matchedDefaultRule: CompiledChapterRule | null = null;

  for (const compiledRule of compiledRules) {
    if (!compiledRule.pattern.test(lineText)) {
      continue;
    }

    if (compiledRule.source === 'custom') {
      return compiledRule;
    }

    if (matchedDefaultRule === null) {
      matchedDefaultRule = compiledRule;
    }
  }

  return matchedDefaultRule;
}

function collectHeadingCandidates(
  lines: string[],
  compiledRules: CompiledChapterRule[],
  lineStarts: number[],
  prevNonEmptyLineIndices: Array<number | null>,
  nextNonEmptyLineIndices: Array<number | null>,
): DetectedHeadingCandidate[] {
  const candidates: DetectedHeadingCandidate[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const lineText = lines[index];
    const stripped = lineText.trim();
    if (!stripped) {
      continue;
    }

    const matchedRule = selectMatchingRule(lineText, compiledRules);
    if (matchedRule === null) {
      continue;
    }

    const weakMatch = classifyWeakHeading(stripped);
    candidates.push({
      lineIndex: index,
      title: stripped,
      lineText,
      charStart: lineStarts[index],
      prevNonEmptyLineIndex: prevNonEmptyLineIndices[index],
      nextNonEmptyLineIndex: nextNonEmptyLineIndices[index],
      source: matchedRule.source,
      strength: weakMatch ? 'weak' : 'strong',
      weakKind: weakMatch?.kind ?? null,
      ordinal: weakMatch?.ordinal ?? null,
    });
  }

  return candidates;
}

function groupWeakCandidatesByKind(
  candidates: DetectedHeadingCandidate[],
): Map<WeakHeadingKind, DetectedHeadingCandidate[]> {
  const groups = new Map<WeakHeadingKind, DetectedHeadingCandidate[]>();

  for (const candidate of candidates) {
    if (candidate.strength !== 'weak' || candidate.weakKind === null || candidate.ordinal === null) {
      continue;
    }

    const currentGroup = groups.get(candidate.weakKind) ?? [];
    currentGroup.push(candidate);
    groups.set(candidate.weakKind, currentGroup);
  }

  return groups;
}

function hasConsistentOrdinalProgression(candidates: DetectedHeadingCandidate[]): boolean {
  if (candidates.length < MIN_WEAK_CANDIDATE_COUNT) {
    return false;
  }

  let increasingTransitions = 0;

  for (let index = 1; index < candidates.length; index += 1) {
    const previous = candidates[index - 1].ordinal;
    const current = candidates[index].ordinal;
    if (previous === null || current === null) {
      continue;
    }

    if (current > previous) {
      increasingTransitions += 1;
    }
  }

  return increasingTransitions / Math.max(candidates.length - 1, 1) >= MIN_INCREMENTING_RATIO;
}

function hasChapterLikeSpacing(
  candidates: DetectedHeadingCandidate[],
  nonEmptyLinePrefixCounts: number[],
): boolean {
  if (candidates.length < MIN_WEAK_CANDIDATE_COUNT) {
    return false;
  }

  const charSpans: number[] = [];
  const nonEmptyLineSpans: number[] = [];

  for (let index = 1; index < candidates.length; index += 1) {
    const previous = candidates[index - 1];
    const current = candidates[index];
    charSpans.push(current.charStart - previous.charStart);
    nonEmptyLineSpans.push(
      countNonEmptyLinesBetween(previous.lineIndex, current.lineIndex, nonEmptyLinePrefixCounts),
    );
  }

  return getMedian(nonEmptyLineSpans) >= MIN_MEDIAN_NON_EMPTY_LINE_SPAN
    || getMedian(charSpans) >= MIN_MEDIAN_CHAR_SPAN;
}

function isSuppressedInsideStructuralChapter(
  candidate: DetectedHeadingCandidate,
  allCandidates: DetectedHeadingCandidate[],
  structuralCandidates: DetectedHeadingCandidate[],
  nonEmptyLinePrefixCounts: number[],
  textLength: number,
): boolean {
  let hasPreviousStrong = false;
  let hasNextStrong = false;

  for (const structuralCandidate of structuralCandidates) {
    if (structuralCandidate.lineIndex < candidate.lineIndex) {
      hasPreviousStrong = true;
      continue;
    }

    if (structuralCandidate.lineIndex > candidate.lineIndex) {
      hasNextStrong = true;
      break;
    }
  }

  if (!hasPreviousStrong || !hasNextStrong) {
    return false;
  }

  const currentIndex = allCandidates.findIndex((entry) => entry.lineIndex === candidate.lineIndex);
  const nextCandidate = currentIndex >= 0 && currentIndex < allCandidates.length - 1
    ? allCandidates[currentIndex + 1]
    : null;
  const charSpan = nextCandidate
    ? nextCandidate.charStart - candidate.charStart
    : textLength - candidate.charStart;
  const nonEmptyLineSpan = nextCandidate
    ? countNonEmptyLinesBetween(
      candidate.lineIndex,
      nextCandidate.lineIndex,
      nonEmptyLinePrefixCounts,
    )
    : 0;

  return charSpan < MIN_STRONG_SECTION_CHAR_SPAN
    && nonEmptyLineSpan < MIN_STRONG_SECTION_NON_EMPTY_LINE_SPAN;
}

function selectAcceptedWeakCandidates(
  defaultCandidates: DetectedHeadingCandidate[],
  allCandidates: DetectedHeadingCandidate[],
  structuralCandidates: DetectedHeadingCandidate[],
  nonEmptyLinePrefixCounts: number[],
  textLength: number,
): DetectedHeadingCandidate[] {
  const accepted: DetectedHeadingCandidate[] = [];
  const groups = groupWeakCandidatesByKind(defaultCandidates);

  for (const groupCandidates of groups.values()) {
    const sortedGroup = [...groupCandidates].sort(
      (left, right) => left.lineIndex - right.lineIndex,
    );
    if (!hasConsistentOrdinalProgression(sortedGroup)) {
      continue;
    }
    if (!hasChapterLikeSpacing(sortedGroup, nonEmptyLinePrefixCounts)) {
      continue;
    }

    accepted.push(
      ...sortedGroup.filter((candidate) => !isSuppressedInsideStructuralChapter(
        candidate,
        allCandidates,
        structuralCandidates,
        nonEmptyLinePrefixCounts,
        textLength,
      )),
    );
  }

  return accepted;
}

function buildDetectedChapters(
  lines: string[],
  candidates: DetectedHeadingCandidate[],
): DetectedChapter[] {
  if (candidates.length === 0) {
    return [];
  }

  const chapters: DetectedChapter[] = [];
  const sortedCandidates = [...candidates].sort((left, right) => left.lineIndex - right.lineIndex);

  if (sortedCandidates[0].lineIndex > 0) {
    const prefaceText = lines.slice(0, sortedCandidates[0].lineIndex).join('\n').trim();
    if (prefaceText) {
      chapters.push({
        title: '前言',
        start: 0,
        end: sortedCandidates[0].lineIndex,
      });
    }
  }

  for (let index = 0; index < sortedCandidates.length; index += 1) {
    const candidate = sortedCandidates[index];
    const end = index + 1 < sortedCandidates.length
      ? sortedCandidates[index + 1].lineIndex
      : lines.length;
    chapters.push({
      title: candidate.title,
      start: candidate.lineIndex,
      end,
    });
  }

  return chapters;
}

export function detectChapters(
  text: string,
  rules: ChapterDetectionRule[],
): DetectedChapter[] {
  if (!text || !rules || rules.length === 0) {
    return [];
  }

  const compiledRules = compileRules(rules);
  if (compiledRules.length === 0) {
    return [];
  }

  const lines = text.split('\n');
  const lineStarts = buildLineStarts(lines);
  const prevNonEmptyLineIndices = buildPrevNonEmptyLineIndices(lines);
  const nextNonEmptyLineIndices = buildNextNonEmptyLineIndices(lines);
  const nonEmptyLinePrefixCounts = buildNonEmptyLinePrefixCounts(lines);
  const candidates = collectHeadingCandidates(
    lines,
    compiledRules,
    lineStarts,
    prevNonEmptyLineIndices,
    nextNonEmptyLineIndices,
  );

  if (candidates.length === 0) {
    return [];
  }

  const customCandidates = candidates.filter((candidate) => candidate.source === 'custom');
  const defaultCandidates = candidates.filter((candidate) => candidate.source === 'default');
  const defaultStrongCandidates = defaultCandidates.filter((candidate) => candidate.strength === 'strong');
  const structuralCandidates = [...customCandidates, ...defaultStrongCandidates]
    .sort((left, right) => left.lineIndex - right.lineIndex);
  const acceptedCandidates = [
    ...customCandidates,
    ...defaultStrongCandidates,
    ...selectAcceptedWeakCandidates(
      defaultCandidates,
      candidates,
      structuralCandidates,
      nonEmptyLinePrefixCounts,
      text.length,
    ),
  ].sort((left, right) => left.lineIndex - right.lineIndex);

  if (acceptedCandidates.length === 0) {
    return [];
  }

  return buildDetectedChapters(lines, acceptedCandidates);
}

export function splitByChapters(
  text: string,
  chapters: DetectedChapter[],
  maxChunkSize = 50000,
): SplitChapter[] {
  const lines = text.split('\n');

  if (!chapters || chapters.length === 0) {
    return splitTextFixed(text, maxChunkSize);
  }

  const result: SplitChapter[] = [];
  for (const chapter of chapters) {
    const content = stripLeadingChapterTitle(
      lines.slice(chapter.start, chapter.end).join('\n').trim(),
      chapter.title,
    );
    if (content.length <= maxChunkSize) {
      result.push({ title: chapter.title, content });
      continue;
    }

    const subChunks = splitTextFixed(content, maxChunkSize);
    for (let index = 0; index < subChunks.length; index += 1) {
      const suffix = subChunks.length > 1 ? ` (${index + 1})` : '';
      result.push({
        title: `${chapter.title}${suffix}`,
        content: subChunks[index].content,
      });
    }
  }

  return result;
}
