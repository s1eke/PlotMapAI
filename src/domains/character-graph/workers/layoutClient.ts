import { createWorkerTaskRunner } from '@infra/workers';
import type { WorkerTaskOptions } from '@infra/workers';
import type { CharacterGraphEdge, CharacterGraphNode } from '@shared/contracts';
import { AppErrorCode } from '@shared/errors';
import type { LayoutNode } from '../utils/characterGraphLayout';

export interface GraphLayoutPayload {
  edges: CharacterGraphEdge[];
  nodes: CharacterGraphNode[];
}

export interface GraphLayoutProgress {
  progress: number;
  stage: 'layout';
}

const runGraphLayoutWorkerTask = createWorkerTaskRunner<
  GraphLayoutPayload,
  LayoutNode[],
  GraphLayoutProgress
>({
  createWorker: () => new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' }),
  task: 'graph-layout',
  unavailableError: {
    code: AppErrorCode.WORKER_UNAVAILABLE,
    kind: 'unsupported',
    source: 'character-graph',
    userMessageKey: 'errors.WORKER_UNAVAILABLE',
    debugMessage: 'Character graph layout worker is unavailable.',
  },
});

export function runGraphLayoutTask(
  payload: GraphLayoutPayload,
  options: WorkerTaskOptions<GraphLayoutProgress> = {},
): Promise<LayoutNode[]> {
  return runGraphLayoutWorkerTask(payload, options);
}
