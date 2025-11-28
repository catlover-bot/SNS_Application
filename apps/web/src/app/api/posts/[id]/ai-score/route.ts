// apps/web/src/app/api/posts/[id]/ai-score/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs"; // ← Edge Runtime だと localhost にアクセスできないので明示

/**
 * GET: その投稿の AI スコアを取得
 *  - 既に ai_post_scores に保存されているものを返すだけ
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params; // ← Next.js 16 の Promise params 対応

  const supa = await supabaseServer();

  const { data, error } = await supa
    .from("ai_post_scores")
    .select(
      `
      post_id,
      truth,
      exaggeration,
      brag,
      joke,
      verdict,
      reason,
      tags
    `
    )
    .eq("post_id", id)
    .maybeSingle();

  if (error) {
    console.error("[GET /api/posts/[id]/ai-score] error", error);
    return NextResponse.json(
      { error: "failed_to_fetch_score" },
      { status: 500 }
    );
  }

  if (!data) {
    // まだスコアがない場合は 204
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json(data);
}

/**
 * POST: LLM を用いてスコアを再計算し、ai_post_scores に保存
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const supa = await supabaseServer();

  // 認証ユーザー取得
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "not_authenticated" },
      { status: 401 }
    );
  }

  // 投稿本文を取得
  const { data: post, error: postErr } = await supa
    .from("posts")
    .select("id, text, media_urls")
    .eq("id", id)
    .maybeSingle();

  if (postErr || !post) {
    console.error("[POST /ai-score] post fetch error", postErr);
    return NextResponse.json(
      { error: "post_not_found" },
      { status: 404 }
    );
  }

  // ---- ここで LLM を呼び出してスコア算出 ----
  const aiResult = await callLlmForPost({
    text: post.text ?? "",
    mediaUrls: (post.media_urls as string[]) ?? [],
  });

  // DB に upsert
  const { data, error } = await supa
    .from("ai_post_scores")
    .upsert(
      {
        post_id: post.id,
        created_by: user.id,
        truth: aiResult.dimensions.truth ?? null,
        exaggeration: aiResult.dimensions.exaggeration ?? null,
        brag: aiResult.dimensions.brag ?? null,
        joke: aiResult.dimensions.joke ?? null,
        verdict: aiResult.verdict,
        reason: aiResult.reason,
        tags: aiResult.tags ?? [],
      },
      { onConflict: "post_id" }
    )
    .select(
      `
      post_id,
      truth,
      exaggeration,
      brag,
      joke,
      verdict,
      reason,
      tags
    `
    )
    .maybeSingle();

  if (error) {
    console.error("[POST /api/posts/[id]/ai-score] upsert error", error);
    return NextResponse.json(
      {
        error: "failed_to_save_score",
        detail: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

// -----------------
// LLM 呼び出し
// -----------------

type AiDimensions = {
  truth?: number;
  exaggeration?: number;
  brag?: number;
  joke?: number;
};

type AiResult = {
  dimensions: AiDimensions;
  verdict: string;
  reason: string;
  tags: string[];
};

type LlmInput = {
  text: string;
  mediaUrls: string[];
};

async function callLlmForPost(input: LlmInput): Promise<AiResult> {
  const baseUrl = process.env.LLM_API_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL_NAME ?? "llama3.2:1b";

  // --- 1) 環境変数が無いときは「ダミー」応答（本番のβ表示用） ---
  if (!baseUrl || !apiKey) {
    return {
      dimensions: {
        truth: 70,
        exaggeration: 30,
        brag: 20,
        joke: 10,
      },
      verdict: "β版（開発中）の AI 判定です",
      reason:
        "本番環境では現在ダミーのスコアを表示しています。ローカル開発環境では Ollama 経由で本物の LLM を使って判定できます。",
      tags: ["beta", "dummy"],
    };
  }

  // --- 2) 実際の LLM 呼び出し（Ollama / OpenAI 互換サーバ想定） ---
  const prompt = `
あなたは SNS の投稿に対して「嘘っぽさ」を多面的に分析するアシスタントです。
以下の投稿について、日本語で判定してください。

評価する指標は 0〜100 の整数です（0 が全くない、100 が非常に強い）。

- truth: どのくらい事実っぽいか（高いほど事実寄り）
- exaggeration: どのくらい盛っていそうか
- brag: 自慢・マウントのニュアンス
- joke: ネタ・冗談要素

投稿本文:
${input.text || "(本文なし)"}

出力は必ず **次の JSON だけ** にしてください（説明文やコメントは禁止）:

{
  "dimensions": { "truth": 70, "exaggeration": 40, "brag": 20, "joke": 10 },
  "verdict": "文章全体として〜〜〜",
  "reason": "このスコアにした理由を簡潔に説明してください。",
  "tags": ["ネタっぽい", "日常", "自慢少なめ"]
}
  `.trim();

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Ollama は Authorization 無視するのでダミーでOK / OpenAI互換サーバもここを使える
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a Japanese content analysis assistant that scores social media posts on truthfulness and exaggeration.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[callLlmForPost] HTTP error", res.status, text);
    // 失敗時は保険として中立スコアを返す
    return {
      dimensions: { truth: 50, exaggeration: 50, brag: 0, joke: 0 },
      verdict: "AI判定に失敗したため、中立的なスコアを設定しました。",
      reason: "LLM API 呼び出しでエラーが発生しました。",
      tags: ["llm_error"],
    };
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content ?? "{}";

  let parsed: AiResult;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    console.error("[callLlmForPost] JSON parse error", e, content);
    parsed = {
      dimensions: { truth: 50, exaggeration: 50, brag: 0, joke: 0 },
      verdict: "判定に失敗しました",
      reason: "LLM 応答の JSON 解析に失敗しました。",
      tags: ["parse_error"],
    };
  }

  return parsed;
}
