// apps/web/src/app/api/posts/[id]/ai-score/route.ts
import { NextRequest, NextResponse } from "next/server";
import { safeJsonError } from "@/lib/apiSecurity";
import { supabaseServer } from "@/lib/supabase/server";
import { getLieJudge } from "@/lib/ai/lieJudge";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET: 既存の AI スコアを取得
export async function GET(req: NextRequest, ctx: RouteContext) {
  const { id: postId } = await ctx.params;
  const supa = await supabaseServer();

  const { data, error } = await supa
    .from("ai_post_scores")
    .select("*")
    .eq("post_id", postId)
    .maybeSingle();

  if (error) {
    console.error("[GET /api/posts/[id]/ai-score] error", error);
    return safeJsonError("ai_score_unavailable", 500);
  }

  if (!data) {
    // まだスコアが無い場合は 204 No Content
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json(data);
}

// POST: LLM で判定して ai_post_scores に upsert
export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id: postId } = await ctx.params;
  const supa = await supabaseServer();

  // 認証ユーザー
  const {
    data: { user },
    error: authError,
  } = await supa.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "unauthorized", message: "ログインが必要です。" },
      { status: 401 }
    );
  }

  // ✅ 投稿本文を取得（text カラムのみ）
  const { data: post, error: postError } = await supa
    .from("posts")
    .select("id, text")
    .eq("id", postId)
    .maybeSingle();

  if (postError) {
    console.error(
      "[POST /api/posts/[id]/ai-score] post fetch error",
      postError
    );
    return safeJsonError("post_unavailable", 500);
  }

  if (!post) {
    return NextResponse.json(
      { error: "post_not_found", message: "投稿が見つかりません。" },
      { status: 404 }
    );
  }

  // ✅ posts.body は存在しないので text だけを見る
  const text = (post.text as string | null | undefined) ?? "";

  // 環境変数で dummy / ollama を切り替える
  const lieJudge = getLieJudge();

  let aiResult;
  try {
    aiResult = await lieJudge({
      text,
      mediaUrls: [],
      premium: false,
    });
  } catch (e: any) {
    console.error("[lieJudge] error", e);
    return safeJsonError("ai_score_failed", 500, {
      message: "AI 判定処理中にエラーが発生しました。時間をおいて再度お試しください。",
    });
  }

  const dims = aiResult.dimensions ?? {};
  const truth = Number(dims.truth ?? 50);
  const exaggeration = Number(dims.exaggeration ?? 50);
  const brag = Number(dims.brag ?? 0);
  const joke = Number(dims.joke ?? 0);

  // DB に upsert
  const { data: saved, error: upsertError } = await supa
    .from("ai_post_scores")
    .upsert(
      {
        post_id: postId,
        created_by: user.id,
        truth,
        exaggeration,
        brag,
        joke,
        verdict: aiResult.verdict,
        reason: aiResult.reason,
        tags: aiResult.tags,
        // 将来: empathy, flame_risk カラムが増えたらここに追加
      },
      { onConflict: "post_id" }
    )
    .select()
    .maybeSingle();

  if (upsertError) {
    console.error(
      "[POST /api/posts/[id]/ai-score] upsert error",
      upsertError
    );
    return safeJsonError("ai_score_save_failed", 500);
  }

  return NextResponse.json(saved);
}
