import { supabase } from "../supabase";
import type {
  FeedPagePayload,
  LieScoreLearnedContextCoefficient,
  LieScoreLearnedContextHistoryPoint,
  NotificationsPayload,
  PageQuery,
  SavedCollectionsSummaryRowsPayload,
  SavedRowsPagePayload,
  TimelineSignalWeightsHistoryPoint,
} from "@sns/core";
import {
  evolveLieScoreLearnedContextCoefficient,
  type TimelineSignalWeights,
} from "@sns/core";

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
  const [res, historyRes] = await Promise.all([
    supabase
      .from("user_timeline_signal_weights")
      .select(
        "followed_author_boost,saved_post_boost,opened_penalty,interested_persona_boost,interested_author_boost,base_score_weight,predicted_buzz_weight,recency_weight,samples,opened_count,saved_count,followed_count"
      )
      .eq("user_id", args.userId)
      .maybeSingle(),
    supabase
      .from("user_timeline_signal_weights_history")
      .select(
        "created_at,samples,opened_count,saved_count,followed_count,followed_author_boost,saved_post_boost,opened_penalty,interested_persona_boost,interested_author_boost,base_score_weight,predicted_buzz_weight,recency_weight"
      )
      .eq("user_id", args.userId)
      .order("created_at", { ascending: false })
      .limit(24),
  ]);
  if (res.error) {
    if (isMissingRelationErrorLike(res.error, "user_timeline_signal_weights")) {
      return {
        available: false,
        weights: null,
        samples: 0,
        learningInput: null,
        historyPoints: [] as TimelineSignalWeightsHistoryPoint[],
      } as const;
    }
    throw res.error;
  }
  const historyPointsRaw =
    historyRes.error && isMissingRelationErrorLike(historyRes.error, "user_timeline_signal_weights_history")
      ? []
      : historyRes.error
        ? []
        : ((historyRes.data ?? []) as any[]);
  const historyPoints: TimelineSignalWeightsHistoryPoint[] = historyPointsRaw
    .map((row) => {
      const at = String(row?.created_at ?? "").trim();
      if (!at) return null;
      return {
        at,
        samples: Math.max(0, Math.floor(Number(row?.samples ?? 0) || 0)),
        openedCount: Math.max(0, Math.floor(Number(row?.opened_count ?? 0) || 0)),
        savedCount: Math.max(0, Math.floor(Number(row?.saved_count ?? 0) || 0)),
        followedCount: Math.max(0, Math.floor(Number(row?.followed_count ?? 0) || 0)),
        weights: {
          followedAuthorBoost: Number(row?.followed_author_boost ?? 0.28) || 0.28,
          savedPostBoost: Number(row?.saved_post_boost ?? 0.34) || 0.34,
          openedPenalty: Number(row?.opened_penalty ?? 0.16) || 0.16,
          interestedPersonaBoost: Number(row?.interested_persona_boost ?? 0.17) || 0.17,
          interestedAuthorBoost: Number(row?.interested_author_boost ?? 0.2) || 0.2,
          baseScoreWeight: Number(row?.base_score_weight ?? 0.38) || 0.38,
          predictedBuzzWeight: Number(row?.predicted_buzz_weight ?? 0.26) || 0.26,
          recencyWeight: Number(row?.recency_weight ?? 0.14) || 0.14,
        },
      } as TimelineSignalWeightsHistoryPoint;
    })
    .filter(Boolean)
    .reverse() as TimelineSignalWeightsHistoryPoint[];
  if (!res.data) {
    return {
      available: true,
      weights: null,
      samples: 0,
      learningInput: null,
      historyPoints,
    } as const;
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
    historyPoints,
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
  const nowIso = new Date().toISOString();
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
      updated_at: nowIso,
    },
    { onConflict: "user_id" }
  );
  if (error) {
    if (isMissingRelationErrorLike(error, "user_timeline_signal_weights")) {
      return { available: false, historyPoint: null } as const;
    }
    throw error;
  }

  const historyInsert = await supabase.from("user_timeline_signal_weights_history").insert({
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
    created_at: nowIso,
  });
  if (historyInsert.error && !isMissingRelationErrorLike(historyInsert.error, "user_timeline_signal_weights_history")) {
    throw historyInsert.error;
  }
  return {
    available: true,
    historyPoint:
      historyInsert.error && isMissingRelationErrorLike(historyInsert.error, "user_timeline_signal_weights_history")
        ? null
        : ({
            at: nowIso,
            samples: Math.max(0, Math.floor(Number(args.samples ?? 0) || 0)),
            openedCount: Math.max(0, Math.floor(Number(args.learningInput.openedCount ?? 0) || 0)),
            savedCount: Math.max(0, Math.floor(Number(args.learningInput.savedCount ?? 0) || 0)),
            followedCount: Math.max(0, Math.floor(Number(args.learningInput.followedCount ?? 0) || 0)),
            weights: args.weights,
          } as TimelineSignalWeightsHistoryPoint),
  } as const;
}

export async function loadMobileLieScoreContextCoefficient(args: {
  userId: string;
  contextKey: string;
}) {
  const userId = String(args.userId ?? "").trim();
  const contextKey = String(args.contextKey ?? "").trim();
  if (!userId || !contextKey) return { available: true, row: null } as const;
  const res = await supabase
    .from("user_lie_score_context_coefficients")
    .select(
      "user_id,context_key,weekday_time_bucket,persona_key,attachment_mix_key,adjustment_bias,confidence,samples,updated_at"
    )
    .eq("user_id", userId)
    .eq("context_key", contextKey)
    .maybeSingle();
  if (res.error) {
    if (isMissingRelationErrorLike(res.error, "user_lie_score_context_coefficients")) {
      return { available: false, row: null } as const;
    }
    throw res.error;
  }
  if (!res.data) return { available: true, row: null } as const;
  const d: any = res.data;
  const row: LieScoreLearnedContextCoefficient & {
    weekdayTimeBucket?: string | null;
    personaKey?: string | null;
    attachmentMixKey?: string | null;
  } = {
    contextKey: String(d.context_key ?? contextKey),
    adjustmentBias: Number(d.adjustment_bias ?? 0) || 0,
    confidence: Number(d.confidence ?? 0) || 0,
    samples: Math.max(0, Math.floor(Number(d.samples ?? 0) || 0)),
    updatedAt: d.updated_at ?? null,
    weekdayTimeBucket: d.weekday_time_bucket ?? null,
    personaKey: d.persona_key ?? null,
    attachmentMixKey: d.attachment_mix_key ?? null,
  };
  return { available: true, row } as const;
}

export async function loadMobileLieScoreContextCoefficientHistory(args: {
  userId: string;
  contextKey: string;
  limit?: number;
}) {
  const userId = String(args.userId ?? "").trim();
  const contextKey = String(args.contextKey ?? "").trim();
  const limit = Math.max(1, Math.min(48, Math.floor(Number(args.limit ?? 16) || 16)));
  if (!userId || !contextKey) return { available: true, points: [] as LieScoreLearnedContextHistoryPoint[] } as const;
  const res = await supabase
    .from("user_lie_score_context_coefficient_history")
    .select("created_at,adjustment_bias,confidence,samples")
    .eq("user_id", userId)
    .eq("context_key", contextKey)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (res.error) {
    if (isMissingRelationErrorLike(res.error, "user_lie_score_context_coefficient_history")) {
      return { available: false, points: [] as LieScoreLearnedContextHistoryPoint[] } as const;
    }
    throw res.error;
  }
  const points = ((res.data ?? []) as any[])
    .map((row) => {
      const at = String(row?.created_at ?? "").trim();
      if (!at) return null;
      return {
        at,
        adjustmentBias: Number(row?.adjustment_bias ?? 0) || 0,
        confidence: Math.max(0, Math.min(1, Number(row?.confidence ?? 0) || 0)),
        samples: Math.max(0, Math.floor(Number(row?.samples ?? 0) || 0)),
      } satisfies LieScoreLearnedContextHistoryPoint;
    })
    .filter(Boolean)
    .reverse() as LieScoreLearnedContextHistoryPoint[];
  return { available: true, points } as const;
}

export async function loadMobileLieScoreContextCoefficientHistoryDaily(args: {
  userId: string;
  contextKey: string;
  limit?: number;
}) {
  const userId = String(args.userId ?? "").trim();
  const contextKey = String(args.contextKey ?? "").trim();
  const limit = Math.max(1, Math.min(120, Math.floor(Number(args.limit ?? 60) || 60)));
  if (!userId || !contextKey) return { available: true, points: [] as LieScoreLearnedContextHistoryPoint[] } as const;
  const res = await supabase
    .from("user_lie_score_context_coefficient_history_daily")
    .select("day,avg_adjustment_bias,avg_confidence,points")
    .eq("user_id", userId)
    .eq("context_key", contextKey)
    .order("day", { ascending: false })
    .limit(limit);
  if (res.error) {
    if (isMissingRelationErrorLike(res.error, "user_lie_score_context_coefficient_history_daily")) {
      return { available: false, points: [] as LieScoreLearnedContextHistoryPoint[] } as const;
    }
    throw res.error;
  }
  const points = ((res.data ?? []) as any[])
    .map((row) => {
      const day = String(row?.day ?? "").trim();
      if (!day) return null;
      return {
        at: `${day}T00:00:00.000Z`,
        adjustmentBias: Number(row?.avg_adjustment_bias ?? 0) || 0,
        confidence: Math.max(0, Math.min(1, Number(row?.avg_confidence ?? 0) || 0)),
        samples: Math.max(0, Math.floor(Number(row?.points ?? 0) || 0)),
      } satisfies LieScoreLearnedContextHistoryPoint;
    })
    .filter(Boolean)
    .reverse() as LieScoreLearnedContextHistoryPoint[];
  return { available: true, points } as const;
}

export async function upsertMobileLieScoreContextCoefficientObservation(args: {
  userId: string;
  contextKey: string;
  weekdayTimeBucket: string;
  personaKey: string;
  attachmentMixKey: string;
  observation: {
    targetBias: number;
    confidence: number;
    sampleIncrement?: number;
  };
}) {
  const userId = String(args.userId ?? "").trim();
  const contextKey = String(args.contextKey ?? "").trim();
  if (!userId || !contextKey) return { available: true, row: null, historyPoint: null } as const;
  const existing = await loadMobileLieScoreContextCoefficient({ userId, contextKey });
  if (existing.available === false) return { available: false, row: null, historyPoint: null } as const;
  const next = evolveLieScoreLearnedContextCoefficient({
    current: existing.row,
    observation: args.observation,
  });
  const nowIso = new Date().toISOString();
  const upsertRes = await supabase.from("user_lie_score_context_coefficients").upsert(
    {
      user_id: userId,
      context_key: contextKey,
      weekday_time_bucket: String(args.weekdayTimeBucket ?? "").trim() || null,
      persona_key: String(args.personaKey ?? "").trim() || "global",
      attachment_mix_key: String(args.attachmentMixKey ?? "").trim() || "none",
      adjustment_bias: next.adjustmentBias,
      confidence: next.confidence,
      samples: next.samples,
      updated_at: nowIso,
    },
    { onConflict: "user_id,context_key" }
  );
  if (upsertRes.error) {
    if (isMissingRelationErrorLike(upsertRes.error, "user_lie_score_context_coefficients")) {
      return { available: false, row: null, historyPoint: null } as const;
    }
    throw upsertRes.error;
  }
  const historyInsert = await supabase.from("user_lie_score_context_coefficient_history").insert({
    user_id: userId,
    context_key: contextKey,
    weekday_time_bucket: String(args.weekdayTimeBucket ?? "").trim() || null,
    persona_key: String(args.personaKey ?? "").trim() || "global",
    attachment_mix_key: String(args.attachmentMixKey ?? "").trim() || "none",
    adjustment_bias: next.adjustmentBias,
    confidence: next.confidence,
    samples: next.samples,
    created_at: nowIso,
  });
  const historyMissing =
    Boolean(historyInsert.error) &&
    isMissingRelationErrorLike(historyInsert.error, "user_lie_score_context_coefficient_history");
  if (historyInsert.error && !historyMissing) {
    throw historyInsert.error;
  }
  return {
    available: true,
    row: {
      contextKey,
      adjustmentBias: next.adjustmentBias,
      confidence: next.confidence,
      samples: next.samples,
      updatedAt: nowIso,
    } satisfies LieScoreLearnedContextCoefficient,
    historyPoint: historyMissing
      ? null
      : ({
          at: nowIso,
          adjustmentBias: next.adjustmentBias,
          confidence: next.confidence,
          samples: next.samples,
        } satisfies LieScoreLearnedContextHistoryPoint),
  } as const;
}
