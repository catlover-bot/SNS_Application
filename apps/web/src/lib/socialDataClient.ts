"use client";

import type { HttpJsonResult, PageQuery, TimelineSignalsPayload } from "@sns/core";

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<HttpJsonResult<T>> {
  const res = await fetch(input, { cache: "no-store", ...init });
  const json = (await res.json().catch(() => null)) as T | null;
  return { res, json };
}

export async function fetchFeedPage(args: PageQuery) {
  const qs = new URLSearchParams({
    limit: String(args.limit),
    offset: String(args.offset),
  });
  return fetchJson<any>(`/api/feed?${qs.toString()}`);
}

export async function fetchNotificationsList() {
  return fetchJson<any>("/api/notifications");
}

export async function markNotificationsRead(ids: string[]) {
  return fetchJson<any>("/api/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}

export async function fetchSavedPostsPage(args: PageQuery & { collection?: string | null }) {
  const qs = new URLSearchParams({
    limit: String(args.limit),
    offset: String(args.offset),
  });
  const collection = String(args.collection ?? "").trim();
  if (collection && collection !== "all") qs.set("collection", collection);
  return fetchJson<any>(`/api/me/saved-posts?${qs.toString()}`);
}

export async function fetchPersonaFeedPage(args: PageQuery & { strategy: string }) {
  const qs = new URLSearchParams({
    limit: String(args.limit),
    offset: String(args.offset),
    strategy: args.strategy,
  });
  return fetchJson<any>(`/api/me/persona-feed?${qs.toString()}`);
}

export async function fetchTimelineSignals() {
  return fetchJson<TimelineSignalsPayload>("/api/me/timeline-signals");
}

export async function updateTimelineSignalWeights(learningInput: {
  openedCount?: number;
  savedCount?: number;
  followedCount?: number;
}) {
  return fetchJson<TimelineSignalsPayload & { ok?: boolean; available?: boolean }>("/api/me/timeline-signals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ learningInput }),
  });
}
