import { createWorkerTaskRunner } from '@infra/workers';
import type { WorkerTaskOptions } from '@infra/workers';
import type { CharacterGraphEdge, CharacterGraphNode } from '@domains/analysis';
import {
  buildSpaciousLayout,
  type LayoutNode,
} from '../utils/characterGraphLayout';

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
  fallback: ({ nodes, edges }, options) => {
    return buildSpaciousLayout(nodes, edges, {
      signal: options.signal,
      onProgress: (progress) => options.onProgress?.({ progress, stage: 'layout' }),
    });
  },
});

export function runGraphLayoutTask(
  payload: GraphLayoutPayload,
  options: WorkerTaskOptions<GraphLayoutProgress> = {},
): Promise<LayoutNode[]> {
  return runGraphLayoutWorkerTask(payload, options);
}
