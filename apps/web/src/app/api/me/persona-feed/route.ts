import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  computeCalibratedBuzzScore,
  loadPersonaBuzzCalibrationSnapshot,
} from "@/lib/personaBuzzCalibration";
import { derivePersonaRowsFromSignals, topPersonaKey } from "@/lib/personaAssignment";

type Strategy = "same" | "compat";

type PersonaCompatNormRow = {
  b: string;
  weight: number | null;
};

type PostScoreRow = {
  post_id: string;
  persona_key: string;
  final_score: number | null;
};

type UserPersonaAffinityRow = {
  persona_key: string;
  weight: number | null;
};

type BuddyPersonaWeight = {
  key: string;
  score: number;
  bonus_scale?: number;
  raw_bonus_scale?: number;
  learned_samples?: number;
  learning_confidence?: number;
  history_points?: BuddyHistoryPoint[];
};

type OwnPostLogRow = {
  created_at: string;
  analysis: any;
};

type BuddyLearningRow = {
  buddy_persona_key: string;
  samples: number | null;
  positive_score: number | null;
  negative_score: number | null;
  bonus_scale: number | null;
};

type BuddyLearningValue = {
  bonus: number;
  samples: number;
  confidence: number;
};

type BuddyHistoryRow = {
  buddy_persona_key: string;
  samples: number | null;
  bonus_scale: number | null;
  confidence: number | null;
  created_at: string | null;
};

type BuddyHistoryPoint = {
  bonus_scale: number;
  confidence: number;
  samples: number;
  created_at: string;
};

type BuddyLearningMode = "adaptive" | "stable";
type BuddyLearningModeSource = "preference" | "ab_assignment" | "ab_optimized" | "default";

type BuddyModeAbAssignmentRow = {
  variant_key: string | null;
  assigned_mode: string | null;
};

type BuddyModeAbAssignment = {
  available: boolean;
  experimentKey: string;
  variantKey: "A" | "B" | null;
  assignedMode: BuddyLearningMode | null;
  source: "db" | "new" | "default";
};

type BuddyModeOptimization = {
  available: boolean;
  recommendedMode: BuddyLearningMode | null;
  reason: string;
  metrics?: {
    adaptiveScore: number;
    stableScore: number;
    adaptiveImpressions: number;
    stableImpressions: number;
    adaptiveFeedLoads: number;
    stableFeedLoads: number;
  } | null;
};

const DEFAULT_BUDDY_BONUS_SCALE = 0.42;
const DEFAULT_BUDDY_LEARNING_MODE: BuddyLearningMode = "adaptive";
const BUDDY_MODE_AB_EXPERIMENT = "buddy_mode_default_v1";

function clampInt(v: string | null, min: number, max: number, def: number) {
  const n = Number(v ?? "");
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function normalizeWeight(v: number | null | undefined, def = 0.65) {
  const n = Number(v ?? def);
  if (!Number.isFinite(n)) return def;
  return Math.max(0.2, Math.min(2.2, n));
}

function normalizeBuddyBonusScale(v: number | null | undefined, def = DEFAULT_BUDDY_BONUS_SCALE) {
  const n = Number(v ?? def);
  if (!Number.isFinite(n)) return def;
  return Math.max(0.12, Math.min(0.95, n));
}

function normalizeBuddyLearningMode(v: string | null | undefined): BuddyLearningMode {
  return String(v ?? "").trim() === "stable" ? "stable" : "adaptive";
}

function effectiveBuddyBonusScaleByMode(args: {
  learnedBonus: number | null | undefined;
  mode: BuddyLearningMode;
}) {
  const learned = normalizeBuddyBonusScale(args.learnedBonus, DEFAULT_BUDDY_BONUS_SCALE);
  if (args.mode === "stable") {
    return normalizeBuddyBonusScale(
      DEFAULT_BUDDY_BONUS_SCALE + (learned - DEFAULT_BUDDY_BONUS_SCALE) * 0.38,
      DEFAULT_BUDDY_BONUS_SCALE
    );
  }
  return learned;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function parseAnalysis(raw: any) {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

function deriveBuddyPersonaWeights(posts: OwnPostLogRow[], basePersona: string): BuddyPersonaWeight[] {
  if (!basePersona || !posts.length) return [];
  const now = Date.now();
  const acc = new Map<string, number>();

  posts.forEach((p) => {
    const analysis = parseAnalysis(p.analysis);
    const selected = String(analysis?.persona?.selected ?? "").trim();
    const secondary = String(analysis?.persona?.blend?.secondary ?? "").trim();
    if (!selected || !secondary) return;
    if (selected !== basePersona) return;
    if (secondary === basePersona) return;

    const rawShare = Number(analysis?.persona?.blend?.primaryShare ?? NaN);
    const primaryShare = Number.isFinite(rawShare) ? clamp(rawShare, 0, 1) : 0.65;
    const buddyShare = clamp(1 - primaryShare, 0.1, 0.8);

    const ts = Date.parse(String(p.created_at ?? ""));
    const ageDays = Number.isFinite(ts) ? Math.max(0, (now - ts) / (1000 * 60 * 60 * 24)) : 30;
    const recency = clamp(Math.pow(0.5, ageDays / 21), 0.32, 1);
    const signal = recency * (0.55 + buddyShare * 1.25);

    acc.set(secondary, (acc.get(secondary) ?? 0) + signal);
  });

  if (!acc.size) return [];
  const max = Math.max(...Array.from(acc.values()));
  if (!Number.isFinite(max) || max <= 0) return [];

  return Array.from(acc.entries())
    .map(([key, v]) => ({
      key,
      score: clamp(v / max, 0, 1),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

function learningConfidenceFromSamples(samples: number) {
  const n = Math.max(0, Math.floor(samples));
  return clamp(Math.log1p(n) / Math.log1p(80), 0, 1);
}

function isMissingRelationError(err: any, table = "user_blocks") {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes(table) && text.includes("does not exist");
}

async function loadBuddyLearningModePreference(args: { supa: any; userId: string }) {
  const { supa, userId } = args;
  const res = await supa
    .from("user_persona_feed_preferences")
    .select("buddy_learning_mode")
    .eq("user_id", userId)
    .maybeSingle();

  if (res.error) {
    if (isMissingRelationError(res.error, "user_persona_feed_preferences")) {
      return {
        available: false,
        mode: DEFAULT_BUDDY_LEARNING_MODE,
        hasExplicit: false,
      };
    }
    return {
      available: false,
      mode: DEFAULT_BUDDY_LEARNING_MODE,
      hasExplicit: false,
    };
  }

  return {
    available: true,
    mode: normalizeBuddyLearningMode(res.data?.buddy_learning_mode),
    hasExplicit: Boolean(String(res.data?.buddy_learning_mode ?? "").trim()),
  };
}

function hashVariantForUser(userId: string): "A" | "B" {
  let h = 0;
  for (let i = 0; i < userId.length; i += 1) {
    h = (h * 33 + userId.charCodeAt(i)) >>> 0;
  }
  return h % 2 === 0 ? "A" : "B";
}

function modeFromVariant(variant: "A" | "B"): BuddyLearningMode {
  return variant === "A" ? "adaptive" : "stable";
}

async function loadOrAssignBuddyModeAb(args: { supa: any; userId: string }): Promise<BuddyModeAbAssignment> {
  const { supa, userId } = args;
  const res = await supa
    .from("user_persona_feed_ab_assignments")
    .select("variant_key,assigned_mode")
    .eq("user_id", userId)
    .eq("experiment_key", BUDDY_MODE_AB_EXPERIMENT)
    .maybeSingle();

  if (res.error) {
    if (isMissingRelationError(res.error, "user_persona_feed_ab_assignments")) {
      return {
        available: false,
        experimentKey: BUDDY_MODE_AB_EXPERIMENT,
        variantKey: null,
        assignedMode: null,
        source: "default",
      };
    }
    return {
      available: false,
      experimentKey: BUDDY_MODE_AB_EXPERIMENT,
      variantKey: null,
      assignedMode: null,
      source: "default",
    };
  }

  const existingVariantRaw = String(res.data?.variant_key ?? "").trim();
  const existingModeRaw = String(res.data?.assigned_mode ?? "").trim();
  const existingVariant =
    existingVariantRaw === "A" || existingVariantRaw === "B"
      ? (existingVariantRaw as "A" | "B")
      : null;
  if (existingVariant && existingModeRaw) {
    return {
      available: true,
      experimentKey: BUDDY_MODE_AB_EXPERIMENT,
      variantKey: existingVariant,
      assignedMode: normalizeBuddyLearningMode(existingModeRaw),
      source: "db",
    };
  }

  const variantKey = hashVariantForUser(userId);
  const assignedMode = modeFromVariant(variantKey);
  const now = new Date().toISOString();
  const up = await supa.from("user_persona_feed_ab_assignments").upsert(
    {
      user_id: userId,
      experiment_key: BUDDY_MODE_AB_EXPERIMENT,
      variant_key: variantKey,
      assigned_mode: assignedMode,
      assigned_at: now,
      updated_at: now,
    },
    { onConflict: "user_id,experiment_key" }
  );
  if (up.error) {
    if (isMissingRelationError(up.error, "user_persona_feed_ab_assignments")) {
      return {
        available: false,
        experimentKey: BUDDY_MODE_AB_EXPERIMENT,
        variantKey: null,
        assignedMode: null,
        source: "default",
      };
    }
    return {
      available: false,
      experimentKey: BUDDY_MODE_AB_EXPERIMENT,
      variantKey: null,
      assignedMode: null,
      source: "default",
    };
  }
  return {
    available: true,
    experimentKey: BUDDY_MODE_AB_EXPERIMENT,
    variantKey,
    assignedMode,
    source: "new",
  };
}

async function logBuddyModeAbEvent(args: {
  supa: any;
  userId: string;
  assignment: BuddyModeAbAssignment;
  mode: BuddyLearningMode;
  strategy: Strategy;
  eventType: string;
  postId?: string | null;
}) {
  const { supa, userId, assignment, mode, strategy, eventType, postId } = args;
  if (!assignment.available || !assignment.variantKey) return false;
  const ins = await supa.from("persona_feed_mode_ab_events").insert({
    user_id: userId,
    experiment_key: assignment.experimentKey,
    variant_key: assignment.variantKey,
    event_type: eventType,
    mode,
    strategy,
    post_id: postId ?? null,
    created_at: new Date().toISOString(),
  });
  if (ins.error) {
    return false;
  }
  return true;
}

async function loadOptimizedBuddyModeFromEvents(args: {
  supa: any;
  userId: string;
  days?: number;
}): Promise<BuddyModeOptimization> {
  const { supa, userId, days = 14 } = args;
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - Math.max(3, Math.min(60, Math.floor(days))));
  const res = await supa
    .from("persona_feed_mode_ab_events")
    .select("mode,event_type,created_at")
    .eq("user_id", userId)
    .gte("created_at", start.toISOString())
    .limit(10000);
  if (res.error) {
    if (isMissingRelationError(res.error, "persona_feed_mode_ab_events")) {
      return { available: false, recommendedMode: null, reason: "table_missing", metrics: null };
    }
    return { available: false, recommendedMode: null, reason: "read_error", metrics: null };
  }

  const init = () => ({
    impressions: 0,
    opens: 0,
    feedLoads: 0,
    likes: 0,
    replies: 0,
    boosts: 0,
    loadTimes: [] as number[],
  });
  const adaptive = init();
  const stable = init();
  const pick = (m: string | null | undefined) => (String(m ?? "").trim() === "stable" ? stable : adaptive);
  ((res.data ?? []) as Array<any>).forEach((row) => {
    const b = pick(row?.mode);
    const ev = String(row?.event_type ?? "").trim();
    if (ev === "impression") b.impressions += 1;
    if (ev === "open") b.opens += 1;
    if (ev === "feed_load") {
      b.feedLoads += 1;
      const ts = Date.parse(String(row?.created_at ?? ""));
      if (Number.isFinite(ts)) b.loadTimes.push(ts);
    }
    if (ev === "like") b.likes += 1;
    if (ev === "reply") b.replies += 1;
    if (ev === "boost") b.boosts += 1;
  });
  const score = (b: ReturnType<typeof init>) => {
    const times = b.loadTimes.slice().sort((a, b2) => a - b2);
    let revisits = 0;
    for (let i = 0; i < times.length - 1; i += 1) {
      const h = (times[i + 1] - times[i]) / 3_600_000;
      if (h > 0 && h <= 36) revisits += 1;
    }
    const openRate = b.impressions > 0 ? b.opens / b.impressions : 0;
    const revisitRate = b.feedLoads > 0 ? revisits / b.feedLoads : 0;
    const engageRate = b.opens > 0 ? (b.likes + b.replies * 1.2 + b.boosts * 1.1) / b.opens : 0;
    return {
      value: openRate * 0.62 + revisitRate * 0.28 + clamp(engageRate, 0, 1.2) * 0.1,
      impressions: b.impressions,
      feedLoads: b.feedLoads,
    };
  };
  const a = score(adaptive);
  const s = score(stable);
  if (Math.max(a.impressions, s.impressions) < 20 || Math.max(a.feedLoads, s.feedLoads) < 4) {
    return {
      available: true,
      recommendedMode: null,
      reason: "insufficient_samples",
      metrics: {
        adaptiveScore: a.value,
        stableScore: s.value,
        adaptiveImpressions: a.impressions,
        stableImpressions: s.impressions,
        adaptiveFeedLoads: a.feedLoads,
        stableFeedLoads: s.feedLoads,
      },
    };
  }
  const diff = a.value - s.value;
  const recommendedMode = Math.abs(diff) > 0.015 ? (diff >= 0 ? "adaptive" : "stable") : null;
  return {
    available: true,
    recommendedMode,
    reason: recommendedMode ? "score_delta" : "near_tie",
    metrics: {
      adaptiveScore: a.value,
      stableScore: s.value,
      adaptiveImpressions: a.impressions,
      stableImpressions: s.impressions,
      adaptiveFeedLoads: a.feedLoads,
      stableFeedLoads: s.feedLoads,
    },
  };
}

async function loadBuddyLearningState(args: {
  supa: any;
  userId: string;
  basePersona: string;
  buddyKeys: string[];
}) {
  const { supa, userId, basePersona, buddyKeys } = args;
  const uniqBuddyKeys = Array.from(new Set(buddyKeys.filter(Boolean)));
  if (!uniqBuddyKeys.length) {
    return {
      available: false,
      globalBonus: DEFAULT_BUDDY_BONUS_SCALE,
      byBuddy: new Map<string, BuddyLearningValue>(),
    };
  }

  const queryKeys = Array.from(new Set([...uniqBuddyKeys, "__all__"]));
  const res = await supa
    .from("user_persona_buddy_learning_state")
    .select("buddy_persona_key,samples,positive_score,negative_score,bonus_scale")
    .eq("user_id", userId)
    .eq("base_persona_key", basePersona)
    .in("buddy_persona_key", queryKeys);

  if (res.error) {
    if (isMissingRelationError(res.error, "user_persona_buddy_learning_state")) {
      return {
        available: false,
        globalBonus: DEFAULT_BUDDY_BONUS_SCALE,
        byBuddy: new Map<string, BuddyLearningValue>(),
      };
    }
    return {
      available: false,
      globalBonus: DEFAULT_BUDDY_BONUS_SCALE,
      byBuddy: new Map<string, BuddyLearningValue>(),
    };
  }

  const rows = (res.data ?? []) as BuddyLearningRow[];
  let globalBonus = DEFAULT_BUDDY_BONUS_SCALE;
  const byBuddy = new Map<string, BuddyLearningValue>();

  rows.forEach((row) => {
    const key = String(row?.buddy_persona_key ?? "").trim();
    if (!key) return;
    const samples = Math.max(0, Math.floor(Number(row?.samples ?? 0) || 0));
    const bonus = normalizeBuddyBonusScale(row?.bonus_scale, DEFAULT_BUDDY_BONUS_SCALE);
    if (key === "__all__") {
      globalBonus = bonus;
      return;
    }
    byBuddy.set(key, {
      bonus,
      samples,
      confidence: learningConfidenceFromSamples(samples),
    });
  });

  return {
    available: true,
    globalBonus,
    byBuddy,
  };
}

async function loadBuddyLearningHistory(args: {
  supa: any;
  userId: string;
  basePersona: string;
  buddyKeys: string[];
  perBuddy?: number;
}) {
  const { supa, userId, basePersona, buddyKeys, perBuddy = 10 } = args;
  const uniqBuddyKeys = Array.from(new Set(buddyKeys.filter(Boolean))).slice(0, 8);
  if (!uniqBuddyKeys.length) {
    return {
      available: false,
      byBuddy: new Map<string, BuddyHistoryPoint[]>(),
    };
  }

  const res = await supa
    .from("user_persona_buddy_learning_history")
    .select("buddy_persona_key,samples,bonus_scale,confidence,created_at")
    .eq("user_id", userId)
    .eq("base_persona_key", basePersona)
    .in("buddy_persona_key", uniqBuddyKeys)
    .order("created_at", { ascending: false })
    .limit(Math.max(24, Math.min(240, uniqBuddyKeys.length * perBuddy * 2)));

  if (res.error) {
    if (isMissingRelationError(res.error, "user_persona_buddy_learning_history")) {
      return {
        available: false,
        byBuddy: new Map<string, BuddyHistoryPoint[]>(),
      };
    }
    return {
      available: false,
      byBuddy: new Map<string, BuddyHistoryPoint[]>(),
    };
  }

  const byBuddy = new Map<string, BuddyHistoryPoint[]>();
  ((res.data ?? []) as BuddyHistoryRow[]).forEach((row) => {
    const key = String(row?.buddy_persona_key ?? "").trim();
    if (!key) return;
    const list = byBuddy.get(key) ?? [];
    if (list.length >= perBuddy) {
      byBuddy.set(key, list);
      return;
    }
    const createdAt = String(row?.created_at ?? "").trim();
    if (!createdAt) return;
    list.push({
      bonus_scale: normalizeBuddyBonusScale(row?.bonus_scale, DEFAULT_BUDDY_BONUS_SCALE),
      confidence: clamp(Number(row?.confidence ?? 0) || 0, 0, 1),
      samples: Math.max(0, Math.floor(Number(row?.samples ?? 0) || 0)),
      created_at: createdAt,
    });
    byBuddy.set(key, list);
  });

  byBuddy.forEach((list, key) => {
    byBuddy.set(
      key,
      list
        .slice()
        .reverse()
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
    );
  });

  return {
    available: true,
    byBuddy,
  };
}

async function loadBlockedIds(supa: any, userId: string): Promise<Set<string>> {
  const blocks = await supa
    .from("user_blocks")
    .select("blocked_id")
    .eq("blocker_id", userId)
    .limit(500);
  if (blocks.error) {
    if (isMissingRelationError(blocks.error)) return new Set<string>();
    return new Set<string>();
  }
  return new Set<string>(
    (blocks.data ?? [])
      .map((x: any) => String(x?.blocked_id ?? "").trim())
      .filter((x: string) => x.length > 0)
  );
}

async function fallbackFeed(
  supa: any,
  limit: number,
  offset: number,
  blockedIds: Set<string>
) {
  const from = offset;
  const fetchLimit = blockedIds.size > 0 ? Math.min(limit * 4, 180) : limit;
  const to = offset + fetchLimit - 1;
  const res = await supa.from("feed_latest").select("*").range(from, to);
  const items = (res.data ?? [])
    .filter((p: any) => !blockedIds.has(String(p?.author ?? "").trim()))
    .map((p: any) => ({
      ...p,
      persona_match: {
        key: null,
        weighted_score: null,
        raw_score: null,
        weight: null,
        reason: "global_fallback",
      },
    }));
  return items.slice(0, limit);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = clampInt(url.searchParams.get("limit"), 1, 60, 20);
  const offset = clampInt(url.searchParams.get("offset"), 0, 500, 0);
  const strategy = (url.searchParams.get("strategy") === "same"
    ? "same"
    : "compat") as Strategy;

  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "not_authenticated", items: [] },
      { status: 401 }
    );
  }

  const blockedIds = await loadBlockedIds(supa, user.id);
  const buddyLearningModePref = await loadBuddyLearningModePreference({
    supa,
    userId: user.id,
  });
  const buddyModeAbAssignment = !buddyLearningModePref.hasExplicit
    ? await loadOrAssignBuddyModeAb({
        supa,
        userId: user.id,
      })
    : {
        available: false,
        experimentKey: BUDDY_MODE_AB_EXPERIMENT,
        variantKey: null,
        assignedMode: null,
        source: "default" as const,
      };
  const buddyModeOptimization = !buddyLearningModePref.hasExplicit
    ? await loadOptimizedBuddyModeFromEvents({
        supa,
        userId: user.id,
        days: 14,
      })
    : {
        available: false,
        recommendedMode: null,
        reason: "preference_override",
        metrics: null,
      };
  const resolvedBuddyLearningMode =
    buddyLearningModePref.hasExplicit
      ? buddyLearningModePref.mode
      : buddyModeOptimization.available && buddyModeOptimization.recommendedMode
      ? buddyModeOptimization.recommendedMode
      : buddyModeAbAssignment.available && buddyModeAbAssignment.assignedMode
      ? buddyModeAbAssignment.assignedMode
      : buddyLearningModePref.mode;
  const buddyLearningModeSource: BuddyLearningModeSource = buddyLearningModePref.hasExplicit
    ? "preference"
    : buddyModeOptimization.available && buddyModeOptimization.recommendedMode
    ? "ab_optimized"
    : buddyModeAbAssignment.available && buddyModeAbAssignment.assignedMode
    ? "ab_assignment"
    : "default";
  const buddyLearningModeMeta = {
    buddy_learning_mode: resolvedBuddyLearningMode,
    buddy_learning_mode_available: buddyLearningModePref.available,
    buddy_learning_mode_source: buddyLearningModeSource,
    buddy_learning_mode_ab:
      buddyModeAbAssignment.available && buddyModeAbAssignment.variantKey
        ? {
            experiment_key: buddyModeAbAssignment.experimentKey,
            variant_key: buddyModeAbAssignment.variantKey,
            assigned_mode: buddyModeAbAssignment.assignedMode,
            source: buddyModeAbAssignment.source,
          }
        : null,
    buddy_learning_mode_optimization:
      buddyModeOptimization.available && buddyModeOptimization.metrics
        ? {
            recommended_mode: buddyModeOptimization.recommendedMode,
            reason: buddyModeOptimization.reason,
            metrics: buddyModeOptimization.metrics,
          }
        : null,
  };

  try {
    const up = await supa
      .from("user_personas")
      .select("persona_key,score,version,updated_at")
      .eq("user_id", user.id)
      .order("version", { ascending: false })
      .order("score", { ascending: false })
      .limit(1)
      .maybeSingle();

    let basePersona = up.data?.persona_key ?? null;

    if (!basePersona) {
      const ownPosts = await supa
        .from("posts")
        .select("id,created_at,analysis")
        .eq("author", user.id)
        .order("created_at", { ascending: false })
        .limit(320);
      const ownPostRows = (ownPosts.data ??
        []) as Array<{ id: string; created_at: string; analysis: any }>;
      if (ownPostRows.length > 0) {
        const ownIds = ownPostRows.map((p) => p.id);
        const ownScores = await supa
          .from("post_scores")
          .select("post_id,persona_key,final_score")
          .in("post_id", ownIds)
          .limit(20000);
        const derived = derivePersonaRowsFromSignals({
          posts: ownPostRows,
          scoreRows: (ownScores.data ??
            []) as Array<{ post_id: string; persona_key: string; final_score: number | null }>,
          limit: 12,
        });
        basePersona = topPersonaKey(derived);
      }
    }

    if (!basePersona) {
      const items = await fallbackFeed(supa, limit, offset, blockedIds);
      await logBuddyModeAbEvent({
        supa,
        userId: user.id,
        assignment: buddyModeAbAssignment,
        mode: resolvedBuddyLearningMode,
        strategy,
        eventType: "feed_load",
      });
      return NextResponse.json({
        strategy,
        ...buddyLearningModeMeta,
        base_persona: null,
        used_personas: [],
        buddy_personas: [],
        items,
      });
    }

    const ownBuddyPosts = await supa
      .from("posts")
      .select("created_at,analysis")
      .eq("author", user.id)
      .order("created_at", { ascending: false })
      .limit(240);
    const buddyPersonasRaw = deriveBuddyPersonaWeights(
      (ownBuddyPosts.data ?? []) as OwnPostLogRow[],
      basePersona
    );
    const buddyLearning = await loadBuddyLearningState({
      supa,
      userId: user.id,
      basePersona,
      buddyKeys: buddyPersonasRaw.map((x) => x.key),
    });
    const buddyHistory = await loadBuddyLearningHistory({
      supa,
      userId: user.id,
      basePersona,
      buddyKeys: buddyPersonasRaw.map((x) => x.key),
      perBuddy: 10,
    });
    const buddyLearningMode = resolvedBuddyLearningMode;
    const buddyPersonas = buddyPersonasRaw.map((x) => {
      const learned = buddyLearning.byBuddy.get(x.key);
      const rawBonus = normalizeBuddyBonusScale(learned?.bonus, buddyLearning.globalBonus);
      const effectiveBonus = effectiveBuddyBonusScaleByMode({
        learnedBonus: rawBonus,
        mode: buddyLearningMode,
      });
      return {
        key: x.key,
        score: x.score,
        bonus_scale: effectiveBonus,
        raw_bonus_scale: rawBonus,
        learned_samples: learned?.samples ?? 0,
        learning_confidence: learned?.confidence ?? 0,
        history_points: buddyHistory.byBuddy.get(x.key) ?? [],
      } satisfies BuddyPersonaWeight;
    });
    const buddyScoreMap = new Map<string, number>(buddyPersonas.map((x) => [x.key, x.score]));
    const buddyBonusMap = new Map<string, number>(
      buddyPersonas.map((x) => [
        x.key,
        normalizeBuddyBonusScale(x.bonus_scale, buddyLearning.globalBonus),
      ])
    );

    const weightMap = new Map<string, number>();
    weightMap.set(basePersona, 1.15);

    if (strategy === "compat") {
      const compat = await supa
        .from("persona_compat_norm")
        .select("b,weight")
        .eq("a", basePersona)
        .order("weight", { ascending: false })
        .limit(8);

      (compat.data ?? []).forEach((r: PersonaCompatNormRow) => {
        if (!r?.b || r.b === basePersona) return;
        weightMap.set(r.b, normalizeWeight(r.weight, 0.7));
      });
      buddyPersonas.forEach((b) => {
        const base = normalizeWeight(weightMap.get(b.key), 0.72);
        const buddyBonus = normalizeBuddyBonusScale(
          b.bonus_scale,
          buddyLearning.globalBonus
        );
        const buddyFactor = 1 + b.score * buddyBonus;
        weightMap.set(b.key, normalizeWeight(base * buddyFactor, base));
      });
    }

    const personaKeys = Array.from(weightMap.keys());
    if (personaKeys.length === 0) {
      const items = await fallbackFeed(supa, limit, offset, blockedIds);
      await logBuddyModeAbEvent({
        supa,
        userId: user.id,
        assignment: buddyModeAbAssignment,
        mode: resolvedBuddyLearningMode,
        strategy,
        eventType: "feed_load",
      });
      return NextResponse.json({
        strategy,
        ...buddyLearningModeMeta,
        base_persona: basePersona,
        used_personas: [basePersona],
        buddy_personas: buddyPersonas,
        items,
      });
    }

    // ユーザー学習重み（存在する場合のみ）をブレンド
    try {
      const affinity = await supa
        .from("user_persona_affinity")
        .select("persona_key,weight")
        .eq("user_id", user.id)
        .in("persona_key", personaKeys);

      (affinity.data ?? []).forEach((r: UserPersonaAffinityRow) => {
        if (!r?.persona_key) return;
        const base = normalizeWeight(weightMap.get(r.persona_key), 0.7);
        const learned = normalizeWeight(r.weight, 1);
        weightMap.set(r.persona_key, normalizeWeight(base * learned, base));
      });
    } catch {
      // 学習テーブルがない環境では静的重みで継続
    }

    const candidateLimit = Math.max(300, limit * 30);
    const ps = await supa
      .from("post_scores")
      .select("post_id,persona_key,final_score")
      .in("persona_key", personaKeys)
      .order("final_score", { ascending: false })
      .limit(candidateLimit);

    const rows = (ps.data ?? []) as PostScoreRow[];
    if (!rows.length) {
      const items = await fallbackFeed(supa, limit, offset, blockedIds);
      await logBuddyModeAbEvent({
        supa,
        userId: user.id,
        assignment: buddyModeAbAssignment,
        mode: resolvedBuddyLearningMode,
        strategy,
        eventType: "feed_load",
      });
      return NextResponse.json({
        strategy,
        ...buddyLearningModeMeta,
        base_persona: basePersona,
        used_personas: personaKeys,
        buddy_personas: buddyPersonas,
        items,
      });
    }

    const bestByPost = new Map<
      string,
      {
        weighted: number;
        raw: number;
        key: string;
        weight: number;
        reason: string;
        buddy_score: number;
        buddy_weight: number;
        buddy_bonus_scale: number;
      }
    >();

    for (const r of rows) {
      if (!r?.post_id || !r?.persona_key) continue;
      const raw = Number(r.final_score ?? 0);
      if (!Number.isFinite(raw)) continue;
      const w = weightMap.get(r.persona_key) ?? 0.5;
      const weighted = raw * w;
      const buddyScore = clamp(buddyScoreMap.get(r.persona_key) ?? 0, 0, 1);
      const buddyBonus = normalizeBuddyBonusScale(
        buddyBonusMap.get(r.persona_key),
        buddyLearning.globalBonus
      );
      const buddyWeight = 1 + buddyScore * buddyBonus;
      const reason =
        r.persona_key === basePersona
          ? "same_persona"
          : buddyScore > 0.08 && buddyBonus > 0.14
          ? `buddy_compat_${r.persona_key}`
          : `compat_${r.persona_key}`;
      const cur = bestByPost.get(r.post_id);
      if (!cur || weighted > cur.weighted) {
        bestByPost.set(r.post_id, {
          weighted,
          raw,
          key: r.persona_key,
          weight: w,
          reason,
          buddy_score: buddyScore,
          buddy_weight: buddyWeight,
          buddy_bonus_scale: buddyBonus,
        });
      }
    }

    const candidates = Array.from(bestByPost.entries()).map(([post_id, v]) => ({
      post_id,
      ...v,
    }));
    const candidateIds = candidates.map((x) => x.post_id);
    const [analysisRes, buzzCalibration] = await Promise.all([
      supa.from("posts").select("id,analysis").in("id", candidateIds),
      loadPersonaBuzzCalibrationSnapshot({
        supa,
        userId: user.id,
        maxPosts: 140,
        matureMinutes: 15,
        persist: true,
      }),
    ]);

    const analysisById = new Map<string, any>();
    ((analysisRes.data ?? []) as Array<{ id: string; analysis: any }>).forEach((row) => {
      if (!row?.id) return;
      analysisById.set(row.id, row.analysis);
    });

    const ranked = candidates
      .map((r) => {
        const predicted = computeCalibratedBuzzScore({
          analysis: analysisById.get(r.post_id),
          personaKey: r.key,
          snapshot: buzzCalibration,
        });
        const rankingScore = r.weighted * (0.82 + predicted.calibrated * 0.36);
        return {
          ...r,
          ranking_score: rankingScore,
          predicted_response: predicted.calibrated,
          predicted_base: predicted.base,
          calibration_multiplier: predicted.stat.multiplier,
          calibration_samples: predicted.stat.samples,
        };
      })
      .sort((a, b) => b.ranking_score - a.ranking_score)
      .slice(offset, offset + limit);

    const ids = ranked.map((r) => r.post_id);
    if (ids.length === 0) {
      await logBuddyModeAbEvent({
        supa,
        userId: user.id,
        assignment: buddyModeAbAssignment,
        mode: resolvedBuddyLearningMode,
        strategy,
        eventType: "feed_load",
      });
      return NextResponse.json({
        strategy,
        ...buddyLearningModeMeta,
        base_persona: basePersona,
        used_personas: personaKeys,
        buddy_personas: buddyPersonas,
        items: [],
      });
    }

    const fromEnriched = await supa.from("v_posts_enriched").select("*").in("id", ids);
    const fromPosts =
      fromEnriched.error || !fromEnriched.data?.length
        ? await supa.from("posts").select("*").in("id", ids)
        : null;

    const byId = new Map(
      ((fromEnriched.data ?? fromPosts?.data ?? []) as any[]).map((p) => [p.id, p])
    );

    const items = ranked
      .map((r) => {
        const post = byId.get(r.post_id);
        if (!post || blockedIds.has(String(post?.author ?? "").trim())) return null;
        return {
          ...post,
          persona_match: {
            key: r.key,
            weighted_score: r.weighted,
            raw_score: r.raw,
            weight: r.weight,
            reason: r.reason,
            buddy_score: r.buddy_score,
            buddy_weight: r.buddy_weight,
            buddy_bonus_scale: r.buddy_bonus_scale,
            predicted_response: r.predicted_response,
            predicted_base: r.predicted_base,
            ranking_score: r.ranking_score,
            calibration_multiplier: r.calibration_multiplier,
            calibration_samples: r.calibration_samples,
          },
        };
      })
      .filter(Boolean);

    await logBuddyModeAbEvent({
      supa,
      userId: user.id,
      assignment: buddyModeAbAssignment,
      mode: resolvedBuddyLearningMode,
      strategy,
      eventType: "feed_load",
    });
    return NextResponse.json({
      strategy,
      ...buddyLearningModeMeta,
      base_persona: basePersona,
      used_personas: personaKeys,
      buddy_personas: buddyPersonas,
      items,
    });
  } catch (e: any) {
    const items = await fallbackFeed(supa, limit, offset, blockedIds);
    await logBuddyModeAbEvent({
      supa,
      userId: user.id,
      assignment: buddyModeAbAssignment,
      mode: resolvedBuddyLearningMode,
      strategy,
      eventType: "feed_load_error",
    });
    return NextResponse.json(
      {
        strategy,
        ...buddyLearningModeMeta,
        base_persona: null,
        used_personas: [],
        buddy_personas: [],
        items,
        error: e?.message ?? "persona_feed_error",
      },
      { status: 200 }
    );
  }
}
