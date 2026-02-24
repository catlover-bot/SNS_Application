import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type PostRow = {
  id: string;
  created_at: string;
  analysis: any;
};

type PostScoreRow = {
  post_id: string;
  persona_key: string;
  final_score: number | null;
};

function clamp01(v: number | null | undefined) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function toDayKey(value: string) {
  return String(value ?? "").slice(0, 10);
}

function toRangeWindow() {
  const now = new Date();
  const startCurrent = new Date(now);
  startCurrent.setDate(now.getDate() - 6);
  startCurrent.setHours(0, 0, 0, 0);

  const startPrev = new Date(startCurrent);
  startPrev.setDate(startCurrent.getDate() - 7);

  return {
    startCurrent,
    startPrev,
    now,
  };
}

async function resolveTitles(supa: any, keys: string[]) {
  const uniq = Array.from(new Set(keys.filter(Boolean)));
  if (!uniq.length) return {} as Record<string, string>;

  const map = new Map<string, string>();

  const arche = await supa
    .from("persona_archetype_defs")
    .select("key,title")
    .in("key", uniq);
  (arche.data ?? []).forEach((r: any) => {
    map.set(r.key, r.title ?? r.key);
  });

  const missing = uniq.filter((k) => !map.has(k));
  if (missing.length > 0) {
    const defs = await supa.from("persona_defs").select("key,title").in("key", missing);
    (defs.data ?? []).forEach((r: any) => {
      map.set(r.key, r.title ?? r.key);
    });
  }

  return Object.fromEntries(uniq.map((k) => [k, map.get(k) ?? k]));
}

export async function GET() {
  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const postsRes = await supa
    .from("posts")
    .select("id,created_at,analysis")
    .eq("author", user.id)
    .order("created_at", { ascending: false })
    .limit(500);

  const posts = (postsRes.data ?? []) as PostRow[];
  if (!posts.length) {
    return NextResponse.json({
      dominant_key: null,
      dominant_title: null,
      streak_days: 0,
      count_total: 0,
      count_7d: 0,
      count_prev_7d: 0,
      momentum_delta: 0,
      trend: "stable",
      top_personas: [],
      day_series: [],
    });
  }

  const ids = posts.map((p) => p.id);
  const scoreRes = await supa
    .from("post_scores")
    .select("post_id,persona_key,final_score")
    .in("post_id", ids)
    .limit(20000);
  const scoreRows = (scoreRes.data ?? []) as PostScoreRow[];

  const topByPost = new Map<string, { key: string; score: number }>();
  scoreRows.forEach((r) => {
    if (!r?.post_id || !r?.persona_key) return;
    const s = clamp01(r.final_score);
    const cur = topByPost.get(r.post_id);
    if (!cur || s > cur.score) {
      topByPost.set(r.post_id, { key: r.persona_key, score: s });
    }
  });

  const postPersonaRows: Array<{
    created_at: string;
    key: string;
  }> = [];

  posts.forEach((p) => {
    const scoreTop = topByPost.get(p.id)?.key ?? null;
    const analysisTop =
      p.analysis?.persona?.selected ??
      p.analysis?.persona?.candidates?.[0]?.key ??
      null;
    const key = scoreTop || analysisTop;
    if (!key) return;
    postPersonaRows.push({
      created_at: p.created_at,
      key,
    });
  });

  if (!postPersonaRows.length) {
    return NextResponse.json({
      dominant_key: null,
      dominant_title: null,
      streak_days: 0,
      count_total: 0,
      count_7d: 0,
      count_prev_7d: 0,
      momentum_delta: 0,
      trend: "stable",
      top_personas: [],
      day_series: [],
    });
  }

  const counts = new Map<string, number>();
  postPersonaRows.forEach((r) => {
    counts.set(r.key, (counts.get(r.key) ?? 0) + 1);
  });
  const dominant = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
  const dominantKey = dominant?.[0] ?? null;
  const dominantCount = dominant?.[1] ?? 0;

  const { startCurrent, startPrev } = toRangeWindow();
  let count7d = 0;
  let countPrev7d = 0;
  postPersonaRows.forEach((r) => {
    if (r.key !== dominantKey) return;
    const ts = new Date(r.created_at);
    if (ts >= startCurrent) count7d += 1;
    else if (ts >= startPrev) countPrev7d += 1;
  });
  const momentumDelta = count7d - countPrev7d;
  const trend =
    momentumDelta >= 3 ? "up" : momentumDelta <= -3 ? "down" : "stable";

  const perDay = new Map<string, Map<string, number>>();
  postPersonaRows.forEach((r) => {
    const day = toDayKey(r.created_at);
    if (!perDay.has(day)) perDay.set(day, new Map());
    const m = perDay.get(day)!;
    m.set(r.key, (m.get(r.key) ?? 0) + 1);
  });

  const daySeries = Array.from(perDay.entries())
    .map(([day, m]) => {
      const top = Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0];
      return {
        day,
        top_key: top?.[0] ?? "unknown",
        posts: Array.from(m.values()).reduce((a, b) => a + b, 0),
      };
    })
    .sort((a, b) => a.day.localeCompare(b.day));

  let streakDays = 0;
  if (dominantKey) {
    for (let i = daySeries.length - 1; i >= 0; i -= 1) {
      if (daySeries[i].top_key !== dominantKey) break;
      streakDays += 1;
    }
  }

  const topPersonas = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([key, count]) => ({
      key,
      count,
      share: count / Math.max(1, postPersonaRows.length),
    }));

  const titleMap = await resolveTitles(
    supa,
    [dominantKey ?? "", ...topPersonas.map((x) => x.key), ...daySeries.map((x) => x.top_key)]
  );

  return NextResponse.json({
    dominant_key: dominantKey,
    dominant_title: dominantKey ? titleMap[dominantKey] ?? dominantKey : null,
    streak_days: streakDays,
    count_total: dominantCount,
    count_7d: count7d,
    count_prev_7d: countPrev7d,
    momentum_delta: momentumDelta,
    trend,
    top_personas: topPersonas.map((x) => ({
      ...x,
      title: titleMap[x.key] ?? x.key,
    })),
    day_series: daySeries.map((x) => ({
      ...x,
      top_title: titleMap[x.top_key] ?? x.top_key,
    })),
  });
}
