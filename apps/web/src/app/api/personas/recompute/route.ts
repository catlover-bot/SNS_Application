// POST /api/personas/recompute
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { derivePersonaRowsFromSignals } from "@/lib/personaAssignment";

function isMissingVersionColumnError(err: any) {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes("version") && (text.includes("column") || text.includes("schema"));
}

export async function POST() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  // 1) 既存RPCがあれば優先利用
  const rpc = await supabase.rpc("assign_top_persona", { p_user: user.id });
  if (!rpc.error) {
    return NextResponse.json({ ok: true, method: "rpc" });
  }

  // 2) RPCが無い/失敗時は投稿履歴からフォールバック再計算
  const postsRes = await supabase
    .from("posts")
    .select("id,created_at,analysis")
    .eq("author", user.id)
    .order("created_at", { ascending: false })
    .limit(600);
  if (postsRes.error) {
    return NextResponse.json(
      { ok: false, error: postsRes.error.message, method: "fallback_posts_error" },
      { status: 500 }
    );
  }

  const posts = (postsRes.data ?? []) as Array<{
    id: string;
    created_at: string;
    analysis: any;
  }>;
  if (!posts.length) {
    return NextResponse.json({
      ok: true,
      method: "fallback_empty",
      personas: [],
      warning: rpc.error?.message ?? "assign_top_persona_failed",
    });
  }

  const ids = posts.map((p) => p.id);
  const scoreRes = await supabase
    .from("post_scores")
    .select("post_id,persona_key,final_score")
    .in("post_id", ids)
    .limit(30000);
  const scoreRows = (scoreRes.data ??
    []) as Array<{ post_id: string; persona_key: string; final_score: number | null }>;
  const derived = derivePersonaRowsFromSignals({
    posts,
    scoreRows: scoreRes.error ? [] : scoreRows,
    limit: 12,
  });

  if (!derived.length) {
    return NextResponse.json({
      ok: true,
      method: "fallback_no_persona",
      personas: [],
      warning: rpc.error?.message ?? "assign_top_persona_failed",
    });
  }

  const nowIso = new Date().toISOString();
  const version = Math.floor(Date.now() / 1000);
  const rowsWithVersion = derived.map((r) => ({
    user_id: user.id,
    persona_key: r.persona_key,
    score: r.score,
    confidence: r.confidence,
    updated_at: nowIso,
    version,
  }));

  const rowsWithoutVersion = rowsWithVersion.map(({ version: _v, ...rest }) => rest);

  let persistError: any = null;
  let persisted = false;
  try {
    const del = await supabase.from("user_personas").delete().eq("user_id", user.id);
    if (!del.error) {
      let ins = await supabase.from("user_personas").insert(rowsWithVersion);
      if (ins.error && isMissingVersionColumnError(ins.error)) {
        ins = await supabase.from("user_personas").insert(rowsWithoutVersion);
      }
      if (!ins.error) {
        persisted = true;
      } else {
        persistError = ins.error;
      }
    } else {
      persistError = del.error;
    }
  } catch (e: any) {
    persistError = e;
  }

  return NextResponse.json({
    ok: true,
    method: persisted ? "fallback_persisted" : "fallback_derived_only",
    personas: derived,
    persisted,
    warning: rpc.error?.message ?? "assign_top_persona_failed",
    persist_error: persistError?.message ?? null,
  });
}
