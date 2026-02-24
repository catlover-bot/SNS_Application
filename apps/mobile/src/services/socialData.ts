import { supabase } from "../supabase";
import type {
  FeedPagePayload,
  NotificationsPayload,
  PageQuery,
  SavedCollectionsSummaryRowsPayload,
  SavedRowsPagePayload,
} from "@sns/core";
import type { TimelineSignalWeights } from "@sns/core";

type SavedCollectionRow = {
  post_id: string;
  collection_key?: string | null;
  collection_label?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

function isMissingRelationErrorLike(error: any, relation: string): boolean {
  const msg = String(error?.message ?? error ?? "").toLowerCase();
  const details = String(error?.details ?? "").toLowerCase();
  const hint = String(error?.hint ?? "").toLowerCase();
  const code = String(error?.code ?? "").toUpperCase();
  const rel = relation.toLowerCase();
  return (
    code === "42P01" ||
    msg.includes(rel) ||
    details.includes(rel) ||
    hint.includes(rel)
  );
}

function uniqStrings(values: string[]) {
  return Array.from(new Set(values.map((x) => String(x ?? "").trim()).filter(Boolean)));
}

export async function enrichMobilePostAuthorProfiles<
  T extends {
    author?: string | null;
    author_handle?: string | null;
    author_display?: string | null;
  },
>(rows: T[]): Promise<T[]> {
  const list = Array.isArray(rows) ? [...rows] : [];
  if (list.length === 0) return list;

  const missingAuthorIds = uniqStrings(
    list
      .filter(
        (row) =>
          row &&
          row.author &&
          (!String(row.author_handle ?? "").trim() || !String(row.author_display ?? "").trim())
      )
      .map((row) => String(row.author ?? ""))
  );
  if (missingAuthorIds.length === 0) return list;

  const profiles = await supabase
    .from("profiles")
    .select("id,handle,display_name")
    .in("id", missingAuthorIds);
  if (profiles.error || !profiles.data) return list;

  const profileMap = new Map<string, { handle?: string | null; display_name?: string | null }>();
  for (const row of profiles.data as any[]) {
    const id = String(row?.id ?? "").trim();
    if (!id) continue;
    profileMap.set(id, {
      handle: row?.handle ?? null,
      display_name: row?.display_name ?? null,
    });
  }

  return list.map((row) => {
    const authorId = String(row?.author ?? "").trim();
    if (!authorId) return row;
    const p = profileMap.get(authorId);
    if (!p) return row;
    return {
      ...row,
      author_handle: String(row.author_handle ?? "").trim() || String(p.handle ?? "").trim() || null,
      author_display:
        String(row.author_display ?? "").trim() || String(p.display_name ?? "").trim() || null,
    };
  });
}

export async function loadMobileFeedPage(args: { limit: number }): Promise<FeedPagePayload> {
  const enriched = await supabase
    .from("feed_latest")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(args.limit);

  if (!enriched.error && enriched.data) {
    return {
      items: await enrichMobilePostAuthorProfiles((enriched.data ?? []) as any[]),
      source: "feed_latest" as const,
    };
  }

  const raw = await supabase
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(args.limit);
  if (raw.error) throw raw.error;
  return {
    items: await enrichMobilePostAuthorProfiles((raw.data ?? []) as any[]),
    source: "posts" as const,
  };
}

export async function loadMobileNotifications(args: {
  userId: string;
  limit?: number;
}): Promise<NotificationsPayload> {
  const res = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", args.userId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, args.limit ?? 50));
  if (res.error) throw res.error;
  return { items: (res.data ?? []) as any[] };
}

export async function fetchMobileSavedCollectionsSummaryRows(args: {
  userId: string;
  limit?: number;
}): Promise<SavedCollectionsSummaryRowsPayload> {
  const res = await supabase
    .from("user_saved_post_collections")
    .select("post_id,collection_key,collection_label,updated_at", { count: "exact" })
    .eq("user_id", args.userId)
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, args.limit ?? 240));

  if (res.error) {
    if (isMissingRelationErrorLike(res.error, "user_saved_post_collections")) {
      return {
        available: false,
        rows: [] as SavedCollectionRow[],
        totalCount: null as number | null,
      };
    }
    throw res.error;
  }

  return {
    available: true,
    rows: (res.data ?? []) as SavedCollectionRow[],
    totalCount: typeof res.count === "number" ? res.count : null,
  };
}

export async function loadMobileSavedFeedRows(args: PageQuery & {
  userId: string;
  collectionKey: string;
}): Promise<SavedRowsPagePayload> {
  const offset = Math.max(0, args.offset);
  const limit = Math.max(1, args.limit);
  const collectionKey = String(args.collectionKey ?? "all").trim() || "all";

  const collectionQuery = supabase
    .from("user_saved_post_collections")
    .select("post_id,collection_key,collection_label,updated_at", { count: "exact" })
    .eq("user_id", args.userId)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const collectionRes =
    collectionKey === "all"
      ? await collectionQuery
      : await collectionQuery.eq("collection_key", collectionKey);

  if (!collectionRes.error) {
    return {
      collectionAvailable: true,
      unsupportedCollectionFilter: false,
      rows: (collectionRes.data ?? []) as SavedCollectionRow[],
      totalCount: typeof collectionRes.count === "number" ? collectionRes.count : null,
    };
  }

  if (!isMissingRelationErrorLike(collectionRes.error, "user_saved_post_collections")) {
    throw collectionRes.error;
  }

  if (collectionKey !== "all") {
    return {
      collectionAvailable: false,
      unsupportedCollectionFilter: true,
      rows: [] as SavedCollectionRow[],
      totalCount: 0,
    };
  }

  const fallback = await supabase
    .from("reactions")
    .select("post_id,created_at", { count: "exact" })
    .eq("user_id", args.userId)
    .eq("kind", "save")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (fallback.error) throw fallback.error;

  const rows = ((fallback.data ?? []) as Array<{ post_id: string; created_at?: string | null }>).map((x) => ({
    post_id: String(x.post_id ?? ""),
    collection_key: "saved",
    collection_label: "保存",
    updated_at: x.created_at ?? null,
    created_at: x.created_at ?? null,
  }));

  return {
    collectionAvailable: false,
    unsupportedCollectionFilter: false,
    rows,
    totalCount: typeof fallback.count === "number" ? fallback.count : null,
  };
}

export async function loadMobilePostsByIdsEnriched(ids: string[]) {
  const uniqueIds = uniqStrings(ids);
  if (uniqueIds.length === 0) return [] as any[];

  const fromView = await supabase.from("v_posts_enriched").select("*").in("id", uniqueIds);
  let rows = ((fromView.data ?? []) as any[]).filter(Boolean);
  const found = new Set(rows.map((x) => String(x?.id ?? "")));
  const missing = uniqueIds.filter((id) => !found.has(id));

  if (missing.length > 0) {
    const fromPosts = await supabase.from("posts").select("*").in("id", missing);
    if (!fromPosts.error && fromPosts.data) {
      rows = [...rows, ...(fromPosts.data as any[])];
    }
  }
  return await enrichMobilePostAuthorProfiles(rows as any[]);
}

export async function fetchMobilePersonaFeedTopPersona(args: { userId: string }) {
  return supabase
    .from("user_personas")
    .select("persona_key,score,version,updated_at")
    .eq("user_id", args.userId)
    .order("version", { ascending: false })
    .order("score", { ascending: false })
    .limit(1)
    .maybeSingle();
}

export async function fetchMobileFeedLatestRange(args: { offset: number; limit: number }) {
  return supabase
    .from("feed_latest")
    .select("*")
    .range(Math.max(0, args.offset), Math.max(0, args.offset) + Math.max(1, args.limit) - 1);
}

export async function fetchMobileOwnPostsAnalysis(args: { userId: string; limit: number }) {
  return supabase
    .from("posts")
    .select("created_at,analysis")
    .eq("author", args.userId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, args.limit));
}

export async function fetchMobilePersonaCompatWeights(args: { basePersona: string; limit: number }) {
  return supabase
    .from("persona_compat_norm")
    .select("b,weight")
    .eq("a", args.basePersona)
    .order("weight", { ascending: false })
    .limit(Math.max(1, args.limit));
}

export async function fetchMobileUserPersonaAffinity(args: {
  userId: string;
  personaKeys: string[];
}) {
  const personaKeys = uniqStrings(args.personaKeys);
  if (personaKeys.length === 0) return { data: [], error: null } as any;
  return supabase
    .from("user_persona_affinity")
    .select("persona_key,weight")
    .eq("user_id", args.userId)
    .in("persona_key", personaKeys);
}

export async function fetchMobilePostScoresByPersona(args: {
  personaKeys: string[];
  limit: number;
}) {
  const personaKeys = uniqStrings(args.personaKeys);
  if (personaKeys.length === 0) return { data: [], error: null } as any;
  return supabase
    .from("post_scores")
    .select("post_id,persona_key,final_score")
    .in("persona_key", personaKeys)
    .order("final_score", { ascending: false })
    .limit(Math.max(1, args.limit));
}

export async function fetchMobilePostAnalysesByIds(postIds: string[]) {
  const ids = uniqStrings(postIds);
  if (ids.length === 0) return { data: [], error: null } as any;
  return supabase.from("posts").select("id,analysis").in("id", ids);
}

export async function fetchMobilePostsByIdsEnrichedFirst(postIds: string[]) {
  const ids = uniqStrings(postIds);
  if (ids.length === 0) return [] as any[];
  const fromView = await supabase.from("v_posts_enriched").select("*").in("id", ids);
  if (!fromView.error && (fromView.data?.length ?? 0) > 0) {
    return await enrichMobilePostAuthorProfiles((fromView.data ?? []) as any[]);
  }
  const fromPosts = await supabase.from("posts").select("*").in("id", ids);
  if (fromPosts.error) throw fromPosts.error;
  return await enrichMobilePostAuthorProfiles((fromPosts.data ?? []) as any[]);
}

export async function loadMobileTimelineSignalWeights(args: { userId: string }) {
  const res = await supabase
    .from("user_timeline_signal_weights")
    .select(
      "followed_author_boost,saved_post_boost,opened_penalty,interested_persona_boost,interested_author_boost,base_score_weight,predicted_buzz_weight,recency_weight,samples,opened_count,saved_count,followed_count"
    )
    .eq("user_id", args.userId)
    .maybeSingle();
  if (res.error) {
    if (isMissingRelationErrorLike(res.error, "user_timeline_signal_weights")) {
      return { available: false, weights: null, samples: 0, learningInput: null } as const;
    }
    throw res.error;
  }
  if (!res.data) {
    return { available: true, weights: null, samples: 0, learningInput: null } as const;
  }
  const d: any = res.data;
  const weights: TimelineSignalWeights = {
    followedAuthorBoost: Number(d.followed_author_boost ?? 0.28) || 0.28,
    savedPostBoost: Number(d.saved_post_boost ?? 0.34) || 0.34,
    openedPenalty: Number(d.opened_penalty ?? 0.16) || 0.16,
    interestedPersonaBoost: Number(d.interested_persona_boost ?? 0.17) || 0.17,
    interestedAuthorBoost: Number(d.interested_author_boost ?? 0.2) || 0.2,
    baseScoreWeight: Number(d.base_score_weight ?? 0.38) || 0.38,
    predictedBuzzWeight: Number(d.predicted_buzz_weight ?? 0.26) || 0.26,
    recencyWeight: Number(d.recency_weight ?? 0.14) || 0.14,
  };
  return {
    available: true,
    weights,
    samples: Math.max(0, Math.floor(Number(d.samples ?? 0) || 0)),
    learningInput: {
      openedCount: Math.max(0, Math.floor(Number(d.opened_count ?? 0) || 0)),
      savedCount: Math.max(0, Math.floor(Number(d.saved_count ?? 0) || 0)),
      followedCount: Math.max(0, Math.floor(Number(d.followed_count ?? 0) || 0)),
    },
  } as const;
}

export async function upsertMobileTimelineSignalWeights(args: {
  userId: string;
  weights: TimelineSignalWeights;
  samples: number;
  learningInput: {
    openedCount?: number;
    savedCount?: number;
    followedCount?: number;
  };
}) {
  const { error } = await supabase.from("user_timeline_signal_weights").upsert(
    {
      user_id: args.userId,
      followed_author_boost: args.weights.followedAuthorBoost,
      saved_post_boost: args.weights.savedPostBoost,
      opened_penalty: args.weights.openedPenalty,
      interested_persona_boost: args.weights.interestedPersonaBoost,
      interested_author_boost: args.weights.interestedAuthorBoost,
      base_score_weight: args.weights.baseScoreWeight,
      predicted_buzz_weight: args.weights.predictedBuzzWeight,
      recency_weight: args.weights.recencyWeight,
      opened_count: Math.max(0, Math.floor(Number(args.learningInput.openedCount ?? 0) || 0)),
      saved_count: Math.max(0, Math.floor(Number(args.learningInput.savedCount ?? 0) || 0)),
      followed_count: Math.max(0, Math.floor(Number(args.learningInput.followedCount ?? 0) || 0)),
      samples: Math.max(0, Math.floor(Number(args.samples ?? 0) || 0)),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) {
    if (isMissingRelationErrorLike(error, "user_timeline_signal_weights")) {
      return { available: false } as const;
    }
    throw error;
  }
  return { available: true } as const;
}
