import { buildPersonaProfile } from "./personaProfile";

export type PersonaBuzzInput = {
  text: string;
  personaKey?: string | null;
  personaTitle?: string | null;
  personaTheme?: string | null;
  vibeTags?: string[] | null;
};

export type PersonaBuzzMetricKey = "hook" | "emotion" | "novelty" | "cta" | "character";

export type PersonaBuzzMetric = {
  key: PersonaBuzzMetricKey;
  label: string;
  score: number;
  note: string;
};

export type PersonaBuzzResult = {
  score: number;
  level: "seed" | "spark" | "wave" | "viral";
  metrics: PersonaBuzzMetric[];
  tips: string[];
  hashtags: string[];
  replyPrompt: string;
};

export type PersonaRewriteVariantKey = "aggressive" | "empathetic" | "short";

export type PersonaRewriteVariant = {
  key: PersonaRewriteVariantKey;
  label: string;
  text: string;
  intent: string;
};

export type PersonaBlendInput = {
  text: string;
  primary: PersonaBuzzInput;
  secondary: PersonaBuzzInput;
  mixRatio?: number; // 0..1 (primary share)
  maxLength?: number;
};

export type PersonaBlendRewrite = PersonaRewriteVariant & {
  primaryShare: number;
  secondaryShare: number;
};

export type PersonaReactionStats = {
  likes?: number | null;
  replies?: number | null;
  boosts?: number | null;
  saves?: number | null;
};

export type PersonaCalibrationStat = {
  samples: number;
  predictedAvg: number;
  actualAvg: number;
  multiplier: number;
  confidence: number;
};

function clamp(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function normalizeText(raw: string) {
  return raw.toLowerCase().replace(/\s+/g, " ").trim();
}

function toPct01(v: number) {
  return Math.round(clamp(v, 0, 1) * 100);
}

function includesAny(text: string, words: string[]) {
  return words.some((w) => text.includes(w));
}

function scoreHook(text: string) {
  const normalized = normalizeText(text);
  const head = normalized.slice(0, 28);
  const len = normalized.replace(/\s+/g, "").length;
  const hotWords = [
    "実は",
    "結論",
    "速報",
    "検証",
    "注意",
    "裏技",
    "まさか",
    "朗報",
    "悲報",
    "正直",
    "失敗",
    "成功",
    "before",
    "after",
  ];

  let raw = 0.34;
  if (includesAny(head, hotWords)) raw += 0.3;
  if (head.includes("？") || head.includes("?")) raw += 0.18;
  if (len >= 24 && len <= 130) raw += 0.18;
  if (len < 10) raw -= 0.14;
  if (len > 220) raw -= 0.16;

  return clamp(raw, 0, 1);
}

function scoreEmotion(text: string) {
  const normalized = normalizeText(text);
  const emotionalWords = [
    "嬉しい",
    "最高",
    "好き",
    "やばい",
    "泣いた",
    "感動",
    "つらい",
    "神",
    "尊い",
    "悔しい",
    "ありがとう",
  ];
  const exclamationCount = (text.match(/[!！]/g) ?? []).length;
  let raw = 0.28 + Math.min(0.18, exclamationCount * 0.05);
  if (includesAny(normalized, emotionalWords)) raw += 0.32;
  if (normalized.includes("w") || normalized.includes("笑")) raw += 0.08;
  return clamp(raw, 0, 1);
}

function scoreNovelty(text: string) {
  const normalized = normalizeText(text);
  const contrastWords = ["でも", "なのに", "一方で", "実験", "比較", "検証", "意外", "逆に", "しかし"];
  const hasNumber = /\d/.test(text);
  const hasList = /[1-9][\.\)]/.test(text) || /①|②|③/.test(text);
  let raw = 0.3;
  if (hasNumber) raw += 0.26;
  if (hasList) raw += 0.16;
  if (includesAny(normalized, contrastWords)) raw += 0.24;
  return clamp(raw, 0, 1);
}

function scoreCta(text: string) {
  const normalized = normalizeText(text);
  const ctaWords = ["どう思う", "どうする", "教えて", "みんな", "あなたは", "どっち", "賛成", "反対"];
  let raw = 0.18;
  if (text.includes("?") || text.includes("？")) raw += 0.34;
  if (includesAny(normalized, ctaWords)) raw += 0.38;
  return clamp(raw, 0, 1);
}

function scoreCharacter(text: string, input: PersonaBuzzInput) {
  const normalized = normalizeText(text);
  const personaKey = String(input.personaKey ?? "").toLowerCase().trim();
  const personaTitle = normalizeText(String(input.personaTitle ?? ""));
  const personaTheme = normalizeText(String(input.personaTheme ?? ""));
  const tags = (input.vibeTags ?? []).map((x) => normalizeText(String(x))).filter(Boolean);

  if (!personaKey && !personaTitle) return 0.55;

  let raw = 0.24;
  if (personaKey && normalized.includes(personaKey)) raw += 0.26;
  if (personaTitle && normalized.includes(personaTitle)) raw += 0.26;
  if (personaTheme && normalized.includes(personaTheme)) raw += 0.18;
  if (tags.some((t) => normalized.includes(t))) raw += 0.22;
  return clamp(raw, 0, 1);
}

function levelFromScore(score: number): PersonaBuzzResult["level"] {
  if (score >= 82) return "viral";
  if (score >= 68) return "wave";
  if (score >= 52) return "spark";
  return "seed";
}

function cleanHashtagToken(raw: string) {
  return raw
    .replace(/[^0-9A-Za-zぁ-んァ-ヶ一-龯々〆〤ー_]+/g, "")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
}

function extractKeywordTokens(text: string) {
  const matches = text.match(/[A-Za-z0-9_]{3,}|[ぁ-んァ-ヶ一-龯々〆〤ー]{2,8}/g) ?? [];
  const stop = new Set(["これ", "それ", "今日", "明日", "です", "ます", "こと", "する", "した", "して", "ある"]);
  return uniq(
    matches
      .map((x) => cleanHashtagToken(x))
      .filter((x) => x.length >= 2 && !stop.has(x.toLowerCase()))
  );
}

function buildReplyPrompt(scoreCtaPct: number, personaTone: string) {
  if (scoreCtaPct < 45) {
    return "あなたならどうする？ 1行で教えて。";
  }
  if (personaTone === "direct") {
    return "賛成/反対どっち？ 理由も一言で。";
  }
  return "同じ経験ある人、最初の一歩だけ教えて。";
}

function metricNote(score: number, high: string, low: string) {
  return score >= 62 ? high : low;
}

function normalizeSpaces(raw: string) {
  return raw.replace(/\s+/g, " ").trim();
}

function trimToMax(raw: string, max: number) {
  const text = normalizeSpaces(raw);
  if (text.length <= max) return text;
  if (max <= 1) return text.slice(0, Math.max(0, max));
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function splitSentences(raw: string) {
  return String(raw ?? "")
    .split(/[\n。!?！？]/g)
    .map((x) => normalizeSpaces(x))
    .filter(Boolean);
}

function mergeBlendText(args: {
  primaryText: string;
  secondaryText: string;
  primaryShare: number;
  maxLength: number;
}) {
  const p = splitSentences(args.primaryText);
  const s = splitSentences(args.secondaryText);
  const pLead = p[0] ?? normalizeSpaces(args.primaryText);
  const sLead = s[0] ?? normalizeSpaces(args.secondaryText);
  const pTail = p[1] ?? "";
  const sTail = s[1] ?? "";

  const primaryMain = args.primaryShare >= 0.5;
  const primaryLeadShare = args.primaryShare >= 0.66;
  const secondaryLeadShare = args.primaryShare <= 0.34;

  let lead = primaryMain ? pLead : sLead;
  let sub = primaryMain ? sLead : pLead;
  let tail = primaryMain ? pTail : sTail;

  if (primaryLeadShare) {
    lead = pLead;
    sub = sLead;
    tail = pTail || sTail;
  } else if (secondaryLeadShare) {
    lead = sLead;
    sub = pLead;
    tail = sTail || pTail;
  }

  const merged = normalizeSpaces([lead, sub, tail].filter(Boolean).join("。"));
  return trimToMax(merged || normalizeSpaces(args.primaryText), args.maxLength);
}

export function extractPersonaKeyFromAnalysis(analysis: any): string | null {
  const selected = String(analysis?.persona?.selected ?? "").trim();
  if (selected) return selected;
  const candidate = String(analysis?.persona?.candidates?.[0]?.key ?? "").trim();
  return candidate || null;
}

export function extractBuzzScoreFromAnalysis(analysis: any, fallback = 0.5): number {
  const raw = Number(analysis?.buzz?.score ?? NaN);
  if (Number.isFinite(raw)) {
    if (raw <= 1) return clamp(raw, 0, 1);
    return clamp(raw / 100, 0, 1);
  }
  const metricLike = Number(analysis?.score ?? NaN);
  if (Number.isFinite(metricLike)) {
    if (metricLike <= 1) return clamp(metricLike, 0, 1);
    return clamp(metricLike / 100, 0, 1);
  }
  return clamp(fallback, 0, 1);
}

export function computePersonaActualEngagementScore(stats: PersonaReactionStats): number {
  const likes = Math.max(0, Number(stats.likes ?? 0) || 0);
  const replies = Math.max(0, Number(stats.replies ?? 0) || 0);
  const boosts = Math.max(0, Number(stats.boosts ?? 0) || 0);
  const saves = Math.max(0, Number(stats.saves ?? 0) || 0);
  const raw =
    Math.log1p(likes) * 1.0 +
    Math.log1p(replies) * 1.35 +
    Math.log1p(boosts) * 1.2 +
    Math.log1p(saves) * 0.95;
  return clamp(1 - Math.exp(-raw * 0.33), 0, 1);
}

export function computePersonaCalibrationStat(args: {
  samples: number;
  predictedAvg: number;
  actualAvg: number;
}): PersonaCalibrationStat {
  const samples = Math.max(0, Math.floor(Number(args.samples ?? 0) || 0));
  const predictedAvg = clamp(Number(args.predictedAvg ?? 0.5), 0, 1);
  const actualAvg = clamp(Number(args.actualAvg ?? 0.2), 0, 1);

  const priorWeight = 8;
  const priorPred = 0.35;
  const priorActual = 0.2;
  const pred = (predictedAvg * samples + priorPred * priorWeight) / (samples + priorWeight);
  const act = (actualAvg * samples + priorActual * priorWeight) / (samples + priorWeight);
  const ratio = pred <= 1e-6 ? 1 : act / pred;
  const multiplier = clamp(ratio, 0.72, 1.38);
  const confidence = clamp(Math.log1p(samples) / Math.log1p(40), 0, 1);

  return {
    samples,
    predictedAvg,
    actualAvg,
    multiplier,
    confidence,
  };
}

export function applyPersonaCalibration(
  baseScore01: number,
  stat: PersonaCalibrationStat | null | undefined
): number {
  const base = clamp(baseScore01, 0, 1);
  if (!stat) return base;
  const m = clamp(Number(stat.multiplier ?? 1), 0.72, 1.38);
  const confidence = clamp(Number(stat.confidence ?? 0), 0, 1);
  const adjusted = base * (1 + (m - 1) * confidence);
  return clamp(adjusted, 0, 1);
}

export function buildPersonaRewrites(
  input: PersonaBuzzInput & {
    maxLength?: number;
    diagnostic?: PersonaBuzzResult | null;
  }
): PersonaRewriteVariant[] {
  const rawText = String(input.text ?? "").trim();
  if (!rawText) return [];

  const maxLength = Math.max(40, Math.min(560, Math.floor(Number(input.maxLength ?? 280) || 280)));
  const diagnosis = input.diagnostic ?? analyzePersonaBuzz(input);
  const profile = buildPersonaProfile({
    key: input.personaKey ?? null,
    title: input.personaTitle ?? null,
    theme: input.personaTheme ?? null,
    vibeTags: input.vibeTags ?? [],
  });
  const base = normalizeSpaces(rawText);
  const firstSentence = normalizeSpaces(base.split(/[\n。!?！？]/)[0] ?? base);
  const shortCore = trimToMax(firstSentence || base, Math.min(72, Math.max(36, maxLength - 16)));
  const replyPrompt = diagnosis.replyPrompt || "あなたはどう思う？";

  const aggressiveHook = diagnosis.score < 60 ? "結論から言うと、" : "正直、";
  const aggressive = trimToMax(
    `${aggressiveHook}${base}${base.endsWith("。") ? "" : "。"}${replyPrompt}`,
    maxLength
  );

  const empathyLead =
    profile.empathy === "high"
      ? "わかる人、多いと思う。"
      : profile.directness === "soft"
      ? "押しつけたいわけじゃないけど、"
      : "状況はそれぞれだけど、";
  const empathetic = trimToMax(
    `${empathyLead}${base}${base.endsWith("。") ? "" : "。"}無理のない範囲で、あなたの考えも聞かせて。`,
    maxLength
  );

  const shortTail =
    diagnosis.metrics.find((m) => m.key === "cta")?.score ?? 0 >= 60
      ? ""
      : " どう思う？";
  const short = trimToMax(`${shortCore}${shortTail}`, Math.min(maxLength, 120));

  return [
    {
      key: "aggressive",
      label: "攻め",
      text: aggressive,
      intent: "結論を先に出して反応を取りに行く",
    },
    {
      key: "empathetic",
      label: "共感",
      text: empathetic,
      intent: "感情受容を先に置いて返信ハードルを下げる",
    },
    {
      key: "short",
      label: "短文",
      text: short,
      intent: "一読で要点が伝わる短文に圧縮する",
    },
  ];
}

export function buildPersonaBlendRewrites(input: PersonaBlendInput): PersonaBlendRewrite[] {
  const text = String(input.text ?? "").trim();
  if (!text) return [];

  const primaryShare = clamp(Number(input.mixRatio ?? 0.5), 0, 1);
  const secondaryShare = 1 - primaryShare;
  const maxLength = Math.max(40, Math.min(560, Math.floor(Number(input.maxLength ?? 280) || 280)));

  const primaryRewrites = buildPersonaRewrites({
    ...input.primary,
    text,
    maxLength,
  });
  const secondaryRewrites = buildPersonaRewrites({
    ...input.secondary,
    text,
    maxLength,
  });
  if (!primaryRewrites.length || !secondaryRewrites.length) return [];

  const secondaryByKey = new Map(
    secondaryRewrites.map((r) => [r.key, r] as [PersonaRewriteVariantKey, PersonaRewriteVariant])
  );

  return primaryRewrites.map((primary) => {
    const secondary = secondaryByKey.get(primary.key) ?? secondaryRewrites[0];
    const merged = mergeBlendText({
      primaryText: primary.text,
      secondaryText: secondary.text,
      primaryShare,
      maxLength,
    });
    return {
      key: primary.key,
      label: `${primary.label} (ブレンド)`,
      text: merged,
      intent: `${primary.intent} / 2キャラ混合`,
      primaryShare,
      secondaryShare,
    };
  });
}

export function analyzePersonaBuzz(input: PersonaBuzzInput): PersonaBuzzResult {
  const text = String(input.text ?? "").trim();
  if (!text) {
    return {
      score: 0,
      level: "seed",
      metrics: [
        { key: "hook", label: "冒頭フック", score: 0, note: "冒頭で驚き/結論を置く" },
        { key: "emotion", label: "感情温度", score: 0, note: "感情語を1つ入れる" },
        { key: "novelty", label: "新規性", score: 0, note: "数字や対比を入れる" },
        { key: "cta", label: "反応導線", score: 0, note: "最後に質問を置く" },
        { key: "character", label: "キャラ一貫性", score: 0, note: "キャラ語彙を入れる" },
      ],
      tips: ["本文を入力すると診断できます。"],
      hashtags: [],
      replyPrompt: "あなたならどうする？ 1行で教えて。",
    };
  }

  const hook = toPct01(scoreHook(text));
  const emotion = toPct01(scoreEmotion(text));
  const novelty = toPct01(scoreNovelty(text));
  const cta = toPct01(scoreCta(text));
  const character = toPct01(scoreCharacter(text, input));

  const weighted =
    hook * 0.24 + emotion * 0.18 + novelty * 0.2 + cta * 0.2 + character * 0.18;
  const score = Math.round(clamp(weighted, 0, 100));

  const personaProfile = buildPersonaProfile({
    key: input.personaKey ?? null,
    title: input.personaTitle ?? null,
    theme: input.personaTheme ?? null,
    vibeTags: input.vibeTags ?? [],
  });

  const tips: string[] = [];
  if (hook < 60) tips.push("冒頭12文字で結論か驚きを先出しする。");
  if (emotion < 55) tips.push("感情語を1語だけ追加して温度を上げる。");
  if (novelty < 60) tips.push("数字1つ or 対比1つを入れて新規性を作る。");
  if (cta < 58) tips.push("末尾を質問に変えて返信導線を作る。");
  if (character < 62 && input.personaKey) {
    tips.push(`@${input.personaKey} らしい語彙を1つ入れて一貫性を出す。`);
  }
  tips.push(`トーン指針: ${personaProfile.toneGuide}`);

  const baseTags = extractKeywordTokens(text).slice(0, 3);
  const personaTags = [
    cleanHashtagToken(String(input.personaKey ?? "")),
    cleanHashtagToken(String(input.personaTitle ?? "")),
  ].filter((x) => x.length >= 2);
  const hashtags = uniq([...personaTags, ...baseTags]).slice(0, 4).map((x) => `#${x}`);

  return {
    score,
    level: levelFromScore(score),
    metrics: [
      {
        key: "hook",
        label: "冒頭フック",
        score: hook,
        note: metricNote(hook, "冒頭で関心を取りに行けています", "冒頭の引きをもう1段強くする"),
      },
      {
        key: "emotion",
        label: "感情温度",
        score: emotion,
        note: metricNote(emotion, "感情の乗りが伝わっています", "感情の単語を1つ追加する"),
      },
      {
        key: "novelty",
        label: "新規性",
        score: novelty,
        note: metricNote(novelty, "比較/具体が効いています", "数字や比較で差分を作る"),
      },
      {
        key: "cta",
        label: "反応導線",
        score: cta,
        note: metricNote(cta, "返信を誘う終わり方です", "問いかけで会話の入口を作る"),
      },
      {
        key: "character",
        label: "キャラ一貫性",
        score: character,
        note: metricNote(character, "キャラ性が投稿に乗っています", "キャラ語彙の明示を増やす"),
      },
    ],
    tips: uniq(tips).slice(0, 5),
    hashtags,
    replyPrompt: buildReplyPrompt(cta, personaProfile.directness),
  };
}
