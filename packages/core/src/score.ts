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
  context?: LieScoreFeedbackContext | null;
  learnedContext?: LieScoreLearnedContextCoefficient | null;
};

export type LieScoreTimeBucket = "late_night" | "morning" | "daytime" | "evening";
export type LieScoreWeekdayBucket = "weekday" | "weekend";
export type LieScoreTextLengthBucket = "xs" | "short" | "medium" | "long";
export type LieScoreAttachmentKind = "none" | "image" | "video" | "url" | "mixed";
export type LieScoreWeekdayTimeBucket =
  | "weekday_late_night"
  | "weekday_morning"
  | "weekday_daytime"
  | "weekday_evening"
  | "weekend_late_night"
  | "weekend_morning"
  | "weekend_daytime"
  | "weekend_evening";

export type LieScorePostFormat = "normal" | "short" | "story" | "unknown";

export type LieScoreFeedbackContext = {
  timeBucket?: LieScoreTimeBucket | null;
  weekdayBucket?: LieScoreWeekdayBucket | null;
  postFormat?: LieScorePostFormat | string | null;
  personaKey?: string | null;
  hasAttachment?: boolean | null;
  attachmentKind?: LieScoreAttachmentKind | string | null;
  attachmentMixKey?: string | null;
  textLengthBucket?: LieScoreTextLengthBucket | null;
  ageHours?: number | null;
};

export type LieScoreLearnedContextCoefficient = {
  contextKey?: string | null;
  adjustmentBias?: number | null;
  confidence?: number | null;
  samples?: number | null;
  updatedAt?: string | null;
};

export type LieScoreLearnedContextHistoryPoint = {
  at: string;
  adjustmentBias: number;
  confidence: number;
  samples: number;
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
    timeBucket: LieScoreTimeBucket | null;
    weekdayBucket: LieScoreWeekdayBucket | null;
    weekdayTimeBucket: LieScoreWeekdayTimeBucket | null;
    postFormat: LieScorePostFormat;
    personaKey: string | null;
    hasAttachment: boolean;
    attachmentKind: LieScoreAttachmentKind;
    attachmentMixKey: string | null;
    textLengthBucket: LieScoreTextLengthBucket | null;
    ageHours: number | null;
    feedbackDecay: number;
    learnedContextKey: string | null;
    learnedAdjustmentBias: number | null;
    learnedConfidence: number | null;
    learnedSamples: number;
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

export function normalizeLieScorePostFormat(input?: string | null): LieScorePostFormat {
  const key = String(input ?? "").trim().toLowerCase();
  if (key === "story") return "story";
  if (key === "short" || key === "reel" || key === "reels") return "short";
  if (key === "normal" || key === "post" || key === "feed") return "normal";
  return key ? "unknown" : "normal";
}

export function normalizeLieScoreAttachmentKind(
  input?: LieScoreAttachmentKind | string | null
): LieScoreAttachmentKind {
  const key = String(input ?? "").trim().toLowerCase();
  if (!key || key === "none" || key === "false") return "none";
  if (key === "image" || key === "photo" || key === "img") return "image";
  if (key === "video" || key === "movie" || key === "clip") return "video";
  if (key === "url" || key === "link") return "url";
  if (key === "mixed" || key === "multi") return "mixed";
  return "none";
}

export function inferLieScoreTimeBucket(
  input?: string | number | Date | null
): LieScoreTimeBucket | null {
  if (input == null) return null;
  const date = input instanceof Date ? input : new Date(input);
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return null;
  const hour = date.getHours();
  if (hour < 5) return "late_night";
  if (hour < 11) return "morning";
  if (hour < 18) return "daytime";
  return "evening";
}

export function inferLieScoreWeekdayBucket(
  input?: string | number | Date | null
): LieScoreWeekdayBucket | null {
  if (input == null) return null;
  const date = input instanceof Date ? input : new Date(input);
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return null;
  const day = date.getDay();
  return day === 0 || day === 6 ? "weekend" : "weekday";
}

export function inferLieScoreWeekdayTimeBucket(args: {
  timeBucket?: LieScoreTimeBucket | null;
  weekdayBucket?: LieScoreWeekdayBucket | null;
}): LieScoreWeekdayTimeBucket | null {
  const timeBucket = args.timeBucket ?? null;
  const weekdayBucket = args.weekdayBucket ?? null;
  if (!timeBucket || !weekdayBucket) return null;
  return `${weekdayBucket}_${timeBucket}` as LieScoreWeekdayTimeBucket;
}

export function inferLieScoreTextLengthBucket(
  input?: string | number | null
): LieScoreTextLengthBucket | null {
  const len =
    typeof input === "number"
      ? Math.max(0, Math.floor(input))
      : typeof input === "string"
        ? String(input).trim().length
        : 0;
  if (len <= 0) return null;
  if (len < 24) return "xs";
  if (len < 70) return "short";
  if (len < 180) return "medium";
  return "long";
}

export function inferLieScoreAgeHours(
  input?: string | number | Date | null
): number | null {
  if (input == null) return null;
  const date = input instanceof Date ? input : new Date(input);
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, (Date.now() - ms) / 3_600_000);
}

function normalizeLieScoreAttachmentMixKey(input?: string | null): string | null {
  const raw = String(input ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (!/^[a-z0-9_:+-]+$/.test(raw)) return null;
  return raw.slice(0, 48);
}

function normalizeLieScoreContextPersonaKey(input?: string | null): string {
  const raw = String(input ?? "").trim().toLowerCase().replace(/[^a-z0-9_:-]/g, "");
  return raw || "global";
}

export function buildLieScoreLearnedContextKey(args: {
  weekdayTimeBucket?: LieScoreWeekdayTimeBucket | null;
  personaKey?: string | null;
  attachmentMixKey?: string | null;
}): string | null {
  const weekdayTimeBucket = args.weekdayTimeBucket ?? null;
  if (!weekdayTimeBucket) return null;
  const personaKey = normalizeLieScoreContextPersonaKey(args.personaKey);
  const attachmentMixKey = normalizeLieScoreAttachmentMixKey(args.attachmentMixKey) ?? "none";
  return `${weekdayTimeBucket}|${personaKey}|${attachmentMixKey}`;
}

export function deriveLieScoreLearnedContextObservation(feedback?: LieScoreFeedback | null): {
  targetBias: number;
  confidence: number;
  sampleIncrement: number;
} | null {
  const opens = Math.max(0, Math.floor(Number(feedback?.opens ?? 0) || 0));
  const replies = Math.max(0, Math.floor(Number(feedback?.replies ?? 0) || 0));
  const reports = Math.max(0, Math.floor(Number(feedback?.reports ?? 0) || 0));
  const truthTrueVotes = Math.max(0, Math.floor(Number(feedback?.truthTrueVotes ?? 0) || 0));
  const truthFalseVotes = Math.max(0, Math.floor(Number(feedback?.truthFalseVotes ?? 0) || 0));
  const votes = truthTrueVotes + truthFalseVotes;
  if (opens <= 0 && votes <= 0 && reports <= 0) return null;

  const replyRate = opens > 0 ? clamp(replies / Math.max(1, opens), 0, 1) : null;
  const reportRate = opens > 0 ? clamp(reports / Math.max(1, opens), 0, 1) : null;
  const falseVoteRate = votes > 0 ? clamp(truthFalseVotes / Math.max(1, votes), 0, 1) : null;

  // Positive bias => "嘘寄りに補正", Negative bias => "信頼寄りに補正"
  const reportComponent =
    reportRate == null ? 0 : clamp((reportRate - 0.012) * 0.9, -0.04, 0.16);
  const voteComponent =
    falseVoteRate == null ? 0 : clamp((falseVoteRate - 0.5) * 0.22, -0.11, 0.11);
  const replyComponent =
    replyRate == null ? 0 : clamp((replyRate - 0.08) * -0.18, -0.08, 0.05);
  const targetBias = clamp(reportComponent + voteComponent + replyComponent, -0.14, 0.18);

  const confidence = clamp(
    (opens / 30) * 0.5 + (votes / 12) * 0.35 + Math.min(1, reports) * 0.15,
    0.05,
    1
  );
  const sampleIncrement = Math.max(1, Math.round(opens * 0.5 + votes * 1.5 + reports * 2));
  return { targetBias, confidence, sampleIncrement };
}

export function evolveLieScoreLearnedContextCoefficient(args: {
  current?: LieScoreLearnedContextCoefficient | null;
  observation: {
    targetBias: number;
    confidence: number;
    sampleIncrement?: number;
  };
}) {
  const currentBias = clamp(Number(args.current?.adjustmentBias ?? 0) || 0, -0.4, 0.4);
  const currentConfidence = clamp(Number(args.current?.confidence ?? 0) || 0, 0, 1);
  const currentSamples = Math.max(0, Math.floor(Number(args.current?.samples ?? 0) || 0));
  const targetBias = clamp(Number(args.observation.targetBias ?? 0) || 0, -0.4, 0.4);
  const obsConfidence = clamp(Number(args.observation.confidence ?? 0) || 0, 0, 1);
  const sampleIncrement = Math.max(
    1,
    Math.floor(Number(args.observation.sampleIncrement ?? 1) || 1)
  );
  const alpha = clamp(0.08 + obsConfidence * 0.22, 0.08, 0.3);
  const nextBias = clamp(currentBias * (1 - alpha) + targetBias * alpha, -0.4, 0.4);
  const nextSamples = Math.min(20000, currentSamples + sampleIncrement);
  const nextConfidence = clamp(
    Math.max(currentConfidence * 0.92, obsConfidence * 0.75, Math.log1p(nextSamples) / Math.log1p(180)),
    0.05,
    1
  );
  return {
    adjustmentBias: nextBias,
    confidence: nextConfidence,
    samples: nextSamples,
  } satisfies Pick<LieScoreLearnedContextCoefficient, "adjustmentBias" | "confidence" | "samples">;
}

export function buildLieScoreLearnedContextTrendRatios(
  history: LieScoreLearnedContextHistoryPoint[],
  maxPoints = 16
): number[] {
  const points = Array.isArray(history) ? history.slice(-Math.max(2, Math.floor(maxPoints))) : [];
  if (points.length < 2) return [];
  const values = points.map((p) => {
    const bias = clamp(Number(p.adjustmentBias ?? 0) || 0, -0.4, 0.4);
    const confidence = clamp(Number(p.confidence ?? 0) || 0, 0, 1);
    return clamp((bias + 0.4) / 0.8 * (0.65 + confidence * 0.35), 0, 1);
  });
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(0.001, max - min);
  return values.map((v) => Math.max(0.12, (v - min) / span));
}

function classifyLieScorePersonaTone(personaKey?: string | null): "expressive" | "authority" | "neutral" {
  const key = String(personaKey ?? "").toLowerCase().trim();
  if (!key) return "neutral";
  if (
    /idol|gyaru|gal|stream|creator|comed|comic|genki|party|hype|trendy|otaku|punk|rebel|tsundere|yanki/.test(
      key
    )
  ) {
    return "expressive";
  }
  if (
    /doctor|nurse|teacher|sensei|prof|analyst|news|journal|law|lawyer|finance|consult|coach|mentor|research/.test(
      key
    )
  ) {
    return "authority";
  }
  return "neutral";
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
  const timeBucket = feedback?.context?.timeBucket ?? null;
  const weekdayBucket = feedback?.context?.weekdayBucket ?? null;
  const weekdayTimeBucket = inferLieScoreWeekdayTimeBucket({ timeBucket, weekdayBucket });
  const postFormat = normalizeLieScorePostFormat(feedback?.context?.postFormat ?? null);
  const personaKey = String(feedback?.context?.personaKey ?? "").trim() || null;
  const attachmentKind = (() => {
    const normalized = normalizeLieScoreAttachmentKind(feedback?.context?.attachmentKind ?? null);
    if (normalized !== "none") return normalized;
    return feedback?.context?.hasAttachment ? "image" : "none";
  })();
  const hasAttachment = attachmentKind !== "none";
  const attachmentMixKey = normalizeLieScoreAttachmentMixKey(feedback?.context?.attachmentMixKey ?? null);
  const textLengthBucket = feedback?.context?.textLengthBucket ?? null;
  const ageHoursRaw = Number(feedback?.context?.ageHours ?? NaN);
  const ageHours = Number.isFinite(ageHoursRaw) ? Math.max(0, ageHoursRaw) : null;
  const personaTone = classifyLieScorePersonaTone(personaKey);
  const learnedContextKey = buildLieScoreLearnedContextKey({
    weekdayTimeBucket,
    personaKey,
    attachmentMixKey,
  });
  const learnedAdjustmentBiasRaw = Number(feedback?.learnedContext?.adjustmentBias ?? NaN);
  const learnedAdjustmentBias = Number.isFinite(learnedAdjustmentBiasRaw)
    ? clamp(learnedAdjustmentBiasRaw, -0.4, 0.4)
    : null;
  const learnedConfidenceRaw = Number(feedback?.learnedContext?.confidence ?? NaN);
  const learnedConfidence = Number.isFinite(learnedConfidenceRaw)
    ? clamp(learnedConfidenceRaw, 0, 1)
    : null;
  const learnedSamples = Math.max(0, Math.floor(Number(feedback?.learnedContext?.samples ?? 0) || 0));
  const feedbackDecay =
    ageHours == null ? 1 : clamp(Math.exp(-ageHours / 120), 0.22, 1);

  const replyRate = opens > 0 ? clamp(replies / opens, 0, 1) : null;
  const reportRate = opens > 0 ? clamp(reports / opens, 0, 1) : null;
  const falseVoteRate = voteTotal > 0 ? clamp(truthFalseVotes / voteTotal, 0, 1) : null;
  const voteConfidence = clamp(voteTotal / 14, 0, 1);

  let adjustment = 0;
  const feedbackReasons: string[] = [];
  const cautionChips = [...base.cautionChips];
  const reliefChips = [...base.reliefChips];
  const reasons = [...base.reasons];
  const attachmentReplyAdj =
    attachmentKind === "video"
      ? 0.02
      : attachmentKind === "image"
        ? 0.012
        : attachmentKind === "mixed"
          ? 0.016
          : attachmentKind === "url"
            ? -0.004
            : 0;
  const attachmentReportAdj =
    attachmentKind === "video"
      ? 0.003
      : attachmentKind === "image"
        ? 0.0015
        : attachmentKind === "mixed"
          ? 0.0035
          : attachmentKind === "url"
            ? -0.001
            : 0;
  const weekdayTimeReplyAdj =
    weekdayTimeBucket === "weekday_morning"
      ? -0.012
      : weekdayTimeBucket === "weekday_daytime"
        ? 0.006
        : weekdayTimeBucket === "weekday_evening"
          ? 0.012
          : weekdayTimeBucket === "weekend_late_night"
            ? -0.008
            : weekdayTimeBucket === "weekend_evening"
              ? 0.014
              : weekdayTimeBucket === "weekend_daytime"
                ? 0.004
                : 0;
  const weekdayTimeReportAdj =
    weekdayTimeBucket === "weekend_late_night"
      ? 0.0025
      : weekdayTimeBucket === "weekday_daytime" && personaTone === "authority"
        ? 0.002
        : weekdayTimeBucket === "weekend_evening" && personaTone === "expressive"
          ? -0.0015
          : 0;

  const replyBaseline =
    clamp(
      0.08 +
        (postFormat === "story" ? -0.035 : postFormat === "short" ? -0.02 : 0) +
        (timeBucket === "late_night" ? -0.02 : timeBucket === "morning" ? -0.01 : timeBucket === "evening" ? 0.01 : 0) +
        (weekdayBucket === "weekend" ? -0.008 : 0.004) +
        attachmentReplyAdj +
        weekdayTimeReplyAdj +
        (textLengthBucket === "long" ? -0.012 : textLengthBucket === "xs" ? -0.005 : 0),
      0.02,
      0.16
    );
  const lowReplyThreshold = clamp(replyBaseline * 0.25, 0.006, 0.04);
  const reportBaseline =
    clamp(
      0.01 +
        (postFormat === "story" ? 0.003 : postFormat === "short" ? 0.002 : 0) +
        (timeBucket === "late_night" ? 0.002 : 0) +
        (weekdayBucket === "weekend" ? 0.001 : 0) +
        attachmentReportAdj +
        weekdayTimeReportAdj,
      0.005,
      0.03
    );
  const personaReportSensitivity = personaTone === "authority" ? 1.15 : personaTone === "expressive" ? 0.9 : 1;
  const personaReplyPenaltyScale = personaTone === "expressive" ? 0.84 : personaTone === "authority" ? 1.06 : 1;

  if (replyRate != null) {
    const replyDelta = clamp(
      (replyRate - replyBaseline) * -0.22 * personaReplyPenaltyScale * feedbackDecay,
      -0.08,
      0.05
    );
    adjustment += replyDelta;
    if (replyRate >= Math.max(0.14, replyBaseline + 0.05)) {
      feedbackReasons.push("返信率が高く、会話として受け取られやすい傾向があります。");
      if (!reliefChips.includes("会話反応あり")) reliefChips.push("会話反応あり");
    } else if (replyRate <= lowReplyThreshold && opens >= 8) {
      feedbackReasons.push("開封に対して返信率が低く、主張だけ強く見える可能性があります。");
      if (!cautionChips.includes("会話化しにくい")) cautionChips.push("会話化しにくい");
    }
  }

  if (reportRate != null) {
    const reportDelta = clamp(
      (reportRate - reportBaseline) * 0.8 * personaReportSensitivity * feedbackDecay,
      -0.02,
      0.22
    );
    adjustment += reportDelta;
    if (reportRate >= Math.max(0.03, reportBaseline + 0.015)) {
      feedbackReasons.push("通報率が高めで、誤解や不快感を生みやすい表現の可能性があります。");
      if (!cautionChips.includes("通報率高め")) cautionChips.push("通報率高め");
    }
  }

  if (falseVoteRate != null) {
    const voteDelta = clamp(
      (falseVoteRate - 0.5) *
        (0.24 * voteConfidence) *
        (personaTone === "authority" ? 1.12 : personaTone === "expressive" ? 0.94 : 1) *
        feedbackDecay,
      -0.12,
      0.12
    );
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

  if (opens >= 6 && reports === 0 && (postFormat === "story" || postFormat === "short")) {
    adjustment -= postFormat === "story" ? 0.02 : 0.012;
    if (!reliefChips.includes(postFormat === "story" ? "Story文脈" : "短尺文脈")) {
      reliefChips.push(postFormat === "story" ? "Story文脈" : "短尺文脈");
    }
    feedbackReasons.push("短尺/Story文脈では短文・テンション表現が自然で、誤判定を少し緩和しています。");
  }
  if (timeBucket === "late_night" && replyRate != null && replyRate <= lowReplyThreshold && opens >= 8) {
    adjustment -= 0.012;
    feedbackReasons.push("深夜帯は返信率が下がりやすいため、低返信の補正を少し緩めています。");
    if (!reliefChips.includes("深夜補正")) reliefChips.push("深夜補正");
  }
  if (weekdayBucket === "weekend" && personaTone === "expressive" && opens >= 6 && reports === 0) {
    adjustment -= 0.012;
    if (!reliefChips.includes("週末キャラ文脈")) reliefChips.push("週末キャラ文脈");
    feedbackReasons.push("週末の盛り上がり系キャラ文脈を考慮して、過剰な嘘判定を少し緩和しています。");
  }
  if (weekdayBucket === "weekday" && personaTone === "authority" && reports > 0) {
    adjustment += 0.01;
    if (!cautionChips.includes("実務文脈注意")) cautionChips.push("実務文脈注意");
    feedbackReasons.push("平日の実務/解説系キャラ文脈では、通報反応をやや重く評価しています。");
  }
  if (attachmentKind !== "none" && reports === 0 && opens >= 6) {
    const attachmentRelief =
      attachmentKind === "url" ? 0.012 : attachmentKind === "video" ? 0.008 : 0.01;
    adjustment -= attachmentRelief * feedbackDecay;
    if (!reliefChips.includes(attachmentKind === "url" ? "出典URLあり" : "添付反応あり")) {
      reliefChips.push(attachmentKind === "url" ? "出典URLあり" : "添付反応あり");
    }
    feedbackReasons.push(
      attachmentKind === "url"
        ? "URL添付で通報反応が低く、根拠提示の効果を考慮して過剰判定を少し緩和しています。"
        : "添付付き投稿で通報反応が低く、印象だけでの過剰判定を少し緩和しています。"
    );
  }
  if (textLengthBucket === "long" && reportRate != null && reportRate <= reportBaseline && opens >= 6) {
    adjustment -= 0.008 * feedbackDecay;
    if (!reliefChips.includes("長文文脈")) reliefChips.push("長文文脈");
    feedbackReasons.push("長文投稿は説明量が多くなりやすいため、反応補正で少し信頼側に寄せています。");
  }
  if (
    weekdayTimeBucket === "weekday_daytime" &&
    personaTone === "authority" &&
    attachmentKind === "url" &&
    reportRate != null &&
    reportRate <= reportBaseline
  ) {
    adjustment -= 0.012 * feedbackDecay;
    if (!reliefChips.includes("業務文脈URL")) reliefChips.push("業務文脈URL");
    feedbackReasons.push("平日昼の解説系 + URL文脈は信頼されやすいため、補正を少し緩和しています。");
  }
  if (
    weekdayTimeBucket === "weekend_evening" &&
    personaTone === "expressive" &&
    (attachmentKind === "video" || attachmentKind === "image" || attachmentKind === "mixed") &&
    reports === 0 &&
    opens >= 6
  ) {
    adjustment -= 0.01 * feedbackDecay;
    if (!reliefChips.includes("週末レジャー文脈")) reliefChips.push("週末レジャー文脈");
    feedbackReasons.push("週末夜の盛り上がり系 + ビジュアル文脈を考慮して誤判定を少し緩和しています。");
  }

  if (learnedAdjustmentBias != null && (learnedConfidence ?? 0) > 0.04) {
    const learnedDelta = clamp(
      learnedAdjustmentBias * (learnedConfidence ?? 0) * 0.8 * feedbackDecay,
      -0.08,
      0.08
    );
    adjustment += learnedDelta;
    if (Math.abs(learnedDelta) >= 0.004) {
      feedbackReasons.push(
        learnedDelta > 0
          ? "この文脈（曜日×時間帯×キャラ×添付傾向）の実反応学習により、やや厳しめに補正しています。"
          : "この文脈（曜日×時間帯×キャラ×添付傾向）の実反応学習により、やや緩めに補正しています。"
      );
      if (learnedDelta > 0) {
        if (!cautionChips.includes("文脈学習補正")) cautionChips.push("文脈学習補正");
      } else {
        if (!reliefChips.includes("文脈学習補正")) reliefChips.push("文脈学習補正");
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
      timeBucket,
      weekdayBucket,
      weekdayTimeBucket,
      postFormat,
      personaKey,
      hasAttachment,
      attachmentKind,
      attachmentMixKey,
      textLengthBucket,
      ageHours,
      feedbackDecay,
      learnedContextKey,
      learnedAdjustmentBias,
      learnedConfidence,
      learnedSamples,
    },
    feedbackReasons,
  };
}
