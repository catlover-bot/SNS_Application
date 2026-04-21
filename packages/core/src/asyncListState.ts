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
  | { type: "error"; error: string | null }
  | { type: "reset"; keepError?: boolean; hasMore?: boolean; offset?: number }
  | { type: "replace"; items: T[]; hasMore?: boolean; offset?: number }
  | { type: "append"; items: T[]; hasMore?: boolean; offset?: number };

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
    case "reset":
      return {
        ...createAsyncListInitialState<T>({
          hasMore: typeof action.hasMore === "boolean" ? action.hasMore : true,
          offset:
            typeof action.offset === "number"
              ? Math.max(0, Math.floor(Number(action.offset) || 0))
              : 0,
        }),
        error: action.keepError ? state.error : null,
      };
    default:
      return state;
  }
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
