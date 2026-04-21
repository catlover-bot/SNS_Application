export type PersonaProfileInput = {
  key?: string | null;
  title?: string | null;
  theme?: string | null;
  blurb?: string | null;
  talkStyle?: string | null;
  relationStyle?: string | null;
  vibeTags?: string[] | null;
};

export type PersonaProfile = {
  energy: "low" | "mid" | "high";
  empathy: "low" | "mid" | "high";
  directness: "soft" | "balanced" | "direct";
  humor: "low" | "mid" | "high";
  summary: string;
  toneGuide: string;
  relationGuide: string;
  hook: string;
  avoid: string[];
  keywords: string[];
};

export type PersonaPostingGuide = {
  summary: string;
  recommendedFormats: Array<{
    key: "normal" | "short" | "story";
    label: string;
    reason: string;
  }>;
  recommendedTimeBuckets: Array<{
    key: "late_night" | "morning" | "daytime" | "evening";
    label: string;
    reason: string;
  }>;
  attachmentHints: string[];
  hookExamples: string[];
  cautionNotes: string[];
  buddyStrategy: string;
};

function normalizeText(raw: string) {
  return raw.toLowerCase().replace(/\s+/g, " ").trim();
}

function includesAny(text: string, words: string[]) {
  return words.some((w) => text.includes(w));
}

function toBand(value: number, low = -1, high = 1): "low" | "mid" | "high" {
  if (value <= low) return "low";
  if (value >= high) return "high";
  return "mid";
}

function toDirectness(value: number): "soft" | "balanced" | "direct" {
  if (value <= -1) return "soft";
  if (value >= 1) return "direct";
  return "balanced";
}

function energyLabel(v: PersonaProfile["energy"]) {
  if (v === "high") return "テンポ速め";
  if (v === "low") return "落ち着き重視";
  return "バランス型";
}

function empathyLabel(v: PersonaProfile["empathy"]) {
  if (v === "high") return "共感先行";
  if (v === "low") return "事実優先";
  return "状況適応";
}

function directnessLabel(v: PersonaProfile["directness"]) {
  if (v === "direct") return "結論先出し";
  if (v === "soft") return "クッション表現";
  return "端的に調整";
}

function humorLabel(v: PersonaProfile["humor"]) {
  if (v === "high") return "軽いユーモア";
  if (v === "low") return "真面目寄り";
  return "時々ユーモア";
}

export function buildPersonaProfile(input: PersonaProfileInput): PersonaProfile {
  const tags = (input.vibeTags ?? []).filter(Boolean);
  const text = normalizeText(
    [
      input.key ?? "",
      input.title ?? "",
      input.theme ?? "",
      input.blurb ?? "",
      input.talkStyle ?? "",
      input.relationStyle ?? "",
      ...tags,
    ].join(" ")
  );

  let energyScore = 0;
  let empathyScore = 0;
  let directScore = 0;
  let humorScore = 0;

  if (includesAny(text, ["chaos", "カオス", "勢い", "テンション", "爆速", "陽"])) energyScore += 2;
  if (includesAny(text, ["quiet", "静か", "穏やか", "落ち着", "丁寧", "ゆっくり"])) energyScore -= 2;
  if (includesAny(text, ["social", "社交", "フットワーク", "即レス"])) energyScore += 1;

  if (includesAny(text, ["やさし", "寄り添", "共感", "傾聴", "気遣", "包容"])) empathyScore += 2;
  if (includesAny(text, ["logic", "論理", "分析", "合理", "結論", "効率"])) empathyScore -= 1;
  if (includesAny(text, ["攻め", "煽", "挑発"])) empathyScore -= 2;

  if (includesAny(text, ["結論", "端的", "ストレート", "即断", "断言"])) directScore += 2;
  if (includesAny(text, ["婉曲", "柔らか", "控えめ", "丁寧"])) directScore -= 2;

  if (includesAny(text, ["ユーモア", "ボケ", "ツッコミ", "冗談", "笑い", "comic", "tease", "trickster"])) {
    humorScore += 2;
  }
  if (includesAny(text, ["sage", "judge", "formal", "堅め"])) humorScore -= 1;

  const theme = (input.theme ?? "").toLowerCase();
  if (theme === "chaos") {
    energyScore += 1;
    humorScore += 1;
  } else if (theme === "logic") {
    directScore += 1;
    empathyScore -= 1;
  } else if (theme === "social") {
    empathyScore += 1;
    energyScore += 1;
  }

  const energy = toBand(energyScore);
  const empathy = toBand(empathyScore);
  const directness = toDirectness(directScore);
  const humor = toBand(humorScore);

  const summary = `${energyLabel(energy)}・${empathyLabel(empathy)}・${directnessLabel(directness)}・${humorLabel(humor)}`;
  const toneGuide = `${energy === "high" ? "短文でテンポ良く" : energy === "low" ? "1文を少し長めに丁寧に" : "1〜2文で簡潔に"}、${
    directness === "direct" ? "結論を先に置く" : directness === "soft" ? "前置きで角を取る" : "要点から入る"
  }`;
  const relationGuide =
    empathy === "high"
      ? "相手の感情を先に受け止めてから提案する"
      : empathy === "low"
      ? "事実と選択肢を先に示して判断を促す"
      : "感情と事実を1つずつ並べて会話する";

  const hook =
    humor === "high"
      ? "一言ユーモア + 具体質問"
      : directness === "direct"
      ? "結論 + 理由1つ + 問い返し"
      : "共感フレーズ + 短い提案";

  const avoid = [
    energy === "high" ? "連続投稿で圧をかけ過ぎる" : "温度感が低すぎる導入",
    empathy === "low" ? "相手感情を飛ばして結論だけ言う" : "共感しすぎて結論が曖昧になる",
    directness === "direct" ? "断定口調の連発" : "遠回しすぎる表現",
    humor === "high" ? "内輪ネタの多用" : "硬すぎて反応余地がない文",
  ];

  const keywords = tags.slice(0, 6);

  return {
    energy,
    empathy,
    directness,
    humor,
    summary,
    toneGuide,
    relationGuide,
    hook,
    avoid,
    keywords,
  };
}

export function buildPersonaPostingGuide(input: PersonaProfileInput): PersonaPostingGuide {
  const profile = buildPersonaProfile(input);
  const theme = String(input.theme ?? "").toLowerCase();
  const keyText = normalizeText([input.key ?? "", input.title ?? "", ...(input.vibeTags ?? [])].join(" "));

  const formatScores = new Map<"normal" | "short" | "story", number>([
    ["normal", 0],
    ["short", 0],
    ["story", 0],
  ]);
  if (profile.directness === "direct") formatScores.set("short", (formatScores.get("short") ?? 0) + 2);
  if (profile.empathy === "high") formatScores.set("story", (formatScores.get("story") ?? 0) + 2);
  if (profile.energy === "high") formatScores.set("short", (formatScores.get("short") ?? 0) + 1.5);
  if (profile.energy === "low") formatScores.set("normal", (formatScores.get("normal") ?? 0) + 1.5);
  if (profile.humor === "high") formatScores.set("short", (formatScores.get("short") ?? 0) + 1);
  if (theme === "logic") formatScores.set("normal", (formatScores.get("normal") ?? 0) + 2);
  if (theme === "social") formatScores.set("story", (formatScores.get("story") ?? 0) + 1);
  if (theme === "chaos") formatScores.set("short", (formatScores.get("short") ?? 0) + 1.5);

  const formatReasons: Record<"normal" | "short" | "story", string> = {
    normal:
      profile.energy === "low" || theme === "logic"
        ? "説明量を出しやすく、信頼・説得に向きます。"
        : "文脈と温度感の両方を出しやすい基本フォーマットです。",
    short:
      profile.directness === "direct" || profile.energy === "high"
        ? "結論先出し・勢いのある一言が刺さりやすいです。"
        : "反応を取りにいく入口投稿として使いやすいです。",
    story:
      profile.empathy === "high"
        ? "感情の流れや距離感を見せるのに相性が良いです。"
        : "近況や舞台裏を軽く出して親近感を作れます。",
  };

  const recommendedFormats = Array.from(formatScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([key]) => ({
      key,
      label: key === "normal" ? "通常投稿" : key === "short" ? "短尺投稿" : "Story",
      reason: formatReasons[key],
    }));

  const timeScores = new Map<"late_night" | "morning" | "daytime" | "evening", number>([
    ["late_night", 0],
    ["morning", 0],
    ["daytime", 0],
    ["evening", 0],
  ]);
  if (profile.energy === "high") timeScores.set("evening", (timeScores.get("evening") ?? 0) + 2);
  if (profile.energy === "high") timeScores.set("late_night", (timeScores.get("late_night") ?? 0) + 1);
  if (profile.energy === "low") timeScores.set("morning", (timeScores.get("morning") ?? 0) + 1.5);
  if (profile.directness === "direct") timeScores.set("daytime", (timeScores.get("daytime") ?? 0) + 1.2);
  if (profile.empathy === "high") timeScores.set("evening", (timeScores.get("evening") ?? 0) + 1.2);
  if (theme === "logic") timeScores.set("daytime", (timeScores.get("daytime") ?? 0) + 1.8);
  if (theme === "social") timeScores.set("evening", (timeScores.get("evening") ?? 0) + 1.4);
  if (theme === "chaos") timeScores.set("late_night", (timeScores.get("late_night") ?? 0) + 1.8);

  const timeLabels = {
    late_night: "深夜",
    morning: "朝",
    daytime: "昼",
    evening: "夜",
  } as const;
  const timeReasons: Record<keyof typeof timeLabels, string> = {
    late_night:
      profile.energy === "high"
        ? "テンション高め・短文系が自然に受け入れられやすい時間帯です。"
        : "近況や本音を短く出すと反応が取りやすい時間帯です。",
    morning: "丁寧な一言・段取り系の投稿が読みやすい時間帯です。",
    daytime: "説明・比較・判断材料を含む投稿が機能しやすい時間帯です。",
    evening: "会話・共感・雑談寄りの投稿が広がりやすい時間帯です。",
  };
  const recommendedTimeBuckets = Array.from(timeScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([key]) => ({
      key,
      label: timeLabels[key],
      reason: timeReasons[key],
    }));

  const attachmentHints = [
    profile.directness === "direct" || theme === "logic"
      ? "URL/根拠リンクを添えると信頼感を維持しやすい"
      : "画像1枚で温度感を補うと刺さりやすい",
    profile.humor === "high" || profile.energy === "high"
      ? "短尺/動画を使う場合は一言のオチを先に置く"
      : "画像やURLは本文の要点を1行で補足する",
  ];

  const hookExamples = [
    `${profile.hook}`,
    profile.directness === "direct"
      ? "結論から言うと、今日はこれでいく。"
      : profile.empathy === "high"
        ? "それ分かる。先に気持ちだけ言うと…"
        : "まず状況を1つだけ共有すると…",
    keyText.includes("idol") || keyText.includes("stream") || keyText.includes("creator")
      ? "一言リアクション + 次の行動を添える"
      : "理由1つ + 質問1つで締める",
  ];

  const cautionNotes = Array.from(new Set(profile.avoid)).slice(0, 3);
  const buddyStrategy =
    profile.empathy === "high"
      ? "相性キャラは“結論役”を合わせると会話が締まりやすい"
      : profile.directness === "direct"
        ? "相性キャラは“共感役”を合わせると反応率が安定しやすい"
        : "相性キャラは“勢い役”を合わせると拡散寄りになりやすい";

  return {
    summary: `${recommendedFormats.map((x) => x.label).join(" / ")} を軸に、${recommendedTimeBuckets
      .map((x) => x.label)
      .join("・")}に出すと相性が出やすいキャラです。`,
    recommendedFormats,
    recommendedTimeBuckets,
    attachmentHints,
    hookExamples,
    cautionNotes,
    buddyStrategy,
  };
}
