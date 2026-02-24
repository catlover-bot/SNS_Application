export type ScoreInput =
  | { text: string }
  | { tokens: string[] };

export type LieScoreFactorKey =
  | "shortness"
  | "hype_density"
  | "punct_energy"
  | "specificity"
  | "hedge_soften";

export type LieScoreFactor = {
  key: LieScoreFactorKey;
  label: string;
  value: number; // 0..1
  direction: "up" | "down";
  weight: number;
  contribution: number;
};

export type LieScoreAnalysis = {
  score: number;
  level: "low" | "mid" | "high";
  reasons: string[];
  cautionChips: string[];
  reliefChips: string[];
  factors: LieScoreFactor[];
};

export type LieScoreFeedback = {
  opens?: number | null;
  replies?: number | null;
  reports?: number | null;
  truthTrueVotes?: number | null;
  truthFalseVotes?: number | null;
};

export type LieScoreCalibratedAnalysis = LieScoreAnalysis & {
  baseScore: number;
  adjustment: number;
  feedbackSignals: {
    opens: number;
    replies: number;
    reports: number;
    truthTrueVotes: number;
    truthFalseVotes: number;
    replyRate: number | null;
    reportRate: number | null;
    falseVoteRate: number | null;
    voteConfidence: number;
  };
  feedbackReasons: string[];
};

function clamp(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function countMatches(text: string, re: RegExp) {
  return (text.match(re) || []).length;
}

function normalizeText(raw: string) {
  return String(raw ?? "").trim();
}

export function analyzeLieScore(input: ScoreInput): LieScoreAnalysis {
  const text =
    "text" in input ? input.text :
    "tokens" in input ? input.tokens.join(" ") : "";
  const normalized = normalizeText(text);
  const low = normalized.toLowerCase();
  const len = Math.max(1, normalized.length);

  // 1) 文章長: 短文ほど文脈不足で不確実性が上がる
  const shortness = clamp((52 - len) / 52, 0, 1);

  // 2) 強い断定/誇張語（日本語・英語）
  const hypeWords =
    countMatches(
      normalized,
      /絶対|必ず|確実|断言|最強|世界一|史上|神|奇跡|運命|秒速|100%|完全に|マジ|やば(?:い|すぎ)?|ヤバ(?:い|すぎ)?|超+|盛れた|爆盛れ/g
    ) +
    countMatches(low, /\b(never fail|guaranteed|best ever|insane|literally)\b/g);
  const hypeDensity = clamp(hypeWords / Math.max(1, len / 18), 0, 1);

  // 3) 記号テンション
  const exclam = countMatches(normalized, /!|！/g);
  const questions = countMatches(normalized, /\?|？/g);
  const punctEnergy = clamp((exclam * 1.2 + questions * 0.35) / Math.max(1, len / 14), 0, 1);

  // 4) 具体性が高いと嘘っぽさを少し下げる
  const numeric = countMatches(normalized, /\d+/g);
  const detailWords = countMatches(
    normalized,
    /(?:分|時間|時|日|週|月|年|円|人|件|回|km|kg|%|URL|http|https|ソース|引用|検証)/gi
  );
  const specificity = clamp((numeric * 0.7 + detailWords * 0.45) / Math.max(1, len / 20), 0, 1);

  // 5) 断定を弱める語（ヘッジ）があると少し下げる
  const hedge = countMatches(
    normalized,
    /たぶん|かも|気がする|かもしれない|と思う|っぽい|らしい|未確認|仮説|推測/g
  );
  const hedgeSoften = clamp(hedge / Math.max(1, len / 24), 0, 1);

  const factors: LieScoreFactor[] = [
    {
      key: "shortness",
      label: "短文",
      value: shortness,
      direction: "up",
      weight: 0.25,
      contribution: shortness * 0.25,
    },
    {
      key: "hype_density",
      label: "誇張語",
      value: hypeDensity,
      direction: "up",
      weight: 0.36,
      contribution: hypeDensity * 0.36,
    },
    {
      key: "punct_energy",
      label: "記号テンション",
      value: punctEnergy,
      direction: "up",
      weight: 0.2,
      contribution: punctEnergy * 0.2,
    },
    {
      key: "specificity",
      label: "具体性",
      value: specificity,
      direction: "down",
      weight: -0.14,
      contribution: -specificity * 0.14,
    },
    {
      key: "hedge_soften",
      label: "断定緩和",
      value: hedgeSoften,
      direction: "down",
      weight: -0.09,
      contribution: -hedgeSoften * 0.09,
    },
  ];

  const raw = 0.12 + factors.reduce((sum, f) => sum + f.contribution, 0);
  const score = clamp(raw, 0, 1);
  const level: LieScoreAnalysis["level"] = score >= 0.67 ? "high" : score >= 0.38 ? "mid" : "low";

  const reasons: string[] = [];
  const cautionChips: string[] = [];
  const reliefChips: string[] = [];

  if (hypeDensity >= 0.35) {
    reasons.push("誇張・断定語が多く、印象先行に見えやすいです。");
    cautionChips.push("誇張語多め");
  }
  if (punctEnergy >= 0.35) {
    reasons.push("記号テンションが強く、煽り寄りに見える可能性があります。");
    cautionChips.push("記号強め");
  }
  if (shortness >= 0.45) {
    reasons.push("短文で根拠が少なく、文脈不足に見えやすいです。");
    cautionChips.push("短文");
  }
  if (specificity >= 0.28) {
    reasons.push("数値や具体的な情報があり、信頼感を補強しています。");
    reliefChips.push("具体性あり");
  }
  if (hedgeSoften >= 0.22) {
    reasons.push("断定を弱める表現があり、言い切り感が緩和されています。");
    reliefChips.push("断定緩和");
  }
  if (reasons.length === 0) {
    reasons.push("誇張・断定・具体性のバランスは中立的です。");
  }

  return {
    score,
    level,
    reasons: reasons.slice(0, 3),
    cautionChips: cautionChips.slice(0, 3),
    reliefChips: reliefChips.slice(0, 3),
    factors,
  };
}

export function computeLieScore(input: ScoreInput): number {
  return analyzeLieScore(input).score;
}

export function calibrateLieScoreWithFeedback(
  base: LieScoreAnalysis,
  feedback?: LieScoreFeedback | null
): LieScoreCalibratedAnalysis {
  const opens = Math.max(0, Math.floor(Number(feedback?.opens ?? 0) || 0));
  const replies = Math.max(0, Math.floor(Number(feedback?.replies ?? 0) || 0));
  const reports = Math.max(0, Math.floor(Number(feedback?.reports ?? 0) || 0));
  const truthTrueVotes = Math.max(0, Math.floor(Number(feedback?.truthTrueVotes ?? 0) || 0));
  const truthFalseVotes = Math.max(0, Math.floor(Number(feedback?.truthFalseVotes ?? 0) || 0));
  const voteTotal = truthTrueVotes + truthFalseVotes;

  const replyRate = opens > 0 ? clamp(replies / opens, 0, 1) : null;
  const reportRate = opens > 0 ? clamp(reports / opens, 0, 1) : null;
  const falseVoteRate = voteTotal > 0 ? clamp(truthFalseVotes / voteTotal, 0, 1) : null;
  const voteConfidence = clamp(voteTotal / 14, 0, 1);

  let adjustment = 0;
  const feedbackReasons: string[] = [];
  const cautionChips = [...base.cautionChips];
  const reliefChips = [...base.reliefChips];
  const reasons = [...base.reasons];

  if (replyRate != null) {
    const replyDelta = clamp((replyRate - 0.08) * -0.22, -0.08, 0.05);
    adjustment += replyDelta;
    if (replyRate >= 0.14) {
      feedbackReasons.push("返信率が高く、会話として受け取られやすい傾向があります。");
      if (!reliefChips.includes("会話反応あり")) reliefChips.push("会話反応あり");
    } else if (replyRate <= 0.015 && opens >= 8) {
      feedbackReasons.push("開封に対して返信率が低く、主張だけ強く見える可能性があります。");
      if (!cautionChips.includes("会話化しにくい")) cautionChips.push("会話化しにくい");
    }
  }

  if (reportRate != null) {
    const reportDelta = clamp((reportRate - 0.01) * 0.8, -0.02, 0.22);
    adjustment += reportDelta;
    if (reportRate >= 0.03) {
      feedbackReasons.push("通報率が高めで、誤解や不快感を生みやすい表現の可能性があります。");
      if (!cautionChips.includes("通報率高め")) cautionChips.push("通報率高め");
    }
  }

  if (falseVoteRate != null) {
    const voteDelta = clamp((falseVoteRate - 0.5) * (0.24 * voteConfidence), -0.12, 0.12);
    adjustment += voteDelta;
    if (voteConfidence >= 0.2) {
      if (falseVoteRate >= 0.62) {
        feedbackReasons.push("真偽投票で『嘘寄り』判定が多く、表現の根拠不足が疑われます。");
        if (!cautionChips.includes("偽票優勢")) cautionChips.push("偽票優勢");
      } else if (falseVoteRate <= 0.35) {
        feedbackReasons.push("真偽投票では『本当寄り』が多く、受け手に信頼されやすい傾向です。");
        if (!reliefChips.includes("真票優勢")) reliefChips.push("真票優勢");
      }
    }
  }

  const score = clamp(base.score + adjustment, 0, 1);
  const level: LieScoreAnalysis["level"] = score >= 0.67 ? "high" : score >= 0.38 ? "mid" : "low";
  if (feedbackReasons.length > 0) {
    reasons.unshift(...feedbackReasons.slice(0, 2));
  }

  return {
    ...base,
    score,
    level,
    reasons: Array.from(new Set(reasons)).slice(0, 4),
    cautionChips: Array.from(new Set(cautionChips)).slice(0, 4),
    reliefChips: Array.from(new Set(reliefChips)).slice(0, 4),
    baseScore: base.score,
    adjustment: clamp(adjustment, -0.3, 0.3),
    feedbackSignals: {
      opens,
      replies,
      reports,
      truthTrueVotes,
      truthFalseVotes,
      replyRate,
      reportRate,
      falseVoteRate,
      voteConfidence,
    },
    feedbackReasons,
  };
}
