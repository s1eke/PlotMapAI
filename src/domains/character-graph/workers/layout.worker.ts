import { registerWorkerTaskHandlers } from '@infra/workers';
import type { GraphLayoutPayload, GraphLayoutProgress } from './layoutClient';
import { buildSpaciousLayout } from '../utils/characterGraphLayout';

registerWorkerTaskHandlers({
  'graph-layout': async (
    payload: GraphLayoutPayload,
    emitProgress: (progress: GraphLayoutProgress) => void,
    signal: AbortSignal,
  ) => {
    return buildSpaciousLayout(payload.nodes, payload.edges, {
      signal,
      onProgress: (progress) => emitProgress({ progress, stage: 'layout' }),
    });
  },
});
