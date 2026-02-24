// apps/web/src/app/api/me/persona_profile/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { derivePersonaRowsFromSignals } from "@/lib/personaAssignment";

export async function GET() {
  const supa = await supabaseServer();

  // ログインユーザー取得
  const {
    data: { user },
    error: authErr,
  } = await supa.auth.getUser();

  if (authErr) {
    console.error("[/api/me/persona_profile] auth error:", authErr.message);
  }

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // 自分のキャラスコア一覧
  const { data: personas, error: pErr } = await supa
    .from("user_personas")
    .select("persona_key, score, confidence")
    .eq("user_id", user.id)
    .order("score", { ascending: false });

  if (pErr) {
    console.error("[/api/me/persona_profile] user_personas error:", pErr.message);
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  let finalPersonas = personas ?? [];
  let source = "user_personas";

  if (!finalPersonas.length) {
    const postsRes = await supa
      .from("posts")
      .select("id,created_at,analysis")
      .eq("author", user.id)
      .order("created_at", { ascending: false })
      .limit(500);

    const posts = (postsRes.data ?? []) as Array<{
      id: string;
      created_at: string;
      analysis: any;
    }>;

    if (posts.length > 0) {
      const ids = posts.map((p) => p.id);
      const scoreRes = await supa
        .from("post_scores")
        .select("post_id,persona_key,final_score")
        .in("post_id", ids)
        .limit(30000);
      const derived = derivePersonaRowsFromSignals({
        posts,
        scoreRows: (scoreRes.data ??
          []) as Array<{ post_id: string; persona_key: string; final_score: number | null }>,
        limit: 12,
      });
      finalPersonas = derived.map((r) => ({
        persona_key: r.persona_key,
        score: r.score,
        confidence: r.confidence,
      }));
      source = "derived_from_posts";
    }
  }

  if (!finalPersonas.length) {
    return NextResponse.json({ personas: [], defs: [], source: "empty" });
  }

  // 対応するキャラ定義（タイトルなど）
  const keys = finalPersonas.map((r: any) => r.persona_key).filter(Boolean);
  let defs: { key: string; title: string; theme: string | null }[] = [];

  if (keys.length > 0) {
    const { data: defRows, error: dErr } = await supa
      .from("persona_archetype_defs")
      .select("key,title,theme")
      .in("key", keys as string[]);

    if (dErr) {
      console.warn("[/api/me/persona_profile] defs error:", dErr.message);
    } else if (defRows) {
      defs = defRows as any;
    }
  }

  return NextResponse.json({ personas: finalPersonas, defs, source });
}
