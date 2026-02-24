export type AsyncListState<T> = {
  items: T[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  hasMore: boolean;
  offset: number;
  initialized: boolean;
};

export type AsyncListAction<T> =
  | { type: "start"; refresh?: boolean }
  | { type: "success"; items: T[]; reset?: boolean; hasMore?: boolean; offset?: number }
  | { type: "error"; error: string | null }
  | { type: "reset"; keepError?: boolean }
  | { type: "replace"; items: T[]; hasMore?: boolean; offset?: number }
  | { type: "append"; items: T[]; hasMore?: boolean; offset?: number }
  | { type: "setError"; error: string | null }
  | { type: "patch"; patch: Partial<AsyncListState<T>> };

export function createAsyncListInitialState<T>(args?: {
  items?: T[];
  hasMore?: boolean;
  offset?: number;
}): AsyncListState<T> {
  return {
    items: args?.items ?? [],
    loading: false,
    refreshing: false,
    error: null,
    hasMore: args?.hasMore ?? true,
    offset: Math.max(0, Math.floor(Number(args?.offset ?? 0) || 0)),
    initialized: false,
  };
}

export function asyncListReducer<T>(
  state: AsyncListState<T>,
  action: AsyncListAction<T>
): AsyncListState<T> {
  switch (action.type) {
    case "start": {
      const refresh = Boolean(action.refresh);
      return {
        ...state,
        loading: true,
        refreshing: refresh,
        error: null,
      };
    }
    case "success": {
      const reset = Boolean(action.reset);
      const nextItems = reset ? [...action.items] : [...action.items];
      return {
        ...state,
        items: nextItems,
        loading: false,
        refreshing: false,
        error: null,
        initialized: true,
        hasMore: typeof action.hasMore === "boolean" ? action.hasMore : state.hasMore,
        offset:
          typeof action.offset === "number"
            ? Math.max(0, Math.floor(action.offset))
            : state.offset,
      };
    }
    case "replace": {
      return {
        ...state,
        items: [...action.items],
        loading: false,
        refreshing: false,
        initialized: true,
        hasMore: typeof action.hasMore === "boolean" ? action.hasMore : state.hasMore,
        offset:
          typeof action.offset === "number"
            ? Math.max(0, Math.floor(action.offset))
            : state.offset,
      };
    }
    case "append": {
      if (!Array.isArray(action.items) || action.items.length === 0) {
        return {
          ...state,
          hasMore: typeof action.hasMore === "boolean" ? action.hasMore : state.hasMore,
          offset:
            typeof action.offset === "number"
              ? Math.max(0, Math.floor(action.offset))
              : state.offset,
        };
      }
      return {
        ...state,
        items: [...state.items, ...action.items],
        loading: false,
        refreshing: false,
        initialized: true,
        hasMore: typeof action.hasMore === "boolean" ? action.hasMore : state.hasMore,
        offset:
          typeof action.offset === "number"
            ? Math.max(0, Math.floor(action.offset))
            : state.offset,
      };
    }
    case "error":
      return {
        ...state,
        loading: false,
        refreshing: false,
        error: action.error ?? "error",
        initialized: true,
      };
    case "setError":
      return {
        ...state,
        error: action.error ?? null,
      };
    case "patch": {
      const patch = action.patch ?? {};
      const nextOffset =
        typeof patch.offset === "number"
          ? Math.max(0, Math.floor(Number(patch.offset) || 0))
          : state.offset;
      return {
        ...state,
        ...patch,
        offset: nextOffset,
      };
    }
    case "reset":
      return {
        ...createAsyncListInitialState<T>({ hasMore: true }),
        error: action.keepError ? state.error : null,
      };
    default:
      return state;
  }
}

export function createAsyncListActions<T>() {
  return {
    start: (refresh = false): AsyncListAction<T> => ({ type: "start", refresh }),
    success: (
      items: T[],
      opts?: { reset?: boolean; hasMore?: boolean; offset?: number }
    ): AsyncListAction<T> => ({
      type: "success",
      items,
      reset: opts?.reset,
      hasMore: opts?.hasMore,
      offset: opts?.offset,
    }),
    replace: (items: T[], opts?: { hasMore?: boolean; offset?: number }): AsyncListAction<T> => ({
      type: "replace",
      items,
      hasMore: opts?.hasMore,
      offset: opts?.offset,
    }),
    append: (items: T[], opts?: { hasMore?: boolean; offset?: number }): AsyncListAction<T> => ({
      type: "append",
      items,
      hasMore: opts?.hasMore,
      offset: opts?.offset,
    }),
    fail: (error: string | null): AsyncListAction<T> => ({ type: "error", error }),
    setError: (error: string | null): AsyncListAction<T> => ({ type: "setError", error }),
    patch: (patch: Partial<AsyncListState<T>>): AsyncListAction<T> => ({ type: "patch", patch }),
    reset: (keepError = false): AsyncListAction<T> => ({ type: "reset", keepError }),
  };
}

export function applyAsyncListPageMerge<T>(
  prev: T[],
  next: T[],
  getId: (item: T) => string,
  reset = false
): T[] {
  if (reset) return [...next];
  if (!prev.length) return [...next];
  const merged = [...prev];
  const seen = new Set(prev.map((x) => getId(x)));
  for (const item of next) {
    const id = getId(item);
    if (!id || seen.has(id)) continue;
    merged.push(item);
    seen.add(id);
  }
  return merged;
}
