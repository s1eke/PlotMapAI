import { cleanText } from './text';

export interface RelationshipGraphNodePairLike {
  source: string;
  target: string;
}

export interface RelationshipGraphMapEntry extends RelationshipGraphNodePairLike {
  chapterCount?: number;
  chapters?: number[];
  description?: string;
  mentionCount?: number;
  relationTags?: string[];
  type?: string;
  weight?: number;
}

export interface MergedRelationshipGraphRecord extends RelationshipGraphNodePairLike {
  description: string;
  relationTags: string[];
  type?: string;
}

const RELATION_TAG_CANONICAL_PATTERNS: Array<[string, string[]]> = [
  ['父女', ['父女']],
  ['父子', ['父子']],
  ['母女', ['母女']],
  ['母子', ['母子']],
  ['兄妹', ['兄妹']],
  ['姐弟', ['姐弟']],
  ['姐妹', ['姐妹']],
  ['兄弟', ['兄弟']],
  ['夫妻', ['夫妻', '夫妇']],
  ['恋人', ['恋人', '情侣', '爱人', '相恋', '相爱']],
  ['亲情', ['亲情', '家人', '亲人', '血亲', '骨肉']],
  ['师徒', ['师徒', '师生']],
  ['君臣', ['君臣', '忠臣', '臣子', '臣属']],
  ['主仆', ['主仆', '仆从', '侍从']],
  ['盟友', ['盟友', '同盟']],
  ['同伴', ['同伴', '伙伴', '搭档']],
  ['朋友', ['朋友', '友人', '友情']],
  ['对立', ['对立', '敌对', '宿敌', '仇敌', '仇人', '敌人', '死敌']],
  ['利用', ['利用', '操控']],
  ['暧昧', ['暧昧']],
];

export function normalizeCharacterPair(source: unknown, target: unknown): [string, string] | null {
  const first = cleanText(source, 80);
  const second = cleanText(target, 80);
  if (!first || !second || first === second) return null;
  return [first, second].sort() as [string, string];
}

export function normalizeRelationTags(...values: unknown[]): string[] | null {
  const results: string[] = [];
  for (const value of values) {
    const candidates = Array.isArray(value) ? value : [value];
    for (const item of candidates) {
      const rawTag = cleanText(item, 80);
      if (!rawTag) continue;
      const fragments = rawTag.split(/[\\/|｜；;，,、]+/).map((fragment) => cleanText(fragment, 80)).filter(Boolean);
      for (const candidate of fragments) {
        const tag = canonicalizeRelationTag(candidate);
        if (tag && !results.includes(tag)) results.push(tag);
      }
    }
  }
  return results.length > 0 ? results : null;
}

export function buildLocalRelationshipGraphMap<T extends RelationshipGraphNodePairLike>(
  raw: readonly T[],
): Map<string, T> {
  const results = new Map<string, T>();
  for (const item of raw) {
    const pair = normalizeCharacterPair(item.source, item.target);
    if (!pair) continue;
    results.set(`${pair[0]}::${pair[1]}`, item);
  }
  return results;
}

export function buildOverviewRelationshipMap(
  raw: readonly RelationshipGraphMapEntry[],
): Map<string, MergedRelationshipGraphRecord> {
  const results = new Map<string, MergedRelationshipGraphRecord>();
  for (const item of raw) {
    const pair = normalizeCharacterPair(item.source, item.target);
    if (!pair) continue;
    const key = `${pair[0]}::${pair[1]}`;
    let target = results.get(key);
    if (!target) {
      target = { source: pair[0], target: pair[1], relationTags: [], description: '' };
      results.set(key, target);
    }
    for (const tag of normalizeRelationTags(item.relationTags, item.type) || []) {
      if (!target.relationTags.includes(tag) && target.relationTags.length < 6) {
        target.relationTags.push(tag);
      }
    }
    const description = cleanText(item.description, 280);
    if (description && description.length > String(target.description ?? '').length) {
      target.description = description;
    }
    if (!target.type) {
      target.type = cleanText(item.type, 80) || undefined;
    }
  }
  return results;
}

function canonicalizeRelationTag(tag: string): string {
  let cleaned = cleanText(tag.replace(/[(（][^)）]{0,20}[)）]/g, ''), 80);
  cleaned = cleaned.replace(/^(疑似|疑为|疑|可能是|可能为|可能|似乎是|似乎|或为|像是|看似|表面上)/, '');
  const compact = cleaned.replace(/\s+/g, '');
  if (!compact) return '';
  for (const [canonical, patterns] of RELATION_TAG_CANONICAL_PATTERNS) {
    if (patterns.some((pattern) => compact.includes(pattern))) return canonical;
  }
  return compact;
}
