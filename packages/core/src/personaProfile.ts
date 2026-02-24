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
