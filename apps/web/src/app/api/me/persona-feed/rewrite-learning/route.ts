import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type PostRow = {
  id: string;
  created_at: string;
  analysis: any;
};

type ReactionRow = {
  post_id: string;
  kind: string | null;
};

type ReplyRow = {
  parent_id: string | null;
};

type RewriteLearningRow = {
  rewrite_style: string;
  samples: number | null;
  predicted_avg: number | null;
  actual_avg: number | null;
  multiplier: number | null;
  confidence: number | null;
  updated_at?: string | null;
};

type RewriteContextLearningRow = RewriteLearningRow & {
  time_bucket?: string | null;
  weekday_bucket?: string | null;
};

type RewriteStyleKey = "aggressive" | "empathy" | "short";

const STYLE_LABELS: Record<RewriteStyleKey, string> = {
  aggressive: "攻め",
  empathy: "共感",
  short: "短文",
};

const STYLE_PRIORS: Record<RewriteStyleKey, number> = {
  aggressive: 0.55,
  empathy: 0.6,
  short: 0.5,
};

function clamp(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function normalizeTzOffsetMinutes(v: string | null | undefined) {
  const n = Number(v ?? NaN);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-14 * 60, Math.min(14 * 60, Math.floor(n)));
}

function localDateWithOffset(dateInput: string | Date, tzOffsetMinutes: number) {
  const ms = new Date(dateInput).getTime();
  if (!Number.isFinite(ms)) return new Date();
  return new Date(ms - tzOffsetMinutes * 60_000);
}

function rewriteTimeBucket(dateInput: string | Date, tzOffsetMinutes: number) {
  const d = localDateWithOffset(dateInput, tzOffsetMinutes);
  const hour = d.getUTCHours();
  if (hour < 6) return "late_night";
  if (hour < 11) return "morning";
  if (hour < 17) return "daytime";
  if (hour < 22) return "evening";
  return "night";
}

function rewriteWeekdayBucket(dateInput: string | Date, tzOffsetMinutes: number) {
  const d = localDateWithOffset(dateInput, tzOffsetMinutes);
  const day = d.getUTCDay(); // 0=Sun
  return day === 0 || day === 6 ? "weekend" : "weekday";
}

function isMissingRelationError(err: any, relation: string) {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes(relation.toLowerCase()) && text.includes("does not exist");
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

function normalizeStyleKey(v: string | null | undefined): RewriteStyleKey | null {
  const raw = String(v ?? "").trim().toLowerCase();
  if (raw === "aggressive" || raw === "attack") return "aggressive";
  if (raw === "empathy" || raw === "empathetic") return "empathy";
  if (raw === "short" || raw === "shortform") return "short";
  if (raw === "攻め") return "aggressive";
  if (raw === "共感") return "empathy";
  if (raw === "短文") return "short";
  return null;
}

function extractRewriteMeta(analysisRaw: any) {
  const analysis = parseAnalysis(analysisRaw);
  const meta = analysis?.persona?.rewrite_mission ?? analysis?.persona?.rewriteMission ?? null;
  if (!meta || typeof meta !== "object") return null;
  const styleKey = normalizeStyleKey(meta.styleKey ?? meta.style_key ?? meta.style);
  if (!styleKey) return null;
  const buddyPersonaKey = String(meta.buddyPersonaKey ?? meta.buddy_persona_key ?? meta.buddyKey ?? "").trim();
  const basePersonaKey = String(meta.basePersonaKey ?? meta.base_persona_key ?? meta.basePersona ?? "").trim();
  if (!buddyPersonaKey) return null;
  return {
    styleKey,
    styleLabel: String(meta.styleLabel ?? meta.style_label ?? STYLE_LABELS[styleKey]).trim() || STYLE_LABELS[styleKey],
    buddyPersonaKey,
    basePersonaKey: basePersonaKey || null,
  };
}

function reactionScore(args: { likes: number; replies: number; boosts: number }) {
  const likes = Math.max(0, args.likes);
  const replies = Math.max(0, args.replies);
  const boosts = Math.max(0, args.boosts);
  const weighted = likes * 1 + replies * 1.6 + boosts * 1.2;
  const score = 1 - Math.exp(-weighted / 4.5);
  return clamp(score, 0, 1);
}

async function loadPersistedRows(args: {
  supa: any;
  userId: string;
  basePersonaKey: string;
  buddyPersonaKey: string;
}) {
  const { supa, userId, basePersonaKey, buddyPersonaKey } = args;
  const res = await supa
    .from("user_persona_rewrite_learning_state")
    .select("rewrite_style,samples,predicted_avg,actual_avg,multiplier,confidence,updated_at")
    .eq("user_id", userId)
    .eq("base_persona_key", basePersonaKey)
    .eq("buddy_persona_key", buddyPersonaKey);

  if (res.error) {
    if (isMissingRelationError(res.error, "user_persona_rewrite_learning_state")) {
      return { available: false, rows: [] as RewriteLearningRow[] };
    }
    return { available: false, rows: [] as RewriteLearningRow[] };
  }
  return { available: true, rows: (res.data ?? []) as RewriteLearningRow[] };
}

async function loadPersistedContextRows(args: {
  supa: any;
  userId: string;
  basePersonaKey: string;
  buddyPersonaKey: string;
  timeBucket: string;
  weekdayBucket: string;
}) {
  const { supa, userId, basePersonaKey, buddyPersonaKey, timeBucket, weekdayBucket } = args;
  const res = await supa
    .from("user_persona_rewrite_context_learning_state")
    .select(
      "rewrite_style,time_bucket,weekday_bucket,samples,predicted_avg,actual_avg,multiplier,confidence,updated_at"
    )
    .eq("user_id", userId)
    .eq("base_persona_key", basePersonaKey)
    .eq("buddy_persona_key", buddyPersonaKey)
    .eq("time_bucket", timeBucket)
    .eq("weekday_bucket", weekdayBucket);
  if (res.error) {
    if (isMissingRelationError(res.error, "user_persona_rewrite_context_learning_state")) {
      return { available: false, rows: [] as RewriteContextLearningRow[] };
    }
    return { available: false, rows: [] as RewriteContextLearningRow[] };
  }
  return { available: true, rows: (res.data ?? []) as RewriteContextLearningRow[] };
}

function shapeResponseRows(rows: RewriteLearningRow[]) {
  const byStyle = new Map<string, RewriteLearningRow>();
  rows.forEach((row) => {
    const key = normalizeStyleKey(row?.rewrite_style);
    if (!key) return;
    byStyle.set(key, row);
  });

  const styles = (["aggressive", "empathy", "short"] as RewriteStyleKey[]).map((styleKey) => {
    const row = byStyle.get(styleKey);
    const samples = Math.max(0, Math.floor(Number(row?.samples ?? 0) || 0));
    const predictedAvg = clamp(Number(row?.predicted_avg ?? STYLE_PRIORS[styleKey]) || STYLE_PRIORS[styleKey], 0.05, 0.95);
    const actualAvg = clamp(Number(row?.actual_avg ?? 0.2) || 0.2, 0, 1);
    const confidence = clamp(Number(row?.confidence ?? 0) || 0, 0, 1);
    const multiplier = clamp(Number(row?.multiplier ?? 1) || 1, 0.72, 1.45);
    const score = predictedAvg * (0.7 + confidence * 0.3) * multiplier;
    return {
      styleKey,
      styleLabel: STYLE_LABELS[styleKey],
      samples,
      predictedAvg,
      actualAvg,
      multiplier,
      confidence,
      score,
      updatedAt: row?.updated_at ?? null,
    };
  });

  return {
    styles,
    by_style: Object.fromEntries(
      styles.map((x) => [
        x.styleKey,
        {
          styleLabel: x.styleLabel,
          samples: x.samples,
          predictedAvg: x.predictedAvg,
          actualAvg: x.actualAvg,
          multiplier: x.multiplier,
          confidence: x.confidence,
          score: x.score,
          updatedAt: x.updatedAt,
        },
      ])
    ),
  };
}

function blendRowsForContext(args: {
  globalRows: RewriteLearningRow[];
  contextRows: RewriteContextLearningRow[];
}) {
  const byGlobal = new Map<string, RewriteLearningRow>();
  args.globalRows.forEach((r) => {
    const key = normalizeStyleKey(r?.rewrite_style);
    if (!key) return;
    byGlobal.set(key, r);
  });
  const byContext = new Map<string, RewriteContextLearningRow>();
  args.contextRows.forEach((r) => {
    const key = normalizeStyleKey(r?.rewrite_style);
    if (!key) return;
    byContext.set(key, r);
  });

  const rows: RewriteLearningRow[] = [];
  (["aggressive", "empathy", "short"] as RewriteStyleKey[]).forEach((styleKey) => {
    const g = byGlobal.get(styleKey) ?? null;
    const c = byContext.get(styleKey) ?? null;
    if (!g && !c) return;
    if (!g || !c) {
      rows.push((c ?? g) as RewriteLearningRow);
      return;
    }
    const cConf = clamp(Number(c.confidence ?? 0) || 0, 0, 1);
    const gConf = clamp(Number(g.confidence ?? 0) || 0, 0, 1);
    const cSamples = Math.max(0, Math.floor(Number(c.samples ?? 0) || 0));
    const gSamples = Math.max(0, Math.floor(Number(g.samples ?? 0) || 0));
    const contextMix = clamp(0.18 + cConf * 0.52 + Math.log1p(cSamples) / Math.log1p(24) * 0.2, 0.12, 0.88);
    const globalMix = 1 - contextMix;
    rows.push({
      rewrite_style: styleKey,
      samples: cSamples,
      predicted_avg:
        (Number(c.predicted_avg ?? 0) || 0) * contextMix +
        (Number(g.predicted_avg ?? 0) || 0) * globalMix,
      actual_avg:
        (Number(c.actual_avg ?? 0) || 0) * contextMix + (Number(g.actual_avg ?? 0) || 0) * globalMix,
      multiplier:
        (Number(c.multiplier ?? 1) || 1) * contextMix + (Number(g.multiplier ?? 1) || 1) * globalMix,
      confidence: clamp(cConf * 0.75 + gConf * 0.25, 0, 1),
      updated_at: c.updated_at ?? g.updated_at ?? null,
    });
  });
  return rows;
}

export async function GET(req: NextRequest) {
  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const basePersonaKey = String(url.searchParams.get("basePersona") ?? "").trim();
  const buddyPersonaKey = String(url.searchParams.get("buddyPersona") ?? "").trim();
  const refresh = String(url.searchParams.get("refresh") ?? "1").trim() !== "0";
  const tzOffsetMinutes = normalizeTzOffsetMinutes(url.searchParams.get("tzOffsetMinutes"));
  const requestNow = new Date();
  const contextTimeBucket = rewriteTimeBucket(requestNow, tzOffsetMinutes);
  const contextWeekdayBucket = rewriteWeekdayBucket(requestNow, tzOffsetMinutes);

  if (!buddyPersonaKey) {
    return NextResponse.json({ error: "buddyPersona is required" }, { status: 400 });
  }

  const baseKey = basePersonaKey || "__all__";
  const persisted = await loadPersistedRows({
    supa,
    userId: user.id,
    basePersonaKey: baseKey,
    buddyPersonaKey,
  });
  const persistedContext = await loadPersistedContextRows({
    supa,
    userId: user.id,
    basePersonaKey: baseKey,
    buddyPersonaKey,
    timeBucket: contextTimeBucket,
    weekdayBucket: contextWeekdayBucket,
  });

  if (!refresh) {
    const shaped = shapeResponseRows(
      persistedContext.available && persistedContext.rows.length > 0
        ? blendRowsForContext({
            globalRows: persisted.rows,
            contextRows: persistedContext.rows,
          })
        : persisted.rows
    );
    return NextResponse.json({
      ok: true,
      available: persisted.available,
      contextAvailable: persistedContext.available,
      source: persisted.available ? "persisted" : "default",
      basePersona: baseKey,
      buddyPersona: buddyPersonaKey,
      context_time_bucket: contextTimeBucket,
      context_weekday_bucket: contextWeekdayBucket,
      ...shaped,
    });
  }

  const postsRes = await supa
    .from("posts")
    .select("id,created_at,analysis")
    .eq("author", user.id)
    .order("created_at", { ascending: false })
    .limit(260);

  if (postsRes.error) {
    const shaped = shapeResponseRows(
      persistedContext.available && persistedContext.rows.length > 0
        ? blendRowsForContext({
            globalRows: persisted.rows,
            contextRows: persistedContext.rows,
          })
        : persisted.rows
    );
    return NextResponse.json({
      ok: true,
      available: persisted.available,
      source: persisted.available ? "persisted" : "default",
      basePersona: baseKey,
      buddyPersona: buddyPersonaKey,
      warning: postsRes.error.message ?? "rewrite_posts_read_error",
      context_time_bucket: contextTimeBucket,
      context_weekday_bucket: contextWeekdayBucket,
      ...shaped,
    });
  }

  const matchingPosts = ((postsRes.data ?? []) as PostRow[]).filter((post) => {
    const meta = extractRewriteMeta(post.analysis);
    if (!meta) return false;
    if (meta.buddyPersonaKey !== buddyPersonaKey) return false;
    if (meta.basePersonaKey && meta.basePersonaKey !== baseKey) return false;
    return true;
  });

  if (matchingPosts.length === 0) {
    const shaped = shapeResponseRows(
      persistedContext.available && persistedContext.rows.length > 0
        ? blendRowsForContext({
            globalRows: persisted.rows,
            contextRows: persistedContext.rows,
          })
        : persisted.rows
    );
    return NextResponse.json({
      ok: true,
      available: persisted.available,
      source: persisted.available ? "persisted" : "default",
      basePersona: baseKey,
      buddyPersona: buddyPersonaKey,
      matchedPosts: 0,
      context_time_bucket: contextTimeBucket,
      context_weekday_bucket: contextWeekdayBucket,
      ...shaped,
    });
  }

  const targetIds = matchingPosts.map((p) => p.id);
  const [reactionsRes, repliesRes] = await Promise.all([
    supa
      .from("reactions")
      .select("post_id,kind")
      .in("post_id", targetIds)
      .in("kind", ["like", "boost"])
      .limit(20000),
    supa.from("posts").select("parent_id").in("parent_id", targetIds).limit(20000),
  ]);

  const likesByPost = new Map<string, number>();
  const boostsByPost = new Map<string, number>();
  if (!reactionsRes.error) {
    ((reactionsRes.data ?? []) as ReactionRow[]).forEach((row) => {
      const postId = String(row?.post_id ?? "").trim();
      const kind = String(row?.kind ?? "").trim();
      if (!postId) return;
      if (kind === "like") likesByPost.set(postId, (likesByPost.get(postId) ?? 0) + 1);
      if (kind === "boost") boostsByPost.set(postId, (boostsByPost.get(postId) ?? 0) + 1);
    });
  }

  const repliesByPost = new Map<string, number>();
  if (!repliesRes.error) {
    ((repliesRes.data ?? []) as ReplyRow[]).forEach((row) => {
      const postId = String(row?.parent_id ?? "").trim();
      if (!postId) return;
      repliesByPost.set(postId, (repliesByPost.get(postId) ?? 0) + 1);
    });
  }

  const buckets = new Map<
    RewriteStyleKey,
    { samples: number; predictedSum: number; actualSum: number }
  >();
  const contextBuckets = new Map<
    RewriteStyleKey,
    { samples: number; predictedSum: number; actualSum: number }
  >();

  matchingPosts.forEach((post) => {
    const meta = extractRewriteMeta(post.analysis);
    if (!meta) return;
    const likes = likesByPost.get(post.id) ?? 0;
    const replies = repliesByPost.get(post.id) ?? 0;
    const boosts = boostsByPost.get(post.id) ?? 0;
    const actual = reactionScore({ likes, replies, boosts });
    const predicted = STYLE_PRIORS[meta.styleKey];
    const prev = buckets.get(meta.styleKey) ?? { samples: 0, predictedSum: 0, actualSum: 0 };
    prev.samples += 1;
    prev.predictedSum += predicted;
    prev.actualSum += actual;
    buckets.set(meta.styleKey, prev);

    const postTimeBucket = rewriteTimeBucket(post.created_at, tzOffsetMinutes);
    const postWeekdayBucket = rewriteWeekdayBucket(post.created_at, tzOffsetMinutes);
    if (postTimeBucket === contextTimeBucket && postWeekdayBucket === contextWeekdayBucket) {
      const cPrev = contextBuckets.get(meta.styleKey) ?? { samples: 0, predictedSum: 0, actualSum: 0 };
      cPrev.samples += 1;
      cPrev.predictedSum += predicted;
      cPrev.actualSum += actual;
      contextBuckets.set(meta.styleKey, cPrev);
    }
  });

  const now = new Date().toISOString();
  const nextRows: Array<{
    user_id: string;
    base_persona_key: string;
    buddy_persona_key: string;
    rewrite_style: RewriteStyleKey;
    samples: number;
    predicted_avg: number;
    actual_avg: number;
    multiplier: number;
    confidence: number;
    updated_at: string;
  }> = [];
  const nextContextRows: Array<{
    user_id: string;
    base_persona_key: string;
    buddy_persona_key: string;
    rewrite_style: RewriteStyleKey;
    time_bucket: string;
    weekday_bucket: string;
    samples: number;
    predicted_avg: number;
    actual_avg: number;
    multiplier: number;
    confidence: number;
    updated_at: string;
  }> = [];

  (["aggressive", "empathy", "short"] as RewriteStyleKey[]).forEach((styleKey) => {
    const bucket = buckets.get(styleKey);
    const samples = Math.max(0, bucket?.samples ?? 0);
    if (samples <= 0) return;
    const predictedAvg = clamp((bucket?.predictedSum ?? 0) / samples, 0.05, 0.95);
    const actualAvg = clamp((bucket?.actualSum ?? 0) / samples, 0, 1);
    const confidence = clamp(Math.log1p(samples) / Math.log1p(20), 0, 1);
    const rawMultiplier = (actualAvg + 0.12) / (predictedAvg + 0.12);
    const multiplier = clamp(1 + (rawMultiplier - 1) * (0.35 + confidence * 0.65), 0.72, 1.45);
    nextRows.push({
      user_id: user.id,
      base_persona_key: baseKey,
      buddy_persona_key: buddyPersonaKey,
      rewrite_style: styleKey,
      samples,
      predicted_avg: predictedAvg,
      actual_avg: actualAvg,
      multiplier,
      confidence,
      updated_at: now,
    });
  });
  (["aggressive", "empathy", "short"] as RewriteStyleKey[]).forEach((styleKey) => {
    const bucket = contextBuckets.get(styleKey);
    const samples = Math.max(0, bucket?.samples ?? 0);
    if (samples <= 0) return;
    const predictedAvg = clamp((bucket?.predictedSum ?? 0) / samples, 0.05, 0.95);
    const actualAvg = clamp((bucket?.actualSum ?? 0) / samples, 0, 1);
    const confidence = clamp(Math.log1p(samples) / Math.log1p(14), 0, 1);
    const rawMultiplier = (actualAvg + 0.12) / (predictedAvg + 0.12);
    const multiplier = clamp(1 + (rawMultiplier - 1) * (0.35 + confidence * 0.65), 0.72, 1.45);
    nextContextRows.push({
      user_id: user.id,
      base_persona_key: baseKey,
      buddy_persona_key: buddyPersonaKey,
      rewrite_style: styleKey,
      time_bucket: contextTimeBucket,
      weekday_bucket: contextWeekdayBucket,
      samples,
      predicted_avg: predictedAvg,
      actual_avg: actualAvg,
      multiplier,
      confidence,
      updated_at: now,
    });
  });

  let available = persisted.available;
  let contextAvailable = persistedContext.available;
  let source = persisted.available ? "persisted" : "default";
  let finalRows = persisted.rows;
  let finalContextRows = persistedContext.rows;
  let warning: string | null = null;

  if (nextRows.length > 0) {
    const up = await supa
      .from("user_persona_rewrite_learning_state")
      .upsert(nextRows, {
        onConflict: "user_id,base_persona_key,buddy_persona_key,rewrite_style",
      });
    if (up.error) {
      if (isMissingRelationError(up.error, "user_persona_rewrite_learning_state")) {
        available = false;
        source = "computed_ephemeral";
        finalRows = nextRows;
      } else {
        warning = up.error.message ?? "rewrite_learning_upsert_error";
        available = persisted.available;
        source = persisted.available ? "persisted" : "computed_ephemeral";
        finalRows = persisted.available ? persisted.rows : nextRows;
      }
    } else {
      available = true;
      source = "refreshed";
      finalRows = nextRows;
    }
  }
  if (nextContextRows.length > 0) {
    const upContext = await supa
      .from("user_persona_rewrite_context_learning_state")
      .upsert(nextContextRows, {
        onConflict:
          "user_id,base_persona_key,buddy_persona_key,rewrite_style,time_bucket,weekday_bucket",
      });
    if (upContext.error) {
      if (isMissingRelationError(upContext.error, "user_persona_rewrite_context_learning_state")) {
        contextAvailable = false;
        finalContextRows = nextContextRows;
      } else {
        warning = warning ?? upContext.error.message ?? "rewrite_context_learning_upsert_error";
        finalContextRows = persistedContext.rows.length > 0 ? persistedContext.rows : nextContextRows;
      }
    } else {
      contextAvailable = true;
      finalContextRows = nextContextRows;
    }
  }

  const shaped = shapeResponseRows(
    (contextAvailable && finalContextRows.length > 0
      ? blendRowsForContext({
          globalRows: finalRows,
          contextRows: finalContextRows,
        })
      : finalRows) as RewriteLearningRow[]
  );
  return NextResponse.json({
    ok: true,
    available,
    contextAvailable,
    source,
    basePersona: baseKey,
    buddyPersona: buddyPersonaKey,
    context_time_bucket: contextTimeBucket,
    context_weekday_bucket: contextWeekdayBucket,
    matchedPosts: matchingPosts.length,
    reactionRows: reactionsRes.error ? 0 : (reactionsRes.data ?? []).length,
    replyRows: repliesRes.error ? 0 : (repliesRes.data ?? []).length,
    warning,
    ...shaped,
  });
}
