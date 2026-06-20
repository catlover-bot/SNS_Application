// apps/web/src/app/api/trending/route.ts
import { NextResponse } from "next/server";
import { safeJsonError } from "@/lib/apiSecurity";
import { supabaseServer } from "@/lib/supabase/server";

function clampInt(value: string | null, min: number, max: number, fallback: number) {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

/**
 * GET /api/trending?limit=20&offset=0
 * - ログイン済み: 自分のキャラ + 相性キャラの post_scores を融合 → 上位
 * - 未ログイン  : post_scores の max(final_score) で全体上位
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = clampInt(url.searchParams.get("limit"), 1, 50, 20);
  const offset = clampInt(url.searchParams.get("offset"), 0, 500, 0);

  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();

  // ユーザー別: ベースキャラ + 上位互換 5件
  let personaKeys: string[] | null = null;
  if (user) {
    const up = await supa
      .from("user_personas")
      .select("persona_key")
      .eq("user_id", user.id)
      .order("version", { ascending: false })
      .order("score", { ascending: false })
      .limit(1)
      .maybeSingle();

    const base = up.data?.persona_key ?? null;
    if (base) {
      const compat = await supa
        .from("persona_compat_norm")
        .select("b,weight")
        .eq("a", base)
        .order("weight", { ascending: false })
        .limit(5);

      if (compat.error) {
        console.error("[api/trending] persona compatibility error", compat.error);
        return safeJsonError("trending_unavailable", 500, { items: [], used_personas: [] });
      }

      personaKeys = [base, ...((compat.data ?? []).map(r => r.b))];
    }
  }

  // post_scores から候補取得（dedupe は JS 側で）
  if (personaKeys && personaKeys.length) {
    // 1) persona_key IN (...) で post_scores をスコア順
    const ps = await supa
      .from("post_scores")
      .select("post_id, persona_key, final_score")
      .in("persona_key", personaKeys)
      .order("final_score", { ascending: false })
      .limit(400); // 後で重複除去するので少し厚めに取る

    if (ps.error) {
      console.error("[api/trending] personalized scores error", ps.error);
      return safeJsonError("trending_unavailable", 500, { items: [], used_personas: [] });
    }

    const rows = (ps.data ?? []);

    // 2) post_id 単位で最大スコアを採用（重複除去）
    const best = new Map<string, {score:number, key:string}>();
    for (const r of rows) {
      const cur = best.get(r.post_id);
      if (!cur || r.final_score > cur.score) {
        best.set(r.post_id, { score: r.final_score, key: r.persona_key });
      }
    }

    // 3) スコア降順で page
    const ranked = [...best.entries()]
      .map(([post_id, {score, key}]) => ({ post_id, score, persona_key: key }))
      .sort((a,b)=> b.score - a.score)
      .slice(offset, offset + limit);

    const ids = ranked.map(r => r.post_id);
    if (ids.length === 0) return NextResponse.json({ items: [], used_personas: personaKeys });

    // 4) posts をまとめて取って並び直す
    const posts = await supa
      .from("posts")
      .select("*")
      .in("id", ids);

    if (posts.error) {
      console.error("[api/trending] personalized posts error", posts.error);
      return safeJsonError("trending_unavailable", 500, { items: [], used_personas: [] });
    }

    const byId = new Map((posts.data ?? []).map(p => [p.id, p]));
    const items = ranked
      .map(r => {
        const post = byId.get(r.post_id);
        return post ? { ...post, score: r.score, matched_persona: r.persona_key } : null;
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    return NextResponse.json({ items, used_personas: personaKeys });
  } else {
    // グローバル: post_scores の max(final_score) ベース
    // View/RPC がなくても JS で集約
    const ps = await supa
      .from("post_scores")
      .select("post_id, final_score")
      .order("final_score", { ascending: false })
      .limit(600);

    if (ps.error) {
      console.error("[api/trending] global scores error", ps.error);
      return safeJsonError("trending_unavailable", 500, { items: [], used_personas: [] });
    }

    const rows = (ps.data ?? []);
    const maxByPost = new Map<string, number>();
    for (const r of rows) {
      const cur = maxByPost.get(r.post_id) ?? -Infinity;
      if (r.final_score > cur) maxByPost.set(r.post_id, r.final_score);
    }
    const ranked = [...maxByPost.entries()]
      .map(([post_id, score]) => ({ post_id, score }))
      .sort((a,b)=> b.score - a.score)
      .slice(offset, offset + limit);

    const ids = ranked.map(r => r.post_id);
    if (ids.length === 0) return NextResponse.json({ items: [], used_personas: [] });

    const posts = await supa
      .from("posts")
      .select("*")
      .in("id", ids);

    if (posts.error) {
      console.error("[api/trending] global posts error", posts.error);
      return safeJsonError("trending_unavailable", 500, { items: [], used_personas: [] });
    }

    const byId = new Map((posts.data ?? []).map(p => [p.id, p]));
    const items = ranked
      .map(r => {
        const post = byId.get(r.post_id);
        return post ? { ...post, score: r.score } : null;
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    return NextResponse.json({ items, used_personas: [] });
  }
}
