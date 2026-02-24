import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type FeedbackEvent =
  | "impression"
  | "open"
  | "like"
  | "reply"
  | "boost"
  | "skip"
  | "hide";

const DELTA_BY_EVENT: Record<FeedbackEvent, number> = {
  impression: 0.005,
  open: 0.03,
  like: 0.08,
  reply: 0.12,
  boost: 0.1,
  skip: -0.02,
  hide: -0.08,
};

const GLOBAL_DWELL_BUCKET = "__all__";
const GLOBAL_PERSONA_KEY = "__all__";
const GLOBAL_EVENT_TYPE = "__all__";
const POSITIVE_EVENTS = new Set<FeedbackEvent>(["open", "like", "reply", "boost"]);
const NEGATIVE_EVENTS = new Set<FeedbackEvent>(["skip", "hide"]);

const POSITIVE_SIGNAL_BY_EVENT: Partial<Record<FeedbackEvent, number>> = {
  open: 0.4,
  like: 1.0,
  reply: 1.35,
  boost: 1.15,
};

const NEGATIVE_SIGNAL_BY_EVENT: Partial<Record<FeedbackEvent, number>> = {
  skip: 0.8,
  hide: 1.35,
};

type DwellLearningRow = {
  persona_key?: string | null;
  event_type?: string | null;
  dwell_bucket: string;
  samples: number | null;
  positive_score: number | null;
  negative_score: number | null;
};

type DwellLearningSnapshot = {
  available: boolean;
  usingPersonaDimension: boolean;
  usingEventDimension: boolean;
  bucket: string;
  personaKey: string;
  eventType: string;
  personaBucketRow: DwellLearningRow | null;
  personaGlobalRow: DwellLearningRow | null;
  globalBucketRow: DwellLearningRow | null;
  globalGlobalRow: DwellLearningRow | null;
};

type BuddyLearningRow = {
  buddy_persona_key: string;
  samples: number | null;
  positive_score: number | null;
  negative_score: number | null;
  bonus_scale: number | null;
};

const DEFAULT_BUDDY_BONUS_SCALE = 0.42;
type BuddyLearningMode = "adaptive" | "stable";
const DEFAULT_BUDDY_LEARNING_MODE: BuddyLearningMode = "adaptive";
const BUDDY_MODE_AB_EXPERIMENT = "buddy_mode_default_v1";

type BuddyModeAbAssignment = {
  available: boolean;
  experimentKey: string;
  variantKey: "A" | "B" | null;
  assignedMode: BuddyLearningMode | null;
  source: "db" | "new" | "default";
};

function clamp(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function toSafeNumber(v: number | null | undefined, def = 0) {
  const n = Number(v ?? def);
  return Number.isFinite(n) ? n : def;
}

function toNonNegative(v: number | null | undefined, def = 0) {
  return Math.max(0, toSafeNumber(v, def));
}

function toNonNegativeInt(v: number | null | undefined, def = 0) {
  return Math.max(0, Math.floor(toSafeNumber(v, def)));
}

function normalizePersonaKey(personaKey: string | null | undefined) {
  const raw = String(personaKey ?? "").trim();
  return raw || GLOBAL_PERSONA_KEY;
}

function normalizeEventType(eventType: FeedbackEvent | null | undefined) {
  const raw = String(eventType ?? "").trim();
  return raw || GLOBAL_EVENT_TYPE;
}

function pairKeyWithEvent(personaKey: string, bucket: string, eventType: string) {
  return `${personaKey}|${bucket}|${eventType}`;
}

function isPersonaKeyColumnError(err: any) {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes("persona_key") && (text.includes("column") || text.includes("schema"));
}

function isEventTypeColumnError(err: any) {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes("event_type") && (text.includes("column") || text.includes("schema"));
}

function isMissingRelationError(err: any, relation: string) {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes(relation.toLowerCase()) && text.includes("does not exist");
}

function parseBuddyPersonaKey(reason: string | null | undefined) {
  const raw = String(reason ?? "").trim();
  if (!raw.startsWith("buddy_compat_")) return null;
  const key = raw.replace(/^buddy_compat_/, "").trim();
  return key || null;
}

function blendLearningRows(
  eventRow: DwellLearningRow | null,
  allRow: DwellLearningRow | null,
  eventType: string
): DwellLearningRow | null {
  if (!eventRow && !allRow) return null;
  if (eventRow && !allRow) {
    return {
      ...eventRow,
      event_type: eventType,
    };
  }
  if (!eventRow && allRow) {
    return {
      ...allRow,
      event_type: eventType,
    };
  }
  const e = eventRow as DwellLearningRow;
  const a = allRow as DwellLearningRow;
  const prior = 0.35;
  return {
    persona_key: e.persona_key ?? a.persona_key ?? GLOBAL_PERSONA_KEY,
    event_type: eventType,
    dwell_bucket: e.dwell_bucket ?? a.dwell_bucket,
    samples: toNonNegativeInt(e.samples, 0) + Math.floor(toNonNegativeInt(a.samples, 0) * prior),
    positive_score: toNonNegative(e.positive_score, 0) + toNonNegative(a.positive_score, 0) * prior,
    negative_score: toNonNegative(e.negative_score, 0) + toNonNegative(a.negative_score, 0) * prior,
  };
}

function dwellBucket(dwellMs: number | null) {
  if (!Number.isFinite(dwellMs ?? NaN)) return "unknown";
  const d = clamp(Number(dwellMs), 0, 120_000);
  if (d < 1_000) return "lt1s";
  if (d < 4_000) return "1to4s";
  if (d < 12_000) return "4to12s";
  if (d < 35_000) return "12to35s";
  return "35splus";
}

function dwellMultiplierStatic(event: FeedbackEvent, dwellMs: number | null) {
  if (!Number.isFinite(dwellMs ?? NaN)) return 1;
  const d = clamp(Number(dwellMs), 0, 120_000);

  if (event === "skip" || event === "hide") {
    if (d < 1_000) return 1.45;
    if (d < 4_000) return 1.2;
    if (d < 12_000) return 0.9;
    if (d < 35_000) return 0.65;
    return 0.45;
  }

  if (event === "open" || event === "like" || event === "reply" || event === "boost") {
    if (d < 1_000) return 0.8;
    if (d < 4_000) return 0.95;
    if (d < 12_000) return 1.05;
    if (d < 35_000) return 1.15;
    return 1.25;
  }

  return 1;
}

function normalizeWeight(v: number | null | undefined, def = 1) {
  const n = Number(v ?? def);
  if (!Number.isFinite(n)) return def;
  return clamp(n, 0.2, 2.2);
}

function normalizeBuddyBonusScale(v: number | null | undefined, def = DEFAULT_BUDDY_BONUS_SCALE) {
  const n = Number(v ?? def);
  if (!Number.isFinite(n)) return def;
  return clamp(n, 0.12, 0.95);
}

function normalizeBuddyLearningMode(v: string | null | undefined): BuddyLearningMode {
  return String(v ?? "").trim() === "stable" ? "stable" : "adaptive";
}

function effectiveBuddyBonusScaleByMode(args: {
  rawBonusScale: number | null | undefined;
  mode: BuddyLearningMode;
}) {
  const raw = normalizeBuddyBonusScale(args.rawBonusScale, DEFAULT_BUDDY_BONUS_SCALE);
  if (args.mode === "stable") {
    return normalizeBuddyBonusScale(
      DEFAULT_BUDDY_BONUS_SCALE + (raw - DEFAULT_BUDDY_BONUS_SCALE) * 0.38,
      DEFAULT_BUDDY_BONUS_SCALE
    );
  }
  return raw;
}

function learningConfidenceFromSamples(samples: number) {
  const n = Math.max(0, Math.floor(samples));
  return clamp(Math.log1p(n) / Math.log1p(80), 0, 1);
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

function smoothBuddyPositiveRate(row: {
  positive_score: number | null | undefined;
  negative_score: number | null | undefined;
}) {
  const p = toNonNegative(row.positive_score, 0);
  const n = toNonNegative(row.negative_score, 0);
  return (p + 2) / (p + n + 4);
}

function smoothPositiveRate(row: DwellLearningRow | null) {
  const p = toNonNegative(row?.positive_score, 0);
  const n = toNonNegative(row?.negative_score, 0);
  // ベータ事前分布で疎データ時の暴れを抑える
  return (p + 2) / (p + n + 4);
}

function learningSamples(row: DwellLearningRow | null) {
  return toNonNegativeInt(row?.samples, 0);
}

async function loadLegacyDwellLearningSnapshot(args: {
  supa: any;
  userId: string;
  bucket: string;
  personaKey: string;
  eventType: string;
}): Promise<DwellLearningSnapshot> {
  const { supa, userId, bucket, personaKey, eventType } = args;
  const legacy = await supa
    .from("persona_dwell_learning_state")
    .select("dwell_bucket,samples,positive_score,negative_score")
    .eq("user_id", userId)
    .in("dwell_bucket", [bucket, GLOBAL_DWELL_BUCKET]);

  if (legacy.error) {
    return {
      available: false,
      usingPersonaDimension: false,
      usingEventDimension: false,
      bucket,
      personaKey,
      eventType,
      personaBucketRow: null,
      personaGlobalRow: null,
      globalBucketRow: null,
      globalGlobalRow: null,
    };
  }

  const rows = (legacy.data ?? []) as DwellLearningRow[];
  const byBucket = new Map(rows.map((r) => [r.dwell_bucket, r]));
  const globalBucketRow = byBucket.get(bucket) ?? null;
  const globalGlobalRow = byBucket.get(GLOBAL_DWELL_BUCKET) ?? null;

  return {
    available: true,
    usingPersonaDimension: false,
    usingEventDimension: false,
    bucket,
    personaKey,
    eventType,
    personaBucketRow: personaKey === GLOBAL_PERSONA_KEY ? globalBucketRow : null,
    personaGlobalRow: personaKey === GLOBAL_PERSONA_KEY ? globalGlobalRow : null,
    globalBucketRow,
    globalGlobalRow,
  };
}

async function loadDwellLearningSnapshot(args: {
  supa: any;
  userId: string;
  personaKey: string | null;
  eventType: FeedbackEvent;
  dwellMs: number | null;
}): Promise<DwellLearningSnapshot> {
  const { supa, userId, personaKey, eventType, dwellMs } = args;
  const bucket = dwellBucket(dwellMs);
  const learningPersonaKey = normalizePersonaKey(personaKey);
  const learningEventType = normalizeEventType(eventType);
  const personaKeys = Array.from(new Set([learningPersonaKey, GLOBAL_PERSONA_KEY]));

  const res = await supa
    .from("persona_dwell_learning_state")
    .select("persona_key,event_type,dwell_bucket,samples,positive_score,negative_score")
    .eq("user_id", userId)
    .in("persona_key", personaKeys)
    .in("event_type", [learningEventType, GLOBAL_EVENT_TYPE])
    .in("dwell_bucket", [bucket, GLOBAL_DWELL_BUCKET]);

  if (res.error) {
    if (isPersonaKeyColumnError(res.error) || isEventTypeColumnError(res.error)) {
      return loadLegacyDwellLearningSnapshot({
        supa,
        userId,
        bucket,
        personaKey: learningPersonaKey,
        eventType: learningEventType,
      });
    }
    return {
      available: false,
      usingPersonaDimension: false,
      usingEventDimension: false,
      bucket,
      personaKey: learningPersonaKey,
      eventType: learningEventType,
      personaBucketRow: null,
      personaGlobalRow: null,
      globalBucketRow: null,
      globalGlobalRow: null,
    };
  }

  const rows = (res.data ?? []) as DwellLearningRow[];
  const byPairEvent = new Map(
    rows.map((r) => [
      pairKeyWithEvent(
        String(r.persona_key ?? GLOBAL_PERSONA_KEY),
        r.dwell_bucket,
        String(r.event_type ?? GLOBAL_EVENT_TYPE)
      ),
      r,
    ])
  );
  const resolve = (persona: string, dwellBucketKey: string) =>
    blendLearningRows(
      byPairEvent.get(pairKeyWithEvent(persona, dwellBucketKey, learningEventType)) ?? null,
      byPairEvent.get(pairKeyWithEvent(persona, dwellBucketKey, GLOBAL_EVENT_TYPE)) ?? null,
      learningEventType
    );
  const personaBucketRow = resolve(learningPersonaKey, bucket);
  const personaGlobalRow = resolve(learningPersonaKey, GLOBAL_DWELL_BUCKET);
  const globalBucketRow = resolve(GLOBAL_PERSONA_KEY, bucket);
  const globalGlobalRow = resolve(GLOBAL_PERSONA_KEY, GLOBAL_DWELL_BUCKET);

  return {
    available: true,
    usingPersonaDimension: learningPersonaKey !== GLOBAL_PERSONA_KEY,
    usingEventDimension: true,
    bucket,
    personaKey: learningPersonaKey,
    eventType: learningEventType,
    personaBucketRow,
    personaGlobalRow,
    globalBucketRow,
    globalGlobalRow,
  };
}

function adaptiveDwellMultiplier(args: {
  event: FeedbackEvent;
  dwellMs: number | null;
  snapshot: DwellLearningSnapshot;
}) {
  const { event, dwellMs, snapshot } = args;
  const base = dwellMultiplierStatic(event, dwellMs);

  if (!POSITIVE_EVENTS.has(event) && !NEGATIVE_EVENTS.has(event)) {
    return {
      source: "static" as const,
      multiplier: base,
      confidence: 0,
      personaBucketRate: null as number | null,
      personaGlobalRate: null as number | null,
      globalRate: null as number | null,
      bucket: snapshot.bucket,
      personaKey: snapshot.personaKey,
      usingPersonaDimension: snapshot.usingPersonaDimension,
      eventType: snapshot.eventType,
      usingEventDimension: snapshot.usingEventDimension,
    };
  }

  if (!snapshot.available) {
    return {
      source: "static" as const,
      multiplier: base,
      confidence: 0,
      personaBucketRate: null as number | null,
      personaGlobalRate: null as number | null,
      globalRate: null as number | null,
      bucket: snapshot.bucket,
      personaKey: snapshot.personaKey,
      usingPersonaDimension: snapshot.usingPersonaDimension,
      eventType: snapshot.eventType,
      usingEventDimension: snapshot.usingEventDimension,
    };
  }

  const personaBucketRow = snapshot.personaBucketRow ?? snapshot.globalBucketRow;
  const personaGlobalRow = snapshot.personaGlobalRow ?? snapshot.globalGlobalRow;
  const globalGlobalRow = snapshot.globalGlobalRow;

  const personaBucketRate = smoothPositiveRate(personaBucketRow);
  const personaGlobalRate = smoothPositiveRate(personaGlobalRow);
  const globalRate = smoothPositiveRate(globalGlobalRow);

  // 1) 同キャラ内での dwell 差分 2) 全体平均との差分 を合成
  const bucketContrast = clamp(personaBucketRate - personaGlobalRate, -0.35, 0.35);
  const personaContrast = clamp(personaGlobalRate - globalRate, -0.25, 0.25);
  const contrast = clamp(bucketContrast * 0.72 + personaContrast * 0.42, -0.4, 0.4);

  const personaBucketSamples = learningSamples(personaBucketRow);
  const personaGlobalSamples = learningSamples(personaGlobalRow);
  const globalSamples = learningSamples(globalGlobalRow);
  const bucketConf = clamp(
    Math.log1p(Math.min(personaBucketSamples, personaGlobalSamples)) / Math.log1p(80),
    0,
    1
  );
  const globalConf = clamp(Math.log1p(globalSamples) / Math.log1p(280), 0, 1);
  const personaDimBonus = snapshot.usingPersonaDimension ? 1 : 0.85;
  const eventDimBonus = snapshot.usingEventDimension ? 1 : 0.88;
  const confidence = bucketConf * globalConf * personaDimBonus * eventDimBonus;
  const mix = 0.75 * confidence;

  const learned =
    POSITIVE_EVENTS.has(event)
      ? clamp(1 + contrast * 1.6, 0.65, 1.45)
      : clamp(1 - contrast * 1.6, 0.55, 1.55);
  const multiplier = clamp(base * (1 - mix) + learned * mix, 0.45, 1.75);

  return {
    source: mix > 0.03 ? ("adaptive" as const) : ("static" as const),
    multiplier,
    confidence,
    personaBucketRate,
    personaGlobalRate,
    globalRate,
    bucket: snapshot.bucket,
    personaKey: snapshot.personaKey,
    usingPersonaDimension: snapshot.usingPersonaDimension,
    eventType: snapshot.eventType,
    usingEventDimension: snapshot.usingEventDimension,
  };
}

async function updateDwellLearningState(args: {
  supa: any;
  userId: string;
  personaKey: string | null;
  eventType: FeedbackEvent;
  event: FeedbackEvent;
  dwellMs: number | null;
}) {
  const { supa, userId, personaKey, eventType, event, dwellMs } = args;
  const positiveSignal = toNonNegative(POSITIVE_SIGNAL_BY_EVENT[event], 0);
  const negativeSignal = toNonNegative(NEGATIVE_SIGNAL_BY_EVENT[event], 0);
  if (positiveSignal <= 0 && negativeSignal <= 0) return false;

  const bucket = dwellBucket(dwellMs);
  const learningPersonaKey = normalizePersonaKey(personaKey);
  const learningEventType = normalizeEventType(eventType);

  const personaTargets =
    learningPersonaKey === GLOBAL_PERSONA_KEY
      ? [
          { persona_key: GLOBAL_PERSONA_KEY, dwell_bucket: bucket },
          { persona_key: GLOBAL_PERSONA_KEY, dwell_bucket: GLOBAL_DWELL_BUCKET },
        ]
      : [
          { persona_key: learningPersonaKey, dwell_bucket: bucket },
          { persona_key: learningPersonaKey, dwell_bucket: GLOBAL_DWELL_BUCKET },
          { persona_key: GLOBAL_PERSONA_KEY, dwell_bucket: bucket },
          { persona_key: GLOBAL_PERSONA_KEY, dwell_bucket: GLOBAL_DWELL_BUCKET },
        ];

  const uniquePersonaKeys = Array.from(new Set(personaTargets.map((x) => x.persona_key)));
  const uniqueBuckets = Array.from(new Set(personaTargets.map((x) => x.dwell_bucket)));
  const eventTypes = Array.from(new Set([learningEventType, GLOBAL_EVENT_TYPE]));

  const cur = await supa
    .from("persona_dwell_learning_state")
    .select("persona_key,event_type,dwell_bucket,samples,positive_score,negative_score")
    .eq("user_id", userId)
    .in("persona_key", uniquePersonaKeys)
    .in("event_type", eventTypes)
    .in("dwell_bucket", uniqueBuckets);

  if (cur.error) {
    if (!isPersonaKeyColumnError(cur.error) && !isEventTypeColumnError(cur.error)) return false;
    const legacyTargets = Array.from(new Set([bucket, GLOBAL_DWELL_BUCKET]));
    const legacyCur = await supa
      .from("persona_dwell_learning_state")
      .select("dwell_bucket,samples,positive_score,negative_score")
      .eq("user_id", userId)
      .in("dwell_bucket", legacyTargets);
    if (legacyCur.error) return false;
    const legacyMap = new Map<string, DwellLearningRow>();
    ((legacyCur.data ?? []) as DwellLearningRow[]).forEach((row) => {
      legacyMap.set(row.dwell_bucket, row);
    });
    const now = new Date().toISOString();
    const legacyRows = legacyTargets.map((dwellBucketKey) => {
      const row = legacyMap.get(dwellBucketKey);
      return {
        user_id: userId,
        dwell_bucket: dwellBucketKey,
        samples: toNonNegativeInt(row?.samples, 0) + 1,
        positive_score: toNonNegative(row?.positive_score, 0) + positiveSignal,
        negative_score: toNonNegative(row?.negative_score, 0) + negativeSignal,
        updated_at: now,
      };
    });
    const legacyUp = await supa
      .from("persona_dwell_learning_state")
      .upsert(legacyRows, { onConflict: "user_id,dwell_bucket" });
    return !legacyUp.error;
  }

  const byPair = new Map<string, DwellLearningRow>();
  ((cur.data ?? []) as DwellLearningRow[]).forEach((row) => {
    byPair.set(
      pairKeyWithEvent(
        String(row.persona_key ?? GLOBAL_PERSONA_KEY),
        row.dwell_bucket,
        String(row.event_type ?? GLOBAL_EVENT_TYPE)
      ),
      row
    );
  });

  const now = new Date().toISOString();
  const targetRows = Array.from(
    new Set(
      personaTargets.flatMap((target) => [
        pairKeyWithEvent(target.persona_key, target.dwell_bucket, learningEventType),
        pairKeyWithEvent(target.persona_key, target.dwell_bucket, GLOBAL_EVENT_TYPE),
      ])
    )
  ).map((k) => {
    const [persona_key, dwell_bucket, event_type] = k.split("|");
    return { persona_key, dwell_bucket, event_type };
  });
  const nextRows = targetRows.map((target) => {
    const row = byPair.get(pairKeyWithEvent(target.persona_key, target.dwell_bucket, target.event_type));
    return {
      user_id: userId,
      persona_key: target.persona_key,
      dwell_bucket: target.dwell_bucket,
      event_type: target.event_type,
      samples: toNonNegativeInt(row?.samples, 0) + 1,
      positive_score: toNonNegative(row?.positive_score, 0) + positiveSignal,
      negative_score: toNonNegative(row?.negative_score, 0) + negativeSignal,
      updated_at: now,
    };
  });

  const up = await supa
    .from("persona_dwell_learning_state")
    .upsert(nextRows, { onConflict: "user_id,persona_key,dwell_bucket,event_type" });

  if (up.error) {
    if (isPersonaKeyColumnError(up.error) || isEventTypeColumnError(up.error)) {
      const legacyTargets = Array.from(new Set([bucket, GLOBAL_DWELL_BUCKET]));
      const legacyCur = await supa
        .from("persona_dwell_learning_state")
        .select("dwell_bucket,samples,positive_score,negative_score")
        .eq("user_id", userId)
        .in("dwell_bucket", legacyTargets);
      if (legacyCur.error) return false;
      const legacyMap = new Map<string, DwellLearningRow>();
      ((legacyCur.data ?? []) as DwellLearningRow[]).forEach((row) => {
        legacyMap.set(row.dwell_bucket, row);
      });
      const legacyRows = legacyTargets.map((dwellBucketKey) => {
        const row = legacyMap.get(dwellBucketKey);
        return {
          user_id: userId,
          dwell_bucket: dwellBucketKey,
          samples: toNonNegativeInt(row?.samples, 0) + 1,
          positive_score: toNonNegative(row?.positive_score, 0) + positiveSignal,
          negative_score: toNonNegative(row?.negative_score, 0) + negativeSignal,
          updated_at: now,
        };
      });
      const legacyUp = await supa
        .from("persona_dwell_learning_state")
        .upsert(legacyRows, { onConflict: "user_id,dwell_bucket" });
      return !legacyUp.error;
    }
    return false;
  }

  return true;
}

async function logFeedEvent(args: {
  supa: any;
  userId: string;
  postId: string;
  personaKey: string | null;
  event: FeedbackEvent;
  reason: string | null;
  dwellMs: number | null;
}) {
  const { supa, userId, postId, personaKey, event, reason, dwellMs } = args;
  const ins = await supa.from("persona_feed_events").insert({
    user_id: userId,
    post_id: postId,
    persona_key: personaKey,
    event,
    reason,
    dwell_ms: dwellMs,
    created_at: new Date().toISOString(),
  });
  if (ins.error) {
    // テーブル未作成などは黙って継続（機能は縮退）
    return false;
  }
  return true;
}

async function applyAffinityDelta(args: {
  supa: any;
  userId: string;
  personaKey: string;
  delta: number;
}) {
  const { supa, userId, personaKey, delta } = args;
  const cur = await supa
    .from("user_persona_affinity")
    .select("weight")
    .eq("user_id", userId)
    .eq("persona_key", personaKey)
    .maybeSingle();

  if (cur.error && cur.error.code !== "PGRST116") {
    return false;
  }

  const nextWeight = clamp(
    normalizeWeight(cur.data?.weight, 1) + delta,
    0.2,
    2.2
  );

  const up = await supa.from("user_persona_affinity").upsert(
    {
      user_id: userId,
      persona_key: personaKey,
      weight: nextWeight,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,persona_key" }
  );

  if (up.error) return false;
  return true;
}

async function resolveBasePersona(args: {
  supa: any;
  userId: string;
  explicitBasePersona: string | null;
}) {
  const { supa, userId, explicitBasePersona } = args;
  const explicit = String(explicitBasePersona ?? "").trim();
  if (explicit) return explicit;
  const up = await supa
    .from("user_personas")
    .select("persona_key,score,version,updated_at")
    .eq("user_id", userId)
    .order("version", { ascending: false })
    .order("score", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (up.error) return null;
  const key = String(up.data?.persona_key ?? "").trim();
  return key || null;
}

async function loadBuddyLearningModePreference(args: {
  supa: any;
  userId: string;
  explicitMode?: string | null;
}) {
  const { supa, userId, explicitMode } = args;
  const explicit = String(explicitMode ?? "").trim();
  if (explicit) {
    return {
      mode: normalizeBuddyLearningMode(explicit),
      available: true,
      source: "request" as const,
      hasExplicit: true,
    };
  }

  const res = await supa
    .from("user_persona_feed_preferences")
    .select("buddy_learning_mode")
    .eq("user_id", userId)
    .maybeSingle();
  if (res.error) {
    if (isMissingRelationError(res.error, "user_persona_feed_preferences")) {
      return {
        mode: DEFAULT_BUDDY_LEARNING_MODE,
        available: false,
        source: "default" as const,
        hasExplicit: false,
      };
    }
    return {
      mode: DEFAULT_BUDDY_LEARNING_MODE,
      available: false,
      source: "default" as const,
      hasExplicit: false,
    };
  }
  const hasExplicit = Boolean(String(res.data?.buddy_learning_mode ?? "").trim());
  return {
    mode: normalizeBuddyLearningMode(res.data?.buddy_learning_mode),
    available: true,
    source: hasExplicit ? ("db" as const) : ("default" as const),
    hasExplicit,
  };
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

  const variantRaw = String(res.data?.variant_key ?? "").trim();
  const modeRaw = String(res.data?.assigned_mode ?? "").trim();
  const existingVariant =
    variantRaw === "A" || variantRaw === "B" ? (variantRaw as "A" | "B") : null;
  if (existingVariant && modeRaw) {
    return {
      available: true,
      experimentKey: BUDDY_MODE_AB_EXPERIMENT,
      variantKey: existingVariant,
      assignedMode: normalizeBuddyLearningMode(modeRaw),
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
  strategy: string | null;
  postId: string;
  eventType: FeedbackEvent;
}) {
  const { supa, userId, assignment, mode, strategy, postId, eventType } = args;
  if (!assignment.available || !assignment.variantKey) return false;
  const ins = await supa.from("persona_feed_mode_ab_events").insert({
    user_id: userId,
    experiment_key: assignment.experimentKey,
    variant_key: assignment.variantKey,
    event_type: eventType,
    mode,
    strategy,
    post_id: postId || null,
    created_at: new Date().toISOString(),
  });
  return !ins.error;
}

async function appendBuddyLearningHistory(args: {
  supa: any;
  userId: string;
  basePersona: string;
  buddyPersona: string;
  samples: number;
  bonusScale: number;
  confidence: number;
  learningMode: BuddyLearningMode;
  event: FeedbackEvent;
}) {
  const { supa, userId, basePersona, buddyPersona, samples, bonusScale, confidence, learningMode, event } =
    args;

  const shouldLog =
    samples <= 12 || samples % 3 === 0 || event === "hide" || event === "reply" || event === "boost";
  if (!shouldLog) return { logged: false, available: true };

  const ins = await supa.from("user_persona_buddy_learning_history").insert({
    user_id: userId,
    base_persona_key: basePersona,
    buddy_persona_key: buddyPersona,
    samples,
    bonus_scale: normalizeBuddyBonusScale(bonusScale, DEFAULT_BUDDY_BONUS_SCALE),
    confidence: clamp(confidence, 0, 1),
    learning_mode: learningMode,
    event_type: event,
    created_at: new Date().toISOString(),
  });
  if (ins.error) {
    if (isMissingRelationError(ins.error, "user_persona_buddy_learning_history")) {
      return { logged: false, available: false };
    }
    return { logged: false, available: true };
  }
  return { logged: true, available: true };
}

async function updateBuddyLearningState(args: {
  supa: any;
  userId: string;
  basePersona: string;
  buddyPersona: string;
  event: FeedbackEvent;
  learningMultiplier: number;
  learningMode: BuddyLearningMode;
}) {
  const { supa, userId, basePersona, buddyPersona, event, learningMultiplier, learningMode } = args;

  const pos = toNonNegative(POSITIVE_SIGNAL_BY_EVENT[event], 0);
  const neg = toNonNegative(NEGATIVE_SIGNAL_BY_EVENT[event], 0);
  if (pos <= 0 && neg <= 0) {
    return {
      updated: false,
      rawBonusScale: DEFAULT_BUDDY_BONUS_SCALE,
      effectiveBonusScale: effectiveBuddyBonusScaleByMode({
        rawBonusScale: DEFAULT_BUDDY_BONUS_SCALE,
        mode: learningMode,
      }),
      confidence: 0,
      samples: 0,
      available: false,
      historyLogged: false,
      historyAvailable: false,
      mode: learningMode,
    };
  }

  const adaptive = clamp(learningMultiplier, 0.6, 1.45);
  const modeSignalScale = learningMode === "stable" ? 0.62 : 1;
  const positiveSignal = pos * adaptive * modeSignalScale;
  const negativeSignal = neg * adaptive * modeSignalScale;

  const keys = [buddyPersona, "__all__"];
  const cur = await supa
    .from("user_persona_buddy_learning_state")
    .select("buddy_persona_key,samples,positive_score,negative_score,bonus_scale")
    .eq("user_id", userId)
    .eq("base_persona_key", basePersona)
    .in("buddy_persona_key", keys);

  if (cur.error) {
    if (isMissingRelationError(cur.error, "user_persona_buddy_learning_state")) {
      return {
        updated: false,
        rawBonusScale: DEFAULT_BUDDY_BONUS_SCALE,
        effectiveBonusScale: effectiveBuddyBonusScaleByMode({
          rawBonusScale: DEFAULT_BUDDY_BONUS_SCALE,
          mode: learningMode,
        }),
        confidence: 0,
        samples: 0,
        available: false,
        historyLogged: false,
        historyAvailable: false,
        mode: learningMode,
      };
    }
    return {
      updated: false,
      rawBonusScale: DEFAULT_BUDDY_BONUS_SCALE,
      effectiveBonusScale: effectiveBuddyBonusScaleByMode({
        rawBonusScale: DEFAULT_BUDDY_BONUS_SCALE,
        mode: learningMode,
      }),
      confidence: 0,
      samples: 0,
      available: false,
      historyLogged: false,
      historyAvailable: false,
      mode: learningMode,
    };
  }

  const byKey = new Map<string, BuddyLearningRow>();
  ((cur.data ?? []) as BuddyLearningRow[]).forEach((row) => {
    const k = String(row?.buddy_persona_key ?? "").trim();
    if (!k) return;
    byKey.set(k, row);
  });

  const now = new Date().toISOString();
  const nextByKey = new Map<
    string,
    {
      samples: number;
      positive_score: number;
      negative_score: number;
      bonus_scale: number;
    }
  >();

  keys.forEach((k) => {
    const row = byKey.get(k);
    nextByKey.set(k, {
      samples: toNonNegativeInt(row?.samples, 0) + 1,
      positive_score: toNonNegative(row?.positive_score, 0) + positiveSignal,
      negative_score: toNonNegative(row?.negative_score, 0) + negativeSignal,
      bonus_scale: normalizeBuddyBonusScale(row?.bonus_scale, DEFAULT_BUDDY_BONUS_SCALE),
    });
  });

  const pair = nextByKey.get(buddyPersona)!;
  const global = nextByKey.get("__all__")!;
  const pairRate = smoothBuddyPositiveRate(pair);
  const globalRate = smoothBuddyPositiveRate(global);
  const contrast = clamp(pairRate - globalRate, -0.35, 0.35);
  const contrastScale = learningMode === "stable" ? 0.42 : 0.7;
  const targetBonus = normalizeBuddyBonusScale(
    DEFAULT_BUDDY_BONUS_SCALE + contrast * contrastScale,
    DEFAULT_BUDDY_BONUS_SCALE
  );
  const confidence = learningConfidenceFromSamples(Math.min(pair.samples, global.samples));
  const mix = learningMode === "stable" ? 0.08 + confidence * 0.28 : 0.2 + confidence * 0.55;
  pair.bonus_scale = normalizeBuddyBonusScale(
    pair.bonus_scale * (1 - mix) + targetBonus * mix,
    DEFAULT_BUDDY_BONUS_SCALE
  );

  const globalTarget = normalizeBuddyBonusScale(
    DEFAULT_BUDDY_BONUS_SCALE + clamp(globalRate - 0.5, -0.2, 0.2) * 0.2,
    DEFAULT_BUDDY_BONUS_SCALE
  );
  const globalMix =
    learningMode === "stable"
      ? 0.08 + learningConfidenceFromSamples(global.samples) * 0.14
      : 0.12 + learningConfidenceFromSamples(global.samples) * 0.25;
  global.bonus_scale = normalizeBuddyBonusScale(
    global.bonus_scale * (1 - globalMix) + globalTarget * globalMix,
    DEFAULT_BUDDY_BONUS_SCALE
  );

  const rows = keys.map((k) => {
    const row = nextByKey.get(k)!;
    return {
      user_id: userId,
      base_persona_key: basePersona,
      buddy_persona_key: k,
      samples: row.samples,
      positive_score: row.positive_score,
      negative_score: row.negative_score,
      bonus_scale: row.bonus_scale,
      updated_at: now,
    };
  });

  const up = await supa
    .from("user_persona_buddy_learning_state")
    .upsert(rows, { onConflict: "user_id,base_persona_key,buddy_persona_key" });
  if (up.error) {
    const rawBonusScale = pair.bonus_scale;
    return {
      updated: false,
      rawBonusScale,
      effectiveBonusScale: effectiveBuddyBonusScaleByMode({
        rawBonusScale,
        mode: learningMode,
      }),
      confidence,
      samples: pair.samples,
      available: true,
      historyLogged: false,
      historyAvailable: true,
      mode: learningMode,
    };
  }

  const history = await appendBuddyLearningHistory({
    supa,
    userId,
    basePersona,
    buddyPersona,
    samples: pair.samples,
    bonusScale: pair.bonus_scale,
    confidence,
    learningMode,
    event,
  });
  const rawBonusScale = pair.bonus_scale;

  return {
    updated: true,
    rawBonusScale,
    effectiveBonusScale: effectiveBuddyBonusScaleByMode({
      rawBonusScale,
      mode: learningMode,
    }),
    confidence,
    samples: pair.samples,
    available: true,
    historyLogged: history.logged,
    historyAvailable: history.available,
    mode: learningMode,
  };
}

export async function POST(req: NextRequest) {
  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const postId = String(body?.postId ?? "").trim();
  const personaKeyRaw = String(body?.personaKey ?? "").trim();
  const basePersonaRaw = String(body?.basePersona ?? "").trim();
  const event = String(body?.event ?? "").trim() as FeedbackEvent;
  const reasonRaw = String(body?.reason ?? "").trim();
  const strategyRaw = String(body?.strategy ?? "").trim();
  const buddyLearningModeRaw = String(body?.buddyLearningMode ?? "").trim();
  const dwellRaw = Number(body?.dwellMs ?? NaN);

  if (!postId || !event || !(event in DELTA_BY_EVENT)) {
    return NextResponse.json(
      { error: "postId and valid event are required" },
      { status: 400 }
    );
  }

  const personaKey = personaKeyRaw || null;
  const explicitBasePersona = basePersonaRaw || null;
  const reason = reasonRaw || null;
  const strategy = strategyRaw === "same" || strategyRaw === "compat" ? strategyRaw : null;
  const buddyPersona = parseBuddyPersonaKey(reason);
  const requestedBuddyLearningMode = buddyLearningModeRaw || null;
  const dwellMs = Number.isFinite(dwellRaw)
    ? Math.max(0, Math.min(120_000, Math.floor(dwellRaw)))
    : null;

  const logged = await logFeedEvent({
    supa,
    userId: user.id,
    postId,
    personaKey,
    event,
    reason,
    dwellMs,
  });

  const storedBuddyLearningModePref = await loadBuddyLearningModePreference({
    supa,
    userId: user.id,
  });
  const buddyModeAbAssignment = !storedBuddyLearningModePref.hasExplicit
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
  const runtimeBuddyLearningMode = requestedBuddyLearningMode
    ? normalizeBuddyLearningMode(requestedBuddyLearningMode)
    : !storedBuddyLearningModePref.hasExplicit &&
      buddyModeAbAssignment.available &&
      buddyModeAbAssignment.assignedMode
    ? buddyModeAbAssignment.assignedMode
    : storedBuddyLearningModePref.mode;

  if (
    event === "impression" ||
    event === "open" ||
    event === "like" ||
    event === "reply" ||
    event === "boost"
  ) {
    await logBuddyModeAbEvent({
      supa,
      userId: user.id,
      assignment: buddyModeAbAssignment,
      mode: runtimeBuddyLearningMode,
      strategy,
      postId,
      eventType: event,
    });
  }

  const learningSnapshot = await loadDwellLearningSnapshot({
    supa,
    userId: user.id,
    personaKey,
    eventType: event,
    dwellMs,
  });
  const learning = adaptiveDwellMultiplier({
    event,
    dwellMs,
    snapshot: learningSnapshot,
  });

  let updatedAffinity = false;
  let appliedDelta = 0;
  if (personaKey) {
    appliedDelta = DELTA_BY_EVENT[event] * learning.multiplier;
    updatedAffinity = await applyAffinityDelta({
      supa,
      userId: user.id,
      personaKey,
      delta: appliedDelta,
    });
  }

  const updatedLearning = await updateDwellLearningState({
    supa,
    userId: user.id,
    personaKey,
    eventType: event,
    event,
    dwellMs,
  });

  let buddyLearning = {
    updated: false,
    available: false,
    rawBonusScale: DEFAULT_BUDDY_BONUS_SCALE,
    effectiveBonusScale: DEFAULT_BUDDY_BONUS_SCALE,
    confidence: 0,
    samples: 0,
    basePersona: null as string | null,
    buddyPersona: buddyPersona,
    mode: DEFAULT_BUDDY_LEARNING_MODE as BuddyLearningMode,
    historyLogged: false,
    historyAvailable: false,
  };
  if (buddyPersona) {
    const basePersona = await resolveBasePersona({
      supa,
      userId: user.id,
      explicitBasePersona,
    });
    if (basePersona) {
      const result = await updateBuddyLearningState({
        supa,
        userId: user.id,
        basePersona,
        buddyPersona,
        event,
        learningMultiplier: learning.multiplier,
        learningMode: runtimeBuddyLearningMode,
      });
      buddyLearning = {
        ...result,
        basePersona,
        buddyPersona,
      };
    }
  }

  return NextResponse.json({
    ok: true,
    logged,
    updatedAffinity,
    appliedDelta,
    learning: {
      source: learning.source,
      personaKey: learning.personaKey,
      usingPersonaDimension: learning.usingPersonaDimension,
      eventType: learning.eventType,
      usingEventDimension: learning.usingEventDimension,
      bucket: learning.bucket,
      multiplier: learning.multiplier,
      confidence: learning.confidence,
      personaBucketRate: learning.personaBucketRate,
      personaGlobalRate: learning.personaGlobalRate,
      globalRate: learning.globalRate,
      updated: updatedLearning,
    },
    buddyLearning,
    buddyLearningMode: runtimeBuddyLearningMode,
    buddyLearningModeSource: storedBuddyLearningModePref.hasExplicit
      ? "preference"
      : buddyModeAbAssignment.available && buddyModeAbAssignment.assignedMode
      ? "ab_assignment"
      : "default",
    buddyLearningModeAb:
      buddyModeAbAssignment.available && buddyModeAbAssignment.variantKey
        ? {
            experiment_key: buddyModeAbAssignment.experimentKey,
            variant_key: buddyModeAbAssignment.variantKey,
            assigned_mode: buddyModeAbAssignment.assignedMode,
          }
        : null,
  });
}
