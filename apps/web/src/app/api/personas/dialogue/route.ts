import { NextRequest, NextResponse } from "next/server";
import { buildPersonaProfile, type PersonaProfile } from "@sns/core";
import { supabaseServer } from "@/lib/supabase/server";

type Mode = "friendship" | "romance";

type PersonaDef = {
  key: string;
  title: string | null;
  theme: string | null;
  blurb: string | null;
  talk_style: string | null;
  relation_style: string | null;
  vibe_tags: string[] | null;
};

type CompatRow = {
  source_key: string;
  target_key: string;
  kind: string;
  score: number | null;
  relation_label: string | null;
};

type DialogueResponse = {
  drafts: string[];
  strategy: string;
  tips?: string[];
};

function fallbackDrafts(args: {
  sourceTitle: string;
  targetTitle: string;
  mode: Mode;
  relationLabel?: string | null;
  context?: string | null;
  replyToText?: string | null;
  sourceTalk?: string | null;
  targetTalk?: string | null;
  sourceProfile: PersonaProfile;
  targetProfile: PersonaProfile;
}) {
  const relation = args.relationLabel ?? (args.mode === "romance" ? "甘めの相性" : "相棒系の相性");
  const topic = args.context?.trim() || "最近の出来事";
  const replyTarget = (args.replyToText ?? "").trim();
  const sourceStyle = (args.sourceTalk ?? "").trim();
  const targetStyle = (args.targetTalk ?? "").trim();
  const sourceHook = args.sourceProfile.hook;
  const targetHook = args.targetProfile.hook;
  const sourceTone = args.sourceProfile.toneGuide;
  const targetTone = args.targetProfile.toneGuide;
  const quoted = replyTarget ? `相手投稿「${replyTarget.slice(0, 80)}${replyTarget.length > 80 ? "…" : ""}」` : "";

  if (args.mode === "romance") {
    return [
      `「${topic}の話、${args.targetTitle}となら安心してできる。${relation}って感じ」${quoted ? ` ${quoted}` : ""}（${sourceTone}）`,
      `「${args.targetTitle}のその言い方、${sourceStyle || "やさしいノリ"}で返されると弱い」`,
      `「今日は${args.targetTitle}にだけ正直に言う。${topic}でちょっと不安だった」`,
      `「${sourceHook}で返すね。私はこう思う、${args.targetTitle}はどう感じた？」（相手: ${targetHook}）`,
    ];
  }

  return [
    `「${topic}、${args.targetTitle}となら最短で進められそう。${relation}が活きる場面だと思う」${quoted ? ` ${quoted}` : ""}`,
    `「まず役割を分けよう。自分は${sourceStyle || "段取り"}担当、${args.targetTitle}は${targetStyle || "瞬発力"}担当でどう？」`,
    `「${args.targetTitle}の視点を先に聞きたい。${topic}の打ち手、3案だけ出してみて」`,
    `「${sourceHook}で返すと、${targetTone}の相手にも通るはず。まず1案だけ先に投げるね」`,
  ];
}

function tryParseJson(text: string): DialogueResponse | null {
  const raw = text.trim();
  const candidates = [raw];

  const fenced = raw.match(/```(?:json)?([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    candidates.push(raw.slice(first, last + 1));
  }

  for (const c of candidates) {
    try {
      const obj = JSON.parse(c);
      if (Array.isArray(obj?.drafts)) {
        return {
          drafts: obj.drafts.map((x: any) => String(x)).filter(Boolean),
          strategy: String(obj.strategy ?? "llm"),
          tips: Array.isArray(obj?.tips) ? obj.tips.map((x: any) => String(x)) : [],
        };
      }
    } catch {
      // ignore
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const supa = await supabaseServer();

  const body = await req.json().catch(() => ({}));
  const sourceKey = String(body?.sourceKey ?? "").trim();
  const targetKey = String(body?.targetKey ?? "").trim();
  const mode = (body?.mode === "romance" ? "romance" : "friendship") as Mode;
  const context = String(body?.context ?? "").trim();
  const replyToText = String(body?.replyToText ?? "").trim();

  if (!sourceKey || !targetKey) {
    return NextResponse.json(
      { error: "sourceKey and targetKey are required" },
      { status: 400 }
    );
  }

  const defsRes = await supa
    .from("persona_defs")
    .select("key,title,theme,blurb,talk_style,relation_style,vibe_tags")
    .in("key", [sourceKey, targetKey]);

  const defs = (defsRes.data ?? []) as PersonaDef[];
  const source = defs.find((d) => d.key === sourceKey);
  const target = defs.find((d) => d.key === targetKey);

  const compatRes = await supa
    .from("persona_compat")
    .select("source_key,target_key,kind,score,relation_label")
    .eq("source_key", sourceKey)
    .eq("target_key", targetKey)
    .eq("kind", mode)
    .maybeSingle();

  const compat = (compatRes.data ?? null) as CompatRow | null;

  const sourceTitle = source?.title ?? sourceKey;
  const targetTitle = target?.title ?? targetKey;
  const sourceProfile = buildPersonaProfile({
    key: source?.key ?? sourceKey,
    title: sourceTitle,
    theme: source?.theme ?? null,
    blurb: source?.blurb ?? null,
    talkStyle: source?.talk_style ?? null,
    relationStyle: source?.relation_style ?? null,
    vibeTags: source?.vibe_tags ?? [],
  });
  const targetProfile = buildPersonaProfile({
    key: target?.key ?? targetKey,
    title: targetTitle,
    theme: target?.theme ?? null,
    blurb: target?.blurb ?? null,
    talkStyle: target?.talk_style ?? null,
    relationStyle: target?.relation_style ?? null,
    vibeTags: target?.vibe_tags ?? [],
  });

  const fallback = fallbackDrafts({
    sourceTitle,
    targetTitle,
    mode,
    relationLabel: compat?.relation_label ?? null,
    context,
    replyToText,
    sourceTalk: source?.talk_style ?? null,
    targetTalk: target?.talk_style ?? null,
    sourceProfile,
    targetProfile,
  });

  const baseUrl = process.env.LLM_API_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  if (!baseUrl || !apiKey) {
    return NextResponse.json({
      drafts: fallback.slice(0, 3),
      strategy: "fallback_no_llm",
      tips: [
        sourceProfile.hook,
        sourceProfile.relationGuide,
        ...sourceProfile.avoid.slice(0, 2),
      ],
      meta: {
        sourceKey,
        targetKey,
        mode,
        relationLabel: compat?.relation_label ?? null,
        score: compat?.score ?? null,
      },
    });
  }

  const prompt = `
あなたはSNSの返信草案を作るアシスタントです。
次の2キャラの相性を踏まえて、返信案を3つ作ってください。

source:
- key: ${sourceKey}
- title: ${sourceTitle}
- talk_style: ${source?.talk_style ?? "(none)"}
- relation_style: ${source?.relation_style ?? "(none)"}
- vibe_tags: ${(source?.vibe_tags ?? []).join(", ") || "(none)"}
- profile_summary: ${sourceProfile.summary}
- tone_guide: ${sourceProfile.toneGuide}
- relation_guide: ${sourceProfile.relationGuide}
- hook: ${sourceProfile.hook}
- avoid: ${sourceProfile.avoid.join(" / ")}

target:
- key: ${targetKey}
- title: ${targetTitle}
- talk_style: ${target?.talk_style ?? "(none)"}
- relation_style: ${target?.relation_style ?? "(none)"}
- vibe_tags: ${(target?.vibe_tags ?? []).join(", ") || "(none)"}
- profile_summary: ${targetProfile.summary}
- tone_guide: ${targetProfile.toneGuide}
- relation_guide: ${targetProfile.relationGuide}
- hook: ${targetProfile.hook}
- avoid: ${targetProfile.avoid.join(" / ")}

compat:
- mode: ${mode}
- relation_label: ${compat?.relation_label ?? "(none)"}
- score: ${compat?.score ?? "(unknown)"}

context topic:
${context || "(none)"}

reply target post body:
${replyToText || "(none)"}

返答は必ずJSONのみ。
{
  "strategy": "返信作成の方針を短く",
  "drafts": ["返信案1", "返信案2", "返信案3"],
  "tips": ["運用上の一言ヒント1", "ヒント2"]
}
`.trim();

  try {
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
              "You are an assistant that returns strict JSON only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.65,
      }),
    });

    const raw = await res.json().catch(() => null);
    const content = raw?.choices?.[0]?.message?.content ?? "";
    const parsed = tryParseJson(String(content));
    if (!parsed || !parsed.drafts.length) {
      return NextResponse.json({
        drafts: fallback.slice(0, 3),
        strategy: "fallback_parse_error",
        tips: [sourceProfile.hook, sourceProfile.relationGuide],
        meta: {
          sourceKey,
          targetKey,
          mode,
          relationLabel: compat?.relation_label ?? null,
          score: compat?.score ?? null,
        },
      });
    }

    return NextResponse.json({
      drafts: parsed.drafts.slice(0, 3),
      strategy: parsed.strategy || "llm",
      tips: parsed.tips ?? [],
      meta: {
        sourceKey,
        targetKey,
        mode,
        relationLabel: compat?.relation_label ?? null,
        score: compat?.score ?? null,
      },
    });
  } catch {
    return NextResponse.json({
      drafts: fallback.slice(0, 3),
      strategy: "fallback_llm_error",
      tips: [sourceProfile.hook, sourceProfile.relationGuide],
      meta: {
        sourceKey,
        targetKey,
        mode,
        relationLabel: compat?.relation_label ?? null,
        score: compat?.score ?? null,
      },
    });
  }
}
