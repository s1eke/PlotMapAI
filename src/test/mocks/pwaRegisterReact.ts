interface RegisterSwState {
  needRefresh: boolean;
  setNeedRefresh: (value: boolean) => void;
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
}

const state: RegisterSwState = {
  needRefresh: false,
  setNeedRefresh: () => undefined,
  updateServiceWorker: async () => undefined,
};

export function __resetRegisterSwState(): void {
  state.needRefresh = false;
  state.setNeedRefresh = () => undefined;
  state.updateServiceWorker = async () => undefined;
}

export function __setRegisterSwState(nextState: Partial<RegisterSwState>): void {
  Object.assign(state, nextState);
}

export function useRegisterSW() {
  return {
    needRefresh: [state.needRefresh, state.setNeedRefresh] as const,
    updateServiceWorker: state.updateServiceWorker,
  };
}
