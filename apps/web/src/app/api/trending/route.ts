// apps/web/src/app/api/trending/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/trending?limit=20&since=<ISO8601>
 * - ログイン中: v_user_persona から persona_key を取得し、同じ arche_key の投稿を優先表示
 * - 未ログイン: スコア→新着の順で汎用トレンド
 * 返値: { persona_key?: string | null, items: Post[] }
 */
export async function GET(req: Request) {
  const supa = await supabaseServer();
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20), 1), 100);
  const since = url.searchParams.get("since"); // "これ以降(より新しい)は出さない"用に created_at より古い方を取る

  // ログイン & キャラキー取得
  const { data: { user } } = await supa.auth.getUser();
  let personaKey: string | null = null;

  if (user) {
    const vp = await supa
      .from("v_user_persona")
      .select("persona_key")
      .eq("user_id", user.id)
      .maybeSingle();
    personaKey = vp.data?.persona_key ?? null;
  }

  // ベースクエリ（v_posts_enriched は PostCard 用の拡張ビュー）
  let q = supa
    .from("v_posts_enriched")
    .select("*")
    .limit(limit);

  if (since) q = q.lt("created_at", since);

  if (personaKey) {
    // 自分のキャラにマッチする投稿を優先（まずキャラ一致で絞り込み）
    q = q.eq("arche_key", personaKey).order("created_at", { ascending: false });
  } else {
    // 未ログイン/キャラ未確定 → 汎用トレンド: スコア → 新着
    q = q.order("score", { ascending: false }).order("created_at", { ascending: false });
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    persona_key: personaKey,
    items: data ?? [],
  });
}
