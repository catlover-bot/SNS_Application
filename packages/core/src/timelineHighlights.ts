export type TimelineHighlightItem = {
  id: string;
  created_at?: string | null;
  score?: number | null;
  analysis?: any;
  author?: string | null;
  author_handle?: string | null;
  author_display?: string | null;
};

export type TimelineHighlightReasoned<T> = {
  item: T;
  reason: string;
  score: number;
};

export type TimelineHighlightsResult<T> = {
  popular: T[];
  forYou: Array<TimelineHighlightReasoned<T>>;
};

function clamp(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function personaKeyFromAnalysis(analysis: any): string | null {
  const selected = String(
    analysis?.persona?.selected ?? analysis?.persona?.candidates?.[0]?.key ?? ""
  ).trim();
  return selected || null;
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

export function pickTimelineHighlights<T extends TimelineHighlightItem>(
  items: T[],
  args?: {
    popularLimit?: number;
    forYouLimit?: number;
    openedIds?: ReadonlySet<string> | Record<string, unknown>;
    savedPostIds?: ReadonlySet<string> | Record<string, unknown> | string[];
    followedAuthorIds?: string[];
    interestedAuthorIds?: string[];
    interestedPersonaKeys?: string[];
  }
): TimelineHighlightsResult<T> {
  const list = Array.isArray(items) ? items.filter((x) => x?.id) : [];
  if (list.length === 0) return { popular: [], forYou: [] };

  const nowMs = Date.now();
  const popularLimit = Math.max(1, args?.popularLimit ?? 3);
  const forYouLimit = Math.max(1, args?.forYouLimit ?? 4);
  const interestedPersonaSet = new Set(
    (args?.interestedPersonaKeys ?? []).map((x) => String(x ?? "").trim()).filter(Boolean)
  );
  const followedAuthorSet = new Set(
    (args?.followedAuthorIds ?? []).map((x) => String(x ?? "").replace(/^@+/, "").trim()).filter(Boolean)
  );
  const interestedAuthorSet = new Set(
    (args?.interestedAuthorIds ?? []).map((x) => String(x ?? "").trim()).filter(Boolean)
  );
  const isOpened = (id: string) =>
    args?.openedIds instanceof Set
      ? args.openedIds.has(id)
      : args?.openedIds
      ? Boolean((args.openedIds as Record<string, unknown>)[id])
      : false;
  const isSaved = (id: string) =>
    Array.isArray(args?.savedPostIds)
      ? args!.savedPostIds.includes(id)
      : args?.savedPostIds instanceof Set
      ? args.savedPostIds.has(id)
      : args?.savedPostIds
      ? Boolean((args.savedPostIds as Record<string, unknown>)[id])
      : false;

  const scoredPopular = list
    .map((item) => {
      const base = clamp(Number(item.score ?? 0) || 0, 0, 1);
      const buzz = predictedBuzzFromAnalysis(item.analysis);
      const recent = recencyScore(item.created_at, nowMs);
      const authorId = String(item.author ?? "").trim();
      const authorHandle = String(item.author_handle ?? "").replace(/^@+/, "").trim();
      const followed =
        (authorId && followedAuthorSet.has(authorId)) ||
        (authorHandle && followedAuthorSet.has(authorHandle));
      const openedPenalty = isOpened(item.id) ? 0.08 : 0;
      const savedBoost = isSaved(item.id) ? 0.08 : 0;
      const followedBoost = followed ? 0.06 : 0;
      const popularity = clamp(
        base * 0.52 + buzz * 0.28 + recent * 0.14 + savedBoost + followedBoost - openedPenalty,
        0,
        1
      );
      return { item, popularity };
    })
    .sort((a, b) => b.popularity - a.popularity);

  const popular = scoredPopular.slice(0, popularLimit).map((x) => x.item);

  const forYou = list
    .map((item) => {
      const personaKey = personaKeyFromAnalysis(item.analysis);
      const authorId = String(item.author ?? "").trim();
      const authorHandle = String(item.author_handle ?? "").replace(/^@+/, "").trim();
      const authorMatched =
        (authorId && interestedAuthorSet.has(authorId)) ||
        (authorHandle && interestedAuthorSet.has(authorHandle));
      const personaMatched = personaKey ? interestedPersonaSet.has(personaKey) : false;
      const followed =
        (authorId && followedAuthorSet.has(authorId)) ||
        (authorHandle && followedAuthorSet.has(authorHandle));
      const base = clamp(Number(item.score ?? 0) || 0, 0, 1);
      const buzz = predictedBuzzFromAnalysis(item.analysis);
      const recent = recencyScore(item.created_at, nowMs);
      let score = base * 0.35 + buzz * 0.25 + recent * 0.15;
      let reason = "今伸びやすい投稿";
      if (personaMatched) {
        score += 0.35;
        reason = `興味キャラ @${personaKey}`;
      }
      if (authorMatched) {
        score += 0.4;
        reason = "よく開くユーザーの投稿";
      }
      if (followed) {
        score += 0.22;
        reason = "フォロー中ユーザーの投稿";
      }
      if (isSaved(item.id)) {
        score += 0.18;
        reason = "保存済み・再訪候補";
      }
      if (isOpened(item.id)) {
        score -= 0.2;
      }
      return { item, reason, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, forYouLimit);

  return { popular, forYou };
}
