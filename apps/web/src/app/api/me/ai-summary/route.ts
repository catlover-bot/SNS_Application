import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type TimelineSummary = {
  overview: string;
  strengths: string[];
  risks: string[];
  suggestions: string[];
};

export async function GET(req: NextRequest) {
  const supa = await supabaseServer();

  const {
    data: { user },
  } = await supa.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // プロフィールからプレミアム判定
  const { data: profile, error: profErr } = await supa
    .from("profiles")
    .select("is_premium")
    .eq("id", user.id)
    .maybeSingle();

  if (profErr) {
    console.error("[ai-summary] profile error", profErr);
  }

  const isPremium = profile?.is_premium === true;

  if (!isPremium) {
    // 課金実装中モード：画面上は「Premium限定 / 実装中」と表示させる
    return NextResponse.json(
      {
        error: "premium_required",
        message:
          "タイムライン一括AI分析は Premium 限定機能です（課金機能は現在準備中）。",
        status: "coming_soon",
      },
      { status: 402 }
    );
  }

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? "20");

  // 直近投稿を取得（author カラムはあなたのスキーマに合わせて調整）
  const { data: posts, error: postsErr } = await supa
    .from("posts")
    .select("id, text, created_at")
    .eq("author", user.id)
    .order("created_at", { ascending: false })
    .limit(Number.isFinite(limit) ? limit : 20);

  if (postsErr) {
    console.error("[ai-summary] posts error", postsErr);
    return NextResponse.json(
      { error: "db_error" },
      { status: 500 }
    );
  }

  if (!posts || posts.length === 0) {
    return NextResponse.json({
      summary: null,
      message: "まだ投稿が少ないため、AIサマリーを作成できません。",
    });
  }

  const baseUrl = process.env.LLM_API_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;

  if (!baseUrl || !apiKey) {
    // 本番に LLM がまだつながっていない場合のダミー
    const dummy: TimelineSummary = {
      overview:
        "あなたの投稿は、日常の出来事や感情を素直に共有するスタイルが多く、全体としてポジティブなトーンです。",
      strengths: ["正直な自己開示", "日常の小さな出来事の観察力"],
      risks: ["一部の投稿で感情が強く出すぎることがある"],
      suggestions: ["ポジティブな気づきを一言添えると、より共感を得やすくなります。"],
    };
    return NextResponse.json({ summary: dummy, source: "dummy" });
  }

  const joined = posts
    .map(
      (p) =>
        `- (${p.created_at}) ${typeof p.text === "string" ? p.text : ""}`
    )
    .join("\n");

  const prompt = `
以下は、あるユーザーの直近の投稿一覧です。

${joined}

これらをまとめて分析し、次の形式の JSON を返してください。

{
  "overview": "全体的な傾向の要約（1〜3文）",
  "strengths": ["強み1", "強み2", ...],
  "risks": ["リスク1", "リスク2", ...],
  "suggestions": ["今後の投稿で意識すると良いポイント", ...]
}
JSON だけを返してください。
`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL_NAME ?? "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an assistant that summarizes a user's social media timeline.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    }),
  });

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content ?? "{}";

  let summary: TimelineSummary;
  try {
    summary = JSON.parse(content);
  } catch {
    summary = {
      overview: "AI サマリーの生成に失敗しました。",
      strengths: [],
      risks: [],
      suggestions: [],
    };
  }

  return NextResponse.json({ summary, source: "llm" });
}
