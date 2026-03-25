import { debugLog } from '@app/debug/service';

interface ChapterInfo {
  title: string;
  start: number;
  end: number;
}

interface SplitChapter {
  title: string;
  content: string;
}

function splitTextFixed(text: string, chunkSize: number): SplitChapter[] {
  if (!text) {
    return [];
  }

  const chunks: SplitChapter[] = [];
  let remaining = text;
  let chunkIdx = 1;

  while (remaining) {
    if (remaining.length <= chunkSize) {
      chunks.push({ title: `第${chunkIdx}部分`, content: remaining.trim() });
      break;
    }

    let cutPos = chunkSize;
    let newlinePos = remaining.lastIndexOf("\n\n", chunkSize);
    if (newlinePos > chunkSize * 0.5) {
      cutPos = newlinePos + 2;
    } else {
      newlinePos = remaining.lastIndexOf("\n", chunkSize);
      if (newlinePos > chunkSize * 0.5) {
        cutPos = newlinePos + 1;
      }
    }

    chunks.push({ title: `第${chunkIdx}部分`, content: remaining.slice(0, cutPos).trim() });
    remaining = remaining.slice(cutPos);
    chunkIdx++;
  }

  return chunks;
}

export function detectChapters(
  text: string,
  rules: Array<{ rule: string }>,
): ChapterInfo[] {
  if (!text || !rules || rules.length === 0) {
    debugLog('ChapterDetect', `skip: text=${!!text}, rules=${rules?.length ?? 0}`);
    return [];
  }

  const lines = text.split("\n");
  debugLog('ChapterDetect', `text=${lines.length} lines, rules=${rules.length}`);
  const compiledRules: RegExp[] = [];
  for (const r of rules) {
    const pattern = r.rule;
    if (!pattern) {
      continue;
    }
    try {
      compiledRules.push(new RegExp(pattern, "m"));
    } catch {
      debugLog('ChapterDetect', `invalid regex: ${pattern.slice(0, 60)}`);
      continue;
    }
  }

  if (compiledRules.length === 0) {
    debugLog('ChapterDetect', 'no valid compiled rules');
    return [];
  }

  debugLog('ChapterDetect', `compiled ${compiledRules.length} rules`);

  const chapterPositions: Array<[number, string]> = [];
  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i].trim();
    if (!stripped) {
      continue;
    }
    for (const pattern of compiledRules) {
      if (pattern.test(lines[i])) {
        chapterPositions.push([i, stripped]);
        break;
      }
    }
  }

  if (chapterPositions.length === 0) {
    debugLog('ChapterDetect', 'no chapter headings found, will fallback to fixed split');
    return [];
  }

  debugLog('ChapterDetect', `found ${chapterPositions.length} chapter headings`);
  const logMax = Math.min(chapterPositions.length, 5);
  for (let i = 0; i < logMax; i++) {
    const [lineIdx, title] = chapterPositions[i];
    debugLog('ChapterDetect', `  line ${lineIdx}: "${title.slice(0, 80)}"`);
  }
  if (chapterPositions.length > 10) debugLog('ChapterDetect', `  ... ${chapterPositions.length - 10} more headings ...`);
  for (let i = Math.max(logMax, chapterPositions.length - 5); i < chapterPositions.length; i++) {
    if (i < logMax) continue;
    const [lineIdx, title] = chapterPositions[i];
    debugLog('ChapterDetect', `  line ${lineIdx}: "${title.slice(0, 80)}"`);
  }

  const chapters: ChapterInfo[] = [];

  if (chapterPositions[0][0] > 0) {
    const prefaceLines = lines.slice(0, chapterPositions[0][0]);
    const prefaceText = prefaceLines.join("\n").trim();
    if (prefaceText) {
      chapters.push({
        title: "前言",
        start: 0,
        end: chapterPositions[0][0],
      });
    }
  }

  for (let idx = 0; idx < chapterPositions.length; idx++) {
    const [lineIdx, title] = chapterPositions[idx];
    const end = idx + 1 < chapterPositions.length
      ? chapterPositions[idx + 1][0]
      : lines.length;
    chapters.push({ title, start: lineIdx, end });
  }

  return chapters;
}

export function splitByChapters(
  text: string,
  chapters: ChapterInfo[],
  maxChunkSize: number = 50000,
): SplitChapter[] {
  const lines = text.split("\n");

  if (!chapters || chapters.length === 0) {
    return splitTextFixed(text, maxChunkSize);
  }

  const result: SplitChapter[] = [];
  for (const ch of chapters) {
    const content = lines.slice(ch.start, ch.end).join("\n").trim();
    if (content.length <= maxChunkSize) {
      result.push({ title: ch.title, content });
    } else {
      const subChunks = splitTextFixed(content, maxChunkSize);
      for (let i = 0; i < subChunks.length; i++) {
        const suffix = subChunks.length > 1 ? ` (${i + 1})` : "";
        result.push({
          title: `${ch.title}${suffix}`,
          content: subChunks[i].content,
        });
      }
    }
  }

  return result;
}
