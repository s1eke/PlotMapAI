export type WorkerTaskHandler<Payload, Result, Progress> = (
  payload: Payload,
  emitProgress: (progress: Progress) => void,
  signal: AbortSignal,
) => Promise<Result> | Result;

export interface WorkerTaskSpec<Payload, Result, Progress> {
  payload: Payload;
  result: Result;
  progress: Progress;
}

export type WorkerTaskSpecMap = Record<string, WorkerTaskSpec<unknown, unknown, unknown>>;

export type WorkerTaskPayload<
  TMap extends WorkerTaskSpecMap,
  TTask extends keyof TMap,
> = TMap[TTask]['payload'];

export type WorkerTaskResult<
  TMap extends WorkerTaskSpecMap,
  TTask extends keyof TMap,
> = TMap[TTask]['result'];

export type WorkerTaskProgress<
  TMap extends WorkerTaskSpecMap,
  TTask extends keyof TMap,
> = TMap[TTask]['progress'];

export type WorkerTaskHandlerMap<TMap extends WorkerTaskSpecMap> = {
  [TTask in keyof TMap]: WorkerTaskHandler<
    WorkerTaskPayload<TMap, TTask>,
    WorkerTaskResult<TMap, TTask>,
    WorkerTaskProgress<TMap, TTask>
  >;
};
