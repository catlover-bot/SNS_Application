// apps/web/src/app/api/me/persona_profile/route.ts
import { NextResponse } from "next/server";
import { safeJsonError } from "@/lib/apiSecurity";
import { supabaseServer } from "@/lib/supabase/server";
import { derivePersonaRowsFromSignals } from "@/lib/personaAssignment";
import { findDefaultPersona } from "@/lib/personaCatalog";
import { buildPersonaScoreBreakdowns } from "@/lib/personaScoreBreakdown";

type PersonaRow = {
  persona_key: string;
  score: number | null;
  confidence: number | null;
};

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
    return safeJsonError("persona_profile_unavailable", 500);
  }

  let finalPersonas = (personas ?? []) as PersonaRow[];
  let source = "user_personas";

  const postsRes = await supa
    .from("posts")
    .select("id,created_at,analysis")
    .eq("author", user.id)
    .order("created_at", { ascending: false })
    .limit(500);
  if (postsRes.error) {
    console.warn("[/api/me/persona_profile] recent post signals unavailable");
  }
  const posts = (postsRes.data ?? []) as PostRow[];
  const ids = posts.map((post) => post.id).filter(Boolean);
  let scoreRows: PostScoreRow[] = [];

  if (ids.length > 0) {
    const scoreRes = await supa
      .from("post_scores")
      .select("post_id,persona_key,final_score")
      .in("post_id", ids)
      .limit(30000);
    if (scoreRes.error) {
      console.warn("[/api/me/persona_profile] post score signals unavailable");
    } else {
      scoreRows = (scoreRes.data ?? []) as PostScoreRow[];
    }
  }

  if (!finalPersonas.length) {
    if (posts.length > 0) {
      const derived = derivePersonaRowsFromSignals({
        posts,
        scoreRows,
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
    return NextResponse.json({ personas: [], defs: [], breakdowns: [], source: "empty" });
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

    const known = new Set(defs.map((row) => row.key));
    keys.forEach((key: string) => {
      if (known.has(key)) return;
      const fallback = findDefaultPersona(key);
      if (fallback) defs.push({ key: fallback.key, title: fallback.title, theme: fallback.theme });
    });
  }

  let aiScoreRows: Array<{
    post_id: string;
    truth: number | null;
    exaggeration: number | null;
    brag: number | null;
    joke: number | null;
    tags: string[] | null;
  }> = [];
  let reactionRows: Array<{ post_id: string; kind: string }> = [];

  if (ids.length > 0) {
    const [aiRes, reactionRes] = await Promise.all([
      supa
        .from("ai_post_scores")
        .select("post_id,truth,exaggeration,brag,joke,tags")
        .in("post_id", ids)
        .limit(500),
      supa.from("reactions").select("post_id,kind").in("post_id", ids).limit(20000),
    ]);
    if (aiRes.error) {
      console.warn("[/api/me/persona_profile] AI score signals unavailable");
    } else {
      aiScoreRows = (aiRes.data ?? []) as typeof aiScoreRows;
    }
    if (reactionRes.error) {
      console.warn("[/api/me/persona_profile] reaction signals unavailable");
    } else {
      reactionRows = (reactionRes.data ?? []) as typeof reactionRows;
    }
  }

  const breakdowns = buildPersonaScoreBreakdowns({
    personas: finalPersonas,
    defs,
    posts,
    scoreRows,
    aiScoreRows,
    reactionRows,
  });

  return NextResponse.json({ personas: finalPersonas, defs, breakdowns, source });
}
