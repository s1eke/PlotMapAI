export type BookImportProgressStage =
  | 'hashing'
  | 'decoding'
  | 'unzipping'
  | 'opf'
  | 'toc'
  | 'chapters'
  | 'images'
  | 'finalizing';

export interface BookImportProgress {
  current?: number;
  detail?: string;
  progress: number;
  stage: BookImportProgressStage;
  total?: number;
}
