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
  TMap extends object,
  TTask extends keyof TMap,
> = TMap[TTask] extends WorkerTaskSpec<infer Payload, unknown, unknown> ? Payload : never;

export type WorkerTaskResult<
  TMap extends object,
  TTask extends keyof TMap,
> = TMap[TTask] extends WorkerTaskSpec<unknown, infer Result, unknown> ? Result : never;

export type WorkerTaskProgress<
  TMap extends object,
  TTask extends keyof TMap,
> = TMap[TTask] extends WorkerTaskSpec<unknown, unknown, infer Progress> ? Progress : never;

export type WorkerTaskHandlerMap<TMap extends object> = {
  [TTask in keyof TMap]: WorkerTaskHandler<
    WorkerTaskPayload<TMap, TTask>,
    WorkerTaskResult<TMap, TTask>,
    WorkerTaskProgress<TMap, TTask>
  >;
};
