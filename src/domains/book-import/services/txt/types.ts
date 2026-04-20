export interface DetectedChapter {
  title: string;
  start: number;
  end: number;
}

export interface SplitChapter {
  title: string;
  content: string;
}

export interface ParsedTextDocument {
  title: string;
  chapters: SplitChapter[];
  encoding: string;
  fileHash: string;
  rawText: string;
  totalWords: number;
}
