// apps/web/src/app/api/personas/compat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { buildPersonaProfile } from "@sns/core";

interface CompatRowRaw {
  source_key: string;
  target_key: string;
  kind: string;
  score: number;
  relation_label: string | null;
  mode: string; // DB上には general 等が入っている想定
}

interface PersonaDefRow {
  key: string;
  title: string;
  icon: string | null;
  theme: string | null;
  relation_style: string | null;
  talk_style: string | null;
  blurb: string | null;
  vibe_tags: string[] | null;
}

type QueryMode = "friendship" | "romance";

type CompatDimension = {
  key: "tone" | "empathy" | "tempo" | "playfulness" | "stability";
  label: string;
  score: number;
  note: string;
};

type CompatInsights = {
  chemistryType: string;
  overallScore: number;
  dimensions: CompatDimension[];
  strengths: string[];
  risks: string[];
  prompts: string[];
};

function clamp01(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function toPct(v01: number) {
  return Math.max(0, Math.min(100, Math.round(clamp01(v01) * 100)));
}

function score01(raw: number | null | undefined) {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n)) return 0;
  if (n <= 1) return clamp01(n);
  return clamp01(n / 100);
}

function avg(nums: number[]) {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function profileNumber(p: ReturnType<typeof buildPersonaProfile>) {
  const energy = p.energy === "high" ? 1 : p.energy === "mid" ? 0.5 : 0;
  const empathy = p.empathy === "high" ? 1 : p.empathy === "mid" ? 0.5 : 0;
  const direct = p.directness === "direct" ? 1 : p.directness === "balanced" ? 0.5 : 0;
  const humor = p.humor === "high" ? 1 : p.humor === "mid" ? 0.5 : 0;
  return { energy, empathy, direct, humor };
}

function buildCompatInsights(args: {
  mode: QueryMode;
  source: PersonaDefRow | null;
  target: PersonaDefRow | null;
  sourceKey: string;
  targetKey: string;
  sourceTitle: string;
  targetTitle: string;
  baseScore: number;
}): CompatInsights {
  const sourceProfile = buildPersonaProfile({
    key: args.source?.key ?? args.sourceKey,
    title: args.source?.title ?? args.sourceTitle,
    theme: args.source?.theme ?? null,
    blurb: args.source?.blurb ?? null,
    talkStyle: args.source?.talk_style ?? null,
    relationStyle: args.source?.relation_style ?? null,
    vibeTags: args.source?.vibe_tags ?? [],
  });
  const targetProfile = buildPersonaProfile({
    key: args.target?.key ?? args.targetKey,
    title: args.target?.title ?? args.targetTitle,
    theme: args.target?.theme ?? null,
    blurb: args.target?.blurb ?? null,
    talkStyle: args.target?.talk_style ?? null,
    relationStyle: args.target?.relation_style ?? null,
    vibeTags: args.target?.vibe_tags ?? [],
  });

  const a = profileNumber(sourceProfile);
  const b = profileNumber(targetProfile);

  const tone = clamp01((1 - Math.abs(a.direct - b.direct) * 0.7) * 0.6 + avg([a.empathy, b.empathy]) * 0.4);
  const empathy = clamp01((1 - Math.abs(a.empathy - b.empathy) * 0.5) * 0.5 + avg([a.empathy, b.empathy]) * 0.5);
  const tempo = clamp01((1 - Math.abs(a.energy - b.energy) * 0.7) * 0.55 + (1 - Math.abs(avg([a.energy, b.energy]) - 0.62)) * 0.45);
  const playfulness = clamp01((1 - Math.abs(a.humor - b.humor) * 0.7) * 0.55 + avg([a.humor, b.humor]) * 0.45);
  const stability = clamp01(
    (1 - Math.abs(a.energy - b.energy) * 0.35 - Math.abs(a.direct - b.direct) * 0.35) * 0.65 +
      avg([a.empathy, b.empathy]) * 0.35
  );

  const dims: CompatDimension[] = [
    {
      key: "tone",
      label: "会話トーン",
      score: toPct(tone),
      note: tone >= 0.68 ? "言い回しの噛み合いが良い" : "言い切り方の差を意識すると改善",
    },
    {
      key: "empathy",
      label: "共感同期",
      score: toPct(empathy),
      note: empathy >= 0.7 ? "温度感の同期が取りやすい" : "先に感情を1行添えると安定",
    },
    {
      key: "tempo",
      label: "テンポ整合",
      score: toPct(tempo),
      note: tempo >= 0.68 ? "会話テンポが自然に続きやすい" : "短文/長文の比率を合わせると良い",
    },
    {
      key: "playfulness",
      label: "遊び心",
      score: toPct(playfulness),
      note: playfulness >= 0.65 ? "軽いユーモアが活きる組み合わせ" : "冗談は短く、主題を先に",
    },
    {
      key: "stability",
      label: "安定運用",
      score: toPct(stability),
      note: stability >= 0.72 ? "継続運用で伸びる安定ペア" : "役割分担を先に決めると機能",
    },
  ];

  const dimsAvg = avg(dims.map((d) => d.score / 100));
  const base = score01(args.baseScore);
  const overall = clamp01(base * 0.58 + dimsAvg * 0.42);

  const chemistryType =
    args.mode === "romance"
      ? overall >= 0.82
        ? "運命共鳴型"
        : overall >= 0.68
        ? "安定親密型"
        : overall >= 0.52
        ? "刺激補完型"
        : "挑戦成長型"
      : overall >= 0.82
      ? "高速シンク型"
      : overall >= 0.68
      ? "実務相棒型"
      : overall >= 0.52
      ? "補完バランス型"
      : "改善余地型";

  const topStrengths = dims
    .slice()
    .sort((x, y) => y.score - x.score)
    .slice(0, 2)
    .map((d) => `${d.label}: ${d.note}`);
  const riskDims = dims
    .filter((d) => d.score < 58)
    .sort((x, y) => x.score - y.score)
    .slice(0, 2)
    .map((d) => `${d.label}: ${d.note}`);

  const prompts =
    args.mode === "romance"
      ? [
          `${args.sourceTitle}らしく短く褒めて、${args.targetTitle}に一つ質問する`,
          `感情→事実→問いかけ の3段で返信する`,
          `温度差がある時は「今の気分」を先に共有する`,
        ]
      : [
          `最初にゴールを1行で共有し、役割を分ける`,
          `${args.sourceTitle}は結論担当、${args.targetTitle}は補足担当で進める`,
          `返信末尾に次アクションを1つだけ置く`,
        ];

  return {
    chemistryType,
    overallScore: toPct(overall),
    dimensions: dims,
    strengths: topStrengths.length > 0 ? topStrengths : ["共通トーンを見つけると伸びる組み合わせ"],
    risks: riskDims.length > 0 ? riskDims : ["大きな衝突リスクは低め"],
    prompts,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const sourceKey = searchParams.get("key");
    const modeParam = (searchParams.get("mode") ?? "friendship") as QueryMode;
    const limitParam = searchParams.get("limit");

    if (!sourceKey) {
      return NextResponse.json(
        { error: "missing `key` query param" },
        { status: 400 }
      );
    }

    if (!["friendship", "romance"].includes(modeParam)) {
      return NextResponse.json(
        { error: "invalid `mode` (use friendship|romance)" },
        { status: 400 }
      );
    }

    const limit =
      limitParam && !Number.isNaN(Number(limitParam))
        ? Math.min(Math.max(Number(limitParam), 1), 50)
        : 16;

    // supabaseServer が関数か、そのままクライアントか分からないので両対応
    const raw = supabaseServer as any;
    const supabase = typeof raw === "function" ? await raw() : raw;

    if (!supabase || typeof supabase.from !== "function") {
      throw new Error(
        "supabaseServer から Supabase クライアントを取得できませんでした。" +
          "他の API (/api/feed など) での使い方と同じ形に揃えてください。"
      );
    }

    // ★ ここがポイント：DB の kind(friendship/romance) を使って絞る
    const { data: compatRowsRaw, error: compatError } = await supabase
      .from("persona_compat")
      .select("source_key, target_key, kind, score, relation_label, mode")
      .eq("source_key", sourceKey)
      .eq("kind", modeParam)
      .neq("target_key", sourceKey)
      .order("score", { ascending: false })
      .limit(limit);

    if (compatError) {
      console.error("[persona_compat] error:", compatError);
      return NextResponse.json(
        {
          error: "failed to load compat",
          details: compatError.message,
        },
        { status: 500 }
      );
    }

    const compatRows = (compatRowsRaw ?? []) as CompatRowRaw[];

    if (compatRows.length === 0) {
      return NextResponse.json({
        mode: modeParam,
        sourceKey,
        items: [],
      });
    }

    const targetKeys = [...new Set(compatRows.map((r) => r.target_key))];
    const keysForDefs = [...new Set([sourceKey, ...targetKeys])];

    // 対象キャラの定義を取得
    const { data: personaDefsRaw, error: defsError } = await supabase
      .from("persona_defs")
      .select("key, title, icon, theme, relation_style, talk_style, blurb, vibe_tags")
      .in("key", keysForDefs);

    if (defsError) {
      console.error("[persona_defs] error:", defsError);
      return NextResponse.json(
        {
          error: "failed to load persona defs",
          details: defsError.message,
        },
        { status: 500 }
      );
    }

    const personaDefs = (personaDefsRaw ?? []) as PersonaDefRow[];

    const defMap = new Map<string, PersonaDefRow>();
    personaDefs.forEach((row) => defMap.set(row.key, row));
    const sourceDef = defMap.get(sourceKey) ?? null;

    const items = compatRows.map((row) => {
      const def = defMap.get(row.target_key);
      const title = def?.title ?? row.target_key;
      const sourceTitle = sourceDef?.title ?? sourceKey;
      const insights = buildCompatInsights({
        mode: modeParam,
        source: sourceDef,
        target: def ?? null,
        sourceKey,
        targetKey: row.target_key,
        sourceTitle,
        targetTitle: title,
        baseScore: row.score,
      });
      return {
        targetKey: row.target_key,
        kind: row.kind, // friendship / romance
        score: row.score,
        relationLabel: row.relation_label,
        title,
        icon: def?.icon ?? null,
        theme: def?.theme ?? null,
        relationStyle: def?.relation_style ?? null,
        vibeTags: def?.vibe_tags ?? [],
        insights,
        // DB の mode は今のところ 'general' 固定なので返さない
      };
    });

    return NextResponse.json({
      mode: modeParam,
      sourceKey,
      items,
    });
  } catch (err: any) {
    console.error("[persona_compat API] fatal error", err);
    return NextResponse.json(
      {
        error: "internal_error",
        details: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}
