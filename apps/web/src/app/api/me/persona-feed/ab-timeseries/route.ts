import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type ModeKey = "adaptive" | "stable";
type AbEventRow = {
  mode: string | null;
  event_type: string | null;
  variant_key: string | null;
  created_at: string | null;
};

function clamp(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function normalizeMode(v: string | null | undefined): ModeKey | null {
  const raw = String(v ?? "").trim();
  return raw === "adaptive" || raw === "stable" ? raw : null;
}

function isMissingRelationError(err: any, relation: string) {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes(relation.toLowerCase()) && text.includes("does not exist");
}

function dayKey(iso: string | null | undefined) {
  const s = String(iso ?? "");
  if (!s) return "";
  const ts = Date.parse(s);
  if (!Number.isFinite(ts)) return "";
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type DayBucket = {
  day: string;
  mode: ModeKey;
  impressions: number;
  opens: number;
  likes: number;
  replies: number;
  boosts: number;
  feedLoads: number;
  revisitCount: number;
  feedLoadTimes: number[];
  variants: Set<string>;
};

function newBucket(day: string, mode: ModeKey): DayBucket {
  return {
    day,
    mode,
    impressions: 0,
    opens: 0,
    likes: 0,
    replies: 0,
    boosts: 0,
    feedLoads: 0,
    revisitCount: 0,
    feedLoadTimes: [],
    variants: new Set<string>(),
  };
}

function finalizeBucket(b: DayBucket) {
  const times = b.feedLoadTimes.slice().sort((a, b2) => a - b2);
  let revisitCount = 0;
  for (let i = 0; i < times.length - 1; i += 1) {
    const diffHours = (times[i + 1] - times[i]) / 3_600_000;
    if (diffHours > 0 && diffHours <= 36) revisitCount += 1;
  }
  const openRate = b.impressions > 0 ? b.opens / b.impressions : 0;
  const engageRate =
    b.opens > 0 ? (b.likes + b.replies * 1.2 + b.boosts * 1.1) / b.opens : 0;
  const revisitRate = b.feedLoads > 0 ? revisitCount / b.feedLoads : 0;
  const score = openRate * 0.62 + revisitRate * 0.28 + clamp(engageRate, 0, 1.2) * 0.1;

  return {
    day: b.day,
    mode: b.mode,
    variants: Array.from(b.variants),
    impressions: b.impressions,
    opens: b.opens,
    likes: b.likes,
    replies: b.replies,
    boosts: b.boosts,
    feedLoads: b.feedLoads,
    revisitCount,
    openRate,
    revisitRate,
    engageRate,
    score,
  };
}

export async function GET(req: NextRequest) {
  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const days = Math.max(7, Math.min(90, Math.floor(Number(url.searchParams.get("days") ?? 28) || 28)));
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  const startIso = start.toISOString();

  const res = await supa
    .from("persona_feed_mode_ab_events")
    .select("mode,event_type,variant_key,created_at")
    .eq("user_id", user.id)
    .gte("created_at", startIso)
    .order("created_at", { ascending: true })
    .limit(20000);

  if (res.error) {
    if (isMissingRelationError(res.error, "persona_feed_mode_ab_events")) {
      return NextResponse.json({
        ok: true,
        available: false,
        days,
        points: [],
        modes: [],
      });
    }
    return NextResponse.json({ error: res.error.message ?? "ab_timeseries_read_failed" }, { status: 500 });
  }

  const rows = (res.data ?? []) as AbEventRow[];
  const byDayMode = new Map<string, DayBucket>();
  const modeSummary = new Map<
    ModeKey,
    { impressions: number; opens: number; likes: number; replies: number; boosts: number; feedLoads: number }
  >([
    ["adaptive", { impressions: 0, opens: 0, likes: 0, replies: 0, boosts: 0, feedLoads: 0 }],
    ["stable", { impressions: 0, opens: 0, likes: 0, replies: 0, boosts: 0, feedLoads: 0 }],
  ]);

  rows.forEach((row) => {
    const mode = normalizeMode(row.mode);
    if (!mode) return;
    const day = dayKey(row.created_at);
    if (!day) return;
    const key = `${day}:${mode}`;
    const bucket = byDayMode.get(key) ?? newBucket(day, mode);
    const ev = String(row.event_type ?? "").trim();
    if (ev === "impression") bucket.impressions += 1;
    if (ev === "open") bucket.opens += 1;
    if (ev === "like") bucket.likes += 1;
    if (ev === "reply") bucket.replies += 1;
    if (ev === "boost") bucket.boosts += 1;
    if (ev === "feed_load") {
      bucket.feedLoads += 1;
      const ts = Date.parse(String(row.created_at ?? ""));
      if (Number.isFinite(ts)) bucket.feedLoadTimes.push(ts);
    }
    const variant = String(row.variant_key ?? "").trim();
    if (variant) bucket.variants.add(variant);
    byDayMode.set(key, bucket);

    const sum = modeSummary.get(mode)!;
    if (ev === "impression") sum.impressions += 1;
    if (ev === "open") sum.opens += 1;
    if (ev === "like") sum.likes += 1;
    if (ev === "reply") sum.replies += 1;
    if (ev === "boost") sum.boosts += 1;
    if (ev === "feed_load") sum.feedLoads += 1;
  });

  const points = Array.from(byDayMode.values())
    .map(finalizeBucket)
    .sort((a, b) => (a.day === b.day ? a.mode.localeCompare(b.mode) : a.day.localeCompare(b.day)));

  const modes = (["adaptive", "stable"] as ModeKey[]).map((mode) => {
    const s = modeSummary.get(mode)!;
    const openRate = s.impressions > 0 ? s.opens / s.impressions : 0;
    const engageRate = s.opens > 0 ? (s.likes + s.replies * 1.2 + s.boosts * 1.1) / s.opens : 0;
    const score = openRate * 0.72 + clamp(engageRate, 0, 1.2) * 0.28;
    return {
      mode,
      impressions: s.impressions,
      opens: s.opens,
      likes: s.likes,
      replies: s.replies,
      boosts: s.boosts,
      feedLoads: s.feedLoads,
      openRate,
      engageRate,
      score,
    };
  });

  const sorted = modes.slice().sort((a, b) => b.score - a.score);
  const recommendedMode =
    sorted[0] && sorted[0].impressions >= 20 && (sorted[0].score - (sorted[1]?.score ?? 0)) > 0.015
      ? sorted[0].mode
      : null;

  return NextResponse.json({
    ok: true,
    available: true,
    days,
    recommendedMode,
    points,
    modes,
  });
}

