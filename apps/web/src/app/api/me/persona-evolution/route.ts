import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type PostRow = {
  id: string;
  created_at: string;
};

type PostScoreRow = {
  post_id: string;
  persona_key: string;
  final_score: number | null;
};

type PersonaHistoryRow = {
  persona_key: string;
  score: number | null;
  confidence: number | null;
  updated_at: string;
  version?: number | null;
};

function clampInt(v: string | null, min: number, max: number, def: number) {
  const n = Number(v ?? "");
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function clamp01(v: number | null | undefined) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

async function buildTitlesMap(supa: any, keys: string[]) {
  const map = new Map<string, string>();
  if (!keys.length) return map;

  const arche = await supa
    .from("persona_archetype_defs")
    .select("key,title")
    .in("key", keys);
  (arche.data ?? []).forEach((r: any) => {
    map.set(r.key, r.title ?? r.key);
  });

  const missing = keys.filter((k) => !map.has(k));
  if (missing.length > 0) {
    const defs = await supa.from("persona_defs").select("key,title").in("key", missing);
    (defs.data ?? []).forEach((r: any) => {
      map.set(r.key, r.title ?? r.key);
    });
  }

  return map;
}

async function fallbackFromPersonaSnapshots(supa: any, userId: string, limit: number) {
  const up = await supa
    .from("user_personas")
    .select("persona_key,score,confidence,updated_at,version")
    .eq("user_id", userId)
    .order("updated_at", { ascending: true })
    .limit(2000);

  const rows = (up.data ?? []) as PersonaHistoryRow[];
  if (!rows.length) {
    return { snapshots: [], titles: {}, source: "empty" as const };
  }

  const grouped = new Map<
    string,
    {
      date: string;
      items: PersonaHistoryRow[];
    }
  >();

  rows.forEach((r) => {
    const k = r.version != null ? `v:${r.version}` : r.updated_at.slice(0, 10);
    if (!grouped.has(k)) grouped.set(k, { date: r.updated_at, items: [] });
    grouped.get(k)!.items.push(r);
  });

  const snapshots = Array.from(grouped.values())
    .map((g) => {
      const top = [...g.items].sort(
        (a, b) => clamp01(b.score) - clamp01(a.score)
      )[0];
      return {
        at: g.date,
        top_key: top?.persona_key ?? "unknown",
        top_score: clamp01(top?.score),
        confidence: clamp01(top?.confidence),
        posts: g.items.length,
      };
    })
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-limit);

  const keys = Array.from(new Set(snapshots.map((s) => s.top_key)));
  const titleMap = await buildTitlesMap(supa, keys);
  const titles = Object.fromEntries(keys.map((k) => [k, titleMap.get(k) ?? k]));

  return { snapshots, titles, source: "user_personas" as const };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = clampInt(url.searchParams.get("limit"), 8, 120, 40);

  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  try {
    const postsRes = await supa
      .from("posts")
      .select("id,created_at")
      .eq("author", user.id)
      .order("created_at", { ascending: true })
      .limit(500);

    const posts = (postsRes.data ?? []) as PostRow[];
    if (!posts.length) {
      return NextResponse.json({
        snapshots: [],
        titles: {},
        source: "posts",
      });
    }

    const ids = posts.map((p) => p.id);
    const scoreRes = await supa
      .from("post_scores")
      .select("post_id,persona_key,final_score")
      .in("post_id", ids)
      .limit(20000);

    const scoreRows = (scoreRes.data ?? []) as PostScoreRow[];
    if (!scoreRows.length) {
      const fallback = await fallbackFromPersonaSnapshots(supa, user.id, limit);
      return NextResponse.json(fallback);
    }

    const topByPost = new Map<
      string,
      { key: string; score: number }
    >();
    scoreRows.forEach((r) => {
      if (!r.post_id || !r.persona_key) return;
      const s = clamp01(r.final_score);
      const cur = topByPost.get(r.post_id);
      if (!cur || s > cur.score) {
        topByPost.set(r.post_id, { key: r.persona_key, score: s });
      }
    });

    const byDay = new Map<
      string,
      {
        at: string;
        entries: Array<{ key: string; score: number }>;
      }
    >();

    posts.forEach((p) => {
      const top = topByPost.get(p.id);
      if (!top) return;
      const day = p.created_at.slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, { at: p.created_at, entries: [] });
      byDay.get(day)!.entries.push(top);
    });

    const snapshots = Array.from(byDay.entries())
      .map(([day, g]) => {
        const count = new Map<string, { n: number; total: number }>();
        g.entries.forEach((e) => {
          const cur = count.get(e.key) ?? { n: 0, total: 0 };
          cur.n += 1;
          cur.total += e.score;
          count.set(e.key, cur);
        });

        const top = Array.from(count.entries())
          .map(([k, v]) => ({
            key: k,
            n: v.n,
            avg: v.total / Math.max(1, v.n),
          }))
          .sort((a, b) => {
            if (b.n !== a.n) return b.n - a.n;
            return b.avg - a.avg;
          })[0];

        return {
          at: day,
          top_key: top?.key ?? "unknown",
          top_score: clamp01(top?.avg),
          confidence: clamp01((top?.n ?? 0) / Math.max(1, g.entries.length)),
          posts: g.entries.length,
        };
      })
      .sort((a, b) => a.at.localeCompare(b.at))
      .slice(-limit);

    const keys = Array.from(new Set(snapshots.map((s) => s.top_key)));
    const titleMap = await buildTitlesMap(supa, keys);
    const titles = Object.fromEntries(keys.map((k) => [k, titleMap.get(k) ?? k]));

    return NextResponse.json({
      snapshots,
      titles,
      source: "post_scores",
    });
  } catch (e: any) {
    const fallback = await fallbackFromPersonaSnapshots(supa, user.id, limit);
    return NextResponse.json({
      ...fallback,
      warning: e?.message ?? "persona_evolution_fallback",
    });
  }
}
