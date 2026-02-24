import {
  applyPersonaCalibration,
  computePersonaActualEngagementScore,
  computePersonaCalibrationStat,
  extractBuzzScoreFromAnalysis,
  extractPersonaKeyFromAnalysis,
  type PersonaCalibrationStat,
} from "@sns/core";

const GLOBAL_PERSONA_KEY = "__all__";

type CalibrationAccum = {
  samples: number;
  predictedSum: number;
  actualSum: number;
};

export type PersonaBuzzCalibrationSnapshot = {
  byPersona: Map<string, PersonaCalibrationStat>;
  global: PersonaCalibrationStat;
};

function parseAnalysis(raw: any) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw;
  return null;
}

function toDateMs(raw: string | null | undefined) {
  const ms = Date.parse(String(raw ?? ""));
  return Number.isFinite(ms) ? ms : null;
}

function addAccum(map: Map<string, CalibrationAccum>, personaKey: string, predicted: number, actual: number) {
  const key = personaKey || GLOBAL_PERSONA_KEY;
  const cur = map.get(key) ?? { samples: 0, predictedSum: 0, actualSum: 0 };
  cur.samples += 1;
  cur.predictedSum += predicted;
  cur.actualSum += actual;
  map.set(key, cur);
}

function normalizeReactionKind(raw: string | null | undefined) {
  const kind = String(raw ?? "").toLowerCase().trim();
  if (!kind) return "unknown";
  if (kind.includes("like")) return "like";
  if (kind.includes("reply")) return "reply";
  if (kind.includes("boost") || kind.includes("repost")) return "boost";
  if (kind.includes("save") || kind.includes("bookmark") || kind.includes("favorite")) return "save";
  return kind;
}

export function computeCalibratedBuzzScore(args: {
  analysis: any;
  personaKey: string | null | undefined;
  snapshot: PersonaBuzzCalibrationSnapshot;
}) {
  const { analysis, personaKey, snapshot } = args;
  const base = extractBuzzScoreFromAnalysis(analysis, 0.5);
  const persona = String(personaKey ?? "").trim() || GLOBAL_PERSONA_KEY;
  const stat = snapshot.byPersona.get(persona) ?? snapshot.global;
  const calibrated = applyPersonaCalibration(base, stat);
  return {
    base,
    calibrated,
    stat,
  };
}

export async function loadPersonaBuzzCalibrationSnapshot(args: {
  supa: any;
  userId: string;
  maxPosts?: number;
  matureMinutes?: number;
  persist?: boolean;
}): Promise<PersonaBuzzCalibrationSnapshot> {
  const { supa, userId, maxPosts = 140, matureMinutes = 15, persist = true } = args;

  const defaultGlobal = computePersonaCalibrationStat({
    samples: 0,
    predictedAvg: 0.5,
    actualAvg: 0.2,
  });

  const postRes = await supa
    .from("posts")
    .select("id,created_at,analysis")
    .eq("author", userId)
    .order("created_at", { ascending: false })
    .limit(maxPosts);

  if (postRes.error) {
    return {
      byPersona: new Map([[GLOBAL_PERSONA_KEY, defaultGlobal]]),
      global: defaultGlobal,
    };
  }

  const now = Date.now();
  const matureMs = matureMinutes * 60 * 1000;
  const posts = ((postRes.data ?? []) as Array<{ id: string; created_at: string; analysis: any }>).filter(
    (p) => {
      if (!p?.id) return false;
      const createdAtMs = toDateMs(p.created_at);
      if (createdAtMs == null) return true;
      return now - createdAtMs >= matureMs;
    }
  );
  if (posts.length === 0) {
    return {
      byPersona: new Map([[GLOBAL_PERSONA_KEY, defaultGlobal]]),
      global: defaultGlobal,
    };
  }

  const postIds = posts.map((p) => p.id);
  const [reactionsRes, repliesRes] = await Promise.all([
    supa.from("reactions").select("post_id,kind").in("post_id", postIds),
    supa.from("posts").select("parent_id,id").in("parent_id", postIds),
  ]);

  const reactionMap = new Map<
    string,
    { likes: number; replies: number; boosts: number; saves: number }
  >();
  const ensureCounts = (postId: string) => {
    const cur = reactionMap.get(postId);
    if (cur) return cur;
    const next = { likes: 0, replies: 0, boosts: 0, saves: 0 };
    reactionMap.set(postId, next);
    return next;
  };

  (reactionsRes.data ?? []).forEach((r: any) => {
    if (!r?.post_id) return;
    const row = ensureCounts(String(r.post_id));
    const kind = normalizeReactionKind(r.kind);
    if (kind === "like") row.likes += 1;
    else if (kind === "boost") row.boosts += 1;
    else if (kind === "save") row.saves += 1;
  });

  (repliesRes.data ?? []).forEach((r: any) => {
    const parentId = String(r?.parent_id ?? "").trim();
    if (!parentId) return;
    const row = ensureCounts(parentId);
    row.replies += 1;
  });

  const accum = new Map<string, CalibrationAccum>();
  posts.forEach((p) => {
    const analysis = parseAnalysis(p.analysis);
    const predicted = extractBuzzScoreFromAnalysis(analysis, 0.5);
    const personaKey = extractPersonaKeyFromAnalysis(analysis) ?? GLOBAL_PERSONA_KEY;
    const counts = reactionMap.get(p.id) ?? { likes: 0, replies: 0, boosts: 0, saves: 0 };
    const actual = computePersonaActualEngagementScore({
      likes: counts.likes,
      replies: counts.replies,
      boosts: counts.boosts,
      saves: counts.saves,
    });
    addAccum(accum, personaKey, predicted, actual);
    addAccum(accum, GLOBAL_PERSONA_KEY, predicted, actual);
  });

  const byPersona = new Map<string, PersonaCalibrationStat>();
  for (const [personaKey, v] of accum.entries()) {
    const predictedAvg = v.samples > 0 ? v.predictedSum / v.samples : 0.5;
    const actualAvg = v.samples > 0 ? v.actualSum / v.samples : 0.2;
    byPersona.set(
      personaKey,
      computePersonaCalibrationStat({
        samples: v.samples,
        predictedAvg,
        actualAvg,
      })
    );
  }
  if (!byPersona.has(GLOBAL_PERSONA_KEY)) {
    byPersona.set(GLOBAL_PERSONA_KEY, defaultGlobal);
  }
  const global = byPersona.get(GLOBAL_PERSONA_KEY) ?? defaultGlobal;

  if (persist) {
    try {
      const nowIso = new Date().toISOString();
      const rows = Array.from(byPersona.entries()).map(([personaKey, stat]) => ({
        user_id: userId,
        persona_key: personaKey,
        samples: stat.samples,
        predicted_avg: stat.predictedAvg,
        actual_avg: stat.actualAvg,
        multiplier: stat.multiplier,
        updated_at: nowIso,
      }));
      await supa
        .from("persona_buzz_learning_state")
        .upsert(rows, { onConflict: "user_id,persona_key" });
    } catch {
      // table not ready
    }
  }

  return { byPersona, global };
}
