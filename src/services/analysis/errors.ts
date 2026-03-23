export class AnalysisConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisConfigError';
  }
}

export class AnalysisExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisExecutionError';
  }
}

export class ChunkingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChunkingError';
  }
}
