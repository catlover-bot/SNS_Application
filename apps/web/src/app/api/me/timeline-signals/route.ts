import { NextResponse } from "next/server";
import {
  evolveTimelineSignalWeightsState,
  normalizeTimelineSignalWeights,
  type TimelineSignalLearningInput,
} from "@sns/core";
import { supabaseServer } from "@/lib/supabase/server";

function isMissingRelationError(err: any, relation: string) {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes(relation.toLowerCase()) && text.includes("does not exist");
}

export async function GET() {
  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "not_authenticated", followedAuthorIds: [], savedPostIds: [], openedPostIds: [] },
      { status: 401 }
    );
  }

  const [followsRes, savedCollectionsRes, fallbackSaveRes, openedRes, weightsRes] = await Promise.all([
    supa.from("follows").select("followee").eq("follower", user.id).limit(300),
    supa
      .from("user_saved_post_collections")
      .select("post_id")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(400),
    supa
      .from("reactions")
      .select("post_id")
      .eq("user_id", user.id)
      .eq("kind", "save")
      .order("created_at", { ascending: false })
      .limit(400),
    supa
      .from("user_post_open_state")
      .select("post_id")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(500),
    supa
      .from("user_timeline_signal_weights")
      .select(
        "followed_author_boost,saved_post_boost,opened_penalty,interested_persona_boost,interested_author_boost,base_score_weight,predicted_buzz_weight,recency_weight,samples,opened_count,saved_count,followed_count"
      )
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const followedAuthorIds = Array.from(
    new Set(
      (followsRes.data ?? [])
        .map((r: any) => String(r?.followee ?? "").trim())
        .filter(Boolean)
    )
  );

  let savedPostIds: string[] = [];
  if (!savedCollectionsRes.error) {
    savedPostIds = Array.from(
      new Set(
        (savedCollectionsRes.data ?? [])
          .map((r: any) => String(r?.post_id ?? "").trim())
          .filter(Boolean)
      )
    );
  } else if (isMissingRelationError(savedCollectionsRes.error, "user_saved_post_collections")) {
    savedPostIds = Array.from(
      new Set(
        (fallbackSaveRes.data ?? [])
          .map((r: any) => String(r?.post_id ?? "").trim())
          .filter(Boolean)
      )
    );
  }

  let openedPostIds: string[] = [];
  let openedDegraded = false;
  if (!openedRes.error) {
    openedPostIds = Array.from(
      new Set(
        (openedRes.data ?? [])
          .map((r: any) => String(r?.post_id ?? "").trim())
          .filter(Boolean)
      )
    );
  } else if (isMissingRelationError(openedRes.error, "user_post_open_state")) {
    openedDegraded = true;
  } else {
    return NextResponse.json(
      {
        error: openedRes.error.message ?? "timeline_signals_failed",
        followedAuthorIds: [],
        savedPostIds: [],
        openedPostIds: [],
      },
      { status: 500 }
    );
  }

  const weightsMissing =
    Boolean(weightsRes.error) &&
    isMissingRelationError(weightsRes.error, "user_timeline_signal_weights");
  const weights =
    !weightsRes.error && weightsRes.data
      ? normalizeTimelineSignalWeights({
          followedAuthorBoost: Number((weightsRes.data as any).followed_author_boost ?? NaN),
          savedPostBoost: Number((weightsRes.data as any).saved_post_boost ?? NaN),
          openedPenalty: Number((weightsRes.data as any).opened_penalty ?? NaN),
          interestedPersonaBoost: Number((weightsRes.data as any).interested_persona_boost ?? NaN),
          interestedAuthorBoost: Number((weightsRes.data as any).interested_author_boost ?? NaN),
          baseScoreWeight: Number((weightsRes.data as any).base_score_weight ?? NaN),
          predictedBuzzWeight: Number((weightsRes.data as any).predicted_buzz_weight ?? NaN),
          recencyWeight: Number((weightsRes.data as any).recency_weight ?? NaN),
        })
      : null;

  return NextResponse.json({
    followedAuthorIds,
    savedPostIds,
    openedPostIds,
    weights,
    weightsSamples:
      !weightsRes.error && weightsRes.data
        ? Math.max(0, Math.floor(Number((weightsRes.data as any).samples ?? 0) || 0))
        : null,
    learningInput:
      !weightsRes.error && weightsRes.data
        ? {
            openedCount: Math.max(
              0,
              Math.floor(Number((weightsRes.data as any).opened_count ?? openedPostIds.length) || 0)
            ),
            savedCount: Math.max(
              0,
              Math.floor(Number((weightsRes.data as any).saved_count ?? savedPostIds.length) || 0)
            ),
            followedCount: Math.max(
              0,
              Math.floor(Number((weightsRes.data as any).followed_count ?? followedAuthorIds.length) || 0)
            ),
          }
        : null,
    degraded: {
      savedCollectionsMissing: Boolean(
        savedCollectionsRes.error && isMissingRelationError(savedCollectionsRes.error, "user_saved_post_collections")
      ),
      openedStateMissing: openedDegraded,
      timelineWeightsMissing: weightsMissing,
    },
  });
}

export async function POST(req: Request) {
  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const learningInput = (body?.learningInput ?? body ?? {}) as TimelineSignalLearningInput;

  const existing = await supa
    .from("user_timeline_signal_weights")
    .select(
      "followed_author_boost,saved_post_boost,opened_penalty,interested_persona_boost,interested_author_boost,base_score_weight,predicted_buzz_weight,recency_weight,samples"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing.error && isMissingRelationError(existing.error, "user_timeline_signal_weights")) {
    return NextResponse.json({ ok: false, available: false, error: "timeline_weights_table_missing" });
  }
  if (existing.error) {
    return NextResponse.json({ error: existing.error.message ?? "timeline_weights_load_failed" }, { status: 500 });
  }

  const evolved = evolveTimelineSignalWeightsState({
    currentWeights: existing.data
      ? {
          followedAuthorBoost: Number((existing.data as any).followed_author_boost ?? NaN),
          savedPostBoost: Number((existing.data as any).saved_post_boost ?? NaN),
          openedPenalty: Number((existing.data as any).opened_penalty ?? NaN),
          interestedPersonaBoost: Number((existing.data as any).interested_persona_boost ?? NaN),
          interestedAuthorBoost: Number((existing.data as any).interested_author_boost ?? NaN),
          baseScoreWeight: Number((existing.data as any).base_score_weight ?? NaN),
          predictedBuzzWeight: Number((existing.data as any).predicted_buzz_weight ?? NaN),
          recencyWeight: Number((existing.data as any).recency_weight ?? NaN),
        }
      : null,
    currentSamples: existing.data ? Number((existing.data as any).samples ?? 0) : 0,
    learningInput,
  });

  const upsertRes = await supa.from("user_timeline_signal_weights").upsert(
    {
      user_id: user.id,
      followed_author_boost: evolved.weights.followedAuthorBoost,
      saved_post_boost: evolved.weights.savedPostBoost,
      opened_penalty: evolved.weights.openedPenalty,
      interested_persona_boost: evolved.weights.interestedPersonaBoost,
      interested_author_boost: evolved.weights.interestedAuthorBoost,
      base_score_weight: evolved.weights.baseScoreWeight,
      predicted_buzz_weight: evolved.weights.predictedBuzzWeight,
      recency_weight: evolved.weights.recencyWeight,
      opened_count: evolved.learningInput.openedCount,
      saved_count: evolved.learningInput.savedCount,
      followed_count: evolved.learningInput.followedCount,
      samples: evolved.samples,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (upsertRes.error) {
    return NextResponse.json({ error: upsertRes.error.message ?? "timeline_weights_upsert_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    available: true,
    weights: evolved.weights,
    weightsSamples: evolved.samples,
    learningInput: evolved.learningInput,
  });
}
