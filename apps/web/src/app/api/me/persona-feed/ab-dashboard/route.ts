import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type AbEventRow = {
  mode: string | null;
  variant_key: string | null;
  event_type: string | null;
  created_at: string | null;
};

type ModeKey = "adaptive" | "stable";

function isMissingRelationError(err: any, relation: string) {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes(relation.toLowerCase()) && text.includes("does not exist");
}

function normalizeMode(v: string | null | undefined): ModeKey | null {
  const raw = String(v ?? "").trim();
  if (raw === "adaptive" || raw === "stable") return raw;
  return null;
}

function clamp(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function summarize(rows: AbEventRow[]) {
  const byMode = new Map<
    ModeKey,
    {
      mode: ModeKey;
      impressions: number;
      opens: number;
      likes: number;
      replies: number;
      boosts: number;
      feedLoads: number;
      revisitCount: number;
      variants: Set<string>;
      feedLoadTimes: number[];
    }
  >();

  (["adaptive", "stable"] as ModeKey[]).forEach((mode) => {
    byMode.set(mode, {
      mode,
      impressions: 0,
      opens: 0,
      likes: 0,
      replies: 0,
      boosts: 0,
      feedLoads: 0,
      revisitCount: 0,
      variants: new Set<string>(),
      feedLoadTimes: [],
    });
  });

  rows.forEach((row) => {
    const mode = normalizeMode(row?.mode);
    if (!mode) return;
    const bucket = byMode.get(mode)!;
    const eventType = String(row?.event_type ?? "").trim();
    if (eventType === "impression") bucket.impressions += 1;
    if (eventType === "open") bucket.opens += 1;
    if (eventType === "like") bucket.likes += 1;
    if (eventType === "reply") bucket.replies += 1;
    if (eventType === "boost") bucket.boosts += 1;
    if (eventType === "feed_load") {
      bucket.feedLoads += 1;
      const ts = Date.parse(String(row?.created_at ?? ""));
      if (Number.isFinite(ts)) bucket.feedLoadTimes.push(ts);
    }
    const variant = String(row?.variant_key ?? "").trim();
    if (variant) bucket.variants.add(variant);
  });

  const modes = Array.from(byMode.values()).map((m) => {
    const times = m.feedLoadTimes.slice().sort((a, b) => a - b);
    let revisitCount = 0;
    for (let i = 0; i < times.length - 1; i += 1) {
      const diffHours = (times[i + 1] - times[i]) / 3_600_000;
      if (diffHours > 0 && diffHours <= 36) revisitCount += 1;
    }
    const openRate = m.impressions > 0 ? m.opens / m.impressions : 0;
    const engageRate =
      m.opens > 0 ? (m.likes + m.replies * 1.2 + m.boosts * 1.1) / m.opens : 0;
    const revisitRate = m.feedLoads > 0 ? revisitCount / m.feedLoads : 0;
    const confidence = clamp(
      Math.min(
        Math.log1p(m.impressions) / Math.log1p(220),
        Math.log1p(Math.max(1, m.feedLoads)) / Math.log1p(18)
      ),
      0,
      1
    );
    const score = openRate * 0.62 + revisitRate * 0.28 + clamp(engageRate, 0, 1.2) * 0.1;
    return {
      mode: m.mode,
      variants: Array.from(m.variants),
      impressions: m.impressions,
      opens: m.opens,
      likes: m.likes,
      replies: m.replies,
      boosts: m.boosts,
      feedLoads: m.feedLoads,
      revisitCount,
      openRate,
      engageRate,
      revisitRate,
      confidence,
      score,
    };
  });

  const sorted = modes.slice().sort((a, b) => b.score - a.score);
  const best = sorted[0];
  const second = sorted[1];
  const delta = best && second ? best.score - second.score : 0;
  const recommendedMode =
    best && best.impressions >= 20 && best.feedLoads >= 4 && delta > 0.015 ? best.mode : null;

  return {
    modes,
    recommendedMode,
    recommendationScoreDelta: delta,
    canAutoSwitch: Boolean(recommendedMode),
  };
}

export async function GET(req: NextRequest) {
  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const days = Math.max(3, Math.min(60, Math.floor(Number(url.searchParams.get("days") ?? 14) || 14)));
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  const startIso = start.toISOString();

  const res = await supa
    .from("persona_feed_mode_ab_events")
    .select("mode,variant_key,event_type,created_at")
    .eq("user_id", user.id)
    .gte("created_at", startIso)
    .order("created_at", { ascending: false })
    .limit(10000);

  if (res.error) {
    if (isMissingRelationError(res.error, "persona_feed_mode_ab_events")) {
      return NextResponse.json({
        ok: true,
        available: false,
        days,
        modes: [],
        recommendedMode: null,
        canAutoSwitch: false,
      });
    }
    return NextResponse.json(
      { error: res.error.message ?? "ab_dashboard_read_error" },
      { status: 500 }
    );
  }

  const summary = summarize((res.data ?? []) as AbEventRow[]);
  return NextResponse.json({
    ok: true,
    available: true,
    days,
    ...summary,
  });
}
