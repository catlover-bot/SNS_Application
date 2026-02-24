"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PostCard from "@/components/PostCard";
import { fetchPersonaFeedPage } from "@/lib/socialDataClient";
import { usePersonaFeedState } from "@/lib/useSocialListState";

type Strategy = "same" | "compat";
type BuddyLearningMode = "adaptive" | "stable";
type BuddyLearningModeSource = "preference" | "ab_assignment" | "ab_optimized" | "default";
type RewriteStyleKey = "aggressive" | "empathy" | "short";

type BuddyHistoryPoint = {
  bonus_scale?: number | null;
  confidence?: number | null;
  samples?: number | null;
  created_at?: string | null;
};

type MatchMeta = {
  key: string | null;
  weighted_score: number | null;
  raw_score: number | null;
  weight: number | null;
  reason: string;
  buddy_score?: number | null;
  buddy_weight?: number | null;
  buddy_bonus_scale?: number | null;
  predicted_response?: number | null;
  predicted_base?: number | null;
  ranking_score?: number | null;
  calibration_multiplier?: number | null;
  calibration_samples?: number | null;
};

type FeedItem = {
  id: string;
  created_at: string;
  [k: string]: any;
  persona_match?: MatchMeta;
};

type ApiResponse = {
  strategy: Strategy;
  buddy_learning_mode?: BuddyLearningMode;
  buddy_learning_mode_available?: boolean;
  buddy_learning_mode_source?: BuddyLearningModeSource;
  buddy_learning_mode_ab?: {
    experiment_key?: string | null;
    variant_key?: "A" | "B" | null;
    assigned_mode?: BuddyLearningMode | null;
    source?: string | null;
  } | null;
  buddy_learning_mode_optimization?: {
    recommended_mode?: BuddyLearningMode | null;
    reason?: string | null;
    metrics?: {
      adaptiveScore?: number;
      stableScore?: number;
      adaptiveImpressions?: number;
      stableImpressions?: number;
      adaptiveFeedLoads?: number;
      stableFeedLoads?: number;
    } | null;
  } | null;
  base_persona: string | null;
  used_personas: string[];
  buddy_personas?: Array<{
    key: string;
    score: number;
    bonus_scale?: number;
    raw_bonus_scale?: number;
    learned_samples?: number;
    learning_confidence?: number;
    history_points?: BuddyHistoryPoint[];
  }>;
  items: FeedItem[];
  error?: string;
};

type BuddyMissionProgressResponse = {
  ok?: boolean;
  available?: boolean;
  xpAvailable?: boolean;
  missionDate?: string;
  counts?: Record<string, number>;
  streaks?: Record<string, number>;
  xp?: Record<
    string,
    {
      xpTotal?: number;
      level?: number;
      currentLevelXp?: number;
      nextLevelXp?: number;
      levelProgressRatio?: number;
      completedMissions?: number;
    }
  >;
};

type RewriteLearningStyleStat = {
  styleLabel?: string;
  samples?: number;
  predictedAvg?: number;
  actualAvg?: number;
  multiplier?: number;
  confidence?: number;
  score?: number;
  updatedAt?: string | null;
};

type RewriteLearningResponse = {
  ok?: boolean;
  available?: boolean;
  contextAvailable?: boolean;
  source?: string;
  context_time_bucket?: string;
  context_weekday_bucket?: string;
  by_style?: Record<string, RewriteLearningStyleStat>;
};

type AbDashboardResponse = {
  ok?: boolean;
  available?: boolean;
  days?: number;
  recommendedMode?: BuddyLearningMode | null;
  canAutoSwitch?: boolean;
  recommendationScoreDelta?: number;
  modes?: Array<{
    mode: BuddyLearningMode;
    impressions: number;
    opens: number;
    feedLoads: number;
    openRate: number;
    revisitRate: number;
    engageRate: number;
    confidence: number;
    score: number;
  }>;
};

type FeedbackEvent = "impression" | "open" | "reply" | "like" | "boost" | "skip" | "hide";

const PAGE = 20;

function toPercent(v: number | null | undefined) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return null;
  if (n <= 1) return Math.round(n * 100);
  return Math.round(n);
}

function clamp01(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function missionLevelLabel(xp: {
  level?: number | null;
  xpTotal?: number | null;
  currentLevelXp?: number | null;
  nextLevelXp?: number | null;
}) {
  const level = Math.max(1, Math.floor(Number(xp?.level ?? 1) || 1));
  const total = Math.max(0, Math.floor(Number(xp?.xpTotal ?? 0) || 0));
  const current = Math.max(0, Math.floor(Number(xp?.currentLevelXp ?? 0) || 0));
  const next = Math.max(1, Math.floor(Number(xp?.nextLevelXp ?? 1) || 1));
  return {
    level,
    total,
    current,
    next,
    ratio: clamp01(current / next),
  };
}

function buddyStageInfo(samplesRaw: number | null | undefined) {
  const samples = Math.max(0, Math.floor(Number(samplesRaw ?? 0) || 0));
  if (samples < 6) return { label: "観測中", goal: 6 };
  if (samples < 18) return { label: "学習中", goal: 18 };
  if (samples < 45) return { label: "最適化中", goal: 45 };
  return { label: "安定運用", goal: 80 };
}

function buddyProgress(samplesRaw: number | null | undefined, goalRaw: number | null | undefined) {
  const samples = Math.max(0, Number(samplesRaw ?? 0) || 0);
  const goal = Math.max(1, Number(goalRaw ?? 1) || 1);
  return clamp01(samples / goal);
}

function normalizeBuddyLearningMode(v: string | null | undefined): BuddyLearningMode {
  return String(v ?? "").trim() === "stable" ? "stable" : "adaptive";
}

function buddyLearningModeLabel(mode: BuddyLearningMode) {
  return mode === "stable" ? "stable（安定）" : "adaptive（学習優先）";
}

function todayKeyLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildBuddyMissionRewrites(args: {
  seedText: string;
  basePersona: string | null;
  buddyKey: string;
}) {
  const seed = args.seedText.trim() || "今日の気づき";
  const baseTag = args.basePersona ? `@${args.basePersona}` : "主キャラ";
  const buddyTag = `@${args.buddyKey}`;
  return [
    {
      styleKey: "aggressive" as RewriteStyleKey,
      style: "攻め",
      text: `${seed}。${baseTag}視点で先に結論を言うと、いま試す価値ある。${buddyTag}っぽい切り口で一言ツッコミも添える。`,
    },
    {
      styleKey: "empathy" as RewriteStyleKey,
      style: "共感",
      text: `${seed}って感じた人いる？ まず共感から入ると、${baseTag}の強みが出る。最後に${buddyTag}的なやわらかい問いかけを1つ。`,
    },
    {
      styleKey: "short" as RewriteStyleKey,
      style: "短文",
      text: `${seed}。\n結論だけ。\nでも余韻は残す。\n(${baseTag} × ${buddyTag})`,
    },
  ];
}

function reasonLabel(reason: string | null | undefined) {
  const r = String(reason ?? "").trim();
  if (!r) return "persona_match";
  if (r === "same_persona") return "同キャラ";
  if (r.startsWith("buddy_compat_")) return "バディ優先";
  if (r.startsWith("compat_")) return "相性";
  if (r === "fallback_no_scores" || r === "global_fallback") return "補完";
  return r;
}

function parseBuddyKey(reason: string | null | undefined) {
  const raw = String(reason ?? "").trim();
  if (!raw.startsWith("buddy_compat_")) return null;
  const key = raw.replace(/^buddy_compat_/, "").trim();
  return key || null;
}

function composeUrlWithMissionRewrite(args: {
  text: string;
  styleKey: RewriteStyleKey;
  styleLabel: string;
  buddyKey: string;
  basePersona: string | null;
}) {
  const params = new URLSearchParams();
  params.set("seed", args.text);
  params.set("rewriteSource", "persona_mission");
  params.set("rewriteStyleKey", args.styleKey);
  params.set("rewriteStyleLabel", args.styleLabel);
  params.set("rewriteBuddyKey", args.buddyKey);
  if (args.basePersona) params.set("rewriteBasePersona", args.basePersona);
  params.set("rewriteSuggestedAt", new Date().toISOString());
  return `/compose?${params.toString()}`;
}

function explainPersonaFeedReason(match: MatchMeta | undefined, basePersona: string | null) {
  const reason = String(match?.reason ?? "").trim();
  const lines: string[] = [];

  if (reason === "same_persona") {
    lines.push(
      `あなたの主キャラ${basePersona ? ` (@${basePersona})` : ""}と投稿キャラが近いため優先表示されています。`
    );
  } else if (reason.startsWith("buddy_compat_")) {
    const buddyKey = reason.replace(/^buddy_compat_/, "");
    lines.push(
      `最近よく使っているバディ組み合わせ（主キャラ${basePersona ? ` @${basePersona}` : ""} × @${buddyKey}）を優先して表示しています。`
    );
  } else if (reason.startsWith("compat_")) {
    const compatKey = reason.replace(/^compat_/, "");
    lines.push(
      `主キャラ${basePersona ? ` @${basePersona}` : ""}と相性が高い @${compatKey} 系統として表示されています。`
    );
  } else if (reason === "fallback_no_scores" || reason === "global_fallback") {
    lines.push("キャラスコア不足のため、通常TLから補完表示されています。");
  } else if (reason) {
    lines.push(`表示理由コード: ${reason}`);
  } else {
    lines.push("表示理由データがまだありません。");
  }

  if (match?.weight != null) {
    lines.push(`学習重み: x${Number(match.weight).toFixed(2)}`);
  }
  if (match?.buddy_weight != null && Number(match.buddy_weight) > 1.01) {
    lines.push(`バディ優先ブースト: x${Number(match.buddy_weight).toFixed(2)}`);
  }
  if (match?.buddy_bonus_scale != null) {
    lines.push(`学習係数上限: +${Math.round(Number(match.buddy_bonus_scale) * 100)}%`);
  }
  if (match?.buddy_score != null && Number(match.buddy_score) > 0) {
    lines.push(`バディ一致度: ${(Number(match.buddy_score) * 100).toFixed(1)}%`);
  }
  if (match?.raw_score != null) {
    lines.push(`原スコア: ${(Number(match.raw_score) * 100).toFixed(1)}%`);
  }
  if (match?.weighted_score != null) {
    lines.push(`重み後スコア: ${(Number(match.weighted_score) * 100).toFixed(1)}%`);
  }
  if (match?.predicted_response != null) {
    lines.push(`予測反応率: ${(Number(match.predicted_response) * 100).toFixed(1)}%`);
  }
  if (match?.calibration_multiplier != null) {
    lines.push(
      `バズ補正: x${Number(match.calibration_multiplier).toFixed(2)} (n=${Number(
        match.calibration_samples ?? 0
      )})`
    );
  }

  return lines;
}

function extractTrendingTopics(items: FeedItem[], limit = 8) {
  const count = new Map<string, number>();
  items.slice(0, 80).forEach((item) => {
    const text = String(item?.text ?? item?.body ?? "").trim();
    if (!text) return;
    const hashMatches = text.match(/#[\p{L}\p{N}_]{2,24}/gu) ?? [];
    hashMatches.forEach((h) => count.set(h, (count.get(h) ?? 0) + 3));
    const tokens =
      text
        .toLowerCase()
        .match(/[\p{L}\p{N}]{2,12}/gu)
        ?.filter((t) => !t.startsWith("#")) ?? [];
    tokens.slice(0, 24).forEach((t) => count.set(t, (count.get(t) ?? 0) + 1));
  });
  return Array.from(count.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, score]) => ({ label, score }));
}

export default function PersonaFeedPage() {
  const [personaFeedState, personaFeedActions] = usePersonaFeedState<FeedItem>({
    hasMore: true,
    items: [],
  });
  const [strategy, setStrategy] = useState<Strategy>("compat");
  const [basePersona, setBasePersona] = useState<string | null>(null);
  const [usedPersonas, setUsedPersonas] = useState<string[]>([]);
  const [buddyPersonas, setBuddyPersonas] = useState<
    Array<{
      key: string;
      score: number;
      bonus_scale?: number;
      raw_bonus_scale?: number;
      learned_samples?: number;
      learning_confidence?: number;
      history_points?: BuddyHistoryPoint[];
    }>
  >([]);
  const items = personaFeedState.items;
  const [page, setPage] = useState(0);
  const hasMore = personaFeedState.hasMore;
  const loading = personaFeedState.loading;
  const [buddyLearningMode, setBuddyLearningMode] = useState<BuddyLearningMode>("adaptive");
  const [buddyLearningModeAvailable, setBuddyLearningModeAvailable] = useState(false);
  const [buddyLearningModeSource, setBuddyLearningModeSource] =
    useState<BuddyLearningModeSource>("default");
  const [buddyLearningModeAb, setBuddyLearningModeAb] = useState<ApiResponse["buddy_learning_mode_ab"]>(
    null
  );
  const [savingBuddyLearningMode, setSavingBuddyLearningMode] = useState(false);
  const [buddyModeDashboard, setBuddyModeDashboard] = useState<AbDashboardResponse | null>(null);
  const [buddyModeDashboardLoading, setBuddyModeDashboardLoading] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  const error = personaFeedState.error;
  const [openedIds, setOpenedIds] = useState<Record<string, true>>({});
  const [expandedReasonPostId, setExpandedReasonPostId] = useState<string | null>(null);
  const [buddyMissionCursor, setBuddyMissionCursor] = useState(0);
  const [buddyMissionCounts, setBuddyMissionCounts] = useState<Record<string, number>>({});
  const [buddyMissionStreaks, setBuddyMissionStreaks] = useState<Record<string, number>>({});
  const [buddyMissionProgressAvailable, setBuddyMissionProgressAvailable] = useState(false);
  const [buddyMissionXpAvailable, setBuddyMissionXpAvailable] = useState(false);
  const [buddyMissionXpByBuddy, setBuddyMissionXpByBuddy] = useState<
    Record<
      string,
      {
        xpTotal?: number;
        level?: number;
        currentLevelXp?: number;
        nextLevelXp?: number;
        levelProgressRatio?: number;
        completedMissions?: number;
      }
    >
  >({});
  const [buddyMissionRewriteSeed, setBuddyMissionRewriteSeed] = useState("");
  const [copiedRewriteIndex, setCopiedRewriteIndex] = useState<number | null>(null);
  const [rewriteLearningByStyle, setRewriteLearningByStyle] = useState<
    Record<string, RewriteLearningStyleStat>
  >({});
  const [rewriteLearningAvailable, setRewriteLearningAvailable] = useState(false);
  const [rewriteLearningSource, setRewriteLearningSource] = useState<string>("default");
  const [rewriteLearningContextLabel, setRewriteLearningContextLabel] = useState<string>("");
  const [rewriteLearningLoading, setRewriteLearningLoading] = useState(false);
  const ids = useRef<Set<string>>(new Set());
  const openStateRequestedIds = useRef<Set<string>>(new Set());
  const persistedOpenedIds = useRef<Set<string>>(new Set());
  const itemsRef = useRef<FeedItem[]>([]);
  const impressionIds = useRef<Set<string>>(new Set());
  const seenAt = useRef<Map<string, number>>(new Map());
  const actionedIds = useRef<Set<string>>(new Set());
  const skipSentIds = useRef<Set<string>>(new Set());
  const hiddenIds = useRef<Set<string>>(new Set());
  const missionOpenedPostKeys = useRef<Set<string>>(new Set());

  const setItems = useCallback(
    (next: FeedItem[] | ((prev: FeedItem[]) => FeedItem[])) => {
      const prevItems = itemsRef.current;
      const resolved =
        typeof next === "function" ? (next as (prev: FeedItem[]) => FeedItem[])(prevItems) : next;
      personaFeedActions.replace(resolved);
    },
    [personaFeedActions]
  );
  const setHasMore = useCallback(
    (next: boolean) => personaFeedActions.patch({ hasMore: Boolean(next) }),
    [personaFeedActions]
  );
  const setLoading = useCallback(
    (next: boolean) => {
      if (next) {
        personaFeedActions.start(false);
        return;
      }
      personaFeedActions.patch({ loading: false, refreshing: false });
    },
    [personaFeedActions]
  );
  const setError = useCallback(
    (next: string | null) => personaFeedActions.setError(next),
    [personaFeedActions]
  );

  const applyBuddyLearningFeedback = useCallback(
    (
      payload: any,
      fallback?: {
        buddyKey?: string | null;
        buddyScore?: number | null;
      }
    ) => {
      const key = String(payload?.buddyPersona ?? fallback?.buddyKey ?? "").trim();
      if (!key) return;
      const bonus = Number(payload?.effectiveBonusScale ?? payload?.bonusScale ?? NaN);
      const rawBonus = Number(payload?.rawBonusScale ?? NaN);
      const confidence = clamp01(Number(payload?.confidence ?? NaN));
      const samples = Math.max(0, Math.floor(Number(payload?.samples ?? 0) || 0));
      const fallbackScore = clamp01(Number(fallback?.buddyScore ?? 0));

      setBuddyPersonas((prev) => {
        const idx = prev.findIndex((x) => x.key === key);
        const base = idx >= 0 ? prev[idx] : null;
        const nextItem = {
          key,
          score: base ? clamp01(base.score) : fallbackScore,
          bonus_scale: Number.isFinite(bonus)
            ? Math.max(0.12, Math.min(0.95, bonus))
            : base?.bonus_scale,
          raw_bonus_scale: Number.isFinite(rawBonus)
            ? Math.max(0.12, Math.min(0.95, rawBonus))
            : base?.raw_bonus_scale,
          learned_samples: samples,
          learning_confidence: confidence,
          history_points: Array.isArray(base?.history_points)
            ? [
                ...base.history_points.slice(-8),
                {
                  bonus_scale: Number.isFinite(bonus) ? bonus : base?.bonus_scale ?? null,
                  confidence,
                  samples,
                  created_at: new Date().toISOString(),
                },
              ].slice(-10)
            : undefined,
        };
        const next = idx >= 0 ? [...prev] : [...prev, nextItem];
        if (idx >= 0) {
          next[idx] = {
            ...next[idx],
            ...nextItem,
          };
        }
        return next.sort((a, b) => b.score - a.score);
      });
    },
    []
  );

  const postFeedback = useCallback(
    async (
      p: FeedItem,
      event: FeedbackEvent,
      opts?: {
        dwellMs?: number | null;
      }
    ) => {
      if (event !== "impression") {
        actionedIds.current.add(p.id);
      }
      if (event === "skip" || event === "hide") {
        skipSentIds.current.add(p.id);
      }
      try {
        const res = await fetch("/api/me/persona-feed/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            postId: p.id,
            personaKey: p.persona_match?.key ?? null,
            basePersona,
            buddyLearningMode,
            strategy,
            reason: p.persona_match?.reason ?? null,
            event,
            dwellMs:
              opts?.dwellMs ??
              (seenAt.current.has(p.id)
                ? Math.max(0, Math.min(120_000, Date.now() - (seenAt.current.get(p.id) ?? Date.now())))
                : null),
          }),
        });
        if (res.ok) {
          const json = await res.json().catch(() => null);
          const buddyLearning = json?.buddyLearning;
          if (buddyLearning?.available) {
            applyBuddyLearningFeedback(buddyLearning, {
              buddyKey: parseBuddyKey(p.persona_match?.reason),
              buddyScore: p.persona_match?.buddy_score ?? null,
            });
          }
        }
      } catch {
        // ignore
      }
    },
    [applyBuddyLearningFeedback, basePersona, buddyLearningMode, strategy]
  );

  const hydrateOpenedState = useCallback(async (postIds: string[]) => {
    const unique = Array.from(new Set(postIds.map((x) => String(x ?? "").trim()).filter(Boolean)));
    if (unique.length === 0) return;
    const missing = unique.filter((x) => !openStateRequestedIds.current.has(x));
    if (missing.length === 0) return;
    missing.forEach((x) => openStateRequestedIds.current.add(x));

    try {
      const params = new URLSearchParams();
      params.set("postIds", missing.join(","));
      const res = await fetch(`/api/me/post-open-state?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = await res.json().catch(() => null);
      const opened = Array.isArray(json?.openedIds)
        ? json.openedIds.map((x: any) => String(x ?? "").trim()).filter(Boolean)
        : [];
      if (opened.length === 0) return;
      opened.forEach((x) => persistedOpenedIds.current.add(x));
      setOpenedIds((prev) => {
        const next = { ...prev };
        opened.forEach((x) => {
          next[x] = true;
        });
        return next;
      });
    } catch {
      // ignore
    }
  }, []);

  const persistOpenedState = useCallback(async (postId: string) => {
    try {
      const res = await fetch("/api/me/post-open-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId,
          source: "persona_feed",
        }),
      });
      if (!res.ok) {
        persistedOpenedIds.current.delete(postId);
      }
    } catch {
      persistedOpenedIds.current.delete(postId);
    }
  }, []);

  const loadBuddyMissionProgress = useCallback(
    async (args: { basePersona: string | null; buddyKeys: string[] }) => {
      const base = String(args.basePersona ?? "").trim();
      const keys = Array.from(new Set(args.buddyKeys.map((x) => String(x ?? "").trim()).filter(Boolean)));
      if (!keys.length) return;
      try {
        const params = new URLSearchParams();
        params.set("missionDate", todayKeyLocal());
        params.set("basePersona", base || "__all__");
        params.set("buddyKeys", keys.join(","));
        const res = await fetch(`/api/me/persona-feed/missions?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as BuddyMissionProgressResponse | null;
        if (!json) return;
        setBuddyMissionProgressAvailable(Boolean(json.available));
        setBuddyMissionXpAvailable(Boolean(json.xpAvailable));
        if (json.counts && typeof json.counts === "object") {
          setBuddyMissionCounts((prev) => ({
            ...prev,
            ...Object.fromEntries(
              Object.entries(json.counts ?? {}).map(([k, v]) => [
                k,
                Math.max(0, Math.floor(Number(v ?? 0) || 0)),
              ])
            ),
          }));
        }
        if (json.streaks && typeof json.streaks === "object") {
          setBuddyMissionStreaks((prev) => ({
            ...prev,
            ...Object.fromEntries(
              Object.entries(json.streaks ?? {}).map(([k, v]) => [
                k,
                Math.max(0, Math.floor(Number(v ?? 0) || 0)),
              ])
            ),
          }));
        }
        if (json.xp && typeof json.xp === "object") {
          setBuddyMissionXpByBuddy((prev) => ({
            ...prev,
            ...json.xp,
          }));
        }
      } catch {
        // ignore
      }
    },
    []
  );

  const persistBuddyMissionProgress = useCallback(
    async (args: { basePersona: string | null; buddyKey: string; targetCount: number }) => {
      const buddyKey = String(args.buddyKey ?? "").trim();
      if (!buddyKey) return;
      try {
        const res = await fetch("/api/me/persona-feed/missions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            missionDate: todayKeyLocal(),
            basePersona: String(args.basePersona ?? "").trim() || "__all__",
            buddyPersona: buddyKey,
            missionKind: "open",
            delta: 1,
            targetCount: Math.max(1, Math.floor(Number(args.targetCount ?? 1) || 1)),
          }),
        });
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        if (!json) return;
        if (json.available === false) {
          setBuddyMissionProgressAvailable(false);
          return;
        }
        setBuddyMissionProgressAvailable(Boolean(json.available));
        if (typeof json.xpAvailable === "boolean") setBuddyMissionXpAvailable(Boolean(json.xpAvailable));
        const countKey = String(json.countKey ?? `${todayKeyLocal()}:${buddyKey}`).trim();
        const progressCount = Math.max(
          0,
          Math.floor(Number(json?.mission?.progressCount ?? buddyMissionCounts[countKey] ?? 0) || 0)
        );
        const streakDays = Math.max(0, Math.floor(Number(json?.mission?.streakDays ?? 0) || 0));
        if (json?.mission?.xp && typeof json.mission.xp === "object") {
          setBuddyMissionXpByBuddy((prev) => ({
            ...prev,
            [buddyKey]: {
              ...(prev[buddyKey] ?? {}),
              ...json.mission.xp,
            },
          }));
        }
        setBuddyMissionCounts((prev) => ({ ...prev, [countKey]: progressCount }));
        setBuddyMissionStreaks((prev) => ({ ...prev, [buddyKey]: streakDays }));
      } catch {
        // ignore
      }
    },
    [buddyMissionCounts]
  );

  const loadRewriteLearning = useCallback(
    async (args: { basePersona: string | null; buddyKey: string | null }) => {
      const buddyKey = String(args.buddyKey ?? "").trim();
      if (!buddyKey) {
        setRewriteLearningAvailable(false);
        setRewriteLearningByStyle({});
        setRewriteLearningSource("default");
        setRewriteLearningContextLabel("");
        return;
      }
      setRewriteLearningLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("buddyPersona", buddyKey);
        if (args.basePersona) params.set("basePersona", args.basePersona);
        params.set("refresh", "1");
        params.set("tzOffsetMinutes", String(new Date().getTimezoneOffset()));
        const res = await fetch(`/api/me/persona-feed/rewrite-learning?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as RewriteLearningResponse | null;
        if (!json) return;
        setRewriteLearningAvailable(Boolean(json.available));
        setRewriteLearningSource(String(json.source ?? "default"));
        const tb = String(json.context_time_bucket ?? "").trim();
        const wb = String(json.context_weekday_bucket ?? "").trim();
        setRewriteLearningContextLabel([tb, wb].filter(Boolean).join(" / "));
        setRewriteLearningByStyle(
          json.by_style && typeof json.by_style === "object" ? json.by_style : {}
        );
      } catch {
        // ignore
      } finally {
        setRewriteLearningLoading(false);
      }
    },
    []
  );

  const loadBuddyModeDashboard = useCallback(async () => {
    setBuddyModeDashboardLoading(true);
    try {
      const res = await fetch("/api/me/persona-feed/ab-dashboard?days=14", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json().catch(() => null)) as AbDashboardResponse | null;
      if (!json) return;
      setBuddyModeDashboard(json);
    } catch {
      // ignore
    } finally {
      setBuddyModeDashboardLoading(false);
    }
  }, []);

  const flushSkipEvents = useCallback(() => {
    const now = Date.now();
    itemsRef.current.forEach((p) => {
      if (!impressionIds.current.has(p.id)) return;
      if (actionedIds.current.has(p.id)) return;
      if (skipSentIds.current.has(p.id)) return;
      const started = seenAt.current.get(p.id);
      if (!started) return;
      const dwell = Math.max(0, Math.min(120_000, now - started));
      if (dwell < 300) return;
      skipSentIds.current.add(p.id);
      void postFeedback(p, "skip", { dwellMs: dwell });
    });
  }, [postFeedback]);

  const fetchPage = useCallback(
    async (nextPage: number, replace = false) => {
      if (loading) return;
      setLoading(true);
      setError(null);

      try {
        const { res, json } = (await fetchPersonaFeedPage({
          limit: PAGE,
          offset: nextPage * PAGE,
          strategy,
        })) as { res: Response; json: ApiResponse | null };

        if (res.status === 401) {
          setNeedLogin(true);
          setItems([]);
          setHasMore(false);
          return;
        }
        if (!res.ok || !json) {
          throw new Error(json?.error ?? "キャラ別タイムライン取得に失敗しました");
        }

        if (replace) {
          flushSkipEvents();
          ids.current.clear();
          hiddenIds.current.clear();
          openStateRequestedIds.current.clear();
          persistedOpenedIds.current.clear();
          setOpenedIds({});
          setExpandedReasonPostId(null);
          setItems([]);
        }

        setNeedLogin(false);
        setBuddyLearningMode(normalizeBuddyLearningMode(json.buddy_learning_mode));
        setBuddyLearningModeAvailable(Boolean(json.buddy_learning_mode_available));
        setBuddyLearningModeSource(
          json.buddy_learning_mode_source === "preference" ||
            json.buddy_learning_mode_source === "ab_assignment" ||
            json.buddy_learning_mode_source === "ab_optimized"
            ? json.buddy_learning_mode_source
            : "default"
        );
        setBuddyLearningModeAb(json.buddy_learning_mode_ab ?? null);
        setBasePersona(json.base_persona ?? null);
        setUsedPersonas(json.used_personas ?? []);
        setBuddyPersonas(
          Array.isArray(json.buddy_personas)
            ? json.buddy_personas
                .map((x) => ({
                  key: String(x?.key ?? "").trim(),
                  score: Number(x?.score ?? 0) || 0,
                  bonus_scale:
                    Number.isFinite(Number(x?.bonus_scale))
                      ? Number(x?.bonus_scale)
                      : undefined,
                  raw_bonus_scale:
                    Number.isFinite(Number(x?.raw_bonus_scale))
                      ? Number(x?.raw_bonus_scale)
                      : undefined,
                  learned_samples: Math.max(
                    0,
                    Math.floor(Number(x?.learned_samples ?? 0) || 0)
                  ),
                  learning_confidence: Math.max(
                    0,
                    Math.min(1, Number(x?.learning_confidence ?? 0) || 0)
                  ),
                  history_points: Array.isArray(x?.history_points)
                    ? x.history_points
                        .map((p: any) => ({
                          bonus_scale:
                            Number.isFinite(Number(p?.bonus_scale)) ? Number(p.bonus_scale) : null,
                          confidence:
                            Number.isFinite(Number(p?.confidence)) ? Number(p.confidence) : null,
                          samples:
                            Number.isFinite(Number(p?.samples))
                              ? Math.max(0, Math.floor(Number(p.samples)))
                              : null,
                          created_at: String(p?.created_at ?? "").trim() || null,
                        }))
                        .filter((p: any) => p.created_at)
                    : undefined,
                }))
                .filter((x) => x.key)
            : []
        );

        const incoming = json.items ?? [];
        void hydrateOpenedState(incoming.map((x) => String(x?.id ?? "").trim()));
        setItems((prev) => {
          const base = replace ? [] : [...prev];
          for (const p of incoming) {
            if (!p?.id || ids.current.has(p.id)) continue;
            if (hiddenIds.current.has(p.id)) continue;
            ids.current.add(p.id);
            base.push(p);
          }
          return base;
        });

        setHasMore(incoming.length === PAGE);
      } catch (e: any) {
        setError(e?.message ?? "キャラ別タイムライン取得に失敗しました");
      } finally {
        setLoading(false);
      }
    },
    [hydrateOpenedState, loading, strategy]
  );

  useEffect(() => {
    flushSkipEvents();
    setPage(0);
    setHasMore(true);
    void fetchPage(0, true);
  }, [fetchPage, flushSkipEvents, strategy]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      flushSkipEvents();
    };
  }, [flushSkipEvents]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        flushSkipEvents();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [flushSkipEvents]);

  useEffect(() => {
    const targets = items.filter((p) => !impressionIds.current.has(p.id)).slice(0, 12);
    if (targets.length === 0) return;
    targets.forEach((p) => {
      impressionIds.current.add(p.id);
      if (!seenAt.current.has(p.id)) seenAt.current.set(p.id, Date.now());
      void postFeedback(p, "impression");
    });
  }, [items, postFeedback]);

  const hideItem = useCallback((p: FeedItem) => {
    hiddenIds.current.add(p.id);
    actionedIds.current.add(p.id);
    setItems((prev) => prev.filter((x) => x.id !== p.id));
    setExpandedReasonPostId((prev) => (prev === p.id ? null : prev));
    void postFeedback(p, "hide");
  }, [postFeedback]);

  const markOpened = useCallback((postId: string) => {
    const id = String(postId ?? "").trim();
    if (!id) return;
    setOpenedIds((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
    if (persistedOpenedIds.current.has(id)) return;
    persistedOpenedIds.current.add(id);
    void persistOpenedState(id);
  }, [persistOpenedState]);

  const hint = useMemo(() => {
    if (!basePersona) return "キャラ分析が未作成のため、通常フィード寄りで表示します。";
    return strategy === "same"
      ? `あなたの主キャラ @${basePersona} と同系統の投稿を優先表示しています。`
      : `@${basePersona} と相性の良いキャラ投稿を優先表示しています。`;
  }, [basePersona, strategy]);

  const freshItems = useMemo(
    () => items.filter((p) => !openedIds[p.id]),
    [items, openedIds]
  );
  const pastItems = useMemo(
    () => items.filter((p) => !!openedIds[p.id]),
    [items, openedIds]
  );
  const trendingTopics = useMemo(() => extractTrendingTopics(items, 8), [items]);
  const buddyProgressRows = useMemo(
    () =>
      buddyPersonas.slice(0, 4).map((x) => {
        const stage = buddyStageInfo(x.learned_samples);
        const samples = Math.max(0, Math.floor(Number(x.learned_samples ?? 0) || 0));
        return {
          ...x,
          stageLabel: stage.label,
          stageGoal: stage.goal,
          progress: buddyProgress(samples, stage.goal),
          remainingSamples: Math.max(0, stage.goal - samples),
          confidence: clamp01(Number(x.learning_confidence ?? 0)),
        };
      }),
    [buddyPersonas]
  );
  const missionCandidates = useMemo(
    () =>
      [...buddyProgressRows].sort((a, b) => {
        if (a.confidence !== b.confidence) return a.confidence - b.confidence;
        return b.score - a.score;
      }),
    [buddyProgressRows]
  );
  const buddyMission = useMemo(() => {
    if (!missionCandidates.length) return null;
    const selected = missionCandidates[buddyMissionCursor % missionCandidates.length];
    const openTarget =
      selected.remainingSamples > 0
        ? Math.max(1, Math.min(3, Math.ceil(selected.remainingSamples / 2)))
        : 1;
    const missionKey = `${todayKeyLocal()}:${selected.key}`;
    const progress = Math.max(0, Math.floor(Number(buddyMissionCounts[missionKey] ?? 0) || 0));
    const unlocked = progress >= openTarget;
    const streakDays = Math.max(0, Math.floor(Number(buddyMissionStreaks[selected.key] ?? 0) || 0));
    const xp = buddyMissionXpByBuddy[selected.key] ?? {};
    if (selected.remainingSamples > 0) {
      return {
        text: `今日のバディミッション: @${selected.key} 投稿を${openTarget}件開いて「${selected.stageLabel}」を進める（残り学習サンプル ${selected.remainingSamples}）`,
        key: selected.key,
        goal: openTarget,
        progress,
        unlocked,
        streakDays,
        xp,
        missionKey,
      };
    }
    return {
      text: `今日のバディミッション: @${selected.key} 投稿を1件開いて現在の学習係数を維持する`,
      key: selected.key,
      goal: openTarget,
      progress,
      unlocked,
      streakDays,
      xp,
      missionKey,
    };
  }, [buddyMissionCounts, buddyMissionCursor, buddyMissionStreaks, buddyMissionXpByBuddy, missionCandidates]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("personaFeedBuddyMissionProgress");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      const today = todayKeyLocal();
      const next: Record<string, number> = {};
      Object.entries(parsed as Record<string, any>).forEach(([k, v]) => {
        if (!k.startsWith(`${today}:`)) return;
        const n = Math.max(0, Math.floor(Number(v ?? 0) || 0));
        if (n > 0) next[k] = n;
      });
      setBuddyMissionCounts(next);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      const today = todayKeyLocal();
      const payload: Record<string, number> = {};
      Object.entries(buddyMissionCounts).forEach(([k, v]) => {
        if (!k.startsWith(`${today}:`)) return;
        const n = Math.max(0, Math.floor(Number(v ?? 0) || 0));
        if (n > 0) payload[k] = n;
      });
      localStorage.setItem("personaFeedBuddyMissionProgress", JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [buddyMissionCounts]);

  useEffect(() => {
    if (!missionCandidates.length) return;
    void loadBuddyMissionProgress({
      basePersona,
      buddyKeys: missionCandidates.slice(0, 6).map((x) => x.key),
    });
  }, [basePersona, loadBuddyMissionProgress, missionCandidates]);

  useEffect(() => {
    void loadBuddyModeDashboard();
  }, [loadBuddyModeDashboard]);

  useEffect(() => {
    void loadRewriteLearning({
      basePersona,
      buddyKey: buddyMission?.key ?? null,
    });
  }, [basePersona, buddyMission?.key, loadRewriteLearning]);

  const missionRewriteVariants = useMemo(() => {
    if (!buddyMission?.unlocked) return [];
    return buildBuddyMissionRewrites({
      seedText: buddyMissionRewriteSeed,
      basePersona,
      buddyKey: buddyMission.key,
    })
      .map((variant) => {
        const stat = rewriteLearningByStyle[variant.styleKey] ?? null;
        const multiplier = Number(stat?.multiplier ?? 1);
        const confidence = Number(stat?.confidence ?? 0);
        const samples = Math.max(0, Math.floor(Number(stat?.samples ?? 0) || 0));
        const learnedScore =
          (Number(stat?.score ?? 0.5) || 0.5) *
          (0.8 + clamp01(confidence) * 0.2) *
          clamp01(multiplier / 1.45);
        return {
          ...variant,
          learning: {
            multiplier: Number.isFinite(multiplier) ? multiplier : 1,
            confidence: clamp01(confidence),
            samples,
            learnedScore,
            actualAvg: Number.isFinite(Number(stat?.actualAvg)) ? Number(stat?.actualAvg) : null,
            predictedAvg: Number.isFinite(Number(stat?.predictedAvg))
              ? Number(stat?.predictedAvg)
              : null,
          },
        };
      })
      .sort((a, b) => {
        const aSamples = a.learning.samples;
        const bSamples = b.learning.samples;
        if (aSamples !== bSamples) return bSamples - aSamples;
        const aScore = Number(a.learning.learnedScore ?? 0);
        const bScore = Number(b.learning.learnedScore ?? 0);
        return bScore - aScore;
      });
  }, [basePersona, buddyMission, buddyMissionRewriteSeed, rewriteLearningByStyle]);

  const recordBuddyMissionProgress = useCallback(
    (p: FeedItem, event: FeedbackEvent) => {
      if (event !== "open") return;
      if (!buddyMission) return;
      const buddyKey = parseBuddyKey(p.persona_match?.reason);
      if (!buddyKey || buddyKey !== buddyMission.key) return;
      const eventKey = `${todayKeyLocal()}:${buddyKey}:${p.id}:open`;
      if (missionOpenedPostKeys.current.has(eventKey)) return;
      missionOpenedPostKeys.current.add(eventKey);
      setBuddyMissionCounts((prev) => ({
        ...prev,
        [buddyMission.missionKey]: Math.max(
          0,
          Math.floor(Number(prev[buddyMission.missionKey] ?? 0) || 0) + 1
        ),
      }));
      void persistBuddyMissionProgress({
        basePersona,
        buddyKey,
        targetCount: buddyMission.goal,
      });
    },
    [basePersona, buddyMission, persistBuddyMissionProgress]
  );

  const saveBuddyLearningModePreference = useCallback(async (nextMode: BuddyLearningMode) => {
    setBuddyLearningMode(nextMode);
    setBuddyLearningModeSource("preference");
    setBuddyLearningModeAb(null);
    setSavingBuddyLearningMode(true);
    try {
      const res = await fetch("/api/me/persona-feed/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buddyLearningMode: nextMode }),
      });
      const json = await res.json().catch(() => null);
      setBuddyLearningMode(normalizeBuddyLearningMode(json?.buddyLearningMode ?? nextMode));
      setBuddyLearningModeAvailable(Boolean(json?.available));
      setPage(0);
      setHasMore(true);
      void fetchPage(0, true);
    } catch {
      // keep local mode optimistically
      setPage(0);
      setHasMore(true);
      void fetchPage(0, true);
    } finally {
      setSavingBuddyLearningMode(false);
    }
  }, [fetchPage]);

  if (needLogin) {
    return (
      <div className="space-y-3 p-6">
        <h1 className="text-xl font-semibold">キャラ別タイムライン</h1>
        <p className="text-sm opacity-70">
          この機能はログイン後に使えます。
        </p>
        <a href="/login?next=/persona-feed" className="underline">
          ログインする
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">キャラ別タイムライン</h1>
        <p className="text-sm opacity-70">{hint}</p>
        <div className="flex flex-wrap gap-3 text-sm">
          <a href="/persona-evolution" className="underline">
            キャラ進化を見る
          </a>
          <a href="/persona-lab" className="underline">
            キャラ対話AIを使う
          </a>
        </div>
      </header>

      {trendingTopics.length > 0 && (
        <div className="rounded-xl border bg-white p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">トレンドトピック（For You）</div>
            <span className="text-[11px] opacity-70">X / Insta 風の発見導線</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {trendingTopics.map((topic) => (
              <a
                key={`topic-${topic.label}`}
                href={topic.label.startsWith("#")
                  ? `/compose?seed=${encodeURIComponent(`${topic.label} `)}`
                  : `/search?q=${encodeURIComponent(topic.label)}`}
                className="text-xs px-2 py-1 rounded-full border bg-slate-50 hover:bg-slate-100"
                title={`score ${topic.score}`}
              >
                {topic.label.startsWith("#") ? topic.label : `#${topic.label}`}
              </a>
            ))}
          </div>
          <div className="text-[11px] opacity-70">
            ハッシュタグは投稿作成に、通常トピックは検索にワンタップで移動します。
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setStrategy("same")}
          className={`px-3 py-1 rounded-full border text-sm ${
            strategy === "same" ? "bg-blue-600 text-white border-blue-600" : "bg-white"
          }`}
        >
          同キャラ優先
        </button>
        <button
          type="button"
          onClick={() => setStrategy("compat")}
          className={`px-3 py-1 rounded-full border text-sm ${
            strategy === "compat" ? "bg-blue-600 text-white border-blue-600" : "bg-white"
          }`}
        >
          相性キャラ優先
        </button>
      </div>

      <div className="rounded-xl border bg-white p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold">バディ学習の強さ</div>
          <div className="text-xs opacity-70">
            {buddyLearningModeAvailable ? "DB保存" : "ローカル/既定値"}
          </div>
        </div>
        <div className="text-[11px] opacity-70">
          {buddyLearningModeSource === "preference"
            ? "あなたが選択した設定を使用中"
            : buddyLearningModeSource === "ab_optimized"
            ? "A/B実績（開封率/再訪率）に基づく自動最適化を使用中"
            : buddyLearningModeSource === "ab_assignment" && buddyLearningModeAb?.variant_key
            ? `A/B最適化中: variant ${buddyLearningModeAb.variant_key}（既定 ${buddyLearningModeAb.assigned_mode}）`
            : "既定の学習モードを使用中"}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={savingBuddyLearningMode || buddyLearningMode === "adaptive"}
            onClick={() => void saveBuddyLearningModePreference("adaptive")}
            className={`px-3 py-1 rounded-full border text-sm disabled:opacity-60 ${
              buddyLearningMode === "adaptive"
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white"
            }`}
          >
            adaptive（学習優先）
          </button>
          <button
            type="button"
            disabled={savingBuddyLearningMode || buddyLearningMode === "stable"}
            onClick={() => void saveBuddyLearningModePreference("stable")}
            className={`px-3 py-1 rounded-full border text-sm disabled:opacity-60 ${
              buddyLearningMode === "stable" ? "bg-slate-700 text-white border-slate-700" : "bg-white"
            }`}
          >
            stable（安定）
          </button>
        </div>
        <p className="text-xs opacity-70">
          {buddyLearningMode === "adaptive"
            ? "新しい反応から表示順を素早く調整します。探索が増え、変化を感じやすいモードです。"
            : "表示順の急変を抑えて、慣れた体験を維持します。学習は継続しますが反映は穏やかです。"}
        </p>
        <div className="rounded-lg border bg-slate-50 p-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium">A/B集計（開封率・再訪率）</div>
            <div className="flex items-center gap-2">
              <a href="/dashboard/ab-timeseries" className="text-xs underline">
                時系列を見る
              </a>
              <button
                type="button"
                className="text-xs underline"
                onClick={() => void loadBuddyModeDashboard()}
                disabled={buddyModeDashboardLoading}
              >
                {buddyModeDashboardLoading ? "更新中…" : "更新"}
              </button>
            </div>
          </div>
          {!buddyModeDashboard?.available ? (
            <div className="text-[11px] opacity-70">
              A/Bイベントが蓄積中です。一定サンプルで既定modeの自動最適化に使われます。
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-[11px] opacity-70">
                直近 {Math.max(1, Math.floor(Number(buddyModeDashboard.days ?? 14) || 14))}日 / 推奨:
                {" "}
                {buddyModeDashboard.recommendedMode ?? "未確定"}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(buddyModeDashboard.modes ?? []).map((m) => (
                  <div key={`ab-mode-${m.mode}`} className="rounded border bg-white p-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold">{m.mode}</div>
                      <div className="text-[10px] opacity-70">
                        score {Number(m.score ?? 0).toFixed(3)}
                      </div>
                    </div>
                    <div className="text-[11px] opacity-80">
                      開封率 {Math.round(clamp01(Number(m.openRate ?? 0)) * 100)}% / 再訪率{" "}
                      {Math.round(clamp01(Number(m.revisitRate ?? 0)) * 100)}%
                    </div>
                    <div className="text-[10px] opacity-70">
                      impression {Math.max(0, Math.floor(Number(m.impressions ?? 0) || 0))} / feed_load{" "}
                      {Math.max(0, Math.floor(Number(m.feedLoads ?? 0) || 0))}
                    </div>
                  </div>
                ))}
              </div>
              {buddyModeDashboard.recommendedMode &&
                buddyLearningModeSource !== "preference" &&
                buddyLearningMode !== buddyModeDashboard.recommendedMode && (
                  <div className="text-[11px] text-emerald-700">
                    既定modeの自動最適化候補: {buddyModeDashboard.recommendedMode}
                  </div>
                )}
            </div>
          )}
        </div>
      </div>

      {usedPersonas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {usedPersonas.map((k) => (
            <span
              key={k}
              className={`text-xs px-2 py-1 rounded-full border ${
                k === basePersona ? "bg-blue-50 border-blue-300" : "bg-gray-50"
              }`}
            >
              @{k}
            </span>
          ))}
        </div>
      )}
      {buddyPersonas.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-emerald-900">
              バディ優先が有効です（{buddyLearningModeLabel(buddyLearningMode)} / 最近の投稿傾向から自動学習）
            </div>
            {missionCandidates.length > 1 && (
              <button
                type="button"
                onClick={() => setBuddyMissionCursor((prev) => prev + 1)}
                className="text-xs underline text-emerald-900/80"
              >
                ミッション変更
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {buddyPersonas.slice(0, 6).map((x) => (
              (() => {
                const xp = missionLevelLabel(buddyMissionXpByBuddy[x.key] ?? {});
                return (
              <span
                key={`buddy-${x.key}`}
                className="text-xs px-2 py-1 rounded-full border border-emerald-300 bg-white"
              >
                @{x.key} {(Math.max(0, Math.min(1, x.score)) * 100).toFixed(0)}% / 係数+
                {Math.round(Math.max(0.12, Math.min(0.95, Number(x.bonus_scale ?? 0.42))) * 100)}
                % / 信頼
                {Math.round(
                  Math.max(0, Math.min(1, Number(x.learning_confidence ?? 0))) * 100
                )}%
                {buddyMissionXpAvailable ? ` / Lv${xp.level}` : ""}
              </span>
                );
              })()
            ))}
          </div>
          {buddyProgressRows.length > 0 && (
            <div className="space-y-2 rounded-lg border border-emerald-200 bg-white/80 p-2">
              <div className="text-xs font-medium text-emerald-900">学習進捗</div>
              {buddyProgressRows.slice(0, 3).map((x) => (
                <div key={`buddy-progress-${x.key}`} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-emerald-900">
                      @{x.key} {x.stageLabel}
                    </span>
                    <span className="text-emerald-900/80">
                      {Math.round(x.progress * 100)}% / 信頼{Math.round(x.confidence * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-emerald-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${Math.round(x.progress * 100)}%` }}
                    />
                  </div>
                  {Array.isArray(x.history_points) && x.history_points.length > 1 && (
                    <div className="space-y-1">
                      <div className="text-[10px] text-emerald-900/70">
                        係数推移（最近）: 「自分向けTL」が育っているか確認できます
                      </div>
                      <div className="h-8 flex items-end gap-[2px] rounded border border-emerald-100 bg-emerald-50 px-1 py-1">
                        {x.history_points.slice(-12).map((pt, idx, arr) => {
                          const values = arr.map((v) =>
                            Math.max(0.12, Math.min(0.95, Number(v?.bonus_scale ?? x.bonus_scale ?? 0.42)))
                          );
                          const min = Math.min(...values);
                          const max = Math.max(...values);
                          const cur = values[idx];
                          const ratio = max - min > 0.0001 ? (cur - min) / (max - min) : 0.5;
                          const h = 6 + Math.round(ratio * 18);
                          return (
                            <div
                              key={`${x.key}-hist-${idx}-${String(pt?.created_at ?? idx)}`}
                              className="w-1 rounded-sm bg-emerald-500/80"
                              style={{ height: `${h}px` }}
                              title={`+${Math.round(cur * 100)}% / n=${Math.max(
                                0,
                                Math.floor(Number(pt?.samples ?? 0) || 0)
                              )}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {buddyMission && (
            <div className="space-y-2 rounded-lg border border-emerald-200 bg-white/70 px-2 py-2">
              <div className="text-xs text-emerald-900">{buddyMission.text}</div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-emerald-900/80">
                <span>
                  連続達成 {buddyMission.streakDays}日
                </span>
                <span>・</span>
                <span>{buddyMissionProgressAvailable ? "進捗はDB保存" : "進捗はローカル保持"}</span>
                {buddyMissionXpAvailable && (
                  <>
                    <span>・</span>
                    <span>Lv{missionLevelLabel(buddyMission.xp ?? {}).level}</span>
                  </>
                )}
              </div>
              {buddyMissionXpAvailable && (
                <div className="space-y-1">
                  {(() => {
                    const xp = missionLevelLabel(buddyMission.xp ?? {});
                    const gainedXp = Math.max(
                      0,
                      Math.floor(Number((buddyMission.xp as any)?.gainedXp ?? 0) || 0)
                    );
                    const completed = Math.max(
                      0,
                      Math.floor(Number((buddyMission.xp as any)?.completedMissions ?? 0) || 0)
                    );
                    return (
                      <>
                        <div className="flex items-center justify-between text-[11px] text-emerald-900/80">
                          <span>XP {xp.current}/{xp.next}（累計 {xp.total}）</span>
                          <span>達成 {completed}回</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-emerald-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-cyan-500"
                            style={{ width: `${Math.round(xp.ratio * 100)}%` }}
                          />
                        </div>
                        {gainedXp > 0 && (
                          <div className="text-[10px] text-cyan-700">今回 +{gainedXp} XP</div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-emerald-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      buddyMission.unlocked ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                    style={{
                      width: `${Math.round(
                        clamp01(buddyMission.progress / Math.max(1, buddyMission.goal)) * 100
                      )}%`,
                    }}
                  />
                </div>
                <div className="text-[11px] text-emerald-900/90">
                  {buddyMission.progress}/{buddyMission.goal}
                </div>
              </div>
              {!buddyMission.unlocked ? (
                <div className="text-[11px] text-emerald-900/80">
                  ミッション達成で「攻め/共感/短文」の3パターン自動リライトが解放されます。
                </div>
              ) : (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-amber-900">
                      リライト提案 解放済み（@{buddyMission.key} ミッション達成）
                    </div>
                    <span className="text-[11px] text-amber-900/80">
                      {rewriteLearningLoading
                        ? "実反応学習を更新中…"
                        : rewriteLearningAvailable
                        ? `実反応学習 ${rewriteLearningSource}${rewriteLearningContextLabel ? ` / ${rewriteLearningContextLabel}` : ""}`
                        : "学習データ準備中"}
                    </span>
                  </div>
                  <textarea
                    value={buddyMissionRewriteSeed}
                    onChange={(e) => setBuddyMissionRewriteSeed(e.target.value)}
                    placeholder="下書きを入れると3パターンに変換（空欄なら定型）"
                    className="w-full rounded border bg-white px-2 py-1 text-xs min-h-16"
                  />
                  <div className="grid gap-2">
                    {missionRewriteVariants.map((v, idx) => (
                      <div key={`rewrite-${idx}`} className="rounded border bg-white p-2 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="space-y-1">
                            <div className="text-xs font-semibold">{v.style}</div>
                            <div className="flex flex-wrap gap-1 text-[10px]">
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5">
                                補正 x{Number(v.learning?.multiplier ?? 1).toFixed(2)}
                              </span>
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5">
                                信頼 {Math.round(clamp01(Number(v.learning?.confidence ?? 0)) * 100)}%
                              </span>
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5">
                                n={Math.max(0, Math.floor(Number(v.learning?.samples ?? 0) || 0))}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="text-xs underline"
                              onClick={() => {
                                const next = composeUrlWithMissionRewrite({
                                  text: v.text,
                                  styleKey: v.styleKey,
                                  styleLabel: v.style,
                                  buddyKey: buddyMission.key,
                                  basePersona,
                                });
                                window.location.href = next;
                              }}
                            >
                              作成に使う
                            </button>
                            <button
                              type="button"
                              className="text-xs underline"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(v.text);
                                  setCopiedRewriteIndex(idx);
                                  window.setTimeout(() => setCopiedRewriteIndex((cur) => (cur === idx ? null : cur)), 1200);
                                } catch {
                                  // ignore
                                }
                              }}
                            >
                              {copiedRewriteIndex === idx ? "コピー済み" : "コピー"}
                            </button>
                          </div>
                        </div>
                        <div className="text-xs whitespace-pre-line">{v.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded border bg-red-50 text-red-700 text-sm p-3">{error}</div>
      )}

      {items.length === 0 && loading ? (
        <div className="text-sm opacity-70">読み込み中…</div>
      ) : items.length === 0 ? (
        <div className="text-sm opacity-70">表示できる投稿がまだありません。</div>
      ) : (
        <div className="space-y-4">
          {freshItems.length > 0 && (
            <section className="space-y-3 rounded-xl border bg-white p-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">新着</h2>
                <span className="text-xs rounded-full border bg-amber-50 border-amber-200 px-2 py-0.5">
                  {freshItems.length}
                </span>
              </div>
              {freshItems.map((p) => {
                const m = p.persona_match;
                const pct = toPercent(m?.weighted_score ?? null);
                const predPct = toPercent(m?.predicted_response ?? null);
                const reasonLines = explainPersonaFeedReason(m, basePersona);
                const reasonOpen = expandedReasonPostId === p.id;
                const reasonTag = reasonLabel(m?.reason);
                const reasonClass =
                  m?.reason === "same_persona"
                    ? "bg-blue-50 border-blue-300"
                    : m?.reason?.startsWith("buddy_compat_")
                    ? "bg-emerald-50 border-emerald-300"
                    : m?.reason?.startsWith("compat_")
                    ? "bg-violet-50 border-violet-300"
                    : "bg-slate-50 border-slate-300";
                return (
                  <div key={p.id} className="space-y-1">
                    {m?.key && (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="px-2 py-0.5 rounded-full border bg-amber-50 border-amber-300">
                          match @{m.key}
                        </span>
                        {pct != null && <span className="opacity-70">score {pct}%</span>}
                        {predPct != null && (
                          <span className="px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-300">
                            予測反応 {predPct}%
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded-full border ${reasonClass}`}>
                          {reasonTag}
                        </span>
                        <button
                          type="button"
                          onClick={() => setExpandedReasonPostId((prev) => (prev === p.id ? null : p.id))}
                          className="underline opacity-80"
                        >
                          {reasonOpen ? "説明を閉じる" : "なぜ表示?"}
                        </button>
                        <a
                          href={`/p/${encodeURIComponent(p.id)}`}
                          onClick={() => {
                            markOpened(p.id);
                            recordBuddyMissionProgress(p, "open");
                            void postFeedback(p, "open");
                          }}
                          className="underline opacity-80"
                        >
                          詳細
                        </a>
                        <button
                          type="button"
                          onClick={() => hideItem(p)}
                          className="underline opacity-70"
                        >
                          興味なし
                        </button>
                      </div>
                    )}
                    {reasonOpen && (
                      <div className="rounded border bg-slate-50 p-2 text-xs whitespace-pre-line">
                        {reasonLines.join("\n")}
                      </div>
                    )}
                    <PostCard
                      p={p}
                      onLikeChanged={(next) => {
                        if (!next) return;
                        markOpened(p.id);
                        void postFeedback(p, "like");
                      }}
                      onBoostChanged={(next) => {
                        if (!next) return;
                        markOpened(p.id);
                        void postFeedback(p, "boost");
                      }}
                      onReplySubmitted={() => {
                        markOpened(p.id);
                        void postFeedback(p, "reply");
                      }}
                    />
                  </div>
                );
              })}
            </section>
          )}

          {pastItems.length > 0 && (
            <section className="space-y-3 rounded-xl border bg-white p-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">過去</h2>
                <span className="text-xs rounded-full border bg-gray-50 px-2 py-0.5">
                  {pastItems.length}
                </span>
              </div>
              {pastItems.map((p) => {
                const m = p.persona_match;
                const pct = toPercent(m?.weighted_score ?? null);
                const predPct = toPercent(m?.predicted_response ?? null);
                const reasonLines = explainPersonaFeedReason(m, basePersona);
                const reasonOpen = expandedReasonPostId === p.id;
                const reasonTag = reasonLabel(m?.reason);
                const reasonClass =
                  m?.reason === "same_persona"
                    ? "bg-blue-50 border-blue-300"
                    : m?.reason?.startsWith("buddy_compat_")
                    ? "bg-emerald-50 border-emerald-300"
                    : m?.reason?.startsWith("compat_")
                    ? "bg-violet-50 border-violet-300"
                    : "bg-slate-50 border-slate-300";
                return (
                  <div key={p.id} className="space-y-1">
                    {m?.key && (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="px-2 py-0.5 rounded-full border bg-amber-50 border-amber-300">
                          match @{m.key}
                        </span>
                        {pct != null && <span className="opacity-70">score {pct}%</span>}
                        {predPct != null && (
                          <span className="px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-300">
                            予測反応 {predPct}%
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded-full border ${reasonClass}`}>
                          {reasonTag}
                        </span>
                        <button
                          type="button"
                          onClick={() => setExpandedReasonPostId((prev) => (prev === p.id ? null : p.id))}
                          className="underline opacity-80"
                        >
                          {reasonOpen ? "説明を閉じる" : "なぜ表示?"}
                        </button>
                        <a
                          href={`/p/${encodeURIComponent(p.id)}`}
                          onClick={() => {
                            markOpened(p.id);
                            recordBuddyMissionProgress(p, "open");
                            void postFeedback(p, "open");
                          }}
                          className="underline opacity-80"
                        >
                          詳細
                        </a>
                        <button
                          type="button"
                          onClick={() => hideItem(p)}
                          className="underline opacity-70"
                        >
                          興味なし
                        </button>
                      </div>
                    )}
                    {reasonOpen && (
                      <div className="rounded border bg-slate-50 p-2 text-xs whitespace-pre-line">
                        {reasonLines.join("\n")}
                      </div>
                    )}
                    <PostCard
                      p={p}
                      onLikeChanged={(next) => {
                        if (!next) return;
                        markOpened(p.id);
                        void postFeedback(p, "like");
                      }}
                      onBoostChanged={(next) => {
                        if (!next) return;
                        markOpened(p.id);
                        void postFeedback(p, "boost");
                      }}
                      onReplySubmitted={() => {
                        markOpened(p.id);
                        void postFeedback(p, "reply");
                      }}
                    />
                  </div>
                );
              })}
            </section>
          )}
        </div>
      )}

      <div className="flex justify-center pt-2">
        <button
          type="button"
          onClick={() => {
            const next = page + 1;
            setPage(next);
            void fetchPage(next, false);
          }}
          disabled={loading || !hasMore}
          className="px-4 py-2 rounded border bg-white disabled:opacity-50"
        >
          {loading ? "読み込み中…" : hasMore ? "もっと読む" : "これ以上ありません"}
        </button>
      </div>
    </div>
  );
}
