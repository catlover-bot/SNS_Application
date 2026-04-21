"use client";

import { useMemo, useReducer } from "react";
import {
  asyncListReducer,
  createAsyncListInitialState,
  type AsyncListState,
} from "@sns/core";

function useAsyncListState<T>(initial?: { items?: T[]; hasMore?: boolean; offset?: number }) {
  const [state, dispatch] = useReducer(
    asyncListReducer<T>,
    undefined as unknown as AsyncListState<T>,
    () => createAsyncListInitialState<T>(initial)
  );

  const actions = useMemo(
    () => ({
      start: (refresh = false) => dispatch({ type: "start", refresh }),
      replace: (items: T[], opts?: { hasMore?: boolean; offset?: number }) =>
        dispatch({ type: "replace", items, hasMore: opts?.hasMore, offset: opts?.offset }),
      append: (items: T[], opts?: { hasMore?: boolean; offset?: number }) =>
        dispatch({ type: "append", items, hasMore: opts?.hasMore, offset: opts?.offset }),
      fail: (error: string | null) => dispatch({ type: "error", error }),
      reset: (arg?: boolean | { keepError?: boolean; hasMore?: boolean; offset?: number }) => {
        const opts = typeof arg === "boolean" ? { keepError: arg } : (arg ?? {});
        dispatch({
          type: "reset",
          keepError: opts.keepError,
          hasMore: opts.hasMore,
          offset: opts.offset,
        });
      },
    }),
    []
  );

  return [state, actions] as const;
}

export function useSocialFeedState<T>(initial?: { items?: T[]; hasMore?: boolean; offset?: number }) {
  return useAsyncListState<T>(initial);
}

export function useNotificationsState<T>(initial?: { items?: T[]; hasMore?: boolean; offset?: number }) {
  return useAsyncListState<T>({ hasMore: false, ...(initial ?? {}) });
}

export function useSavedState<T>(initial?: { items?: T[]; hasMore?: boolean; offset?: number }) {
  return useAsyncListState<T>(initial);
}

export function usePersonaFeedState<T>(initial?: { items?: T[]; hasMore?: boolean; offset?: number }) {
  return useAsyncListState<T>(initial);
}
