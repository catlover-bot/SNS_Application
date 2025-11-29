// apps/web/src/app/api/profiles/[handle]/ai-summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type ProfileRow = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type ProfileAiSummaryRow = {
  user_id: string;
  analyzed_posts: number | null;
  truth_avg: number | null;
  exaggeration_avg: number | null;
  brag_avg: number | null;
  joke_avg: number | null;
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ handle: string }> } | { params: { handle: string } }
) {
  const supa = await supabaseServer();

  // Next 15/16 の「params が Promise 問題」に対応
  const awaitedParams = "then" in ctx.params ? await ctx.params : ctx.params;
  const handle = awaitedParams.handle;

  // 1) ハンドルからプロフィールを取得
  const { data: prof, error: profErr } = await supa
    .from("profiles")
    .select("id, handle, display_name, avatar_url")
    .eq("handle", handle)
    .maybeSingle<ProfileRow>();

  if (profErr) {
    console.error("[profiles/ai-summary] profile error", profErr);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  if (!prof) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // 2) v_profile_ai_summary から集約値を取得
  const { data: summaryRow, error: sumErr } = await supa
    .from("v_profile_ai_summary")
    .select(
      "user_id, analyzed_posts, truth_avg, exaggeration_avg, brag_avg, joke_avg"
    )
    .eq("user_id", prof.id)
    .maybeSingle<ProfileAiSummaryRow>();

  if (sumErr) {
    console.error("[profiles/ai-summary] summary error", sumErr);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  if (!summaryRow) {
    // まだ1件も AI 判定されていない
    return NextResponse.json({
      profile: prof,
      summary: null,
    });
  }

  return NextResponse.json({
    profile: prof,
    summary: summaryRow,
  });
}
