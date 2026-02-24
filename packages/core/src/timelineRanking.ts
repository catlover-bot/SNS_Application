import { type TimelineHighlightItem } from "./timelineHighlights";

function clamp(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function predictedBuzzFromAnalysis(analysis: any): number {
  const raw = Number(
    analysis?.buzz?.score ??
      analysis?.buzz_score ??
      analysis?.persona?.buzz?.score ??
      analysis?.persona_match?.predicted_response ??
      NaN
  );
  if (!Number.isFinite(raw)) return 0.5;
  if (raw > 1) return clamp(raw / 100, 0, 1);
  return clamp(raw, 0, 1);
}

function recencyScore(createdAt: string | null | undefined, nowMs: number): number {
  const ms = Date.parse(String(createdAt ?? ""));
  if (!Number.isFinite(ms)) return 0.35;
  const ageHours = Math.max(0, (nowMs - ms) / 3_600_000);
  if (ageHours <= 2) return 1;
  if (ageHours <= 12) return 0.85;
  if (ageHours <= 24) return 0.7;
  if (ageHours <= 72) return 0.5;
  return 0.25;
}

function personaKeyFromAnalysis(analysis: any): string | null {
  const selected = String(
    analysis?.persona?.selected ?? analysis?.persona?.candidates?.[0]?.key ?? ""
  ).trim();
  return selected || null;
}

export type TimelineSignalWeights = {
  followedAuthorBoost: number;
  savedPostBoost: number;
  openedPenalty: number;
  interestedPersonaBoost: number;
  interestedAuthorBoost: number;
  baseScoreWeight: number;
  predictedBuzzWeight: number;
  recencyWeight: number;
};

export type TimelineSignalLearningInput = {
  openedCount?: number;
  savedCount?: number;
  followedCount?: number;
};

export type TimelineSignalWeightsState = {
  weights: TimelineSignalWeights;
  learningInput: Required<TimelineSignalLearningInput>;
  samples: number;
};

export type TimelineRankingArgs<T> = {
  openedIds?: ReadonlySet<string> | Record<string, unknown> | string[];
  savedPostIds?: ReadonlySet<string> | Record<string, unknown> | string[];
  followedAuthorIds?: string[];
  interestedAuthorIds?: string[];
  interestedPersonaKeys?: string[];
  weights?: Partial<TimelineSignalWeights>;
  learningInput?: TimelineSignalLearningInput;
  limit?: number;
  keepOpenedInOrder?: boolean;
  getAuthorId?: (item: T) => string | null;
  getAuthorHandle?: (item: T) => string | null;
};

export type TimelineRankedItem<T> = {
  item: T;
  rankScore: number;
  reasons: string[];
};

export const DEFAULT_TIMELINE_SIGNAL_WEIGHTS: TimelineSignalWeights = {
  followedAuthorBoost: 0.28,
  savedPostBoost: 0.34,
  openedPenalty: 0.16,
  interestedPersonaBoost: 0.17,
  interestedAuthorBoost: 0.2,
  baseScoreWeight: 0.38,
  predictedBuzzWeight: 0.26,
  recencyWeight: 0.14,
};

export function normalizeTimelineSignalWeights(
  input?: Partial<TimelineSignalWeights> | null
): TimelineSignalWeights {
  return {
    followedAuthorBoost: clamp(
      Number(input?.followedAuthorBoost ?? DEFAULT_TIMELINE_SIGNAL_WEIGHTS.followedAuthorBoost) || 0,
      0.08,
      0.55
    ),
    savedPostBoost: clamp(
      Number(input?.savedPostBoost ?? DEFAULT_TIMELINE_SIGNAL_WEIGHTS.savedPostBoost) || 0,
      0.12,
      0.7
    ),
    openedPenalty: clamp(
      Number(input?.openedPenalty ?? DEFAULT_TIMELINE_SIGNAL_WEIGHTS.openedPenalty) || 0,
      0.05,
      0.35
    ),
    interestedPersonaBoost: clamp(
      Number(
        input?.interestedPersonaBoost ?? DEFAULT_TIMELINE_SIGNAL_WEIGHTS.interestedPersonaBoost
      ) || 0,
      0.06,
      0.35
    ),
    interestedAuthorBoost: clamp(
      Number(input?.interestedAuthorBoost ?? DEFAULT_TIMELINE_SIGNAL_WEIGHTS.interestedAuthorBoost) || 0,
      0.08,
      0.4
    ),
    baseScoreWeight: clamp(
      Number(input?.baseScoreWeight ?? DEFAULT_TIMELINE_SIGNAL_WEIGHTS.baseScoreWeight) || 0,
      0.22,
      0.5
    ),
    predictedBuzzWeight: clamp(
      Number(input?.predictedBuzzWeight ?? DEFAULT_TIMELINE_SIGNAL_WEIGHTS.predictedBuzzWeight) || 0,
      0.12,
      0.38
    ),
    recencyWeight: clamp(
      Number(input?.recencyWeight ?? DEFAULT_TIMELINE_SIGNAL_WEIGHTS.recencyWeight) || 0,
      0.05,
      0.28
    ),
  };
}

export function evolveTimelineSignalWeightsState(args: {
  currentWeights?: Partial<TimelineSignalWeights> | null;
  currentSamples?: number | null;
  learningInput?: TimelineSignalLearningInput | null;
}): TimelineSignalWeightsState {
  const learningInput = {
    openedCount: Math.max(0, Math.floor(Number(args.learningInput?.openedCount ?? 0) || 0)),
    savedCount: Math.max(0, Math.floor(Number(args.learningInput?.savedCount ?? 0) || 0)),
    followedCount: Math.max(0, Math.floor(Number(args.learningInput?.followedCount ?? 0) || 0)),
  } satisfies Required<TimelineSignalLearningInput>;

  const base = normalizeTimelineSignalWeights(args.currentWeights);
  const target = learnTimelineSignalWeights(learningInput);
  const prevSamples = Math.max(0, Math.floor(Number(args.currentSamples ?? 0) || 0));
  const alpha = clamp(prevSamples <= 0 ? 0.42 : 1 / Math.min(14, prevSamples + 3), 0.08, 0.42);
  const next = {
    followedAuthorBoost:
      base.followedAuthorBoost * (1 - alpha) + target.followedAuthorBoost * alpha,
    savedPostBoost: base.savedPostBoost * (1 - alpha) + target.savedPostBoost * alpha,
    openedPenalty: base.openedPenalty * (1 - alpha) + target.openedPenalty * alpha,
    interestedPersonaBoost:
      base.interestedPersonaBoost * (1 - alpha) + target.interestedPersonaBoost * alpha,
    interestedAuthorBoost:
      base.interestedAuthorBoost * (1 - alpha) + target.interestedAuthorBoost * alpha,
    baseScoreWeight: base.baseScoreWeight * (1 - alpha) + target.baseScoreWeight * alpha,
    predictedBuzzWeight:
      base.predictedBuzzWeight * (1 - alpha) + target.predictedBuzzWeight * alpha,
    recencyWeight: base.recencyWeight * (1 - alpha) + target.recencyWeight * alpha,
  };

  return {
    weights: normalizeTimelineSignalWeights(next),
    learningInput,
    samples: prevSamples + 1,
  };
}

export function learnTimelineSignalWeights(
  input?: TimelineSignalLearningInput,
  base?: Partial<TimelineSignalWeights>
): TimelineSignalWeights {
  const defaults = { ...DEFAULT_TIMELINE_SIGNAL_WEIGHTS, ...(base ?? {}) };
  const openedCount = Math.max(0, Math.floor(Number(input?.openedCount ?? 0) || 0));
  const savedCount = Math.max(0, Math.floor(Number(input?.savedCount ?? 0) || 0));
  const followedCount = Math.max(0, Math.floor(Number(input?.followedCount ?? 0) || 0));

  const openedScale = clamp(openedCount / 120, 0, 1);
  const saveScale = clamp(savedCount / 80, 0, 1);
  const followScale = clamp(followedCount / 60, 0, 1);

  return {
    ...defaults,
    followedAuthorBoost: clamp(defaults.followedAuthorBoost + followScale * 0.12, 0.08, 0.55),
    savedPostBoost: clamp(defaults.savedPostBoost + saveScale * 0.14, 0.12, 0.7),
    openedPenalty: clamp(defaults.openedPenalty + openedScale * 0.08, 0.05, 0.35),
    interestedPersonaBoost: clamp(defaults.interestedPersonaBoost + openedScale * 0.06, 0.06, 0.35),
    interestedAuthorBoost: clamp(defaults.interestedAuthorBoost + openedScale * 0.08, 0.08, 0.4),
    baseScoreWeight: clamp(defaults.baseScoreWeight - (openedScale + saveScale) * 0.03, 0.22, 0.5),
    predictedBuzzWeight: clamp(defaults.predictedBuzzWeight + saveScale * 0.04, 0.12, 0.38),
    recencyWeight: defaults.recencyWeight,
  };
}

export function rankTimelineByUserSignals<T extends TimelineHighlightItem>(
  items: T[],
  args?: TimelineRankingArgs<T>
): TimelineRankedItem<T>[] {
  const list = Array.isArray(items) ? items.filter((x) => x?.id) : [];
  if (list.length === 0) return [];

  const nowMs = Date.now();
  const learnedWeights = normalizeTimelineSignalWeights(
    args?.learningInput ? learnTimelineSignalWeights(args.learningInput, args?.weights) : args?.weights
  );
  const followedAuthorSet = new Set(
    (args?.followedAuthorIds ?? []).map((x) => String(x ?? "").replace(/^@+/, "").trim()).filter(Boolean)
  );
  const interestedAuthorSet = new Set(
    (args?.interestedAuthorIds ?? []).map((x) => String(x ?? "").replace(/^@+/, "").trim()).filter(Boolean)
  );
  const interestedPersonaSet = new Set(
    (args?.interestedPersonaKeys ?? []).map((x) => String(x ?? "").trim()).filter(Boolean)
  );

  const hasSetOrObj = (s: any, id: string) =>
    Array.isArray(s) ? s.includes(id) : s instanceof Set ? s.has(id) : s ? Boolean((s as Record<string, unknown>)[id]) : false;

  const getAuthorId = (item: any) =>
    String(args?.getAuthorId?.(item) ?? item.author ?? "").trim() || null;
  const getAuthorHandle = (item: any) =>
    String(args?.getAuthorHandle?.(item) ?? item.author_handle ?? "")
      .replace(/^@+/, "")
      .trim() || null;

  const ranked = list.map((item) => {
    const baseScore = clamp(Number(item.score ?? 0) || 0, 0, 1);
    const buzzScore = predictedBuzzFromAnalysis(item.analysis);
    const recent = recencyScore(item.created_at, nowMs);
    const personaKey = personaKeyFromAnalysis(item.analysis);
    const authorId = getAuthorId(item);
    const authorHandle = getAuthorHandle(item);

    const opened = hasSetOrObj(args?.openedIds, item.id);
    const saved = hasSetOrObj(args?.savedPostIds, item.id);
    const followed =
      (!!authorId && followedAuthorSet.has(authorId)) ||
      (!!authorHandle && followedAuthorSet.has(authorHandle));
    const interestedAuthor =
      (!!authorId && interestedAuthorSet.has(authorId)) ||
      (!!authorHandle && interestedAuthorSet.has(authorHandle));
    const interestedPersona = !!personaKey && interestedPersonaSet.has(personaKey);

    let rankScore =
      baseScore * learnedWeights.baseScoreWeight +
      buzzScore * learnedWeights.predictedBuzzWeight +
      recent * learnedWeights.recencyWeight;

    const reasons: string[] = [];
    if (followed) {
      rankScore += learnedWeights.followedAuthorBoost;
      reasons.push("フォロー中ユーザー");
    }
    if (saved) {
      rankScore += learnedWeights.savedPostBoost;
      reasons.push("保存済み/再訪候補");
    }
    if (interestedAuthor) {
      rankScore += learnedWeights.interestedAuthorBoost;
      reasons.push("よく開く作者");
    }
    if (interestedPersona) {
      rankScore += learnedWeights.interestedPersonaBoost;
      reasons.push(`興味キャラ @${personaKey}`);
    }
    if (opened) {
      rankScore -= learnedWeights.openedPenalty;
      reasons.push("開封済み");
    }

    return {
      item,
      rankScore: clamp(rankScore, -1, 3),
      reasons: reasons.slice(0, 3),
    };
  });

  ranked.sort((a, b) => b.rankScore - a.rankScore);
  if (typeof args?.limit === "number" && args.limit > 0) {
    return ranked.slice(0, args.limit);
  }
  return ranked;
}

export function sortTimelineByUserSignals<T extends TimelineHighlightItem>(
  items: T[],
  args?: TimelineRankingArgs<T>
): T[] {
  return rankTimelineByUserSignals(items, args).map((x) => x.item);
}
