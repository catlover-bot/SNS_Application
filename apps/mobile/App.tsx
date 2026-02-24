import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  analyzeLieScore,
  applyPersonaCalibration,
  analyzePersonaBuzz,
  buildPersonaBlendRewrites,
  buildPersonaProfile,
  buildPersonaRewrites,
  computeLieScore,
  computePersonaActualEngagementScore,
  computePersonaCalibrationStat,
  calibrateLieScoreWithFeedback,
  evolveTimelineSignalWeightsState,
  extractBuzzScoreFromAnalysis,
  extractPersonaKeyFromAnalysis,
  pickTimelineHighlights,
  rankTimelineByUserSignals,
  resolvePostAuthorIdentity,
  resolveSocialIdentityLabels,
  splitByOpenedIds,
  splitByReadAt,
  type TimelineSignalWeights,
} from "@sns/core";
import {
  useNotificationsState,
  usePersonaFeedState,
  useSavedState,
} from "./src/hooks/useSocialListState";
import { supabase } from "./src/supabase";
import {
  fetchMobileFeedLatestRange,
  fetchMobileOwnPostsAnalysis,
  fetchMobilePersonaCompatWeights,
  fetchMobilePersonaFeedTopPersona,
  fetchMobilePostAnalysesByIds,
  fetchMobilePostScoresByPersona,
  fetchMobilePostsByIdsEnrichedFirst,
  fetchMobileSavedCollectionsSummaryRows,
  fetchMobileUserPersonaAffinity,
  enrichMobilePostAuthorProfiles,
  loadMobileFeedPage,
  loadMobileNotifications,
  loadMobilePostsByIdsEnriched,
  loadMobileSavedFeedRows,
  loadMobileTimelineSignalWeights,
  upsertMobileTimelineSignalWeights,
} from "./src/services/socialData";

type AppTab =
  | "timeline"
  | "following"
  | "saved"
  | "personaFeed"
  | "personaCatalog"
  | "evolution"
  | "dialogue"
  | "compose"
  | "search"
  | "notifications"
  | "persona"
  | "profile";
type AuthMode = "signin" | "signup";

type FeedItem = {
  id: string;
  created_at: string;
  text?: string | null;
  body?: string | null;
  score?: number | null;
  analysis?: any;
  author?: string | null;
  author_handle?: string | null;
  author_display?: string | null;
  persona_match?: {
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
};

type SavedFeedItem = FeedItem & {
  save_meta?: {
    collection_key: string;
    collection_label: string;
    saved_at: string;
  };
};

type SavedCollectionSummary = {
  key: string;
  label: string;
  count: number;
  lastSavedAt?: string | null;
};

type CardSaveState = {
  saved: boolean;
  saveCount: number;
  busy?: boolean;
  collectionKey?: string | null;
  collectionLabel?: string | null;
};

type ProfileRow = {
  handle: string | null;
  display_name: string | null;
  bio: string | null;
};

type NotificationItem = {
  id: string;
  created_at: string;
  read_at?: string | null;
  kind?: string | null;
  title?: string | null;
  body?: string | null;
  post_id?: string | null;
  actor_handle?: string | null;
  actor_display?: string | null;
  actor_id?: string | null;
};

type SearchPost = {
  id: string;
  created_at: string;
  text?: string | null;
  body?: string | null;
  author?: string | null;
  author_handle?: string | null;
  author_display?: string | null;
  score?: number | null;
};

type PostDetailItem = FeedItem & {
  reply_count?: number | null;
};

type FormatRailItem = {
  id: string;
  format: "story" | "short";
  text: string;
  created_at: string;
  author?: string | null;
  author_display?: string | null;
  author_handle?: string | null;
  personaKey?: string | null;
};

type PersonaScoreRow = {
  persona_key: string;
  score: number;
  confidence: number;
};

type PersonaDefRow = {
  key: string;
  title: string;
  theme?: string | null;
  blurb?: string | null;
  talk_style?: string | null;
  relation_style?: string | null;
  vibe_tags?: string[] | null;
};

type PersonaCatalogDefRow = {
  key: string;
  title: string;
  theme?: string | null;
  blurb?: string | null;
  category?: string | null;
  image_url?: string | null;
};

type SoulmateRow = {
  target_user_id: string;
  target_persona_key: string;
  romance_score: number;
  relation_label: string | null;
};

type PromptOfDayRow = {
  id?: string | null;
  date: string;
  title: string;
  body?: string | null;
};

type PersonaEvolutionSnapshot = {
  at: string;
  top_key: string;
  top_score: number;
  confidence: number;
  posts: number;
};

type PersonaCompatItem = {
  targetKey: string;
  score: number;
  relationLabel: string | null;
  title: string;
  insights?: {
    chemistryType: string;
    overallScore: number;
    dimensions: Array<{
      key: string;
      label: string;
      score: number;
      note: string;
    }>;
    strengths: string[];
    risks: string[];
    prompts: string[];
  } | null;
};

type PersonaDialogueResult = {
  drafts: string[];
  strategy: string;
  tips: string[];
};

type PersonaSuggestItem = {
  key: string;
  title: string;
  score: number;
};

type PersonaInsightRow = {
  dominantKey: string | null;
  dominantTitle: string | null;
  streakDays: number;
  count7d: number;
  countPrev7d: number;
  momentumDelta: number;
  trend: "up" | "down" | "stable";
  topPersonas: Array<{ key: string; title: string; count: number; share: number }>;
};

type PersonaQuestRow = {
  id: string;
  kind: "focus" | "contrast" | "duet";
  title: string;
  description: string;
  xp: number;
  completed: boolean;
  seed: string;
};

type BuddyPersonaWeight = {
  key: string;
  score: number;
  bonus_scale?: number;
  raw_bonus_scale?: number;
  learned_samples?: number;
  learning_confidence?: number;
  history_points?: Array<{
    bonus_scale?: number | null;
    confidence?: number | null;
    samples?: number | null;
    created_at?: string | null;
  }>;
};

type RewriteStyleKey = "aggressive" | "empathy" | "short";

type RewriteLearningStyleStat = {
  styleLabel?: string | null;
  samples?: number | null;
  predictedAvg?: number | null;
  actualAvg?: number | null;
  multiplier?: number | null;
  confidence?: number | null;
  score?: number | null;
  updatedAt?: string | null;
};

type BuddyModeAbAssignmentView = {
  experiment_key?: string | null;
  variant_key?: "A" | "B" | null;
  assigned_mode?: BuddyLearningMode | null;
  source?: string | null;
} | null;

type BlockedUserViewRow = {
  blocked_id: string;
  handle: string | null;
  display_name: string | null;
  created_at?: string | null;
};

type NotificationFilter = "all" | "reply" | "like" | "follow" | "boost" | "growth";
type VirtualListRow =
  | {
      key: string;
      type: "block";
      node: ReactNode;
      estimatedHeight?: number;
    }
  | {
      key: string;
      type: "post";
      item: FeedItem | SearchPost | PostDetailItem;
      opts?: {
        showOpenHint?: boolean;
        personaMatch?: FeedItem["persona_match"];
        opened?: boolean;
        source?: string;
      };
      estimatedHeight?: number;
    }
  | {
      key: string;
      type: "notification";
      item: NotificationItem;
      estimatedHeight?: number;
    };

const MAX_POST_LENGTH = 280;
const PERSONA_FEED_PAGE = 20;
const SAVED_FEED_PAGE = 20;
const MAX_OPENED_POST_STATE = 1200;
type FeedbackEvent = "impression" | "open" | "like" | "reply" | "boost" | "skip" | "hide";
const FEEDBACK_DELTA_MAP: Record<FeedbackEvent, number> = {
  impression: 0.005,
  open: 0.03,
  like: 0.08,
  reply: 0.12,
  boost: 0.1,
  skip: -0.02,
  hide: -0.08,
};
type DwellLearningRow = {
  persona_key?: string | null;
  event_type?: string | null;
  dwell_bucket: string;
  samples: number | null;
  positive_score: number | null;
  negative_score: number | null;
};

type DwellLearningSnapshot = {
  available: boolean;
  usingPersonaDimension: boolean;
  usingEventDimension: boolean;
  bucket: string;
  personaKey: string;
  eventType: string;
  personaBucketRow: DwellLearningRow | null;
  personaGlobalRow: DwellLearningRow | null;
  globalBucketRow: DwellLearningRow | null;
  globalGlobalRow: DwellLearningRow | null;
};

const GLOBAL_DWELL_BUCKET = "__all__";
const GLOBAL_PERSONA_KEY = "__all__";
const GLOBAL_EVENT_TYPE = "__all__";
const GLOBAL_BUZZ_PERSONA_KEY = "__all__";
const POSITIVE_EVENTS = new Set<FeedbackEvent>(["open", "like", "reply", "boost"]);
const NEGATIVE_EVENTS = new Set<FeedbackEvent>(["skip", "hide"]);

type BuzzCalibrationEntry = {
  samples: number;
  predictedAvg: number;
  actualAvg: number;
  multiplier: number;
  confidence: number;
};

const POSITIVE_SIGNAL_BY_EVENT: Partial<Record<FeedbackEvent, number>> = {
  open: 0.4,
  like: 1.0,
  reply: 1.35,
  boost: 1.15,
};

const NEGATIVE_SIGNAL_BY_EVENT: Partial<Record<FeedbackEvent, number>> = {
  skip: 0.8,
  hide: 1.35,
};

const DEFAULT_BUDDY_BONUS_SCALE = 0.42;
const GLOBAL_BUDDY_KEY = "__all__";
type BuddyLearningMode = "adaptive" | "stable";
const DEFAULT_BUDDY_LEARNING_MODE: BuddyLearningMode = "adaptive";
const BUDDY_MODE_AB_EXPERIMENT = "buddy_mode_default_v1";
const REWRITE_STYLE_LABELS: Record<RewriteStyleKey, string> = {
  aggressive: "攻め",
  empathy: "共感",
  short: "短文",
};
const REWRITE_STYLE_PRIORS: Record<RewriteStyleKey, number> = {
  aggressive: 0.55,
  empathy: 0.6,
  short: 0.5,
};

const MODERATION_REPORT_REASONS = [
  "spam",
  "harassment",
  "misinformation",
  "nsfw",
  "other",
] as const;

const LEGAL_LINKS = [
  { key: "terms", label: "利用規約", path: "/legal/terms" },
  { key: "privacy", label: "プライバシー", path: "/legal/privacy" },
  { key: "guidelines", label: "コミュニティガイドライン", path: "/legal/guidelines" },
] as const;

const SAVED_COLLECTION_PRESETS = [
  { key: "saved", label: "保存" },
  { key: "read_later", label: "後で読む" },
  { key: "ideas", label: "ネタ帳" },
  { key: "research", label: "研究" },
  { key: "favorites", label: "お気に入り" },
] as const;

function toSafeNumber(v: number | null | undefined, def = 0) {
  const n = Number(v ?? def);
  return Number.isFinite(n) ? n : def;
}

function toNonNegative(v: number | null | undefined, def = 0) {
  return Math.max(0, toSafeNumber(v, def));
}

function toNonNegativeInt(v: number | null | undefined, def = 0) {
  return Math.max(0, Math.floor(toSafeNumber(v, def)));
}

function normalizeCollectionKey(raw: string | null | undefined) {
  const cleaned = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 _-]+/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return cleaned || "saved";
}

function normalizeCollectionLabel(raw: string | null | undefined) {
  const label = String(raw ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
  return label || "保存";
}

function isCreatorGrowthNotificationKind(kind: string | null | undefined) {
  const k = String(kind ?? "").toLowerCase();
  return k.includes("creator_growth") || k.includes("growth_");
}

function growthNotificationPromptLabel(kind: string | null | undefined) {
  const k = String(kind ?? "").toLowerCase();
  if (k.includes("save_rate")) return "保存率が伸びています";
  if (k.includes("reply_rate")) return "返信率が伸びています";
  if (k.includes("save")) return "保存数が増えています";
  if (k.includes("reply")) return "返信が増えています";
  if (k.includes("open")) return "開封が増えています";
  return "投稿の反応が伸びています";
}

function normalizePersonaKey(personaKey: string | null | undefined) {
  const raw = String(personaKey ?? "").trim();
  return raw || GLOBAL_PERSONA_KEY;
}

function normalizeEventType(eventType: FeedbackEvent | null | undefined) {
  const raw = String(eventType ?? "").trim();
  return raw || GLOBAL_EVENT_TYPE;
}

function pairKeyWithEvent(personaKey: string, bucket: string, eventType: string) {
  return `${personaKey}|${bucket}|${eventType}`;
}

function isPersonaKeyColumnError(err: any) {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes("persona_key") && (text.includes("column") || text.includes("schema"));
}

function isEventTypeColumnError(err: any) {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes("event_type") && (text.includes("column") || text.includes("schema"));
}

function isMissingVersionColumnError(err: any) {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes("version") && (text.includes("column") || text.includes("schema"));
}

function isMissingRelationError(err: any, relation?: string) {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  const relationMissing =
    text.includes("relation") && (text.includes("does not exist") || text.includes("unknown"));
  const tableMissing = text.includes("table") && text.includes("does not exist");
  if (!relationMissing && !tableMissing) return false;
  if (!relation) return true;
  return text.includes(relation.toLowerCase());
}

function isMissingFunctionError(err: any, fn?: string) {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  if (!text.includes("function") || !text.includes("does not exist")) return false;
  if (!fn) return true;
  return text.includes(fn.toLowerCase());
}

function isMissingOpenStateTableError(err: any) {
  return isMissingRelationError(err, "user_post_open_state");
}

function blendLearningRows(
  eventRow: DwellLearningRow | null,
  allRow: DwellLearningRow | null,
  eventType: string
): DwellLearningRow | null {
  if (!eventRow && !allRow) return null;
  if (eventRow && !allRow) {
    return {
      ...eventRow,
      event_type: eventType,
    };
  }
  if (!eventRow && allRow) {
    return {
      ...allRow,
      event_type: eventType,
    };
  }
  const e = eventRow as DwellLearningRow;
  const a = allRow as DwellLearningRow;
  const prior = 0.35;
  return {
    persona_key: e.persona_key ?? a.persona_key ?? GLOBAL_PERSONA_KEY,
    event_type: eventType,
    dwell_bucket: e.dwell_bucket ?? a.dwell_bucket,
    samples: toNonNegativeInt(e.samples, 0) + Math.floor(toNonNegativeInt(a.samples, 0) * prior),
    positive_score: toNonNegative(e.positive_score, 0) + toNonNegative(a.positive_score, 0) * prior,
    negative_score: toNonNegative(e.negative_score, 0) + toNonNegative(a.negative_score, 0) * prior,
  };
}

function dwellBucket(dwellMs: number | null | undefined) {
  if (!Number.isFinite(dwellMs ?? NaN)) return "unknown";
  const d = clamp(Number(dwellMs), 0, 120_000);
  if (d < 1_000) return "lt1s";
  if (d < 4_000) return "1to4s";
  if (d < 12_000) return "4to12s";
  if (d < 35_000) return "12to35s";
  return "35splus";
}

function dwellMultiplierStaticForEvent(
  event: FeedbackEvent,
  dwellMs: number | null | undefined
) {
  if (!Number.isFinite(dwellMs ?? NaN)) return 1;
  const d = clamp(Number(dwellMs), 0, 120_000);

  if (event === "skip" || event === "hide") {
    if (d < 1_000) return 1.45;
    if (d < 4_000) return 1.2;
    if (d < 12_000) return 0.9;
    if (d < 35_000) return 0.65;
    return 0.45;
  }
  if (event === "open" || event === "like" || event === "reply" || event === "boost") {
    if (d < 1_000) return 0.8;
    if (d < 4_000) return 0.95;
    if (d < 12_000) return 1.05;
    if (d < 35_000) return 1.15;
    return 1.25;
  }
  return 1;
}

function smoothPositiveRate(row: DwellLearningRow | null) {
  const p = toNonNegative(row?.positive_score, 0);
  const n = toNonNegative(row?.negative_score, 0);
  return (p + 2) / (p + n + 4);
}

function learningSamples(row: DwellLearningRow | null) {
  return toNonNegativeInt(row?.samples, 0);
}

function computeAdaptiveDwellMultiplier(args: {
  event: FeedbackEvent;
  dwellMs: number | null;
  snapshot: DwellLearningSnapshot;
}) {
  const { event, dwellMs, snapshot } = args;
  const base = dwellMultiplierStaticForEvent(event, dwellMs);

  if (!POSITIVE_EVENTS.has(event) && !NEGATIVE_EVENTS.has(event)) {
    return {
      source: "static" as const,
      multiplier: base,
      confidence: 0,
      personaBucketRate: null as number | null,
      personaGlobalRate: null as number | null,
      globalRate: null as number | null,
      bucket: snapshot.bucket,
      personaKey: snapshot.personaKey,
      usingPersonaDimension: snapshot.usingPersonaDimension,
      eventType: snapshot.eventType,
      usingEventDimension: snapshot.usingEventDimension,
    };
  }

  if (!snapshot.available) {
    return {
      source: "static" as const,
      multiplier: base,
      confidence: 0,
      personaBucketRate: null as number | null,
      personaGlobalRate: null as number | null,
      globalRate: null as number | null,
      bucket: snapshot.bucket,
      personaKey: snapshot.personaKey,
      usingPersonaDimension: snapshot.usingPersonaDimension,
      eventType: snapshot.eventType,
      usingEventDimension: snapshot.usingEventDimension,
    };
  }

  const personaBucketRow = snapshot.personaBucketRow ?? snapshot.globalBucketRow;
  const personaGlobalRow = snapshot.personaGlobalRow ?? snapshot.globalGlobalRow;
  const globalGlobalRow = snapshot.globalGlobalRow;

  const personaBucketRate = smoothPositiveRate(personaBucketRow);
  const personaGlobalRate = smoothPositiveRate(personaGlobalRow);
  const globalRate = smoothPositiveRate(globalGlobalRow);

  const bucketContrast = clamp(personaBucketRate - personaGlobalRate, -0.35, 0.35);
  const personaContrast = clamp(personaGlobalRate - globalRate, -0.25, 0.25);
  const contrast = clamp(bucketContrast * 0.72 + personaContrast * 0.42, -0.4, 0.4);

  const personaBucketSamples = learningSamples(personaBucketRow);
  const personaGlobalSamples = learningSamples(personaGlobalRow);
  const globalSamples = learningSamples(globalGlobalRow);
  const bucketConf = clamp(
    Math.log1p(Math.min(personaBucketSamples, personaGlobalSamples)) / Math.log1p(80),
    0,
    1
  );
  const globalConf = clamp(Math.log1p(globalSamples) / Math.log1p(280), 0, 1);
  const personaDimBonus = snapshot.usingPersonaDimension ? 1 : 0.85;
  const eventDimBonus = snapshot.usingEventDimension ? 1 : 0.88;
  const confidence = bucketConf * globalConf * personaDimBonus * eventDimBonus;
  const mix = 0.75 * confidence;

  const learned =
    POSITIVE_EVENTS.has(event)
      ? clamp(1 + contrast * 1.6, 0.65, 1.45)
      : clamp(1 - contrast * 1.6, 0.55, 1.55);
  const multiplier = clamp(base * (1 - mix) + learned * mix, 0.45, 1.75);

  return {
    source: mix > 0.03 ? ("adaptive" as const) : ("static" as const),
    multiplier,
    confidence,
    personaBucketRate,
    personaGlobalRate,
    globalRate,
    bucket: snapshot.bucket,
    personaKey: snapshot.personaKey,
    usingPersonaDimension: snapshot.usingPersonaDimension,
    eventType: snapshot.eventType,
    usingEventDimension: snapshot.usingEventDimension,
  };
}

function parseAnalysisBlob(raw: any) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw;
  return null;
}

function normalizeReactionKind(raw: string | null | undefined) {
  const kind = String(raw ?? "").toLowerCase().trim();
  if (!kind) return "unknown";
  if (kind.includes("like")) return "like";
  if (kind.includes("reply")) return "reply";
  if (kind.includes("boost") || kind.includes("repost")) return "boost";
  if (kind.includes("save") || kind.includes("bookmark") || kind.includes("favorite")) return "save";
  return kind;
}

function sanitizeCollectionKey(raw: string | null | undefined) {
  const normalized = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-zA-Zぁ-んァ-ヶ一-龯々〆〤ー_\s-]+/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return normalized || "saved";
}

function sanitizeCollectionLabel(raw: string | null | undefined) {
  const label = String(raw ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
  return label || "保存";
}

function defaultBuzzCalibrationEntry(): BuzzCalibrationEntry {
  return computePersonaCalibrationStat({
    samples: 0,
    predictedAvg: 0.5,
    actualAvg: 0.2,
  });
}

function computePersonaFeedRankingScore(weighted: number, predictedResponse: number) {
  const safeWeighted = Number.isFinite(weighted) ? weighted : 0;
  const safePred = clamp(Number(predictedResponse ?? 0.5), 0, 1);
  return safeWeighted * (0.82 + safePred * 0.36);
}

function normalize01FromUnknown(v: number | null | undefined) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  if (n <= 1) return clamp(n, 0, 1);
  if (n <= 100) return clamp(n / 100, 0, 1);
  return 1;
}

function postRecencyWeight(createdAt: string, nowMs: number) {
  const ms = Date.parse(String(createdAt ?? ""));
  if (!Number.isFinite(ms)) return 1;
  const days = Math.max(0, (nowMs - ms) / (1000 * 60 * 60 * 24));
  const halfLifeDays = 14;
  const w = Math.pow(0.5, days / halfLifeDays);
  return clamp(w, 0.35, 1);
}

function analysisPersonaCandidates(analysis: any) {
  const selected = String(analysis?.persona?.selected ?? "").trim();
  const cands: Array<{ key?: string; score?: number }> = Array.isArray(
    analysis?.persona?.candidates
  )
    ? (analysis.persona.candidates as Array<{ key?: string; score?: number }>)
    : [];
  const out: Array<{ key: string; weight: number }> = [];
  if (selected) out.push({ key: selected, weight: 1 });

  const normalized = cands
    .map((c: any) => ({
      key: String(c?.key ?? "").trim(),
      score: Number(c?.score ?? 0),
    }))
    .filter((c: { key: string; score: number }) => c.key.length > 0);
  const maxScore = Math.max(
    1,
    ...normalized.map((c: { key: string; score: number }) =>
      Number.isFinite(c.score) ? c.score : 0
    )
  );
  normalized.slice(0, 4).forEach((c: { key: string; score: number }) => {
    const w = 0.45 + clamp(c.score / maxScore, 0, 1) * 0.55;
    if (!out.some((x) => x.key === c.key)) out.push({ key: c.key, weight: w });
  });

  return out;
}

function derivePersonaRowsFromSignalsLocal(args: {
  posts: Array<{ id: string; created_at: string; analysis: any }>;
  scoreRows: Array<{ post_id: string; persona_key: string; final_score: number | null }>;
  limit?: number;
}): PersonaScoreRow[] {
  const { posts, scoreRows, limit = 12 } = args;
  if (!posts.length) return [];

  const topByPost = new Map<string, { key: string; score: number }>();
  scoreRows.forEach((r) => {
    if (!r?.post_id || !r?.persona_key) return;
    const s = normalize01FromUnknown(r.final_score);
    const cur = topByPost.get(r.post_id);
    if (!cur || s > cur.score) {
      topByPost.set(r.post_id, { key: r.persona_key, score: s });
    }
  });

  const nowMs = Date.now();
  const accum = new Map<string, { total: number; count: number }>();
  const add = (personaKey: string, weight: number) => {
    if (!personaKey) return;
    const cur = accum.get(personaKey) ?? { total: 0, count: 0 };
    cur.total += weight;
    cur.count += 1;
    accum.set(personaKey, cur);
  };

  posts.forEach((p) => {
    if (!p?.id) return;
    const recency = postRecencyWeight(p.created_at, nowMs);
    const scored = topByPost.get(p.id);
    if (scored) {
      add(scored.key, (0.75 + scored.score * 0.65) * recency);
      return;
    }
    const analysis = parseAnalysisBlob(p.analysis);
    const cands = analysisPersonaCandidates(analysis);
    cands.forEach((c) => add(c.key, c.weight * recency * 0.95));
  });

  if (!accum.size) return [];

  const maxTotal = Math.max(...Array.from(accum.values()).map((x) => x.total));
  const totalMass = Math.max(
    1e-6,
    Array.from(accum.values()).reduce((acc, x) => acc + x.total, 0)
  );

  return Array.from(accum.entries())
    .map(([persona_key, row]) => {
      const score = clamp(row.total / Math.max(1e-6, maxTotal), 0, 1);
      const coverage = clamp((row.total / totalMass) * 3.2, 0, 1);
      const support = clamp(Math.log1p(row.count) / Math.log1p(10), 0, 1);
      const confidence = clamp(coverage * 0.6 + support * 0.4, 0.08, 1);
      return {
        persona_key,
        score,
        confidence,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.confidence - a.confidence;
    })
    .slice(0, Math.max(1, Math.min(24, Math.floor(limit))));
}

function deriveBuddyPersonaWeights(args: {
  posts: Array<{ created_at: string; analysis: any }>;
  basePersona: string | null;
  limit?: number;
}): BuddyPersonaWeight[] {
  const { posts, basePersona, limit = 10 } = args;
  if (!basePersona || posts.length === 0) return [];

  const now = Date.now();
  const acc = new Map<string, number>();

  posts.forEach((p) => {
    const analysis = parseAnalysisBlob(p.analysis);
    const selected = String(analysis?.persona?.selected ?? "").trim();
    const secondary = String(analysis?.persona?.blend?.secondary ?? "").trim();
    if (!selected || !secondary) return;
    if (selected !== basePersona || secondary === basePersona) return;

    const rawShare = Number(analysis?.persona?.blend?.primaryShare ?? NaN);
    const primaryShare = Number.isFinite(rawShare) ? clamp(rawShare, 0, 1) : 0.65;
    const buddyShare = clamp(1 - primaryShare, 0.1, 0.8);

    const ts = Date.parse(String(p.created_at ?? ""));
    const ageDays = Number.isFinite(ts) ? Math.max(0, (now - ts) / (1000 * 60 * 60 * 24)) : 30;
    const recency = clamp(Math.pow(0.5, ageDays / 21), 0.32, 1);
    const signal = recency * (0.55 + buddyShare * 1.25);
    acc.set(secondary, (acc.get(secondary) ?? 0) + signal);
  });

  if (!acc.size) return [];
  const max = Math.max(...Array.from(acc.values()));
  if (!Number.isFinite(max) || max <= 0) return [];

  return Array.from(acc.entries())
    .map(([key, v]) => ({
      key,
      score: clamp(v / max, 0, 1),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(20, Math.floor(limit))));
}

function toPercent01(value: number | null | undefined): number {
  const raw = Number(value ?? 0);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(100, Math.round(raw * 100)));
}

function toCompatPercent(value: number | null | undefined): number {
  const raw = Number(value ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (raw <= 1) return Math.max(0, Math.min(100, Math.round(raw * 100)));
  if (raw <= 100) return Math.round(raw);
  return 100;
}

function formatRelativeTime(value: string | null | undefined) {
  const v = String(value ?? "").trim();
  if (!v) return "-";
  const ts = Date.parse(v);
  if (!Number.isFinite(ts)) return v;

  const diffMs = Date.now() - ts;
  if (diffMs < 45_000) return "たった今";
  if (diffMs < 60 * 60 * 1000) return `${Math.max(1, Math.floor(diffMs / 60_000))}分前`;
  if (diffMs < 24 * 60 * 60 * 1000) {
    return `${Math.max(1, Math.floor(diffMs / (60 * 60 * 1000)))}時間前`;
  }
  if (diffMs < 8 * 24 * 60 * 60 * 1000) {
    return `${Math.max(1, Math.floor(diffMs / (24 * 60 * 60 * 1000)))}日前`;
  }
  return new Date(ts).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

function formatDateTime(value: string | null | undefined) {
  const v = String(value ?? "").trim();
  if (!v) return "未取得";
  const ts = Date.parse(v);
  if (!Number.isFinite(ts)) return "未取得";
  return new Date(ts).toLocaleString("ja-JP");
}

function passwordStrengthLabel(password: string | null | undefined) {
  const p = String(password ?? "");
  const checks = [
    p.length >= 8,
    /[A-Z]/.test(p),
    /[a-z]/.test(p),
    /[0-9]/.test(p),
    /[^A-Za-z0-9]/.test(p),
  ];
  const score = checks.filter(Boolean).length;
  if (!p) return { score: 0, label: "未入力" };
  if (score <= 2) return { score, label: "弱い" };
  if (score <= 4) return { score, label: "普通" };
  return { score, label: "強い" };
}

function matchNotificationFilter(kind: string | null | undefined, filter: NotificationFilter) {
  if (filter === "all") return true;
  const k = String(kind ?? "").toLowerCase();
  if (filter === "growth") return isCreatorGrowthNotificationKind(k);
  if (filter === "boost") return k.includes("boost") || k.includes("repost");
  return k.includes(filter);
}

function explainPersonaFeedReason(item: FeedItem, basePersona: string | null) {
  const match = item.persona_match;
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

  return lines.join("\n");
}

function personaFeedReasonLabel(reason: string | null | undefined) {
  const r = String(reason ?? "").trim();
  if (!r) return "persona_match";
  if (r === "same_persona") return "同キャラ";
  if (r.startsWith("buddy_compat_")) return "バディ優先";
  if (r.startsWith("compat_")) return "相性";
  if (r === "fallback_no_scores" || r === "global_fallback") return "補完";
  return r;
}

function notificationMeta(kind?: string | null) {
  const k = (kind ?? "").toLowerCase();

  if (k.includes("reply")) {
    return {
      label: "返信",
      bg: "#DBEAFE",
      fg: "#1D4ED8",
      fallbackText: "あなたの投稿に返信がありました。",
    };
  }
  if (k.includes("creator_growth") || k.includes("growth_")) {
    return {
      label: "成績",
      bg: "#FEF3C7",
      fg: "#92400E",
      fallbackText: "投稿の成績が伸びています。",
    };
  }
  if (k.includes("follow")) {
    return {
      label: "フォロー",
      bg: "#DCFCE7",
      fg: "#166534",
      fallbackText: "新しくフォローされました。",
    };
  }
  if (k.includes("like")) {
    return {
      label: "いいね",
      bg: "#FCE7F3",
      fg: "#BE185D",
      fallbackText: "あなたの投稿にいいねがつきました。",
    };
  }
  if (k.includes("boost") || k.includes("repost")) {
    return {
      label: "拡散",
      bg: "#EDE9FE",
      fg: "#6D28D9",
      fallbackText: "あなたの投稿が拡散されました。",
    };
  }
  if (k.includes("truth") || k.includes("vote")) {
    return {
      label: "投票",
      bg: "#FEF3C7",
      fg: "#92400E",
      fallbackText: "あなたの投稿に真偽投票がありました。",
    };
  }

  return {
    label: "通知",
    bg: "#E5E7EB",
    fg: "#374151",
    fallbackText: "新しい通知があります。",
  };
}

function normalizeTalkStyle(raw: string | null | undefined): string {
  const base = (raw ?? "").trim();
  if (!base) return "明るく短く、相手の反応を引き出す文体";
  return base.length > 120 ? `${base.slice(0, 120)}…` : base;
}

function buildPersonaStarters(personaTitle: string, talkStyle: string): string[] {
  const s = normalizeTalkStyle(talkStyle);
  return [
    `【${personaTitle}モード】${s}で一言: 今日いちばんの出来事は、`,
    `【${personaTitle}モード】読んだ人に問いかける口調で: みんなはどう思う？`,
    `【${personaTitle}モード】短文3連投イメージで: 1) 2) 3)`,
  ];
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function normalizeWeight(v: number | null | undefined, def = 0.7) {
  const n = Number(v ?? def);
  if (!Number.isFinite(n)) return def;
  return clamp(n, 0.2, 2.2);
}

function normalizeBuddyBonusScale(
  v: number | null | undefined,
  def = DEFAULT_BUDDY_BONUS_SCALE
) {
  const n = Number(v ?? def);
  if (!Number.isFinite(n)) return def;
  return clamp(n, 0.12, 0.95);
}

function learningConfidenceFromSamples(samples: number | null | undefined) {
  const n = Math.max(0, Math.floor(Number(samples ?? 0) || 0));
  return clamp(Math.log1p(n) / Math.log1p(80), 0, 1);
}

function normalizeBuddyLearningMode(v: string | null | undefined): BuddyLearningMode {
  return String(v ?? "").trim() === "stable" ? "stable" : "adaptive";
}

function effectiveBuddyBonusScaleByMode(args: {
  rawBonusScale: number | null | undefined;
  mode: BuddyLearningMode;
}) {
  const raw = normalizeBuddyBonusScale(args.rawBonusScale, DEFAULT_BUDDY_BONUS_SCALE);
  if (args.mode === "stable") {
    return normalizeBuddyBonusScale(
      DEFAULT_BUDDY_BONUS_SCALE + (raw - DEFAULT_BUDDY_BONUS_SCALE) * 0.38,
      DEFAULT_BUDDY_BONUS_SCALE
    );
  }
  return raw;
}

function buddyLearningStageInfo(samplesRaw: number | null | undefined) {
  const samples = Math.max(0, Math.floor(Number(samplesRaw ?? 0) || 0));
  if (samples < 6) return { label: "観測中", goal: 6 };
  if (samples < 18) return { label: "学習中", goal: 18 };
  if (samples < 45) return { label: "最適化中", goal: 45 };
  return { label: "安定運用", goal: 80 };
}

function buddyLearningProgress(samplesRaw: number | null | undefined, goalRaw: number | null | undefined) {
  const samples = Math.max(0, Number(samplesRaw ?? 0) || 0);
  const goal = Math.max(1, Number(goalRaw ?? 1) || 1);
  return clamp(samples / goal, 0, 1);
}

function buddyLearningModeLabel(mode: BuddyLearningMode) {
  return mode === "stable" ? "stable（安定）" : "adaptive（学習優先）";
}

function missionLevelStats(xpTotalRaw: number | null | undefined) {
  const xpTotal = Math.max(0, Math.floor(Number(xpTotalRaw ?? 0) || 0));
  const requirementForLevel = (level: number) =>
    Math.max(24, Math.floor(36 + (level - 1) * 18 + (level - 1) * (level - 1) * 4));
  let level = 1;
  let floorXp = 0;
  let nextCost = requirementForLevel(level);
  let remaining = xpTotal;
  while (remaining >= nextCost && level < 99) {
    remaining -= nextCost;
    floorXp += nextCost;
    level += 1;
    nextCost = requirementForLevel(level);
  }
  return {
    xpTotal,
    level,
    currentLevelXp: remaining,
    nextLevelXp: nextCost,
    levelProgressRatio: nextCost > 0 ? remaining / nextCost : 0,
    floorXp,
  };
}

function missionXpGainForOpen(delta: number) {
  return Math.max(0, Math.min(200, Math.floor((Number(delta ?? 0) || 0) * 4)));
}

function todayLocalKey() {
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
      text: `${seed}。${baseTag}視点で先に結論、${buddyTag}っぽい軽いツッコミで締める。`,
    },
    {
      styleKey: "empathy" as RewriteStyleKey,
      style: "共感",
      text: `${seed}って感じた人いる？ まず共感。次に${baseTag}の本音。最後に${buddyTag}的な問いかけを1つ。`,
    },
    {
      styleKey: "short" as RewriteStyleKey,
      style: "短文",
      text: `${seed}。\n結論だけ。\n余韻は残す。\n(${baseTag} × ${buddyTag})`,
    },
  ];
}

function normalizeRewriteStyleKey(v: string | null | undefined): RewriteStyleKey | null {
  const raw = String(v ?? "").trim().toLowerCase();
  if (raw === "aggressive" || raw === "attack" || raw === "攻め") return "aggressive";
  if (raw === "empathy" || raw === "empathetic" || raw === "共感") return "empathy";
  if (raw === "short" || raw === "shortform" || raw === "短文") return "short";
  return null;
}

function rewriteTimeBucket(dateInput: string | Date) {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "unknown";
  const hour = d.getHours();
  if (hour < 6) return "late_night";
  if (hour < 11) return "morning";
  if (hour < 17) return "daytime";
  if (hour < 22) return "evening";
  return "night";
}

function rewriteWeekdayBucket(dateInput: string | Date) {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "weekday";
  const day = d.getDay();
  return day === 0 || day === 6 ? "weekend" : "weekday";
}

function hashVariantForUser(userId: string): "A" | "B" {
  let h = 0;
  for (let i = 0; i < userId.length; i += 1) {
    h = (h * 33 + userId.charCodeAt(i)) >>> 0;
  }
  return h % 2 === 0 ? "A" : "B";
}

function buddyModeFromVariant(variant: "A" | "B"): BuddyLearningMode {
  return variant === "A" ? "adaptive" : "stable";
}

function rewriteReactionScore(args: { likes: number; replies: number; boosts: number }) {
  const weighted =
    Math.max(0, args.likes) + Math.max(0, args.replies) * 1.6 + Math.max(0, args.boosts) * 1.2;
  return clamp(1 - Math.exp(-weighted / 4.5), 0, 1);
}

function extractRewriteMissionMeta(analysisRaw: any): {
  styleKey: RewriteStyleKey;
  styleLabel: string;
  buddyPersonaKey: string;
  basePersonaKey: string | null;
} | null {
  const analysis = parseAnalysisBlob(analysisRaw);
  const meta = analysis?.persona?.rewrite_mission ?? analysis?.persona?.rewriteMission ?? null;
  if (!meta || typeof meta !== "object") return null;
  const styleKey = normalizeRewriteStyleKey(meta.styleKey ?? meta.style_key ?? meta.style);
  const buddyPersonaKey = String(
    meta.buddyPersonaKey ?? meta.buddy_persona_key ?? meta.buddyKey ?? ""
  ).trim();
  const basePersonaKey = String(
    meta.basePersonaKey ?? meta.base_persona_key ?? meta.basePersona ?? ""
  ).trim();
  if (!styleKey || !buddyPersonaKey) return null;
  return {
    styleKey,
    styleLabel:
      String(meta.styleLabel ?? meta.style_label ?? REWRITE_STYLE_LABELS[styleKey]).trim() ||
      REWRITE_STYLE_LABELS[styleKey],
    buddyPersonaKey,
    basePersonaKey: basePersonaKey || null,
  };
}

function parseBuddyPersonaKey(reason: string | null | undefined) {
  const raw = String(reason ?? "").trim();
  if (!raw.startsWith("buddy_compat_")) return null;
  const key = raw.replace(/^buddy_compat_/, "").trim();
  return key || null;
}

function normalize01(v: number | null | undefined) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  return clamp(n, 0, 1);
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function normalizeText(raw: string) {
  return raw
    .toLowerCase()
    .replace(/[^0-9a-zA-Zぁ-んァ-ヶ一-龯々〆〤ー\s_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeText(raw: string) {
  const normalized = normalizeText(raw);
  const words = normalized.split(" ").map((x) => x.trim()).filter(Boolean);
  const dense = normalized.replace(/\s+/g, "");
  const bi: string[] = [];
  for (let i = 0; i < dense.length - 1; i += 1) {
    bi.push(dense.slice(i, i + 2));
  }
  return uniq([...words, ...bi]).filter((x) => x.length >= 2);
}

function toDayKey(value: string) {
  return String(value ?? "").slice(0, 10);
}

function extractFeedTrendingTopics(items: Array<{ text?: string | null; body?: string | null }>, limit = 8) {
  const count = new Map<string, number>();
  items.slice(0, 80).forEach((item) => {
    const text = String(item?.text ?? item?.body ?? "").trim();
    if (!text) return;
    const hashes = text.match(/#[0-9A-Za-z_ぁ-んァ-ヶ一-龯々〆〤ー]{2,24}/g) ?? [];
    hashes.forEach((h) => count.set(h, (count.get(h) ?? 0) + 3));
    tokenizeText(text)
      .slice(0, 24)
      .forEach((t) => count.set(t, (count.get(t) ?? 0) + 1));
  });
  return Array.from(count.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, score]) => ({ label, score }));
}

function extractFormatRailItems(
  items: Array<FeedItem | SearchPost | PostDetailItem>,
  limit = 12
): Array<{
  id: string;
  format: "story" | "short";
  text: string;
  created_at: string;
  author?: string | null;
  author_display?: string | null;
  author_handle?: string | null;
  personaKey?: string | null;
}> {
  const out: Array<{
    id: string;
    format: "story" | "short";
    text: string;
    created_at: string;
    author?: string | null;
    author_display?: string | null;
    author_handle?: string | null;
    personaKey?: string | null;
  }> = [];
  const seen = new Set<string>();
  items.forEach((item) => {
    const id = String((item as any)?.id ?? "").trim();
    if (!id || seen.has(id)) return;
    const analysis = parseAnalysisBlob((item as any)?.analysis);
    const fmt = String(analysis?.post_format ?? "").trim();
    const format = fmt === "story" ? "story" : fmt === "short" ? "short" : null;
    if (!format) return;
    const text = String((item as any)?.text ?? (item as any)?.body ?? "").trim();
    if (!text) return;
    seen.add(id);
    out.push({
      id,
      format,
      text,
      created_at: String((item as any)?.created_at ?? ""),
      author: (item as any)?.author ?? null,
      author_display: (item as any)?.author_display ?? null,
      author_handle: (item as any)?.author_handle ?? null,
      personaKey:
        String(analysis?.persona?.selected ?? analysis?.persona?.candidates?.[0]?.key ?? "").trim() ||
        null,
    });
  });
  return out.slice(0, Math.max(1, Math.min(24, Math.floor(limit))));
}

function suggestPersonasFromText(defs: PersonaDefRow[], text: string, limit = 6): PersonaSuggestItem[] {
  const tokens = tokenizeText(text);
  if (!tokens.length || defs.length === 0) return [];

  const scored = defs
    .map((d) => {
      const merged = normalizeText(
        [
          d.key,
          d.title ?? "",
          d.theme ?? "",
          d.blurb ?? "",
          d.talk_style ?? "",
          d.relation_style ?? "",
          ...(d.vibe_tags ?? []),
        ].join(" ")
      );
      let score = 0;
      tokens.forEach((t) => {
        if (merged.includes(t)) score += 1.1;
        if (d.key.includes(t) || t.includes(d.key)) score += 1.6;
      });
      return {
        key: d.key,
        title: d.title ?? d.key,
        score,
      };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

function buildDialogueFallback(args: {
  sourceTitle: string;
  targetTitle: string;
  mode: "friendship" | "romance";
  relationLabel?: string | null;
  context?: string | null;
  replyToText?: string | null;
  sourceTalk?: string | null;
  targetTalk?: string | null;
  sourceProfileSummary?: string | null;
  targetProfileSummary?: string | null;
  sourceHook?: string | null;
  targetHook?: string | null;
}): PersonaDialogueResult {
  const relation =
    args.relationLabel ?? (args.mode === "romance" ? "甘めの相性" : "相棒系の相性");
  const topic = args.context?.trim() || "最近の出来事";
  const sourceStyle = (args.sourceTalk ?? "").trim();
  const targetStyle = (args.targetTalk ?? "").trim();
  const sourceProfileSummary = (args.sourceProfileSummary ?? "").trim();
  const targetProfileSummary = (args.targetProfileSummary ?? "").trim();
  const sourceHook = (args.sourceHook ?? "").trim();
  const targetHook = (args.targetHook ?? "").trim();
  const quoted = (args.replyToText ?? "").trim();
  const quotePart = quoted
    ? ` 相手投稿「${quoted.slice(0, 80)}${quoted.length > 80 ? "…" : ""}」`
    : "";

  if (args.mode === "romance") {
    return {
      strategy: "fallback_local",
      drafts: [
        `「${topic}の話、${args.targetTitle}となら安心してできる。${relation}って感じ」${quotePart}`,
        `「${args.targetTitle}のその言い方、${sourceStyle || "やさしいノリ"}で返されると弱いんだよね」`,
        `「今日は${args.targetTitle}にだけ正直に言う。${topic}のことで、実はちょっと不安だった」`,
        `${sourceHook ? `「${sourceHook}で返すね」` : "「気持ちは短く言うね」"} ${targetHook ? `（相手は${targetHook}）` : ""}`,
      ],
      tips: [
        sourceProfileSummary || "短く返す",
        targetProfileSummary ? `相手特性: ${targetProfileSummary}` : "感情を一言添える",
        "問いかけを1つ置く",
      ],
    };
  }

  return {
    strategy: "fallback_local",
    drafts: [
      `「${topic}、${args.targetTitle}となら最短で進められそう。${relation}が活きる場面だと思う」${quotePart}`,
      `「まず役割を分けよう。自分は${sourceStyle || "段取り"}担当、${args.targetTitle}は${targetStyle || "瞬発力"}担当でどう？」`,
      `「${args.targetTitle}の視点を先に聞きたい。${topic}の打ち手、3案だけ出してみて」`,
      `${sourceHook ? `「${sourceHook}で返すと刺さるはず」` : "「まず1案だけ投げる」"} ${targetHook ? `（相手は${targetHook}）` : ""}`,
    ],
    tips: [
      sourceProfileSummary || "最初の1文は短く",
      targetProfileSummary ? `相手特性: ${targetProfileSummary}` : "相手が返しやすい終わり方にする",
      "押しつけを避ける",
    ],
  };
}

export default function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [authShowPassword, setAuthShowPassword] = useState(false);
  const [authFailedCount, setAuthFailedCount] = useState(0);
  const [authCooldownUntil, setAuthCooldownUntil] = useState<number | null>(null);
  const [authCooldownTick, setAuthCooldownTick] = useState(0);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const devAutoLoginAttemptedRef = useRef(false);

  const [tab, setTab] = useState<AppTab>("timeline");

  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  const [followingFeed, setFollowingFeed] = useState<FeedItem[]>([]);
  const [followingLoading, setFollowingLoading] = useState(false);
  const [followingError, setFollowingError] = useState<string | null>(null);
  const [savedFeedState, savedFeedListActions] = useSavedState<SavedFeedItem>({
    hasMore: true,
    items: [],
  });
  const savedFeed = savedFeedState.items;
  const savedFeedLoading = savedFeedState.loading;
  const savedFeedError = savedFeedState.error;
  const savedFeedOffset = savedFeedState.offset;
  const savedFeedHasMore = savedFeedState.hasMore;
  const [savedCollections, setSavedCollections] = useState<SavedCollectionSummary[]>([]);
  const [savedCollectionKey, setSavedCollectionKey] = useState<string>("all");
  const [savedCollectionsAvailable, setSavedCollectionsAvailable] = useState(true);

  const [composeText, setComposeText] = useState("");
  const [posting, setPosting] = useState(false);
  const [composeLastPostedResult, setComposeLastPostedResult] = useState<{
    postId: string;
    createdAt: string;
    text: string;
    liePct: number;
    personaKey: string | null;
    buzzScore: number;
    calibratedBuzzScore: number;
    buzzLevel: string;
    counts: {
      opens: number;
      saves: number;
      replies: number;
      likes: number;
      boosts: number;
      impressions: number;
      personaFeedOpens: number;
    };
    rates: {
      savePerOpen: number | null;
      replyPerOpen: number | null;
      personaFeedOpenRate: number | null;
    };
    suggestions: string[];
  } | null>(null);
  const [composeLastPostedResultLoading, setComposeLastPostedResultLoading] = useState(false);
  const [composeLastPostedResultError, setComposeLastPostedResultError] = useState<string | null>(null);
  const [composePersonaCandidates, setComposePersonaCandidates] = useState<
    PersonaSuggestItem[]
  >([]);
  const [composePersonaSelected, setComposePersonaSelected] = useState<string | null>(null);
  const [composeCompatItems, setComposeCompatItems] = useState<PersonaCompatItem[]>([]);
  const [composeCompatLoading, setComposeCompatLoading] = useState(false);
  const [composeCompatError, setComposeCompatError] = useState<string | null>(null);
  const [composeBlendSecondaryKey, setComposeBlendSecondaryKey] = useState<string>("");
  const [composeBlendPrimarySharePct, setComposeBlendPrimarySharePct] = useState(70);
  const [composeBuzzCalibration, setComposeBuzzCalibration] = useState<BuzzCalibrationEntry | null>(
    null
  );
  const [composeMissionRewriteAttribution, setComposeMissionRewriteAttribution] = useState<{
    styleKey: RewriteStyleKey;
    styleLabel: string;
    buddyPersonaKey: string;
    basePersonaKey: string | null;
    suggestedAt: string;
  } | null>(null);

  const [personaFeedStrategy, setPersonaFeedStrategy] = useState<"same" | "compat">("compat");
  const [personaFeedListState, personaFeedListActions] = usePersonaFeedState<FeedItem>({
    hasMore: true,
    items: [],
  });
  const personaFeedItems = personaFeedListState.items;
  const personaFeedLoading = personaFeedListState.loading;
  const personaFeedError = personaFeedListState.error;
  const personaFeedOffset = personaFeedListState.offset;
  const personaFeedHasMore = personaFeedListState.hasMore;
  const [personaFeedBasePersona, setPersonaFeedBasePersona] = useState<string | null>(null);
  const [personaFeedUsedPersonas, setPersonaFeedUsedPersonas] = useState<string[]>([]);
  const [personaFeedBuddyLearningMode, setPersonaFeedBuddyLearningMode] =
    useState<BuddyLearningMode>(DEFAULT_BUDDY_LEARNING_MODE);
  const [personaFeedBuddyLearningModeAvailable, setPersonaFeedBuddyLearningModeAvailable] =
    useState(false);
  const [personaFeedBuddyLearningModeSource, setPersonaFeedBuddyLearningModeSource] = useState<
    "preference" | "ab_assignment" | "ab_optimized" | "default"
  >("default");
  const [personaFeedBuddyLearningModeAb, setPersonaFeedBuddyLearningModeAb] =
    useState<BuddyModeAbAssignmentView>(null);
  const [personaFeedSavingBuddyLearningMode, setPersonaFeedSavingBuddyLearningMode] = useState(false);
  const [personaFeedBuddyPersonas, setPersonaFeedBuddyPersonas] = useState<BuddyPersonaWeight[]>(
    []
  );
  const [personaFeedBuddyMissionCursor, setPersonaFeedBuddyMissionCursor] = useState(0);
  const [personaFeedBuddyMissionCounts, setPersonaFeedBuddyMissionCounts] = useState<
    Record<string, number>
  >({});
  const [personaFeedBuddyMissionStreaks, setPersonaFeedBuddyMissionStreaks] = useState<
    Record<string, number>
  >({});
  const [personaFeedBuddyMissionProgressAvailable, setPersonaFeedBuddyMissionProgressAvailable] =
    useState(false);
  const [personaFeedBuddyMissionXpAvailable, setPersonaFeedBuddyMissionXpAvailable] =
    useState(false);
  const [personaFeedBuddyMissionXpByBuddy, setPersonaFeedBuddyMissionXpByBuddy] = useState<
    Record<
      string,
      {
        xpTotal?: number;
        level?: number;
        currentLevelXp?: number;
        nextLevelXp?: number;
        levelProgressRatio?: number;
        completedMissions?: number;
        gainedXp?: number;
      }
    >
  >({});
  const [personaFeedBuddyMissionRewriteSeed, setPersonaFeedBuddyMissionRewriteSeed] = useState("");
  const [personaFeedRewriteLearningByStyle, setPersonaFeedRewriteLearningByStyle] = useState<
    Record<string, RewriteLearningStyleStat>
  >({});
  const [personaFeedRewriteLearningAvailable, setPersonaFeedRewriteLearningAvailable] = useState(false);
  const [personaFeedRewriteLearningSource, setPersonaFeedRewriteLearningSource] = useState("default");
  const [personaFeedRewriteLearningContextLabel, setPersonaFeedRewriteLearningContextLabel] =
    useState("");
  const [personaFeedRewriteLearningLoading, setPersonaFeedRewriteLearningLoading] = useState(false);
  const personaFeedSeenAtRef = useRef<Map<string, number>>(new Map());
  const personaFeedActionedRef = useRef<Set<string>>(new Set());
  const personaFeedSkipSentRef = useRef<Set<string>>(new Set());
  const personaFeedMissionOpenedRef = useRef<Set<string>>(new Set());

  const [evolutionLoading, setEvolutionLoading] = useState(false);
  const [evolutionError, setEvolutionError] = useState<string | null>(null);
  const [evolutionSource, setEvolutionSource] = useState<string>("");
  const [evolutionSnapshots, setEvolutionSnapshots] = useState<PersonaEvolutionSnapshot[]>([]);
  const [evolutionTitles, setEvolutionTitles] = useState<Record<string, string>>({});

  const [dialogueMode, setDialogueMode] = useState<"friendship" | "romance">("friendship");
  const [dialogueSourceKey, setDialogueSourceKey] = useState("");
  const [dialogueTargetKey, setDialogueTargetKey] = useState("");
  const [dialogueCompatItems, setDialogueCompatItems] = useState<PersonaCompatItem[]>([]);
  const [dialogueCompatLoading, setDialogueCompatLoading] = useState(false);
  const [dialogueCompatError, setDialogueCompatError] = useState<string | null>(null);
  const [dialogueContext, setDialogueContext] = useState("");
  const [dialogueReplyToText, setDialogueReplyToText] = useState("");
  const [dialogueLoading, setDialogueLoading] = useState(false);
  const [dialogueError, setDialogueError] = useState<string | null>(null);
  const [dialogueResult, setDialogueResult] = useState<PersonaDialogueResult | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchItems, setSearchItems] = useState<SearchPost[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [notificationsState, notificationsListActions] = useNotificationsState<NotificationItem>({
    items: [],
  });
  const notifications = notificationsState.items;
  const notificationsLoading = notificationsState.loading;
  const notificationsError = notificationsState.error;
  const [notificationsBusy, setNotificationsBusy] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<NotificationFilter>("all");
  const creatorGrowthAlertShownRef = useRef<Set<string>>(new Set());
  const [pushSetupBusy, setPushSetupBusy] = useState(false);
  const [pushSetupMessage, setPushSetupMessage] = useState<string | null>(null);
  const [pushSetupAvailable, setPushSetupAvailable] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushTokenPreview, setPushTokenPreview] = useState<string | null>(null);
  const pushReceiveSubRef = useRef<any | null>(null);
  const pushResponseSubRef = useRef<any | null>(null);
  const loggedOutResetAppliedRef = useRef(false);
  const userBootstrapLoadedRef = useRef<string | null>(null);
  const feedLoadInFlightRef = useRef(false);
  const timelineSignalWeightPersistSigRef = useRef<string>("");
  const devUiSmokeRunningRef = useRef(false);
  const devUiSmokeCompletedUserRef = useRef<string | null>(null);
  const composeGrowthAlertCheckpointRef = useRef<
    Map<
      string,
      {
        saves: number;
        replies: number;
        opens: number;
        saveRateBucket: number;
        replyRateBucket: number;
      }
    >
  >(new Map());

  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [securityMessage, setSecurityMessage] = useState<string | null>(null);
  const [securityBusyKey, setSecurityBusyKey] = useState<
    null | "password" | "reset" | "others" | "global"
  >(null);
  const [securityNewPassword, setSecurityNewPassword] = useState("");
  const [securityConfirmPassword, setSecurityConfirmPassword] = useState("");
  const [accountEmail, setAccountEmail] = useState<string>("");
  const [accountEmailConfirmedAt, setAccountEmailConfirmedAt] = useState<string | null>(null);
  const [accountLastSignInAt, setAccountLastSignInAt] = useState<string | null>(null);
  const [accountCreatedAt, setAccountCreatedAt] = useState<string | null>(null);
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserViewRow[]>([]);
  const [moderationMessage, setModerationMessage] = useState<string | null>(null);
  const [moderationBusy, setModerationBusy] = useState(false);
  const [accountDeleteBusy, setAccountDeleteBusy] = useState(false);
  const [devUiSmokeStatus, setDevUiSmokeStatus] = useState<string | null>(null);
  const [devUiSmokeHistory, setDevUiSmokeHistory] = useState<string[]>([]);

  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailPost, setDetailPost] = useState<PostDetailItem | null>(null);
  const [detailReplies, setDetailReplies] = useState<PostDetailItem[]>([]);
  const [postSaveStateById, setPostSaveStateById] = useState<Record<string, CardSaveState>>({});
  const [detailSaveBusy, setDetailSaveBusy] = useState(false);
  const [detailSaved, setDetailSaved] = useState(false);
  const [detailSaveCount, setDetailSaveCount] = useState(0);
  const [detailSaveCollectionKey, setDetailSaveCollectionKey] = useState<string>("saved");
  const [detailSaveCollectionLabel, setDetailSaveCollectionLabel] = useState<string>("保存");
  const [detailSaveCollectionAvailable, setDetailSaveCollectionAvailable] = useState(false);
  const [detailLieFeedback, setDetailLieFeedback] = useState<{
    opens: number;
    reports: number;
    truthTrueVotes: number;
    truthFalseVotes: number;
  }>({
    opens: 0,
    reports: 0,
    truthTrueVotes: 0,
    truthFalseVotes: 0,
  });
  const [detailSequenceIds, setDetailSequenceIds] = useState<string[]>([]);
  const [detailSequenceIndex, setDetailSequenceIndex] = useState(0);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [detailPersonaMatch, setDetailPersonaMatch] = useState<{
    key: string | null;
    reason: string | null;
  } | null>(null);
  const detailSwipeStartXRef = useRef<number | null>(null);
  const detailVisibleRef = useRef(false);
  const [formatRailViewerVisible, setFormatRailViewerVisible] = useState(false);
  const [formatRailViewerSource, setFormatRailViewerSource] = useState<string>("");
  const [formatRailViewerItems, setFormatRailViewerItems] = useState<FormatRailItem[]>([]);
  const [formatRailViewerIndex, setFormatRailViewerIndex] = useState(0);
  const formatRailSwipeStartYRef = useRef<number | null>(null);
  const formatRailSwipeStartXRef = useRef<number | null>(null);
  const [openedPostIds, setOpenedPostIds] = useState<string[]>([]);
  const feedItemsRef = useRef<FeedItem[]>([]);
  const followingFeedItemsRef = useRef<FeedItem[]>([]);
  const savedFeedItemsRef = useRef<SavedFeedItem[]>([]);
  const notificationsRef = useRef<NotificationItem[]>([]);
  const personaFeedItemsRef = useRef<FeedItem[]>([]);
  const openedPostStateRequestedRef = useRef<Set<string>>(new Set());
  const openedPostStatePersistedRef = useRef<Set<string>>(new Set());
  const openedPostStateEnabledRef = useRef(true);

  const [personaLoading, setPersonaLoading] = useState(false);
  const [personaError, setPersonaError] = useState<string | null>(null);
  const [personaRows, setPersonaRows] = useState<
    Array<PersonaScoreRow & { title: string; theme?: string | null }>
  >([]);
  const [personaInsightLoading, setPersonaInsightLoading] = useState(false);
  const [personaInsightError, setPersonaInsightError] = useState<string | null>(null);
  const [personaInsight, setPersonaInsight] = useState<PersonaInsightRow | null>(null);
  const [personaQuests, setPersonaQuests] = useState<PersonaQuestRow[]>([]);
  const [questXp, setQuestXp] = useState(0);
  const [soulmateError, setSoulmateError] = useState<string | null>(null);
  const [soulmates, setSoulmates] = useState<
    Array<{
      user_id: string;
      handle: string | null;
      display_name: string | null;
      persona_key: string;
      persona_title: string;
      percent: number;
      relation_label: string | null;
    }>
  >([]);
  const [recomputeBusy, setRecomputeBusy] = useState(false);

  const [dominantPersonaTitle, setDominantPersonaTitle] = useState<string | null>(null);
  const [dominantTalkStyle, setDominantTalkStyle] = useState<string | null>(null);
  const [dailyPrompt, setDailyPrompt] = useState<PromptOfDayRow | null>(null);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [personaDefs, setPersonaDefs] = useState<PersonaDefRow[]>([]);
  const [personaCatalogDefs, setPersonaCatalogDefs] = useState<PersonaCatalogDefRow[]>([]);
  const [personaCatalogLoading, setPersonaCatalogLoading] = useState(false);
  const [personaCatalogError, setPersonaCatalogError] = useState<string | null>(null);
  const [personaCatalogImageErrors, setPersonaCatalogImageErrors] = useState<Record<string, number>>({});
  const [personaCatalogDetail, setPersonaCatalogDetail] = useState<PersonaCatalogDefRow | null>(null);
  const [personaCatalogDetailTab, setPersonaCatalogDetailTab] = useState<
    "compat" | "dialogue" | "examples"
  >("compat");
  const [personaCatalogDetailCompatItems, setPersonaCatalogDetailCompatItems] = useState<PersonaCompatItem[]>([]);
  const [personaCatalogDetailCompatLoading, setPersonaCatalogDetailCompatLoading] = useState(false);
  const [personaCatalogDetailCompatError, setPersonaCatalogDetailCompatError] = useState<string | null>(null);
  const [personaCatalogDetailDialogueTargetKey, setPersonaCatalogDetailDialogueTargetKey] = useState("");
  const [personaCatalogDetailExamples, setPersonaCatalogDetailExamples] = useState<FeedItem[]>([]);
  const [personaCatalogDetailExamplesLoading, setPersonaCatalogDetailExamplesLoading] = useState(false);
  const [personaCatalogDetailExamplesError, setPersonaCatalogDetailExamplesError] = useState<string | null>(null);
  const [timelineSignalWeights, setTimelineSignalWeights] = useState<TimelineSignalWeights | null>(null);
  const [timelineSignalWeightsSamples, setTimelineSignalWeightsSamples] = useState(0);
  const [timelineSignalWeightsAvailable, setTimelineSignalWeightsAvailable] = useState(true);

  const setSavedFeed = useCallback(
    (next: SavedFeedItem[] | ((prev: SavedFeedItem[]) => SavedFeedItem[])) => {
      const prev = savedFeedItemsRef.current;
      const resolved = typeof next === "function" ? (next as (prev: SavedFeedItem[]) => SavedFeedItem[])(prev) : next;
      savedFeedListActions.replace(resolved);
    },
    [savedFeedListActions]
  );
  const setSavedFeedLoading = useCallback(
    (next: boolean) => {
      if (next) {
        savedFeedListActions.start(false);
        return;
      }
      savedFeedListActions.patch({ loading: false, refreshing: false });
    },
    [savedFeedListActions]
  );
  const setSavedFeedError = useCallback(
    (next: string | null) => savedFeedListActions.setError(next),
    [savedFeedListActions]
  );
  const setSavedFeedOffset = useCallback(
    (next: number) => savedFeedListActions.patch({ offset: Math.max(0, Math.floor(next || 0)) }),
    [savedFeedListActions]
  );
  const setSavedFeedHasMore = useCallback(
    (next: boolean) => savedFeedListActions.patch({ hasMore: Boolean(next) }),
    [savedFeedListActions]
  );

  const setPersonaFeedItems = useCallback(
    (next: FeedItem[] | ((prev: FeedItem[]) => FeedItem[])) => {
      const prev = personaFeedItemsRef.current;
      const resolved = typeof next === "function" ? (next as (prev: FeedItem[]) => FeedItem[])(prev) : next;
      personaFeedListActions.replace(resolved);
    },
    [personaFeedListActions]
  );
  const setPersonaFeedLoading = useCallback(
    (next: boolean) => {
      if (next) {
        personaFeedListActions.start(false);
        return;
      }
      personaFeedListActions.patch({ loading: false, refreshing: false });
    },
    [personaFeedListActions]
  );
  const setPersonaFeedError = useCallback(
    (next: string | null) => personaFeedListActions.setError(next),
    [personaFeedListActions]
  );
  const setPersonaFeedOffset = useCallback(
    (next: number) => personaFeedListActions.patch({ offset: Math.max(0, Math.floor(next || 0)) }),
    [personaFeedListActions]
  );
  const setPersonaFeedHasMore = useCallback(
    (next: boolean) => personaFeedListActions.patch({ hasMore: Boolean(next) }),
    [personaFeedListActions]
  );

  const setNotifications = useCallback(
    (next: NotificationItem[] | ((prev: NotificationItem[]) => NotificationItem[])) => {
      const prev = notificationsRef.current;
      const resolved =
        typeof next === "function" ? (next as (prev: NotificationItem[]) => NotificationItem[])(prev) : next;
      notificationsListActions.replace(resolved);
    },
    [notificationsListActions]
  );
  const setNotificationsLoading = useCallback(
    (next: boolean) => {
      if (next) {
        notificationsListActions.start(false);
        return;
      }
      notificationsListActions.patch({ loading: false, refreshing: false });
    },
    [notificationsListActions]
  );
  const setNotificationsError = useCallback(
    (next: string | null) => notificationsListActions.setError(next),
    [notificationsListActions]
  );

  const composeLieAnalysis = useMemo(() => analyzeLieScore({ text: composeText }), [composeText]);
  const score = composeLieAnalysis.score;
  const composeSelectedPersonaSuggestion = useMemo(
    () => composePersonaCandidates.find((x) => x.key === composePersonaSelected) ?? null,
    [composePersonaCandidates, composePersonaSelected]
  );
  const composeSelectedPersonaDef = useMemo(
    () => personaDefs.find((x) => x.key === composePersonaSelected) ?? null,
    [composePersonaSelected, personaDefs]
  );
  const composeBuzz = useMemo(
    () =>
      analyzePersonaBuzz({
        text: composeText,
        personaKey: composePersonaSelected,
        personaTitle:
          composeSelectedPersonaDef?.title ?? composeSelectedPersonaSuggestion?.title ?? null,
        personaTheme: composeSelectedPersonaDef?.theme ?? null,
        vibeTags: composeSelectedPersonaDef?.vibe_tags ?? [],
      }),
    [
      composePersonaSelected,
      composeSelectedPersonaDef?.theme,
      composeSelectedPersonaDef?.title,
      composeSelectedPersonaDef?.vibe_tags,
      composeSelectedPersonaSuggestion?.title,
      composeText,
    ]
  );
  const composeCalibratedBuzzScore = useMemo(() => {
    const adjusted = applyPersonaCalibration(composeBuzz.score / 100, composeBuzzCalibration);
    return Math.max(0, Math.min(100, Math.round(adjusted * 100)));
  }, [composeBuzz.score, composeBuzzCalibration]);
  const composeRewriteVariants = useMemo(
    () =>
      buildPersonaRewrites({
        text: composeText,
        personaKey: composePersonaSelected,
        personaTitle:
          composeSelectedPersonaDef?.title ?? composeSelectedPersonaSuggestion?.title ?? null,
        personaTheme: composeSelectedPersonaDef?.theme ?? null,
        vibeTags: composeSelectedPersonaDef?.vibe_tags ?? [],
        maxLength: MAX_POST_LENGTH,
        diagnostic: composeBuzz,
      }),
    [
      composeBuzz,
      composePersonaSelected,
      composeSelectedPersonaDef?.theme,
      composeSelectedPersonaDef?.title,
      composeSelectedPersonaDef?.vibe_tags,
      composeSelectedPersonaSuggestion?.title,
      composeText,
    ]
  );
  const composeCompatScoreMap = useMemo(() => {
    const map = new Map<string, number>();
    composeCompatItems.forEach((item) => {
      if (!item?.targetKey) return;
      map.set(item.targetKey, toCompatPercent(item.score));
    });
    return map;
  }, [composeCompatItems]);
  const composeBlendSecondaryOptions = useMemo(
    () =>
      personaDefs
        .filter((x) => x.key !== composePersonaSelected)
        .sort((a, b) => {
          const as = composeCompatScoreMap.get(a.key) ?? -1;
          const bs = composeCompatScoreMap.get(b.key) ?? -1;
          if (bs !== as) return bs - as;
          return (a.title ?? a.key).localeCompare(b.title ?? b.key);
        }),
    [composeCompatScoreMap, composePersonaSelected, personaDefs]
  );
  const composeBlendSecondaryDef = useMemo(
    () =>
      composeBlendSecondaryOptions.find((x) => x.key === composeBlendSecondaryKey) ??
      composeBlendSecondaryOptions[0] ??
      null,
    [composeBlendSecondaryKey, composeBlendSecondaryOptions]
  );
  const composeBlendRewrites = useMemo(() => {
    if (!composeText.trim() || !composePersonaSelected || !composeBlendSecondaryDef) return [];
    return buildPersonaBlendRewrites({
      text: composeText,
      mixRatio: clamp(composeBlendPrimarySharePct / 100, 0, 1),
      maxLength: MAX_POST_LENGTH,
      primary: {
        text: composeText,
        personaKey: composePersonaSelected,
        personaTitle:
          composeSelectedPersonaDef?.title ?? composeSelectedPersonaSuggestion?.title ?? null,
        personaTheme: composeSelectedPersonaDef?.theme ?? null,
        vibeTags: composeSelectedPersonaDef?.vibe_tags ?? [],
      },
      secondary: {
        text: composeText,
        personaKey: composeBlendSecondaryDef.key,
        personaTitle: composeBlendSecondaryDef.title ?? composeBlendSecondaryDef.key,
        personaTheme: composeBlendSecondaryDef.theme ?? null,
        vibeTags: composeBlendSecondaryDef.vibe_tags ?? [],
      },
    });
  }, [
    composeBlendPrimarySharePct,
    composeBlendSecondaryDef,
    composePersonaSelected,
    composeSelectedPersonaDef?.theme,
    composeSelectedPersonaDef?.title,
    composeSelectedPersonaDef?.vibe_tags,
    composeSelectedPersonaSuggestion?.title,
    composeText,
  ]);
  const unreadNotificationIds = useMemo(
    () => notifications.filter((x) => !x.read_at).map((x) => x.id),
    [notifications]
  );
  const openedPostIdSet = useMemo(() => new Set(openedPostIds), [openedPostIds]);
  const timelineInterestedAuthorIds = useMemo(() => {
    const ids = new Set<string>();
    feed.forEach((item) => {
      if (!openedPostIdSet.has(item.id)) return;
      const authorId = String(item.author ?? "").trim();
      const authorHandle = String(item.author_handle ?? "").replace(/^@+/, "").trim();
      if (authorId) ids.add(authorId);
      if (authorHandle) ids.add(authorHandle);
    });
    return Array.from(ids);
  }, [feed, openedPostIdSet]);
  const timelineInterestedPersonaKeys = useMemo(
    () => personaRows.slice(0, 3).map((x) => String(x.persona_key ?? "").trim()).filter(Boolean),
    [personaRows]
  );
  const timelineFollowedAuthorIds = useMemo(() => {
    const ids = new Set<string>();
    followingFeed.forEach((item) => {
      const authorId = String(item.author ?? "").trim();
      const authorHandle = String(item.author_handle ?? "").replace(/^@+/, "").trim();
      if (authorId) ids.add(authorId);
      if (authorHandle) ids.add(authorHandle);
    });
    return Array.from(ids);
  }, [followingFeed]);
  const timelineSavedPostIds = useMemo(() => {
    const ids = new Set<string>();
    savedFeed.forEach((item) => {
      if (item?.id) ids.add(String(item.id));
    });
    Object.entries(postSaveStateById).forEach(([postId, st]) => {
      if (st?.saved) ids.add(String(postId));
    });
    return Array.from(ids);
  }, [postSaveStateById, savedFeed]);
  const timelineSignalLearningInput = useMemo(
    () => ({
      openedCount: openedPostIds.length,
      savedCount: timelineSavedPostIds.length,
      followedCount: timelineFollowedAuthorIds.length,
    }),
    [openedPostIds.length, timelineFollowedAuthorIds.length, timelineSavedPostIds.length]
  );

  useEffect(() => {
    if (!userId) {
      setTimelineSignalWeights(null);
      setTimelineSignalWeightsSamples(0);
      setTimelineSignalWeightsAvailable(true);
      timelineSignalWeightPersistSigRef.current = "";
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await loadMobileTimelineSignalWeights({ userId });
        if (!alive) return;
        setTimelineSignalWeightsAvailable(res.available !== false);
        setTimelineSignalWeights(res.weights ?? null);
        setTimelineSignalWeightsSamples(Math.max(0, Math.floor(Number(res.samples ?? 0) || 0)));
      } catch {
        if (!alive) return;
        setTimelineSignalWeightsAvailable(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !timelineSignalWeightsAvailable) return;
    if (
      timelineSignalLearningInput.openedCount <= 0 &&
      timelineSignalLearningInput.savedCount <= 0 &&
      timelineSignalLearningInput.followedCount <= 0
    ) {
      return;
    }
    const sig = JSON.stringify(timelineSignalLearningInput);
    if (timelineSignalWeightPersistSigRef.current === sig) return;
    timelineSignalWeightPersistSigRef.current = sig;
    let cancelled = false;
    (async () => {
      try {
        const evolved = evolveTimelineSignalWeightsState({
          currentWeights: timelineSignalWeights,
          currentSamples: timelineSignalWeightsSamples,
          learningInput: timelineSignalLearningInput,
        });
        const saveRes = await upsertMobileTimelineSignalWeights({
          userId,
          weights: evolved.weights,
          samples: evolved.samples,
          learningInput: evolved.learningInput,
        });
        if (cancelled) return;
        if (saveRes.available === false) {
          setTimelineSignalWeightsAvailable(false);
          return;
        }
        setTimelineSignalWeights(evolved.weights);
        setTimelineSignalWeightsSamples(evolved.samples);
      } catch {
        // ignore, local ranking still works
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    timelineSignalLearningInput,
    timelineSignalWeights,
    timelineSignalWeightsAvailable,
    timelineSignalWeightsSamples,
    userId,
  ]);
  const timelineRankedItems = useMemo(
    () =>
      rankTimelineByUserSignals(feed, {
        openedIds: openedPostIdSet,
        savedPostIds: timelineSavedPostIds,
        followedAuthorIds: timelineFollowedAuthorIds,
        interestedAuthorIds: timelineInterestedAuthorIds,
        interestedPersonaKeys: timelineInterestedPersonaKeys,
        weights: timelineSignalWeights ?? undefined,
        learningInput: timelineSignalLearningInput,
      }).map((x) => x.item),
    [
      feed,
      openedPostIdSet,
      timelineFollowedAuthorIds,
      timelineInterestedAuthorIds,
      timelineInterestedPersonaKeys,
      timelineSignalLearningInput,
      timelineSignalWeights,
      timelineSavedPostIds,
    ]
  );
  const { fresh: timelineFreshItems, past: timelinePastItems } = useMemo(
    () => splitByOpenedIds(timelineRankedItems, openedPostIdSet),
    [openedPostIdSet, timelineRankedItems]
  );
  const timelineHighlights = useMemo(
    () =>
      pickTimelineHighlights(timelineRankedItems, {
        popularLimit: 3,
        forYouLimit: 4,
        openedIds: openedPostIdSet,
        savedPostIds: timelineSavedPostIds,
        followedAuthorIds: timelineFollowedAuthorIds,
        interestedAuthorIds: timelineInterestedAuthorIds,
        interestedPersonaKeys: timelineInterestedPersonaKeys,
      }),
    [
      openedPostIdSet,
      timelineFollowedAuthorIds,
      timelineInterestedAuthorIds,
      timelineInterestedPersonaKeys,
      timelineRankedItems,
      timelineSavedPostIds,
    ]
  );
  const { fresh: followingFreshItems, past: followingPastItems } = useMemo(
    () => splitByOpenedIds(followingFeed, openedPostIdSet),
    [followingFeed, openedPostIdSet]
  );
  const { fresh: savedFreshItems, past: savedPastItems } = useMemo(
    () => splitByOpenedIds(savedFeed, openedPostIdSet),
    [openedPostIdSet, savedFeed]
  );
  const { fresh: personaFeedFreshItems, past: personaFeedPastItems } = useMemo(
    () => splitByOpenedIds(personaFeedItems, openedPostIdSet),
    [openedPostIdSet, personaFeedItems]
  );
  const personaFeedBuddyProgressRows = useMemo(
    () =>
      personaFeedBuddyPersonas.slice(0, 4).map((x) => {
        const stage = buddyLearningStageInfo(x.learned_samples);
        const samples = Math.max(0, Math.floor(Number(x.learned_samples ?? 0) || 0));
        const confidence = clamp(Number(x.learning_confidence ?? 0) || 0, 0, 1);
        return {
          ...x,
          stageLabel: stage.label,
          stageGoal: stage.goal,
          progress: buddyLearningProgress(samples, stage.goal),
          confidence,
          remainingSamples: Math.max(0, stage.goal - samples),
        };
      }),
    [personaFeedBuddyPersonas]
  );
  const personaFeedBuddyMissionCandidates = useMemo(
    () =>
      [...personaFeedBuddyProgressRows].sort((a, b) => {
        if (a.confidence !== b.confidence) return a.confidence - b.confidence;
        return b.score - a.score;
      }),
    [personaFeedBuddyProgressRows]
  );
  const personaFeedBuddyMission = useMemo(() => {
    if (!personaFeedBuddyMissionCandidates.length) return null;
    const target =
      personaFeedBuddyMissionCandidates[
        personaFeedBuddyMissionCursor % personaFeedBuddyMissionCandidates.length
      ];
    const openTarget =
      target.remainingSamples > 0
        ? Math.max(1, Math.min(3, Math.ceil(target.remainingSamples / 2)))
        : 1;
    const missionKey = `${todayLocalKey()}:${target.key}`;
    const progress = Math.max(
      0,
      Math.floor(Number(personaFeedBuddyMissionCounts[missionKey] ?? 0) || 0)
    );
    const unlocked = progress >= openTarget;
    const streakDays = Math.max(
      0,
      Math.floor(Number(personaFeedBuddyMissionStreaks[target.key] ?? 0) || 0)
    );
    const xp = personaFeedBuddyMissionXpByBuddy[target.key] ?? {};
    if (target.remainingSamples > 0) {
      return {
        key: target.key,
        text: `今日のバディミッション: @${target.key} 投稿を${openTarget}件開いて「${target.stageLabel}」を進める（残り学習サンプル ${target.remainingSamples}）`,
        goal: openTarget,
        progress,
        unlocked,
        streakDays,
        xp,
        missionKey,
      };
    }
    return {
      key: target.key,
      text: `今日のバディミッション: @${target.key} 投稿を1件開いて現在の学習係数を維持する`,
      goal: openTarget,
      progress,
      unlocked,
      streakDays,
      xp,
      missionKey,
    };
  }, [
    personaFeedBuddyMissionCandidates,
    personaFeedBuddyMissionCounts,
    personaFeedBuddyMissionCursor,
    personaFeedBuddyMissionStreaks,
    personaFeedBuddyMissionXpByBuddy,
  ]);
  const personaFeedMissionRewrites = useMemo(() => {
    if (!personaFeedBuddyMission?.unlocked) return [];
    return buildBuddyMissionRewrites({
      seedText: personaFeedBuddyMissionRewriteSeed,
      basePersona: personaFeedBasePersona,
      buddyKey: personaFeedBuddyMission.key,
    })
      .map((variant) => {
        const stat = personaFeedRewriteLearningByStyle[variant.styleKey] ?? null;
        const multiplier = Number(stat?.multiplier ?? 1);
        const confidence = clamp(Number(stat?.confidence ?? 0) || 0, 0, 1);
        const samples = Math.max(0, Math.floor(Number(stat?.samples ?? 0) || 0));
        const learnedScore =
          (Number(stat?.score ?? 0.5) || 0.5) *
          (0.8 + confidence * 0.2) *
          clamp(multiplier / 1.45, 0, 1);
        return {
          ...variant,
          learning: {
            multiplier: Number.isFinite(multiplier) ? multiplier : 1,
            confidence,
            samples,
            learnedScore,
          },
        };
      })
      .sort((a, b) => {
        if (a.learning.samples !== b.learning.samples) {
          return b.learning.samples - a.learning.samples;
        }
        return (b.learning.learnedScore ?? 0) - (a.learning.learnedScore ?? 0);
      });
  }, [
    personaFeedBasePersona,
    personaFeedBuddyMission,
    personaFeedBuddyMissionRewriteSeed,
    personaFeedRewriteLearningByStyle,
  ]);
  const personaFeedTrendingTopics = useMemo(
    () => extractFeedTrendingTopics(personaFeedItems, 8),
    [personaFeedItems]
  );
  const timelineFormatRailItems = useMemo(() => extractFormatRailItems(feed, 10), [feed]);
  const followingFormatRailItems = useMemo(
    () => extractFormatRailItems(followingFeed, 10),
    [followingFeed]
  );
  const savedFormatRailItems = useMemo(() => extractFormatRailItems(savedFeed, 10), [savedFeed]);
  const personaFeedFormatRailItems = useMemo(
    () => extractFormatRailItems(personaFeedItems, 12),
    [personaFeedItems]
  );
  const { fresh: searchFreshItems, past: searchPastItems } = useMemo(
    () => splitByOpenedIds(searchItems, openedPostIdSet),
    [openedPostIdSet, searchItems]
  );
  const filteredNotifications = useMemo(
    () => notifications.filter((x) => matchNotificationFilter(x.kind, notificationFilter)),
    [notificationFilter, notifications]
  );
  const { fresh: freshNotifications, past: pastNotifications } = useMemo(
    () => splitByReadAt(filteredNotifications),
    [filteredNotifications]
  );
  const blockedAuthorIds = useMemo(
    () =>
      blockedUsers
        .map((x) => String(x.blocked_id ?? "").trim())
        .filter((x) => x.length > 0),
    [blockedUsers]
  );
  const blockedAuthorSet = useMemo(() => new Set(blockedAuthorIds), [blockedAuthorIds]);
  const webBaseUrl = useMemo(
    () => (process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "").trim().replace(/\/$/, ""),
    []
  );
  const webBaseUrlDevOverride = useMemo(
    () => (process.env.EXPO_PUBLIC_WEB_BASE_URL_DEV ?? "").trim().replace(/\/$/, ""),
    []
  );
  const personaImageHostBaseUrl = useMemo(() => {
    if (__DEV__) return webBaseUrlDevOverride || "http://127.0.0.1:3000";
    if (webBaseUrl) return webBaseUrl;
    return "";
  }, [webBaseUrl, webBaseUrlDevOverride]);
  const resolvePersonaCatalogImageUrl = useCallback(
    (keyName: string, title?: string | null, rawImageUrl?: string | null) => {
      const key = String(keyName ?? "").trim();
      if (!key) return null;
      const imageUrl = String(rawImageUrl ?? "").trim();
      if (imageUrl) {
        if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
        if (imageUrl.startsWith("/")) {
          if (!personaImageHostBaseUrl) return null;
          return `${personaImageHostBaseUrl}${imageUrl}`;
        }
      }
      if (!personaImageHostBaseUrl) return null;
      const titleQ = encodeURIComponent(String(title ?? key));
      return `${personaImageHostBaseUrl}/api/personas/image/${encodeURIComponent(key)}?title=${titleQ}`;
    },
    [personaImageHostBaseUrl]
  );
  const buildPersonaCatalogImageCandidates = useCallback(
    (def: PersonaCatalogDefRow) => {
      const key = String(def.key ?? "").trim();
      if (!key) return [] as string[];

      const pushUnique = (list: string[], raw: string | null | undefined) => {
        const v = String(raw ?? "").trim();
        if (!v) return;
        if (list.includes(v)) return;
        list.push(v);
      };

      const candidates: string[] = [];
      const raw = String(def.image_url ?? "").trim();
      const isRaster = (v: string) =>
        /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(v) || v.includes("/persona-images/");

      if (raw && isRaster(raw)) {
        if (/^https?:\/\//i.test(raw)) {
          pushUnique(candidates, raw);
        } else if (raw.startsWith("/") && personaImageHostBaseUrl) {
          pushUnique(candidates, `${personaImageHostBaseUrl}${raw}`);
        }
      }

      if (personaImageHostBaseUrl) {
        pushUnique(candidates, `${personaImageHostBaseUrl}/persona-images/${encodeURIComponent(key)}.png`);
        pushUnique(
          candidates,
          `${personaImageHostBaseUrl}/persona-images/${encodeURIComponent(key)}_legend.png`
        );
        pushUnique(candidates, `${personaImageHostBaseUrl}/persona-images/${encodeURIComponent(key)}_lite.png`);
      }

      const apiUrl = resolvePersonaCatalogImageUrl(def.key, def.title, def.image_url);
      if (apiUrl && isRaster(apiUrl)) {
        pushUnique(candidates, apiUrl);
      }

      return candidates;
    },
    [personaImageHostBaseUrl, resolvePersonaCatalogImageUrl]
  );
  const personaCatalogGroups = useMemo(() => {
    const groups = new Map<string, PersonaCatalogDefRow[]>();
    personaCatalogDefs.forEach((r) => {
      const cat = String(r.category ?? "General").trim() || "General";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)?.push(r);
    });
    return groups;
  }, [personaCatalogDefs]);
  const personaCatalogCategories = useMemo(
    () => Array.from(personaCatalogGroups.keys()),
    [personaCatalogGroups]
  );
  const devQuickLoginEmail = useMemo(
    () => (process.env.EXPO_PUBLIC_DEV_LOGIN_EMAIL ?? "").trim(),
    []
  );
  const devQuickLoginPassword = useMemo(
    () => String(process.env.EXPO_PUBLIC_DEV_LOGIN_PASSWORD ?? ""),
    []
  );
  const devQuickLoginAvailable = useMemo(
    () => __DEV__ && devQuickLoginEmail.length > 0 && devQuickLoginPassword.length > 0,
    [devQuickLoginEmail, devQuickLoginPassword]
  );
  const devAutoLoginEnabled = useMemo(() => {
    const raw = String(process.env.EXPO_PUBLIC_DEV_AUTO_LOGIN ?? "").trim().toLowerCase();
    return __DEV__ && (raw === "1" || raw === "true" || raw === "yes");
  }, []);
  const devUiSmokeEnabled = useMemo(() => {
    const raw = String(process.env.EXPO_PUBLIC_DEV_UI_SMOKE ?? "").trim().toLowerCase();
    return __DEV__ && (raw === "1" || raw === "true" || raw === "yes");
  }, []);
  const showQuickComposeFab = useMemo(
    () =>
      tab === "timeline" ||
      tab === "following" ||
      tab === "saved" ||
      tab === "personaFeed" ||
      tab === "search" ||
      tab === "notifications",
    [tab]
  );
  const FlashListComponent = useMemo(() => {
    try {
      return require("@shopify/flash-list").FlashList as any;
    } catch {
      return null;
    }
  }, []);
  const authCooldownSeconds = useMemo(() => {
    if (!authCooldownUntil) return 0;
    return Math.max(0, Math.ceil((authCooldownUntil - Date.now()) / 1000));
  }, [authCooldownTick, authCooldownUntil]);

  const renderVirtualRowsList = useCallback(
    (args: {
      rows: VirtualListRow[];
      refreshing?: boolean;
      onRefresh?: () => void;
      listKey: string;
      renderPost: (item: any, opts?: any) => ReactNode;
      renderNotification: (item: NotificationItem) => ReactNode;
    }) => {
      const estimated = Math.max(
        100,
        Math.round(
          args.rows.reduce((acc, row) => acc + Math.max(60, row.estimatedHeight ?? 140), 0) /
            Math.max(1, args.rows.length)
        )
      );

      const renderRow = ({ item }: { item: VirtualListRow }) => {
        if (item.type === "block") return <>{item.node}</>;
        if (item.type === "post") return <>{args.renderPost(item.item, item.opts)}</>;
        return <>{args.renderNotification(item.item)}</>;
      };

      const canUseFlashList = FlashListComponent && Platform.OS !== "web";

      if (canUseFlashList) {
        return (
          <View style={styles.virtualList}>
            <FlashListComponent
              key={`flash-${args.listKey}`}
              data={args.rows}
              renderItem={renderRow}
              keyExtractor={(item: VirtualListRow) => item.key}
              estimatedItemSize={estimated}
              contentContainerStyle={styles.virtualListContent}
              ItemSeparatorComponent={() => <View style={styles.virtualListSeparator} />}
              refreshing={Boolean(args.refreshing)}
              onRefresh={args.onRefresh}
            />
          </View>
        );
      }

      return (
        <ScrollView
          key={`scroll-${args.listKey}`}
          style={styles.virtualList}
          contentContainerStyle={styles.feedList}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            args.onRefresh ? (
              <RefreshControl
                refreshing={Boolean(args.refreshing)}
                onRefresh={() => {
                  args.onRefresh?.();
                }}
              />
            ) : undefined
          }
        >
          {args.rows.map((row) => {
            if (row.type === "block") return <View key={row.key}>{row.node}</View>;
            if (row.type === "post") return <View key={row.key}>{args.renderPost(row.item, row.opts)}</View>;
            return <View key={row.key}>{args.renderNotification(row.item)}</View>;
          })}
        </ScrollView>
      );
    },
    [FlashListComponent]
  );
  const authPasswordStrength = useMemo(() => passwordStrengthLabel(password), [password]);
  const securityPasswordStrength = useMemo(
    () => passwordStrengthLabel(securityNewPassword),
    [securityNewPassword]
  );
  const canDetailPrev = detailSequenceIds.length > 0 && detailSequenceIndex > 0;
  const canDetailNext =
    detailSequenceIds.length > 0 && detailSequenceIndex < detailSequenceIds.length - 1;
  const personaStarters = useMemo(() => {
    if (!dominantPersonaTitle) return [];
    return buildPersonaStarters(dominantPersonaTitle, dominantTalkStyle ?? "");
  }, [dominantPersonaTitle, dominantTalkStyle]);
  const evolutionTransitions = useMemo(() => {
    const out: PersonaEvolutionSnapshot[] = [];
    evolutionSnapshots.forEach((s, i) => {
      if (i === 0 || evolutionSnapshots[i - 1]?.top_key !== s.top_key) out.push(s);
    });
    return out;
  }, [evolutionSnapshots]);
  const dialogueSourceDef = useMemo(
    () => personaDefs.find((x) => x.key === dialogueSourceKey) ?? null,
    [dialogueSourceKey, personaDefs]
  );
  const dialogueTargetDef = useMemo(
    () => personaDefs.find((x) => x.key === dialogueTargetKey) ?? null,
    [dialogueTargetKey, personaDefs]
  );
  const selectedDialogueCompat = useMemo(
    () => dialogueCompatItems.find((x) => x.targetKey === dialogueTargetKey) ?? null,
    [dialogueCompatItems, dialogueTargetKey]
  );
  const dominantPersonaProfile = useMemo(() => {
    if (personaRows.length === 0) return null;
    const top = personaRows[0];
    const def = personaDefs.find((x) => x.key === top.persona_key);
    return buildPersonaProfile({
      key: top.persona_key,
      title: def?.title ?? top.title,
      theme: def?.theme ?? top.theme ?? null,
      blurb: def?.blurb ?? null,
      talkStyle: def?.talk_style ?? dominantTalkStyle ?? null,
      relationStyle: def?.relation_style ?? null,
      vibeTags: def?.vibe_tags ?? [],
    });
  }, [dominantTalkStyle, personaDefs, personaRows]);
  const dialogueSourceProfile = useMemo(
    () =>
      buildPersonaProfile({
        key: dialogueSourceDef?.key ?? dialogueSourceKey,
        title: dialogueSourceDef?.title ?? dialogueSourceKey,
        theme: dialogueSourceDef?.theme ?? null,
        blurb: dialogueSourceDef?.blurb ?? null,
        talkStyle: dialogueSourceDef?.talk_style ?? null,
        relationStyle: dialogueSourceDef?.relation_style ?? null,
        vibeTags: dialogueSourceDef?.vibe_tags ?? [],
      }),
    [dialogueSourceDef, dialogueSourceKey]
  );
  const dialogueTargetProfile = useMemo(
    () =>
      buildPersonaProfile({
        key: dialogueTargetDef?.key ?? dialogueTargetKey,
        title: dialogueTargetDef?.title ?? dialogueTargetKey,
        theme: dialogueTargetDef?.theme ?? null,
        blurb: dialogueTargetDef?.blurb ?? null,
        talkStyle: dialogueTargetDef?.talk_style ?? null,
        relationStyle: dialogueTargetDef?.relation_style ?? null,
        vibeTags: dialogueTargetDef?.vibe_tags ?? [],
      }),
    [dialogueTargetDef, dialogueTargetKey]
  );
  const dialogueQuickContexts = useMemo(() => {
    const source = dialogueSourceDef?.title ?? dialogueSourceKey;
    const target = dialogueTargetDef?.title ?? dialogueTargetKey;
    if (!source || !target) return [];
    return [
      `${source}×${target}で朝の挨拶に返信`,
      `${source}×${target}で軽い相談に返答`,
      `${source}×${target}で週末の予定を決める`,
    ];
  }, [dialogueSourceDef, dialogueSourceKey, dialogueTargetDef, dialogueTargetKey]);
  const localPersonaQuests = useMemo<PersonaQuestRow[]>(() => {
    if (personaRows.length === 0) return [];
    const dominant = personaRows[0];
    const second = personaRows[1] ?? null;
    const third = personaRows[2] ?? null;
    const promptTitle = dailyPrompt?.title ?? "今日の出来事";
    const promptBody = dailyPrompt?.body ?? "";
    const quests: PersonaQuestRow[] = [
      {
        id: "main_streak",
        kind: "focus",
        title: `主キャラ「${dominant.title}」で1投稿`,
        description: "主軸キャラを継続して学習精度を上げる",
        xp: 40,
        completed: false,
        seed: `【${dominant.title}モード】${normalizeTalkStyle(dominantTalkStyle)}\n${promptTitle}\n${promptBody}`,
      },
      {
        id: "contrast_break",
        kind: "contrast",
        title: `逆視点「${third?.title ?? second?.title ?? "別キャラ"}」で投稿`,
        description: "普段と違うキャラで投稿して会話の幅を増やす",
        xp: 60,
        completed: false,
        seed: `【視点転換】いつもと違うキャラで語る\nテーマ: ${promptTitle}`,
      },
      {
        id: "duet_reply",
        kind: "duet",
        title: `相棒「${second?.title ?? "相性キャラ"}」で返信`,
        description: "相性キャラの掛け合わせで返信率を上げる",
        xp: 55,
        completed: false,
        seed: `【相棒返信】${dominant.title} × ${second?.title ?? "相性キャラ"}\n短く質問を添える`,
      },
    ];
    return quests;
  }, [dailyPrompt?.body, dailyPrompt?.title, dominantTalkStyle, personaRows]);

  const isBlockedAuthor = useCallback(
    (authorId: string | null | undefined) => {
      const key = String(authorId ?? "").trim();
      if (!key) return false;
      return blockedAuthorSet.has(key);
    },
    [blockedAuthorSet]
  );

  const filterBlockedFeedItems = useCallback(
    (items: FeedItem[]) => {
      if (blockedAuthorSet.size === 0) return items;
      return items.filter((item) => !isBlockedAuthor(item.author));
    },
    [blockedAuthorSet.size, isBlockedAuthor]
  );

  const filterBlockedSearchItems = useCallback(
    (items: SearchPost[]) => {
      if (blockedAuthorSet.size === 0) return items;
      return items.filter((item) => !isBlockedAuthor(item.author));
    },
    [blockedAuthorSet.size, isBlockedAuthor]
  );

  const filterBlockedDetailItems = useCallback(
    (items: PostDetailItem[]) => {
      if (blockedAuthorSet.size === 0) return items;
      return items.filter((item) => !isBlockedAuthor(item.author));
    },
    [blockedAuthorSet.size, isBlockedAuthor]
  );

  const loadBlockedUsers = useCallback(async () => {
    if (!userId) return;
    setModerationMessage(null);

    const res = await supabase
      .from("user_blocks")
      .select("blocked_id,created_at")
      .eq("blocker_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (res.error) {
      if (isMissingRelationError(res.error, "user_blocks")) {
        setBlockedUsers([]);
        setModerationMessage(
          "ブロック機能は未構成です。docs/sql/app_store_safety.sql を適用してください。"
        );
        return;
      }
      setModerationMessage(res.error.message ?? "ブロック一覧の取得に失敗しました");
      setBlockedUsers([]);
      return;
    }

    const rows = (res.data ?? []) as Array<{ blocked_id: string; created_at?: string | null }>;
    const ids = Array.from(
      new Set(
        rows
          .map((r) => String(r?.blocked_id ?? "").trim())
          .filter((x) => x.length > 0)
      )
    );
    if (ids.length === 0) {
      setBlockedUsers([]);
      return;
    }

    const profilesRes = await supabase
      .from("profiles")
      .select("id,handle,display_name")
      .in("id", ids)
      .limit(300);
    const profileMap = new Map<
      string,
      {
        handle: string | null;
        display_name: string | null;
      }
    >();
    (profilesRes.data ?? []).forEach((p: any) => {
      if (!p?.id) return;
      profileMap.set(String(p.id), {
        handle: p.handle ?? null,
        display_name: p.display_name ?? null,
      });
    });
    setBlockedUsers(
      ids.map((id) => {
        const row = rows.find((r) => r.blocked_id === id);
        const profile = profileMap.get(id);
        return {
          blocked_id: id,
          created_at: row?.created_at ?? null,
          handle: profile?.handle ?? null,
          display_name: profile?.display_name ?? null,
        };
      })
    );
  }, [userId]);

  const openLegalLink = useCallback(
    async (path: string) => {
      if (!webBaseUrl) {
        Alert.alert(
          "未設定",
          "EXPO_PUBLIC_WEB_BASE_URL が未設定です。法務ページURLを設定してください。"
        );
        return;
      }
      const next = `${webBaseUrl}${path}`;
      const can = await Linking.canOpenURL(next);
      if (!can) {
        Alert.alert("リンクエラー", "URLを開けませんでした。");
        return;
      }
      await Linking.openURL(next);
    },
    [webBaseUrl]
  );

  const loadFeed = useCallback(async () => {
    if (!userId) return;
    if (feedLoadInFlightRef.current) return;
    feedLoadInFlightRef.current = true;
    setFeedLoading(true);
    setFeedError(null);

    try {
      const withTimeout = async <T,>(p: Promise<T>, ms: number, label: string): Promise<T> => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        try {
          return await Promise.race([
            p,
            new Promise<T>((_, reject) => {
              timer = setTimeout(() => reject(new Error(`${label} がタイムアウトしました`)), ms);
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      };

      const page = await withTimeout(loadMobileFeedPage({ limit: 40 }), 8000, "タイムライン取得");
      const baseItems = filterBlockedFeedItems((page.items ?? []) as FeedItem[]);
      setFeed(baseItems);
    } catch (e: any) {
      setFeedError(e?.message ?? "タイムライン取得に失敗しました");
      setFeed([]);
    } finally {
      feedLoadInFlightRef.current = false;
      setFeedLoading(false);
    }
  }, [
    filterBlockedFeedItems,
    userId,
  ]);

  const loadFollowingFeed = useCallback(async () => {
    if (!userId) return;
    setFollowingLoading(true);
    setFollowingError(null);

    try {
      const fromView = await supabase
        .from("feed_following")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(40);

      if (!fromView.error && fromView.data) {
        setFollowingFeed(
          filterBlockedFeedItems(
            (await enrichMobilePostAuthorProfiles(fromView.data as FeedItem[])) as FeedItem[]
          )
        );
        return;
      }

      const follows = await supabase
        .from("follows")
        .select("followee")
        .eq("follower", userId)
        .limit(200);

      if (follows.error) throw follows.error;
      const followeeIds = (follows.data ?? [])
        .map((x: any) => x.followee)
        .filter(Boolean) as string[];

      if (followeeIds.length === 0) {
        setFollowingFeed([]);
        return;
      }

      const fromPosts = await supabase
        .from("posts")
        .select("*")
        .in("author", followeeIds)
        .order("created_at", { ascending: false })
        .limit(40);

      if (fromPosts.error) throw fromPosts.error;
      setFollowingFeed(
        filterBlockedFeedItems(
          (await enrichMobilePostAuthorProfiles((fromPosts.data ?? []) as FeedItem[])) as FeedItem[]
        )
      );
    } catch (e: any) {
      setFollowingError(e?.message ?? "フォロー中フィードの取得に失敗しました");
      setFollowingFeed([]);
    } finally {
      setFollowingLoading(false);
    }
  }, [filterBlockedFeedItems, userId]);

  const loadPostsByIdsForSaved = useCallback(async (ids: string[]) => {
    const rows = (await loadMobilePostsByIdsEnriched(ids)) as FeedItem[];
    return new Map(rows.map((row) => [row.id, row]));
  }, []);

  const loadSavedCollectionsSummary = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetchMobileSavedCollectionsSummaryRows({ userId, limit: 240 });
      if (!res.available) {
        setSavedCollectionsAvailable(false);
        setSavedCollections([{ key: "all", label: "すべて", count: savedFeed.length }]);
        if (savedCollectionKey !== "all") setSavedCollectionKey("all");
        return;
      }

      const rows = res.rows as Array<{
        post_id: string;
        collection_key?: string | null;
        collection_label?: string | null;
        updated_at?: string | null;
      }>;
      const map = new Map<string, SavedCollectionSummary>();
      rows.forEach((row) => {
        const key = normalizeCollectionKey(row.collection_key);
        const cur = map.get(key) ?? {
          key,
          label: normalizeCollectionLabel(row.collection_label),
          count: 0,
          lastSavedAt: row.updated_at ?? null,
        };
        cur.count += 1;
        if (!cur.lastSavedAt || (row.updated_at && row.updated_at > cur.lastSavedAt)) {
          cur.lastSavedAt = row.updated_at ?? cur.lastSavedAt ?? null;
        }
        if (!cur.label || cur.label === "保存") {
          cur.label = normalizeCollectionLabel(row.collection_label);
        }
        map.set(key, cur);
      });

      const items = Array.from(map.values()).sort((a, b) => {
        const ta = String(a.lastSavedAt ?? "");
        const tb = String(b.lastSavedAt ?? "");
        if (ta !== tb) return tb.localeCompare(ta);
        return b.count - a.count;
      });
      const totalCount =
        typeof res.totalCount === "number" ? Math.max(0, res.totalCount) : rows.length;

      const next = [{ key: "all", label: "すべて", count: totalCount } as SavedCollectionSummary, ...items];
      setSavedCollectionsAvailable(true);
      setSavedCollections(next);
      if (
        savedCollectionKey !== "all" &&
        !next.some((x) => x.key === savedCollectionKey)
      ) {
        setSavedCollectionKey("all");
      }
    } catch {
      // Keep current UI state; saved list loading handles explicit errors.
    }
  }, [savedCollectionKey, savedFeed.length, userId]);

  const loadSavedFeed = useCallback(
    async (reset = false) => {
      if (!userId) return;
      const offset = reset ? 0 : savedFeedOffset;
      setSavedFeedLoading(true);
      setSavedFeedError(null);

      try {
        let collectionAvailable = true;
        const savedPage = await loadMobileSavedFeedRows({
          userId,
          offset,
          limit: SAVED_FEED_PAGE,
          collectionKey: savedCollectionKey,
        });
        if (savedPage.unsupportedCollectionFilter) {
          setSavedCollectionsAvailable(false);
          setSavedFeed([]);
          setSavedFeedOffset(0);
          setSavedFeedHasMore(false);
          setSavedFeedError("コレクション機能DB未適用のため、分類フィルタは利用できません。");
          return;
        }
        collectionAvailable = savedPage.collectionAvailable;
        setSavedCollectionsAvailable(collectionAvailable);

        const rows = savedPage.rows as Array<{
          post_id: string;
          collection_key?: string | null;
          collection_label?: string | null;
          updated_at?: string | null;
          created_at?: string | null;
        }>;
        const totalCount = savedPage.totalCount;

        const postIds = rows.map((x) => String(x.post_id ?? "").trim()).filter((x) => x.length > 0);
        const byId = await loadPostsByIdsForSaved(postIds);
        const items = rows
          .map((row) => {
            const post = byId.get(String(row.post_id ?? ""));
            if (!post || isBlockedAuthor(post.author)) return null;
            return {
              ...post,
              save_meta: {
                collection_key: collectionAvailable
                  ? normalizeCollectionKey(row.collection_key)
                  : "saved",
                collection_label: collectionAvailable
                  ? normalizeCollectionLabel(row.collection_label)
                  : "保存",
                saved_at: String(row.updated_at ?? row.created_at ?? post.created_at ?? ""),
              },
            } as SavedFeedItem;
          })
          .filter(Boolean) as SavedFeedItem[];

        setSavedFeed((prev) => {
          if (reset) return items;
          const next = [...prev];
          const seen = new Set(prev.map((x) => x.id));
          items.forEach((item) => {
            if (seen.has(item.id)) return;
            next.push(item);
            seen.add(item.id);
          });
          return next;
        });
        const nextOffset = offset + rows.length;
        setSavedFeedOffset(nextOffset);
        setSavedFeedHasMore(
          totalCount != null ? nextOffset < totalCount : rows.length >= SAVED_FEED_PAGE
        );
        if (reset) {
          void loadSavedCollectionsSummary();
        }
      } catch (e: any) {
        setSavedFeedError(e?.message ?? "保存一覧の取得に失敗しました");
        if (reset) {
          setSavedFeed([]);
          setSavedFeedOffset(0);
          setSavedFeedHasMore(false);
        }
      } finally {
        setSavedFeedLoading(false);
      }
    },
    [
      isBlockedAuthor,
      loadPostsByIdsForSaved,
      loadSavedCollectionsSummary,
      savedCollectionKey,
      savedFeedOffset,
      userId,
    ]
  );

  const loadPersonaDefs = useCallback(async () => {
    const defsRes = await supabase
      .from("persona_defs")
      .select("key,title,theme,blurb,talk_style,relation_style,vibe_tags")
      .limit(500);
    if (!defsRes.error && defsRes.data) {
      setPersonaDefs((defsRes.data ?? []) as PersonaDefRow[]);
    }
  }, []);

  const loadPersonaCatalogDefs = useCallback(async () => {
    setPersonaCatalogLoading(true);
    setPersonaCatalogError(null);
    try {
      const archetypes = await supabase
        .from("persona_archetype_defs")
        .select("key,title,blurb,image_url,theme,category")
        .order("category", { ascending: true })
        .order("title", { ascending: true })
        .limit(2000);

      if (!archetypes.error && (archetypes.data?.length ?? 0) > 0) {
        setPersonaCatalogDefs((archetypes.data ?? []) as PersonaCatalogDefRow[]);
        setPersonaCatalogImageErrors({});
        return;
      }

      const defsRes = await supabase
        .from("persona_defs")
        .select("key,title,theme,blurb")
        .order("title", { ascending: true })
        .limit(1000);
      if (defsRes.error) throw defsRes.error;
      setPersonaCatalogDefs(
        ((defsRes.data ?? []) as any[]).map((r) => ({
          ...r,
          image_url: null,
          category: null,
        })) as PersonaCatalogDefRow[]
      );
      setPersonaCatalogImageErrors({});
      if (archetypes.error) {
        setPersonaCatalogError(
          "persona_archetype_defs が未利用のため、一部の画像/カテゴリは表示されません。"
        );
      }
    } catch (e: any) {
      setPersonaCatalogError(e?.message ?? "キャラ図鑑の取得に失敗しました");
      setPersonaCatalogDefs([]);
    } finally {
      setPersonaCatalogLoading(false);
    }
  }, []);

  const resolvePersonaTitles = useCallback(
    async (keys: string[]) => {
      const uniqKeys = uniq(keys.filter(Boolean));
      if (uniqKeys.length === 0) return {} as Record<string, string>;

      const map = new Map<string, string>();
      personaDefs.forEach((d) => {
        if (uniqKeys.includes(d.key)) map.set(d.key, d.title ?? d.key);
      });

      const missing = uniqKeys.filter((k) => !map.has(k));
      if (missing.length > 0) {
        const arche = await supabase
          .from("persona_archetype_defs")
          .select("key,title")
          .in("key", missing);
        (arche.data ?? []).forEach((r: any) => {
          map.set(r.key, r.title ?? r.key);
        });
      }

      const stillMissing = uniqKeys.filter((k) => !map.has(k));
      if (stillMissing.length > 0) {
        const defs = await supabase
          .from("persona_defs")
          .select("key,title")
          .in("key", stillMissing);
        (defs.data ?? []).forEach((r: any) => {
          map.set(r.key, r.title ?? r.key);
        });
      }

      return Object.fromEntries(uniqKeys.map((k) => [k, map.get(k) ?? k]));
    },
    [personaDefs]
  );

  const loadPersonaCatalogDetailCompat = useCallback(
    async (sourceKey: string) => {
      const key = String(sourceKey ?? "").trim();
      if (!key) {
        setPersonaCatalogDetailCompatItems([]);
        setPersonaCatalogDetailCompatError(null);
        setPersonaCatalogDetailCompatLoading(false);
        return;
      }

      setPersonaCatalogDetailCompatLoading(true);
      setPersonaCatalogDetailCompatError(null);
      try {
        const r = await fetchMobilePersonaCompatWeights({ basePersona: key, limit: 16 });
        if (r.error) throw r.error;
        const rows = (r.data ?? []) as Array<{ b?: string | null; weight?: number | null }>;
        const targetKeys = rows
          .map((x) => String(x?.b ?? "").trim())
          .filter((x) => x.length > 0 && x !== key);
        const titles = await resolvePersonaTitles(targetKeys);
        const items: PersonaCompatItem[] = rows
          .map((x) => {
            const targetKey = String(x?.b ?? "").trim();
            if (!targetKey || targetKey === key) return null;
            return {
              targetKey,
              score: Number(x?.weight ?? 0) || 0,
              relationLabel: null,
              title: titles[targetKey] ?? targetKey,
              insights: null,
            } satisfies PersonaCompatItem;
          })
          .filter(Boolean) as PersonaCompatItem[];
        setPersonaCatalogDetailCompatItems(items);
      } catch (e: any) {
        setPersonaCatalogDetailCompatItems([]);
        setPersonaCatalogDetailCompatError(e?.message ?? "相性データの取得に失敗しました");
      } finally {
        setPersonaCatalogDetailCompatLoading(false);
      }
    },
    [resolvePersonaTitles]
  );

  const loadPersonaCatalogDetailExamples = useCallback(async (personaKey: string) => {
    const key = String(personaKey ?? "").trim();
    if (!key) {
      setPersonaCatalogDetailExamples([]);
      setPersonaCatalogDetailExamplesError(null);
      setPersonaCatalogDetailExamplesLoading(false);
      return;
    }
    setPersonaCatalogDetailExamplesLoading(true);
    setPersonaCatalogDetailExamplesError(null);
    try {
      const scoresRes = await fetchMobilePostScoresByPersona({ personaKeys: [key], limit: 24 });
      if (scoresRes.error) throw scoresRes.error;
      const postIds = Array.from(
        new Set(
          ((scoresRes.data ?? []) as Array<{ post_id?: string | null }>)
            .map((r) => String(r?.post_id ?? "").trim())
            .filter(Boolean)
        )
      ).slice(0, 8);
      if (postIds.length === 0) {
        setPersonaCatalogDetailExamples([]);
        return;
      }
      const posts = (await fetchMobilePostsByIdsEnrichedFirst(postIds)) as FeedItem[];
      const byId = new Map(posts.map((p) => [p.id, p]));
      const ordered = postIds.map((id) => byId.get(id)).filter(Boolean) as FeedItem[];
      setPersonaCatalogDetailExamples(ordered);
    } catch (e: any) {
      setPersonaCatalogDetailExamples([]);
      setPersonaCatalogDetailExamplesError(e?.message ?? "投稿例の取得に失敗しました");
    } finally {
      setPersonaCatalogDetailExamplesLoading(false);
    }
  }, []);

  useEffect(() => {
    const key = String(personaCatalogDetail?.key ?? "").trim();
    setPersonaCatalogDetailTab("compat");
    setPersonaCatalogDetailDialogueTargetKey("");
    if (!key) {
      setPersonaCatalogDetailCompatItems([]);
      setPersonaCatalogDetailCompatError(null);
      setPersonaCatalogDetailExamples([]);
      setPersonaCatalogDetailExamplesError(null);
      return;
    }
    void Promise.allSettled([
      loadPersonaCatalogDetailCompat(key),
      loadPersonaCatalogDetailExamples(key),
    ]);
  }, [loadPersonaCatalogDetailCompat, loadPersonaCatalogDetailExamples, personaCatalogDetail?.key]);

  useEffect(() => {
    if (!personaCatalogDetailCompatItems.length) return;
    setPersonaCatalogDetailDialogueTargetKey((prev) =>
      prev && personaCatalogDetailCompatItems.some((x) => x.targetKey === prev)
        ? prev
        : personaCatalogDetailCompatItems[0]?.targetKey ?? ""
    );
  }, [personaCatalogDetailCompatItems]);

  const loadPersonaBuzzCalibration = useCallback(async () => {
    const fallback = {
      byPersona: new Map<string, BuzzCalibrationEntry>([
        [GLOBAL_BUZZ_PERSONA_KEY, defaultBuzzCalibrationEntry()],
      ]),
      global: defaultBuzzCalibrationEntry(),
    };
    if (!userId) return fallback;

    const postsRes = await supabase
      .from("posts")
      .select("id,created_at,analysis")
      .eq("author", userId)
      .order("created_at", { ascending: false })
      .limit(140);
    if (postsRes.error) return fallback;

    const now = Date.now();
    const matureMs = 15 * 60 * 1000;
    const posts = ((postsRes.data ?? []) as Array<{ id: string; created_at: string; analysis: any }>).filter(
      (p) => {
        if (!p?.id) return false;
        const createdAtMs = Date.parse(String(p.created_at ?? ""));
        if (!Number.isFinite(createdAtMs)) return true;
        return now - createdAtMs >= matureMs;
      }
    );
    if (posts.length === 0) return fallback;

    const postIds = posts.map((p) => p.id);
    const [reactionsRes, repliesRes] = await Promise.all([
      supabase.from("reactions").select("post_id,kind").in("post_id", postIds),
      supabase.from("posts").select("parent_id,id").in("parent_id", postIds),
    ]);

    const reactionCounts = new Map<string, { likes: number; replies: number; boosts: number; saves: number }>();
    const ensureCount = (postId: string) => {
      const cur = reactionCounts.get(postId);
      if (cur) return cur;
      const next = { likes: 0, replies: 0, boosts: 0, saves: 0 };
      reactionCounts.set(postId, next);
      return next;
    };

    (reactionsRes.data ?? []).forEach((r: any) => {
      const postId = String(r?.post_id ?? "").trim();
      if (!postId) return;
      const kind = normalizeReactionKind(r?.kind);
      const row = ensureCount(postId);
      if (kind === "like") row.likes += 1;
      else if (kind === "boost") row.boosts += 1;
      else if (kind === "save") row.saves += 1;
    });

    (repliesRes.data ?? []).forEach((r: any) => {
      const parentId = String(r?.parent_id ?? "").trim();
      if (!parentId) return;
      const row = ensureCount(parentId);
      row.replies += 1;
    });

    const accum = new Map<string, { samples: number; predictedSum: number; actualSum: number }>();
    const add = (personaKey: string, predicted: number, actual: number) => {
      const key = personaKey || GLOBAL_BUZZ_PERSONA_KEY;
      const cur = accum.get(key) ?? { samples: 0, predictedSum: 0, actualSum: 0 };
      cur.samples += 1;
      cur.predictedSum += predicted;
      cur.actualSum += actual;
      accum.set(key, cur);
    };

    posts.forEach((p) => {
      const analysis = parseAnalysisBlob(p.analysis);
      const predicted = extractBuzzScoreFromAnalysis(analysis, 0.5);
      const personaKey = extractPersonaKeyFromAnalysis(analysis) ?? GLOBAL_BUZZ_PERSONA_KEY;
      const stats = reactionCounts.get(p.id) ?? { likes: 0, replies: 0, boosts: 0, saves: 0 };
      const actual = computePersonaActualEngagementScore({
        likes: stats.likes,
        replies: stats.replies,
        boosts: stats.boosts,
        saves: stats.saves,
      });
      add(personaKey, predicted, actual);
      add(GLOBAL_BUZZ_PERSONA_KEY, predicted, actual);
    });

    const byPersona = new Map<string, BuzzCalibrationEntry>();
    accum.forEach((v, personaKey) => {
      const predictedAvg = v.samples > 0 ? v.predictedSum / v.samples : 0.5;
      const actualAvg = v.samples > 0 ? v.actualSum / v.samples : 0.2;
      byPersona.set(
        personaKey,
        computePersonaCalibrationStat({
          samples: v.samples,
          predictedAvg,
          actualAvg,
        })
      );
    });
    if (!byPersona.has(GLOBAL_BUZZ_PERSONA_KEY)) {
      byPersona.set(GLOBAL_BUZZ_PERSONA_KEY, defaultBuzzCalibrationEntry());
    }
    const global = byPersona.get(GLOBAL_BUZZ_PERSONA_KEY) ?? defaultBuzzCalibrationEntry();

    try {
      const nowIso = new Date().toISOString();
      const rows = Array.from(byPersona.entries()).map(([personaKey, stat]) => ({
        user_id: userId,
        persona_key: personaKey,
        samples: stat.samples,
        predicted_avg: stat.predictedAvg,
        actual_avg: stat.actualAvg,
        multiplier: stat.multiplier,
        updated_at: nowIso,
      }));
      await supabase
        .from("persona_buzz_learning_state")
        .upsert(rows, { onConflict: "user_id,persona_key" });
    } catch {
      // table missing is allowed
    }

    return { byPersona, global };
  }, [userId]);

  const loadPersonaDwellLearningSnapshot = useCallback(
    async (
      personaKey: string | null,
      eventType: FeedbackEvent,
      dwellMs: number | null
    ): Promise<DwellLearningSnapshot> => {
      const bucket = dwellBucket(dwellMs);
      const learningPersonaKey = normalizePersonaKey(personaKey);
      const learningEventType = normalizeEventType(eventType);
      if (!userId) {
        return {
          available: false,
          usingPersonaDimension: false,
          usingEventDimension: false,
          bucket,
          personaKey: learningPersonaKey,
          eventType: learningEventType,
          personaBucketRow: null,
          personaGlobalRow: null,
          globalBucketRow: null,
          globalGlobalRow: null,
        };
      }

      const res = await supabase
        .from("persona_dwell_learning_state")
        .select("persona_key,event_type,dwell_bucket,samples,positive_score,negative_score")
        .eq("user_id", userId)
        .in("persona_key", Array.from(new Set([learningPersonaKey, GLOBAL_PERSONA_KEY])))
        .in("event_type", [learningEventType, GLOBAL_EVENT_TYPE])
        .in("dwell_bucket", [bucket, GLOBAL_DWELL_BUCKET]);

      if (res.error) {
        if (!isPersonaKeyColumnError(res.error) && !isEventTypeColumnError(res.error)) {
          return {
            available: false,
            usingPersonaDimension: false,
            usingEventDimension: false,
            bucket,
            personaKey: learningPersonaKey,
            eventType: learningEventType,
            personaBucketRow: null,
            personaGlobalRow: null,
            globalBucketRow: null,
            globalGlobalRow: null,
          };
        }

        const legacy = await supabase
          .from("persona_dwell_learning_state")
          .select("dwell_bucket,samples,positive_score,negative_score")
          .eq("user_id", userId)
          .in("dwell_bucket", [bucket, GLOBAL_DWELL_BUCKET]);
        if (legacy.error) {
          return {
            available: false,
            usingPersonaDimension: false,
            usingEventDimension: false,
            bucket,
            personaKey: learningPersonaKey,
            eventType: learningEventType,
            personaBucketRow: null,
            personaGlobalRow: null,
            globalBucketRow: null,
            globalGlobalRow: null,
          };
        }

        const rows = (legacy.data ?? []) as DwellLearningRow[];
        const byBucket = new Map(rows.map((r) => [r.dwell_bucket, r]));
        const globalBucketRow = byBucket.get(bucket) ?? null;
        const globalGlobalRow = byBucket.get(GLOBAL_DWELL_BUCKET) ?? null;
        return {
          available: true,
          usingPersonaDimension: false,
          usingEventDimension: false,
          bucket,
          personaKey: learningPersonaKey,
          eventType: learningEventType,
          personaBucketRow: learningPersonaKey === GLOBAL_PERSONA_KEY ? globalBucketRow : null,
          personaGlobalRow: learningPersonaKey === GLOBAL_PERSONA_KEY ? globalGlobalRow : null,
          globalBucketRow,
          globalGlobalRow,
        };
      }

      const rows = (res.data ?? []) as DwellLearningRow[];
      const byPairEvent = new Map(
        rows.map((r) => [
          pairKeyWithEvent(
            String(r.persona_key ?? GLOBAL_PERSONA_KEY),
            r.dwell_bucket,
            String(r.event_type ?? GLOBAL_EVENT_TYPE)
          ),
          r,
        ])
      );
      const resolve = (persona: string, dwellBucketKey: string) =>
        blendLearningRows(
          byPairEvent.get(pairKeyWithEvent(persona, dwellBucketKey, learningEventType)) ?? null,
          byPairEvent.get(pairKeyWithEvent(persona, dwellBucketKey, GLOBAL_EVENT_TYPE)) ?? null,
          learningEventType
        );
      return {
        available: true,
        usingPersonaDimension: learningPersonaKey !== GLOBAL_PERSONA_KEY,
        usingEventDimension: true,
        bucket,
        personaKey: learningPersonaKey,
        eventType: learningEventType,
        personaBucketRow: resolve(learningPersonaKey, bucket),
        personaGlobalRow: resolve(learningPersonaKey, GLOBAL_DWELL_BUCKET),
        globalBucketRow: resolve(GLOBAL_PERSONA_KEY, bucket),
        globalGlobalRow: resolve(GLOBAL_PERSONA_KEY, GLOBAL_DWELL_BUCKET),
      };
    },
    [userId]
  );

  const updatePersonaDwellLearningState = useCallback(
    async (personaKey: string | null, event: FeedbackEvent, dwellMs: number | null) => {
      if (!userId) return false;

      const positiveSignal = toNonNegative(POSITIVE_SIGNAL_BY_EVENT[event], 0);
      const negativeSignal = toNonNegative(NEGATIVE_SIGNAL_BY_EVENT[event], 0);
      if (positiveSignal <= 0 && negativeSignal <= 0) return false;

      const bucket = dwellBucket(dwellMs);
      const learningPersonaKey = normalizePersonaKey(personaKey);
      const learningEventType = normalizeEventType(event);
      const personaTargets =
        learningPersonaKey === GLOBAL_PERSONA_KEY
          ? [
              { persona_key: GLOBAL_PERSONA_KEY, dwell_bucket: bucket },
              { persona_key: GLOBAL_PERSONA_KEY, dwell_bucket: GLOBAL_DWELL_BUCKET },
            ]
          : [
              { persona_key: learningPersonaKey, dwell_bucket: bucket },
              { persona_key: learningPersonaKey, dwell_bucket: GLOBAL_DWELL_BUCKET },
              { persona_key: GLOBAL_PERSONA_KEY, dwell_bucket: bucket },
              { persona_key: GLOBAL_PERSONA_KEY, dwell_bucket: GLOBAL_DWELL_BUCKET },
            ];
      const uniquePersonaKeys = Array.from(new Set(personaTargets.map((x) => x.persona_key)));
      const uniqueBuckets = Array.from(new Set(personaTargets.map((x) => x.dwell_bucket)));
      const eventTypes = Array.from(new Set([learningEventType, GLOBAL_EVENT_TYPE]));

      const cur = await supabase
        .from("persona_dwell_learning_state")
        .select("persona_key,event_type,dwell_bucket,samples,positive_score,negative_score")
        .eq("user_id", userId)
        .in("persona_key", uniquePersonaKeys)
        .in("event_type", eventTypes)
        .in("dwell_bucket", uniqueBuckets);
      if (cur.error) {
        if (!isPersonaKeyColumnError(cur.error) && !isEventTypeColumnError(cur.error)) return false;
        const legacyTargets = Array.from(new Set([bucket, GLOBAL_DWELL_BUCKET]));
        const legacyCur = await supabase
          .from("persona_dwell_learning_state")
          .select("dwell_bucket,samples,positive_score,negative_score")
          .eq("user_id", userId)
          .in("dwell_bucket", legacyTargets);
        if (legacyCur.error) return false;
        const legacyMap = new Map<string, DwellLearningRow>();
        ((legacyCur.data ?? []) as DwellLearningRow[]).forEach((row) => {
          legacyMap.set(row.dwell_bucket, row);
        });
        const now = new Date().toISOString();
        const legacyRows = legacyTargets.map((dwellBucketKey) => {
          const row = legacyMap.get(dwellBucketKey);
          return {
            user_id: userId,
            dwell_bucket: dwellBucketKey,
            samples: toNonNegativeInt(row?.samples, 0) + 1,
            positive_score: toNonNegative(row?.positive_score, 0) + positiveSignal,
            negative_score: toNonNegative(row?.negative_score, 0) + negativeSignal,
            updated_at: now,
          };
        });
        const legacyUp = await supabase
          .from("persona_dwell_learning_state")
          .upsert(legacyRows, { onConflict: "user_id,dwell_bucket" });
        return !legacyUp.error;
      }

      const byPair = new Map<string, DwellLearningRow>();
      ((cur.data ?? []) as DwellLearningRow[]).forEach((row) => {
        byPair.set(
          pairKeyWithEvent(
            String(row.persona_key ?? GLOBAL_PERSONA_KEY),
            row.dwell_bucket,
            String(row.event_type ?? GLOBAL_EVENT_TYPE)
          ),
          row
        );
      });

      const now = new Date().toISOString();
      const targetRows = Array.from(
        new Set(
          personaTargets.flatMap((target) => [
            pairKeyWithEvent(target.persona_key, target.dwell_bucket, learningEventType),
            pairKeyWithEvent(target.persona_key, target.dwell_bucket, GLOBAL_EVENT_TYPE),
          ])
        )
      ).map((k) => {
        const [persona_key, dwell_bucket, event_type] = k.split("|");
        return { persona_key, dwell_bucket, event_type };
      });
      const nextRows = targetRows.map((target) => {
        const row = byPair.get(
          pairKeyWithEvent(target.persona_key, target.dwell_bucket, target.event_type)
        );
        return {
          user_id: userId,
          persona_key: target.persona_key,
          dwell_bucket: target.dwell_bucket,
          event_type: target.event_type,
          samples: toNonNegativeInt(row?.samples, 0) + 1,
          positive_score: toNonNegative(row?.positive_score, 0) + positiveSignal,
          negative_score: toNonNegative(row?.negative_score, 0) + negativeSignal,
          updated_at: now,
        };
      });

      const up = await supabase
        .from("persona_dwell_learning_state")
        .upsert(nextRows, { onConflict: "user_id,persona_key,dwell_bucket,event_type" });
      if (up.error) {
        if (!isPersonaKeyColumnError(up.error) && !isEventTypeColumnError(up.error)) return false;
        const legacyTargets = Array.from(new Set([bucket, GLOBAL_DWELL_BUCKET]));
        const legacyCur = await supabase
          .from("persona_dwell_learning_state")
          .select("dwell_bucket,samples,positive_score,negative_score")
          .eq("user_id", userId)
          .in("dwell_bucket", legacyTargets);
        if (legacyCur.error) return false;
        const legacyMap = new Map<string, DwellLearningRow>();
        ((legacyCur.data ?? []) as DwellLearningRow[]).forEach((row) => {
          legacyMap.set(row.dwell_bucket, row);
        });
        const legacyRows = legacyTargets.map((dwellBucketKey) => {
          const row = legacyMap.get(dwellBucketKey);
          return {
            user_id: userId,
            dwell_bucket: dwellBucketKey,
            samples: toNonNegativeInt(row?.samples, 0) + 1,
            positive_score: toNonNegative(row?.positive_score, 0) + positiveSignal,
            negative_score: toNonNegative(row?.negative_score, 0) + negativeSignal,
            updated_at: now,
          };
        });
        const legacyUp = await supabase
          .from("persona_dwell_learning_state")
          .upsert(legacyRows, { onConflict: "user_id,dwell_bucket" });
        return !legacyUp.error;
      }
      return true;
    },
    [userId]
  );

  const loadPersonaBuddyLearningState = useCallback(
    async (basePersona: string | null, buddyKeys: string[]) => {
      const base = String(basePersona ?? "").trim();
      const uniqBuddyKeys = uniq(
        buddyKeys.map((x) => String(x ?? "").trim()).filter((x) => x.length > 0)
      );
      if (!userId || !base || uniqBuddyKeys.length === 0) {
        return {
          available: false,
          globalBonus: DEFAULT_BUDDY_BONUS_SCALE,
          byBuddy: new Map<
            string,
            { bonus: number; samples: number; confidence: number }
          >(),
        };
      }

      const queryKeys = uniq([...uniqBuddyKeys, GLOBAL_BUDDY_KEY]);
      const res = await supabase
        .from("user_persona_buddy_learning_state")
        .select("buddy_persona_key,samples,positive_score,negative_score,bonus_scale")
        .eq("user_id", userId)
        .eq("base_persona_key", base)
        .in("buddy_persona_key", queryKeys);

      if (res.error) {
        if (isMissingRelationError(res.error, "user_persona_buddy_learning_state")) {
          return {
            available: false,
            globalBonus: DEFAULT_BUDDY_BONUS_SCALE,
            byBuddy: new Map<
              string,
              { bonus: number; samples: number; confidence: number }
            >(),
          };
        }
        return {
          available: false,
          globalBonus: DEFAULT_BUDDY_BONUS_SCALE,
          byBuddy: new Map<
            string,
            { bonus: number; samples: number; confidence: number }
          >(),
        };
      }

      let globalBonus = DEFAULT_BUDDY_BONUS_SCALE;
      const byBuddy = new Map<string, { bonus: number; samples: number; confidence: number }>();
      ((res.data ?? []) as Array<any>).forEach((row) => {
        const key = String(row?.buddy_persona_key ?? "").trim();
        if (!key) return;
        const samples = Math.max(0, Math.floor(Number(row?.samples ?? 0) || 0));
        const bonus = normalizeBuddyBonusScale(row?.bonus_scale, DEFAULT_BUDDY_BONUS_SCALE);
        if (key === GLOBAL_BUDDY_KEY) {
          globalBonus = bonus;
          return;
        }
        byBuddy.set(key, {
          bonus,
          samples,
          confidence: learningConfidenceFromSamples(samples),
        });
      });

      return {
        available: true,
        globalBonus,
        byBuddy,
      };
    },
    [userId]
  );

  const loadPersonaFeedBuddyModePreference = useCallback(async () => {
    if (!userId) {
      return {
        available: false,
        mode: DEFAULT_BUDDY_LEARNING_MODE,
        hasExplicit: false,
      };
    }
    const res = await supabase
      .from("user_persona_feed_preferences")
      .select("buddy_learning_mode")
      .eq("user_id", userId)
      .maybeSingle();
    if (res.error) {
      if (isMissingRelationError(res.error, "user_persona_feed_preferences")) {
        return {
          available: false,
          mode: DEFAULT_BUDDY_LEARNING_MODE,
          hasExplicit: false,
        };
      }
      return {
        available: false,
        mode: DEFAULT_BUDDY_LEARNING_MODE,
        hasExplicit: false,
      };
    }
    const hasExplicit = Boolean(String(res.data?.buddy_learning_mode ?? "").trim());
    return {
      available: true,
      mode: normalizeBuddyLearningMode(res.data?.buddy_learning_mode),
      hasExplicit,
    };
  }, [userId]);

  const loadOrAssignPersonaFeedBuddyModeAb = useCallback(async () => {
    if (!userId) {
      return {
        available: false,
        experimentKey: BUDDY_MODE_AB_EXPERIMENT,
        variantKey: null as "A" | "B" | null,
        assignedMode: null as BuddyLearningMode | null,
        source: "default" as const,
      };
    }
    const res = await supabase
      .from("user_persona_feed_ab_assignments")
      .select("variant_key,assigned_mode")
      .eq("user_id", userId)
      .eq("experiment_key", BUDDY_MODE_AB_EXPERIMENT)
      .maybeSingle();
    if (res.error) {
      if (isMissingRelationError(res.error, "user_persona_feed_ab_assignments")) {
        return {
          available: false,
          experimentKey: BUDDY_MODE_AB_EXPERIMENT,
          variantKey: null as "A" | "B" | null,
          assignedMode: null as BuddyLearningMode | null,
          source: "default" as const,
        };
      }
      return {
        available: false,
        experimentKey: BUDDY_MODE_AB_EXPERIMENT,
        variantKey: null as "A" | "B" | null,
        assignedMode: null as BuddyLearningMode | null,
        source: "default" as const,
      };
    }
    const variantRaw = String(res.data?.variant_key ?? "").trim();
    const modeRaw = String(res.data?.assigned_mode ?? "").trim();
    const existingVariant =
      variantRaw === "A" || variantRaw === "B" ? (variantRaw as "A" | "B") : null;
    if (existingVariant && modeRaw) {
      return {
        available: true,
        experimentKey: BUDDY_MODE_AB_EXPERIMENT,
        variantKey: existingVariant,
        assignedMode: normalizeBuddyLearningMode(modeRaw),
        source: "db" as const,
      };
    }

    const variantKey = hashVariantForUser(userId);
    const assignedMode = buddyModeFromVariant(variantKey);
    const now = new Date().toISOString();
    const up = await supabase.from("user_persona_feed_ab_assignments").upsert(
      {
        user_id: userId,
        experiment_key: BUDDY_MODE_AB_EXPERIMENT,
        variant_key: variantKey,
        assigned_mode: assignedMode,
        assigned_at: now,
        updated_at: now,
      },
      { onConflict: "user_id,experiment_key" }
    );
    if (up.error) {
      if (isMissingRelationError(up.error, "user_persona_feed_ab_assignments")) {
        return {
          available: false,
          experimentKey: BUDDY_MODE_AB_EXPERIMENT,
          variantKey: null as "A" | "B" | null,
          assignedMode: null as BuddyLearningMode | null,
          source: "default" as const,
        };
      }
      return {
        available: false,
        experimentKey: BUDDY_MODE_AB_EXPERIMENT,
        variantKey: null as "A" | "B" | null,
        assignedMode: null as BuddyLearningMode | null,
        source: "default" as const,
      };
    }
    return {
      available: true,
      experimentKey: BUDDY_MODE_AB_EXPERIMENT,
      variantKey,
      assignedMode,
      source: "new" as const,
    };
  }, [userId]);

  const logPersonaFeedBuddyModeAbEvent = useCallback(
    async (args: {
      eventType: FeedbackEvent | "feed_load";
      mode: BuddyLearningMode;
      strategy: "same" | "compat";
      postId?: string | null;
      assignment?: {
        available: boolean;
        experimentKey: string;
        variantKey: "A" | "B" | null;
      } | null;
    }) => {
      if (!userId) return false;
      const assignment =
        args.assignment && args.assignment.available && args.assignment.variantKey
          ? args.assignment
          : null;
      if (!assignment) return false;
      const ins = await supabase.from("persona_feed_mode_ab_events").insert({
        user_id: userId,
        experiment_key: assignment.experimentKey,
        variant_key: assignment.variantKey,
        event_type: args.eventType,
        mode: args.mode,
        strategy: args.strategy,
        post_id: args.postId ?? null,
        created_at: new Date().toISOString(),
      });
      return !ins.error;
    },
    [userId]
  );

  const loadOptimizedPersonaFeedBuddyModeFromEvents = useCallback(async () => {
    if (!userId) {
      return {
        available: false,
        recommendedMode: null as BuddyLearningMode | null,
        reason: "no_user",
      };
    }
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - 14);
    const res = await supabase
      .from("persona_feed_mode_ab_events")
      .select("mode,event_type,created_at")
      .eq("user_id", userId)
      .gte("created_at", start.toISOString())
      .limit(10000);
    if (res.error) {
      if (isMissingRelationError(res.error, "persona_feed_mode_ab_events")) {
        return { available: false, recommendedMode: null as BuddyLearningMode | null, reason: "table_missing" };
      }
      return { available: false, recommendedMode: null as BuddyLearningMode | null, reason: "read_error" };
    }
    const init = () => ({
      impressions: 0,
      opens: 0,
      feedLoads: 0,
      likes: 0,
      replies: 0,
      boosts: 0,
      times: [] as number[],
    });
    const adaptive = init();
    const stable = init();
    ((res.data ?? []) as Array<any>).forEach((row) => {
      const mode = String(row?.mode ?? "").trim() === "stable" ? stable : adaptive;
      const ev = String(row?.event_type ?? "").trim();
      if (ev === "impression") mode.impressions += 1;
      if (ev === "open") mode.opens += 1;
      if (ev === "feed_load") {
        mode.feedLoads += 1;
        const ts = Date.parse(String(row?.created_at ?? ""));
        if (Number.isFinite(ts)) mode.times.push(ts);
      }
      if (ev === "like") mode.likes += 1;
      if (ev === "reply") mode.replies += 1;
      if (ev === "boost") mode.boosts += 1;
    });
    const score = (bucket: ReturnType<typeof init>) => {
      const times = bucket.times.slice().sort((a, b) => a - b);
      let revisit = 0;
      for (let i = 0; i < times.length - 1; i += 1) {
        const h = (times[i + 1] - times[i]) / 3_600_000;
        if (h > 0 && h <= 36) revisit += 1;
      }
      const openRate = bucket.impressions > 0 ? bucket.opens / bucket.impressions : 0;
      const revisitRate = bucket.feedLoads > 0 ? revisit / bucket.feedLoads : 0;
      const engageRate =
        bucket.opens > 0
          ? (bucket.likes + bucket.replies * 1.2 + bucket.boosts * 1.1) / bucket.opens
          : 0;
      return {
        value: openRate * 0.62 + revisitRate * 0.28 + clamp(engageRate, 0, 1.2) * 0.1,
        impressions: bucket.impressions,
        feedLoads: bucket.feedLoads,
      };
    };
    const a = score(adaptive);
    const s = score(stable);
    if (Math.max(a.impressions, s.impressions) < 20 || Math.max(a.feedLoads, s.feedLoads) < 4) {
      return { available: true, recommendedMode: null as BuddyLearningMode | null, reason: "insufficient_samples" };
    }
    const diff = a.value - s.value;
    if (Math.abs(diff) <= 0.015) {
      return { available: true, recommendedMode: null as BuddyLearningMode | null, reason: "near_tie" };
    }
    return {
      available: true,
      recommendedMode: (diff >= 0 ? "adaptive" : "stable") as BuddyLearningMode,
      reason: "score_delta",
    };
  }, [userId]);

  const savePersonaFeedBuddyLearningModePreference = useCallback(
    async (nextMode: BuddyLearningMode) => {
      setPersonaFeedBuddyLearningMode(nextMode);
      setPersonaFeedBuddyLearningModeSource("preference");
      setPersonaFeedBuddyLearningModeAb(null);
      setPersonaFeedSavingBuddyLearningMode(true);
      if (!userId) {
        setPersonaFeedSavingBuddyLearningMode(false);
        return {
          ok: false,
          available: false,
          mode: nextMode,
        };
      }
      const up = await supabase.from("user_persona_feed_preferences").upsert(
        {
          user_id: userId,
          buddy_learning_mode: nextMode,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (up.error) {
        if (isMissingRelationError(up.error, "user_persona_feed_preferences")) {
          setPersonaFeedBuddyLearningModeAvailable(false);
          setPersonaFeedSavingBuddyLearningMode(false);
          return {
            ok: false,
            available: false,
            mode: nextMode,
          };
        }
        setPersonaFeedSavingBuddyLearningMode(false);
        return {
          ok: false,
          available: false,
          mode: nextMode,
        };
      }
      setPersonaFeedBuddyLearningModeAvailable(true);
      setPersonaFeedSavingBuddyLearningMode(false);
      return {
        ok: true,
        available: true,
        mode: nextMode,
      };
    },
    [userId]
  );

  const loadPersonaBuddyLearningHistory = useCallback(
    async (basePersona: string | null, buddyKeys: string[], perBuddy = 10) => {
      const base = String(basePersona ?? "").trim();
      const keys = uniq(buddyKeys.map((x) => String(x ?? "").trim()).filter(Boolean)).slice(0, 8);
      if (!userId || !base || keys.length === 0) {
        return {
          available: false,
          byBuddy: new Map<
            string,
            Array<{
              bonus_scale: number;
              confidence: number;
              samples: number;
              created_at: string;
            }>
          >(),
        };
      }
      const res = await supabase
        .from("user_persona_buddy_learning_history")
        .select("buddy_persona_key,samples,bonus_scale,confidence,created_at")
        .eq("user_id", userId)
        .eq("base_persona_key", base)
        .in("buddy_persona_key", keys)
        .order("created_at", { ascending: false })
        .limit(Math.max(24, Math.min(240, keys.length * perBuddy * 2)));
      if (res.error) {
        if (isMissingRelationError(res.error, "user_persona_buddy_learning_history")) {
          return {
            available: false,
            byBuddy: new Map<
              string,
              Array<{
                bonus_scale: number;
                confidence: number;
                samples: number;
                created_at: string;
              }>
            >(),
          };
        }
        return {
          available: false,
          byBuddy: new Map<
            string,
            Array<{
              bonus_scale: number;
              confidence: number;
              samples: number;
              created_at: string;
            }>
          >(),
        };
      }
      const byBuddy = new Map<
        string,
        Array<{
          bonus_scale: number;
          confidence: number;
          samples: number;
          created_at: string;
        }>
      >();
      ((res.data ?? []) as Array<any>).forEach((row) => {
        const key = String(row?.buddy_persona_key ?? "").trim();
        const createdAt = String(row?.created_at ?? "").trim();
        if (!key || !createdAt) return;
        const list = byBuddy.get(key) ?? [];
        if (list.length >= perBuddy) {
          byBuddy.set(key, list);
          return;
        }
        list.push({
          bonus_scale: normalizeBuddyBonusScale(row?.bonus_scale, DEFAULT_BUDDY_BONUS_SCALE),
          confidence: clamp(Number(row?.confidence ?? 0) || 0, 0, 1),
          samples: Math.max(0, Math.floor(Number(row?.samples ?? 0) || 0)),
          created_at: createdAt,
        });
        byBuddy.set(key, list);
      });
      byBuddy.forEach((list, key) => {
        byBuddy.set(key, list.slice().reverse().sort((a, b) => a.created_at.localeCompare(b.created_at)));
      });
      return {
        available: true,
        byBuddy,
      };
    },
    [userId]
  );

  const loadPersonaFeedBuddyMissionProgress = useCallback(
    async (args: { basePersona: string | null; buddyKeys: string[]; missionDate?: string }) => {
      const basePersona = String(args.basePersona ?? "").trim() || "__all__";
      const missionDate = String(args.missionDate ?? todayLocalKey()).trim() || todayLocalKey();
      const buddyKeys = uniq(args.buddyKeys.map((x) => String(x ?? "").trim()).filter(Boolean)).slice(
        0,
        12
      );
      if (!userId || buddyKeys.length === 0) return;

      const todayRes = await supabase
        .from("user_persona_buddy_mission_progress")
        .select(
          "mission_date,base_persona_key,buddy_persona_key,mission_kind,progress_count,target_count,unlocked_at"
        )
        .eq("user_id", userId)
        .eq("mission_date", missionDate)
        .eq("base_persona_key", basePersona)
        .eq("mission_kind", "open")
        .in("buddy_persona_key", buddyKeys);
      if (todayRes.error) {
        if (isMissingRelationError(todayRes.error, "user_persona_buddy_mission_progress")) {
          setPersonaFeedBuddyMissionProgressAvailable(false);
        }
        return;
      }

      const d = new Date(`${missionDate}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() - 44);
      const startKey = d.toISOString().slice(0, 10);
      const historyRes = await supabase
        .from("user_persona_buddy_mission_progress")
        .select(
          "mission_date,base_persona_key,buddy_persona_key,mission_kind,progress_count,target_count,unlocked_at"
        )
        .eq("user_id", userId)
        .eq("base_persona_key", basePersona)
        .eq("mission_kind", "open")
        .in("buddy_persona_key", buddyKeys)
        .gte("mission_date", startKey)
        .lte("mission_date", missionDate)
        .order("mission_date", { ascending: false })
        .limit(Math.max(64, buddyKeys.length * 46));
      if (historyRes.error) {
        if (isMissingRelationError(historyRes.error, "user_persona_buddy_mission_progress")) {
          setPersonaFeedBuddyMissionProgressAvailable(false);
        }
        return;
      }
      const xpRes = await supabase
        .from("user_persona_buddy_mission_xp_state")
        .select("buddy_persona_key,xp_total,completed_missions")
        .eq("user_id", userId)
        .eq("base_persona_key", basePersona)
        .in("buddy_persona_key", buddyKeys);
      if (xpRes.error && isMissingRelationError(xpRes.error, "user_persona_buddy_mission_xp_state")) {
        setPersonaFeedBuddyMissionXpAvailable(false);
      }

      const todayRows = (todayRes.data ?? []) as Array<any>;
      const historyRows = (historyRes.data ?? []) as Array<any>;
      const counts: Record<string, number> = {};
      todayRows.forEach((row) => {
        const buddyKey = String(row?.buddy_persona_key ?? "").trim();
        if (!buddyKey) return;
        counts[`${missionDate}:${buddyKey}`] = Math.max(
          0,
          Math.floor(Number(row?.progress_count ?? 0) || 0)
        );
      });

      const streaks: Record<string, number> = {};
      buddyKeys.forEach((buddyKey) => {
        const unlockedByDate = new Set<string>();
        historyRows.forEach((row) => {
          if (String(row?.buddy_persona_key ?? "").trim() !== buddyKey) return;
          const dateKey = String(row?.mission_date ?? "").slice(0, 10);
          const progress = Math.max(0, Math.floor(Number(row?.progress_count ?? 0) || 0));
          const target = Math.max(1, Math.floor(Number(row?.target_count ?? 1) || 1));
          if (dateKey && progress >= target) unlockedByDate.add(dateKey);
        });
        let streak = 0;
        let cursor = new Date(`${missionDate}T00:00:00.000Z`);
        while (true) {
          const key = cursor.toISOString().slice(0, 10);
          if (!unlockedByDate.has(key)) break;
          streak += 1;
          cursor.setUTCDate(cursor.getUTCDate() - 1);
        }
        streaks[buddyKey] = streak;
      });

      setPersonaFeedBuddyMissionProgressAvailable(true);
      setPersonaFeedBuddyMissionCounts((prev) => ({ ...prev, ...counts }));
      setPersonaFeedBuddyMissionStreaks((prev) => ({ ...prev, ...streaks }));
      if (!xpRes.error) {
        const xpByBuddy: Record<string, any> = {};
        ((xpRes.data ?? []) as Array<any>).forEach((row) => {
          const key = String(row?.buddy_persona_key ?? "").trim();
          if (!key) return;
          xpByBuddy[key] = {
            ...missionLevelStats(row?.xp_total),
            completedMissions: Math.max(0, Math.floor(Number(row?.completed_missions ?? 0) || 0)),
          };
        });
        setPersonaFeedBuddyMissionXpAvailable(true);
        setPersonaFeedBuddyMissionXpByBuddy((prev: Record<string, any>) => ({ ...prev, ...xpByBuddy }));
      }
    },
    [userId]
  );

  const incrementPersonaFeedBuddyMissionProgress = useCallback(
    async (args: { basePersona: string | null; buddyPersona: string; targetCount: number }) => {
      const basePersona = String(args.basePersona ?? "").trim() || "__all__";
      const buddyPersona = String(args.buddyPersona ?? "").trim();
      const targetCount = Math.max(1, Math.min(12, Math.floor(Number(args.targetCount ?? 1) || 1)));
      if (!userId || !buddyPersona) return;
      const missionDate = todayLocalKey();

      const cur = await supabase
        .from("user_persona_buddy_mission_progress")
        .select("progress_count,target_count,unlocked_at")
        .eq("user_id", userId)
        .eq("mission_date", missionDate)
        .eq("base_persona_key", basePersona)
        .eq("buddy_persona_key", buddyPersona)
        .eq("mission_kind", "open")
        .maybeSingle();
      if (cur.error) {
        if (isMissingRelationError(cur.error, "user_persona_buddy_mission_progress")) {
          setPersonaFeedBuddyMissionProgressAvailable(false);
        }
        return;
      }

      const currentProgress = Math.max(0, Math.floor(Number(cur.data?.progress_count ?? 0) || 0));
      const currentTarget = Math.max(1, Math.floor(Number(cur.data?.target_count ?? 1) || 1));
      const nextProgress = currentProgress + 1;
      const nextTarget = Math.max(currentTarget, targetCount);
      const now = new Date().toISOString();
      const justUnlocked = !cur.data?.unlocked_at && nextProgress >= nextTarget;
      const up = await supabase.from("user_persona_buddy_mission_progress").upsert(
        {
          user_id: userId,
          mission_date: missionDate,
          base_persona_key: basePersona,
          buddy_persona_key: buddyPersona,
          mission_kind: "open",
          progress_count: nextProgress,
          target_count: nextTarget,
          unlocked_at: cur.data?.unlocked_at ?? (nextProgress >= nextTarget ? now : null),
          last_event_at: now,
          updated_at: now,
        },
        {
          onConflict:
            "user_id,mission_date,base_persona_key,buddy_persona_key,mission_kind",
        }
      );
      if (up.error) {
        if (isMissingRelationError(up.error, "user_persona_buddy_mission_progress")) {
          setPersonaFeedBuddyMissionProgressAvailable(false);
        }
        return;
      }
      const xpGain = missionXpGainForOpen(1) + (justUnlocked ? 12 : 0);
      const xpCur = await supabase
        .from("user_persona_buddy_mission_xp_state")
        .select("xp_total,completed_missions")
        .eq("user_id", userId)
        .eq("base_persona_key", basePersona)
        .eq("buddy_persona_key", buddyPersona)
        .maybeSingle();
      if (!xpCur.error) {
        const nextXpTotal =
          Math.max(0, Math.floor(Number(xpCur.data?.xp_total ?? 0) || 0)) + xpGain;
        const nextCompleted =
          Math.max(0, Math.floor(Number(xpCur.data?.completed_missions ?? 0) || 0)) +
          (justUnlocked ? 1 : 0);
        const xpUp = await supabase.from("user_persona_buddy_mission_xp_state").upsert(
          {
            user_id: userId,
            base_persona_key: basePersona,
            buddy_persona_key: buddyPersona,
            xp_total: nextXpTotal,
            completed_missions: nextCompleted,
            updated_at: now,
          },
          { onConflict: "user_id,base_persona_key,buddy_persona_key" }
        );
        if (!xpUp.error) {
          setPersonaFeedBuddyMissionXpAvailable(true);
          setPersonaFeedBuddyMissionXpByBuddy((prev: Record<string, any>) => ({
            ...prev,
            [buddyPersona]: {
              ...missionLevelStats(nextXpTotal),
              completedMissions: nextCompleted,
              gainedXp: xpGain,
            },
          }));
        } else if (isMissingRelationError(xpUp.error, "user_persona_buddy_mission_xp_state")) {
          setPersonaFeedBuddyMissionXpAvailable(false);
        }
      } else if (isMissingRelationError(xpCur.error, "user_persona_buddy_mission_xp_state")) {
        setPersonaFeedBuddyMissionXpAvailable(false);
      }

      setPersonaFeedBuddyMissionProgressAvailable(true);
      setPersonaFeedBuddyMissionCounts((prev) => ({
        ...prev,
        [`${missionDate}:${buddyPersona}`]: nextProgress,
      }));
      void loadPersonaFeedBuddyMissionProgress({
        basePersona,
        buddyKeys: [buddyPersona],
        missionDate,
      });
    },
    [loadPersonaFeedBuddyMissionProgress, userId]
  );

  const refreshPersonaFeedRewriteLearningState = useCallback(
    async (args: { basePersona: string | null; buddyPersona: string | null }) => {
      const basePersona = String(args.basePersona ?? "").trim() || "__all__";
      const buddyPersona = String(args.buddyPersona ?? "").trim();
      if (!userId || !buddyPersona) {
        setPersonaFeedRewriteLearningAvailable(false);
        setPersonaFeedRewriteLearningByStyle({});
        setPersonaFeedRewriteLearningSource("default");
        setPersonaFeedRewriteLearningContextLabel("");
        return;
      }
      setPersonaFeedRewriteLearningLoading(true);
      try {
        const nowDate = new Date();
        const contextTime = rewriteTimeBucket(nowDate);
        const contextWeekday = rewriteWeekdayBucket(nowDate);
        setPersonaFeedRewriteLearningContextLabel(`${contextTime} / ${contextWeekday}`);

        const blendGlobalAndContext = (
          globalRows: Array<any>,
          contextRows: Array<any>
        ): Record<string, RewriteLearningStyleStat> => {
          const byGlobal = new Map<string, any>();
          globalRows.forEach((row) => {
            const key = normalizeRewriteStyleKey(row?.rewrite_style);
            if (!key) return;
            byGlobal.set(key, row);
          });
          const byContext = new Map<string, any>();
          contextRows.forEach((row) => {
            const key = normalizeRewriteStyleKey(row?.rewrite_style);
            if (!key) return;
            byContext.set(key, row);
          });
          const out: Record<string, RewriteLearningStyleStat> = {};
          (["aggressive", "empathy", "short"] as RewriteStyleKey[]).forEach((styleKey) => {
            const g = byGlobal.get(styleKey) ?? null;
            const c = byContext.get(styleKey) ?? null;
            if (!g && !c) return;
            const grow = g ?? c;
            const crow = c ?? null;
            const gConf = clamp(Number(grow?.confidence ?? 0) || 0, 0, 1);
            const cConf = crow ? clamp(Number(crow?.confidence ?? 0) || 0, 0, 1) : 0;
            const cSamples = crow ? Math.max(0, Math.floor(Number(crow?.samples ?? 0) || 0)) : 0;
            const mix =
              crow && cSamples > 0
                ? clamp(
                    0.18 + cConf * 0.52 + (Math.log1p(cSamples) / Math.log1p(24)) * 0.2,
                    0.12,
                    0.88
                  )
                : 0;
            const gm = 1 - mix;
            const predictedAvg =
              (Number(crow?.predicted_avg ?? grow?.predicted_avg ?? 0) || 0) * mix +
              (Number(grow?.predicted_avg ?? 0) || 0) * gm;
            const actualAvg =
              (Number(crow?.actual_avg ?? grow?.actual_avg ?? 0) || 0) * mix +
              (Number(grow?.actual_avg ?? 0) || 0) * gm;
            const multiplier =
              (Number(crow?.multiplier ?? grow?.multiplier ?? 1) || 1) * mix +
              (Number(grow?.multiplier ?? 1) || 1) * gm;
            const confidence = clamp(gConf * 0.75 + cConf * 0.25, 0, 1);
            const samples = crow ? cSamples : Math.max(0, Math.floor(Number(grow?.samples ?? 0) || 0));
            out[styleKey] = {
              styleLabel: REWRITE_STYLE_LABELS[styleKey],
              samples,
              predictedAvg,
              actualAvg,
              multiplier,
              confidence,
              score: predictedAvg * multiplier,
              updatedAt: String(crow?.updated_at ?? grow?.updated_at ?? "").trim() || null,
            };
          });
          return out;
        };

        const postsRes = await supabase
          .from("posts")
          .select("id,created_at,analysis")
          .eq("author", userId)
          .order("created_at", { ascending: false })
          .limit(260);
        if (postsRes.error) return;
        const matching = ((postsRes.data ?? []) as Array<any>).filter((post) => {
          const meta = extractRewriteMissionMeta(post?.analysis);
          if (!meta) return false;
          if (meta.buddyPersonaKey !== buddyPersona) return false;
          if (meta.basePersonaKey && meta.basePersonaKey !== basePersona) return false;
          return true;
        });
        if (matching.length === 0) {
          const [persisted, persistedContext] = await Promise.all([
            supabase
              .from("user_persona_rewrite_learning_state")
              .select("rewrite_style,samples,predicted_avg,actual_avg,multiplier,confidence,updated_at")
              .eq("user_id", userId)
              .eq("base_persona_key", basePersona)
              .eq("buddy_persona_key", buddyPersona),
            supabase
              .from("user_persona_rewrite_context_learning_state")
              .select(
                "rewrite_style,time_bucket,weekday_bucket,samples,predicted_avg,actual_avg,multiplier,confidence,updated_at"
              )
              .eq("user_id", userId)
              .eq("base_persona_key", basePersona)
              .eq("buddy_persona_key", buddyPersona)
              .eq("time_bucket", contextTime)
              .eq("weekday_bucket", contextWeekday),
          ]);
          if (persisted.error) {
            if (isMissingRelationError(persisted.error, "user_persona_rewrite_learning_state")) {
              setPersonaFeedRewriteLearningAvailable(false);
            }
            return;
          }
          const nextByStyle = blendGlobalAndContext(
            (persisted.data ?? []) as Array<any>,
            persistedContext.error ? [] : ((persistedContext.data ?? []) as Array<any>)
          );
          setPersonaFeedRewriteLearningAvailable(true);
          setPersonaFeedRewriteLearningSource("persisted");
          setPersonaFeedRewriteLearningByStyle(nextByStyle);
          return;
        }

        const ids = matching.map((p) => String(p.id)).filter(Boolean);
        const [reactionsRes, repliesRes] = await Promise.all([
          supabase
            .from("reactions")
            .select("post_id,kind")
            .in("post_id", ids)
            .in("kind", ["like", "boost"])
            .limit(20000),
          supabase.from("posts").select("parent_id").in("parent_id", ids).limit(20000),
        ]);

        const likesByPost = new Map<string, number>();
        const boostsByPost = new Map<string, number>();
        ((reactionsRes.data ?? []) as Array<any>).forEach((r) => {
          const postId = String(r?.post_id ?? "").trim();
          const kind = String(r?.kind ?? "").trim();
          if (!postId) return;
          if (kind === "like") likesByPost.set(postId, (likesByPost.get(postId) ?? 0) + 1);
          if (kind === "boost") boostsByPost.set(postId, (boostsByPost.get(postId) ?? 0) + 1);
        });
        const repliesByPost = new Map<string, number>();
        ((repliesRes.data ?? []) as Array<any>).forEach((r) => {
          const postId = String(r?.parent_id ?? "").trim();
          if (!postId) return;
          repliesByPost.set(postId, (repliesByPost.get(postId) ?? 0) + 1);
        });

        const buckets = new Map<RewriteStyleKey, { samples: number; predictedSum: number; actualSum: number }>();
        const contextBuckets = new Map<
          RewriteStyleKey,
          { samples: number; predictedSum: number; actualSum: number }
        >();
        matching.forEach((post) => {
          const meta = extractRewriteMissionMeta(post?.analysis);
          if (!meta) return;
          const likes = likesByPost.get(post.id) ?? 0;
          const boosts = boostsByPost.get(post.id) ?? 0;
          const replies = repliesByPost.get(post.id) ?? 0;
          const actual = rewriteReactionScore({ likes, replies, boosts });
          const predicted = REWRITE_STYLE_PRIORS[meta.styleKey];
          const cur = buckets.get(meta.styleKey) ?? { samples: 0, predictedSum: 0, actualSum: 0 };
          cur.samples += 1;
          cur.predictedSum += predicted;
          cur.actualSum += actual;
          buckets.set(meta.styleKey, cur);

           if (
             rewriteTimeBucket(post?.created_at ?? new Date()) === contextTime &&
             rewriteWeekdayBucket(post?.created_at ?? new Date()) === contextWeekday
           ) {
            const c = contextBuckets.get(meta.styleKey) ?? {
              samples: 0,
              predictedSum: 0,
              actualSum: 0,
            };
            c.samples += 1;
            c.predictedSum += predicted;
            c.actualSum += actual;
            contextBuckets.set(meta.styleKey, c);
          }
        });

        const now = new Date().toISOString();
        const rows: Array<any> = [];
        const contextRows: Array<any> = [];
        const nextByStyle: Record<string, RewriteLearningStyleStat> = {};
        (["aggressive", "empathy", "short"] as RewriteStyleKey[]).forEach((styleKey) => {
          const bucket = buckets.get(styleKey);
          const samples = Math.max(0, bucket?.samples ?? 0);
          if (samples <= 0) return;
          const predictedAvg = clamp((bucket?.predictedSum ?? 0) / samples, 0.05, 0.95);
          const actualAvg = clamp((bucket?.actualSum ?? 0) / samples, 0, 1);
          const confidence = clamp(Math.log1p(samples) / Math.log1p(20), 0, 1);
          const rawMultiplier = (actualAvg + 0.12) / (predictedAvg + 0.12);
          const multiplier = clamp(
            1 + (rawMultiplier - 1) * (0.35 + confidence * 0.65),
            0.72,
            1.45
          );
          rows.push({
            user_id: userId,
            base_persona_key: basePersona,
            buddy_persona_key: buddyPersona,
            rewrite_style: styleKey,
            samples,
            predicted_avg: predictedAvg,
            actual_avg: actualAvg,
            multiplier,
            confidence,
            updated_at: now,
          });
          nextByStyle[styleKey] = {
            styleLabel: REWRITE_STYLE_LABELS[styleKey],
            samples,
            predictedAvg,
            actualAvg,
            multiplier,
            confidence,
            score: predictedAvg * multiplier,
            updatedAt: now,
          };
        });
        (["aggressive", "empathy", "short"] as RewriteStyleKey[]).forEach((styleKey) => {
          const bucket = contextBuckets.get(styleKey);
          const samples = Math.max(0, bucket?.samples ?? 0);
          if (samples <= 0) return;
          const predictedAvg = clamp((bucket?.predictedSum ?? 0) / samples, 0.05, 0.95);
          const actualAvg = clamp((bucket?.actualSum ?? 0) / samples, 0, 1);
          const confidence = clamp(Math.log1p(samples) / Math.log1p(14), 0, 1);
          const rawMultiplier = (actualAvg + 0.12) / (predictedAvg + 0.12);
          const multiplier = clamp(
            1 + (rawMultiplier - 1) * (0.35 + confidence * 0.65),
            0.72,
            1.45
          );
          contextRows.push({
            user_id: userId,
            base_persona_key: basePersona,
            buddy_persona_key: buddyPersona,
            rewrite_style: styleKey,
            time_bucket: contextTime,
            weekday_bucket: contextWeekday,
            samples,
            predicted_avg: predictedAvg,
            actual_avg: actualAvg,
            multiplier,
            confidence,
            updated_at: now,
          });
        });

        if (rows.length === 0) {
          setPersonaFeedRewriteLearningAvailable(false);
          setPersonaFeedRewriteLearningSource("default");
          setPersonaFeedRewriteLearningByStyle({});
          return;
        }

        const up = await supabase.from("user_persona_rewrite_learning_state").upsert(rows, {
          onConflict: "user_id,base_persona_key,buddy_persona_key,rewrite_style",
        });
        if (up.error) {
          if (isMissingRelationError(up.error, "user_persona_rewrite_learning_state")) {
            setPersonaFeedRewriteLearningAvailable(false);
            setPersonaFeedRewriteLearningSource("computed_ephemeral");
            setPersonaFeedRewriteLearningByStyle(
              blendGlobalAndContext(rows, contextRows)
            );
            return;
          }
        }
        const upContext =
          contextRows.length > 0
            ? await supabase.from("user_persona_rewrite_context_learning_state").upsert(contextRows, {
                onConflict:
                  "user_id,base_persona_key,buddy_persona_key,rewrite_style,time_bucket,weekday_bucket",
              })
            : { error: null as any };
        setPersonaFeedRewriteLearningAvailable(!up.error);
        setPersonaFeedRewriteLearningSource(
          up.error
            ? "computed_ephemeral"
            : upContext?.error
            ? "refreshed_global"
            : "refreshed_context"
        );
        setPersonaFeedRewriteLearningByStyle(
          blendGlobalAndContext(rows, contextRows)
        );
      } finally {
        setPersonaFeedRewriteLearningLoading(false);
      }
    },
    [userId]
  );

  const appendPersonaBuddyLearningHistory = useCallback(
    async (args: {
      basePersona: string;
      buddyPersona: string;
      samples: number;
      bonusScale: number;
      confidence: number;
      learningMode: BuddyLearningMode;
      event: FeedbackEvent;
    }) => {
      if (!userId) return { logged: false, available: false };
      const shouldLog =
        args.samples <= 12 ||
        args.samples % 3 === 0 ||
        args.event === "hide" ||
        args.event === "reply" ||
        args.event === "boost";
      if (!shouldLog) return { logged: false, available: true };
      const ins = await supabase.from("user_persona_buddy_learning_history").insert({
        user_id: userId,
        base_persona_key: args.basePersona,
        buddy_persona_key: args.buddyPersona,
        samples: args.samples,
        bonus_scale: normalizeBuddyBonusScale(args.bonusScale, DEFAULT_BUDDY_BONUS_SCALE),
        confidence: clamp(args.confidence, 0, 1),
        learning_mode: args.learningMode,
        event_type: args.event,
        created_at: new Date().toISOString(),
      });
      if (ins.error) {
        if (isMissingRelationError(ins.error, "user_persona_buddy_learning_history")) {
          return { logged: false, available: false };
        }
        return { logged: false, available: true };
      }
      return { logged: true, available: true };
    },
    [userId]
  );

  const updatePersonaBuddyLearningState = useCallback(
    async (args: {
      basePersona: string | null;
      buddyPersona: string | null;
      event: FeedbackEvent;
      learningMultiplier: number;
      learningMode: BuddyLearningMode;
    }) => {
      const basePersona = String(args.basePersona ?? "").trim();
      const buddyPersona = String(args.buddyPersona ?? "").trim();
      if (!userId || !basePersona || !buddyPersona) {
        return {
          updated: false,
          available: false,
          rawBonusScale: DEFAULT_BUDDY_BONUS_SCALE,
          effectiveBonusScale: effectiveBuddyBonusScaleByMode({
            rawBonusScale: DEFAULT_BUDDY_BONUS_SCALE,
            mode: args.learningMode,
          }),
          confidence: 0,
          samples: 0,
          mode: args.learningMode,
          historyLogged: false,
          historyAvailable: false,
        };
      }

      const positive = toNonNegative(POSITIVE_SIGNAL_BY_EVENT[args.event], 0);
      const negative = toNonNegative(NEGATIVE_SIGNAL_BY_EVENT[args.event], 0);
      if (positive <= 0 && negative <= 0) {
        return {
          updated: false,
          available: false,
          rawBonusScale: DEFAULT_BUDDY_BONUS_SCALE,
          effectiveBonusScale: effectiveBuddyBonusScaleByMode({
            rawBonusScale: DEFAULT_BUDDY_BONUS_SCALE,
            mode: args.learningMode,
          }),
          confidence: 0,
          samples: 0,
          mode: args.learningMode,
          historyLogged: false,
          historyAvailable: false,
        };
      }

      const adaptive = clamp(args.learningMultiplier, 0.6, 1.45);
      const modeSignalScale = args.learningMode === "stable" ? 0.62 : 1;
      const positiveSignal = positive * adaptive * modeSignalScale;
      const negativeSignal = negative * adaptive * modeSignalScale;
      const keys = [buddyPersona, GLOBAL_BUDDY_KEY];

      const cur = await supabase
        .from("user_persona_buddy_learning_state")
        .select("buddy_persona_key,samples,positive_score,negative_score,bonus_scale")
        .eq("user_id", userId)
        .eq("base_persona_key", basePersona)
        .in("buddy_persona_key", keys);
      if (cur.error) {
        if (isMissingRelationError(cur.error, "user_persona_buddy_learning_state")) {
          return {
            updated: false,
            available: false,
            rawBonusScale: DEFAULT_BUDDY_BONUS_SCALE,
            effectiveBonusScale: effectiveBuddyBonusScaleByMode({
              rawBonusScale: DEFAULT_BUDDY_BONUS_SCALE,
              mode: args.learningMode,
            }),
            confidence: 0,
            samples: 0,
            mode: args.learningMode,
            historyLogged: false,
            historyAvailable: false,
          };
        }
        return {
          updated: false,
          available: false,
          rawBonusScale: DEFAULT_BUDDY_BONUS_SCALE,
          effectiveBonusScale: effectiveBuddyBonusScaleByMode({
            rawBonusScale: DEFAULT_BUDDY_BONUS_SCALE,
            mode: args.learningMode,
          }),
          confidence: 0,
          samples: 0,
          mode: args.learningMode,
          historyLogged: false,
          historyAvailable: false,
        };
      }

      const byKey = new Map<string, any>();
      ((cur.data ?? []) as Array<any>).forEach((row) => {
        const k = String(row?.buddy_persona_key ?? "").trim();
        if (!k) return;
        byKey.set(k, row);
      });

      const nextByKey = new Map<
        string,
        {
          samples: number;
          positive_score: number;
          negative_score: number;
          bonus_scale: number;
        }
      >();
      keys.forEach((k) => {
        const row = byKey.get(k);
        nextByKey.set(k, {
          samples: toNonNegativeInt(row?.samples, 0) + 1,
          positive_score: toNonNegative(row?.positive_score, 0) + positiveSignal,
          negative_score: toNonNegative(row?.negative_score, 0) + negativeSignal,
          bonus_scale: normalizeBuddyBonusScale(row?.bonus_scale, DEFAULT_BUDDY_BONUS_SCALE),
        });
      });

      const pair = nextByKey.get(buddyPersona)!;
      const global = nextByKey.get(GLOBAL_BUDDY_KEY)!;
      const pairRate = (pair.positive_score + 2) / (pair.positive_score + pair.negative_score + 4);
      const globalRate =
        (global.positive_score + 2) / (global.positive_score + global.negative_score + 4);
      const contrast = clamp(pairRate - globalRate, -0.35, 0.35);
      const contrastScale = args.learningMode === "stable" ? 0.42 : 0.7;
      const targetBonus = normalizeBuddyBonusScale(
        DEFAULT_BUDDY_BONUS_SCALE + contrast * contrastScale,
        DEFAULT_BUDDY_BONUS_SCALE
      );
      const confidence = learningConfidenceFromSamples(Math.min(pair.samples, global.samples));
      const mix =
        args.learningMode === "stable" ? 0.08 + confidence * 0.28 : 0.2 + confidence * 0.55;
      pair.bonus_scale = normalizeBuddyBonusScale(
        pair.bonus_scale * (1 - mix) + targetBonus * mix,
        DEFAULT_BUDDY_BONUS_SCALE
      );

      const globalTarget = normalizeBuddyBonusScale(
        DEFAULT_BUDDY_BONUS_SCALE + clamp(globalRate - 0.5, -0.2, 0.2) * 0.2,
        DEFAULT_BUDDY_BONUS_SCALE
      );
      const globalMix =
        args.learningMode === "stable"
          ? 0.08 + learningConfidenceFromSamples(global.samples) * 0.14
          : 0.12 + learningConfidenceFromSamples(global.samples) * 0.25;
      global.bonus_scale = normalizeBuddyBonusScale(
        global.bonus_scale * (1 - globalMix) + globalTarget * globalMix,
        DEFAULT_BUDDY_BONUS_SCALE
      );

      const now = new Date().toISOString();
      const rows = keys.map((k) => {
        const row = nextByKey.get(k)!;
        return {
          user_id: userId,
          base_persona_key: basePersona,
          buddy_persona_key: k,
          samples: row.samples,
          positive_score: row.positive_score,
          negative_score: row.negative_score,
          bonus_scale: row.bonus_scale,
          updated_at: now,
        };
      });

      const up = await supabase
        .from("user_persona_buddy_learning_state")
        .upsert(rows, { onConflict: "user_id,base_persona_key,buddy_persona_key" });
      const rawBonusScale = pair.bonus_scale;
      let historyLogged = false;
      let historyAvailable = true;
      if (!up.error) {
        const history = await appendPersonaBuddyLearningHistory({
          basePersona,
          buddyPersona,
          samples: pair.samples,
          bonusScale: rawBonusScale,
          confidence,
          learningMode: args.learningMode,
          event: args.event,
        });
        historyLogged = history.logged;
        historyAvailable = history.available;
      }
      return {
        updated: !up.error,
        available: true,
        rawBonusScale,
        effectiveBonusScale: effectiveBuddyBonusScaleByMode({
          rawBonusScale,
          mode: args.learningMode,
        }),
        confidence,
        samples: pair.samples,
        mode: args.learningMode,
        historyLogged,
        historyAvailable,
      };
    },
    [appendPersonaBuddyLearningHistory, userId]
  );

  const applyPersonaFeedBuddyLearningUiUpdate = useCallback(
    (args: {
      buddyPersona: string | null;
      effectiveBonusScale: number | null | undefined;
      rawBonusScale?: number | null | undefined;
      confidence: number | null | undefined;
      samples: number | null | undefined;
    }) => {
      const buddyPersona = String(args.buddyPersona ?? "").trim();
      if (!buddyPersona) return;
      const confidence = clamp(Number(args.confidence ?? 0) || 0, 0, 1);
      const samples = Math.max(0, Math.floor(Number(args.samples ?? 0) || 0));
      const bonusScale = normalizeBuddyBonusScale(
        args.effectiveBonusScale,
        DEFAULT_BUDDY_BONUS_SCALE
      );
      const rawBonusScale = normalizeBuddyBonusScale(args.rawBonusScale, bonusScale);

      setPersonaFeedBuddyPersonas((prev) => {
        const index = prev.findIndex((x) => x.key === buddyPersona);
        const nextItem: BuddyPersonaWeight = {
          key: buddyPersona,
          score: index >= 0 ? clamp(Number(prev[index]?.score ?? 0), 0, 1) : 0,
          bonus_scale: bonusScale,
          raw_bonus_scale: rawBonusScale,
          learned_samples: samples,
          learning_confidence: confidence,
          history_points:
            index >= 0 && Array.isArray(prev[index]?.history_points)
              ? [
                  ...(prev[index]?.history_points ?? []).slice(-8),
                  {
                    bonus_scale: bonusScale,
                    confidence,
                    samples,
                    created_at: new Date().toISOString(),
                  },
                ].slice(-10)
              : undefined,
        };
        if (index < 0) {
          return [...prev, nextItem].sort((a, b) => (Number(b.score ?? 0) || 0) - (Number(a.score ?? 0) || 0));
        }
        const next = [...prev];
        next[index] = {
          ...next[index],
          ...nextItem,
        };
        return next.sort((a, b) => (Number(b.score ?? 0) || 0) - (Number(a.score ?? 0) || 0));
      });
    },
    []
  );

  const logPersonaFeedFeedback = useCallback(
    async (args: {
      postId: string;
      personaKey?: string | null;
      basePersona?: string | null;
      reason?: string | null;
      event: FeedbackEvent;
      dwellMs?: number | null;
    }) => {
      if (!userId || !args.postId) return;

      const personaKey = (args.personaKey ?? "").trim() || null;
      const basePersona =
        String(args.basePersona ?? personaFeedBasePersona ?? "").trim() || null;
      const reason = (args.reason ?? "").trim() || null;
      const buddyPersona = parseBuddyPersonaKey(reason);
      const event = args.event;
      const started = personaFeedSeenAtRef.current.get(args.postId);
      const dwellMs =
        Number.isFinite(args.dwellMs ?? NaN)
          ? clamp(Number(args.dwellMs), 0, 120_000)
          : started != null
          ? clamp(Date.now() - started, 0, 120_000)
          : null;

      if (event !== "impression") {
        personaFeedActionedRef.current.add(args.postId);
      }
      if (event === "skip" || event === "hide") {
        personaFeedSkipSentRef.current.add(args.postId);
      }
      if (event === "open" && buddyPersona) {
        const missionKey = `${todayLocalKey()}:${buddyPersona}:${args.postId}:open`;
        if (!personaFeedMissionOpenedRef.current.has(missionKey)) {
          personaFeedMissionOpenedRef.current.add(missionKey);
          const dayMissionKey = `${todayLocalKey()}:${buddyPersona}`;
          setPersonaFeedBuddyMissionCounts((prev) => ({
            ...prev,
            [dayMissionKey]: Math.max(0, Math.floor(Number(prev[dayMissionKey] ?? 0) || 0) + 1),
          }));
          void incrementPersonaFeedBuddyMissionProgress({
            basePersona,
            buddyPersona,
            targetCount:
              buddyPersona === personaFeedBuddyMission?.key
                ? Math.max(1, Math.floor(Number(personaFeedBuddyMission.goal ?? 1) || 1))
                : 1,
          });
        }
      }

      if (
        event === "impression" ||
        event === "open" ||
        event === "like" ||
        event === "reply" ||
        event === "boost"
      ) {
        void logPersonaFeedBuddyModeAbEvent({
          eventType: event,
          mode: personaFeedBuddyLearningMode,
          strategy: personaFeedStrategy,
          postId: args.postId,
          assignment:
            personaFeedBuddyLearningModeAb &&
            personaFeedBuddyLearningModeAb.variant_key &&
            personaFeedBuddyLearningModeAb.experiment_key
              ? {
                  available: true,
                  experimentKey: String(personaFeedBuddyLearningModeAb.experiment_key),
                  variantKey: personaFeedBuddyLearningModeAb.variant_key,
                }
              : null,
        });
      }

      // ログテーブルが無い環境では失敗を無視
      await supabase.from("persona_feed_events").insert({
        user_id: userId,
        post_id: args.postId,
        persona_key: personaKey,
        reason,
        event,
        dwell_ms: dwellMs,
        created_at: new Date().toISOString(),
      });

      const snapshot = await loadPersonaDwellLearningSnapshot(personaKey, event, dwellMs);
      const learning = computeAdaptiveDwellMultiplier({
        event,
        dwellMs,
        snapshot,
      });

      if (personaKey) {
        const delta = (FEEDBACK_DELTA_MAP[event] ?? 0) * learning.multiplier;
        const cur = await supabase
          .from("user_persona_affinity")
          .select("weight")
          .eq("user_id", userId)
          .eq("persona_key", personaKey)
          .maybeSingle();

        const nextWeight = clamp(
          normalizeWeight(cur.data?.weight, 1) + delta,
          0.2,
          2.2
        );

        await supabase.from("user_persona_affinity").upsert(
          {
            user_id: userId,
            persona_key: personaKey,
            weight: nextWeight,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,persona_key" }
        );
      }

      await updatePersonaDwellLearningState(personaKey, event, dwellMs);
      if (basePersona && buddyPersona) {
        const buddyResult = await updatePersonaBuddyLearningState({
          basePersona,
          buddyPersona,
          event,
          learningMultiplier: learning.multiplier,
          learningMode: personaFeedBuddyLearningMode,
        });
        if (buddyResult.available) {
          applyPersonaFeedBuddyLearningUiUpdate({
            buddyPersona,
            effectiveBonusScale: buddyResult.effectiveBonusScale,
            rawBonusScale: buddyResult.rawBonusScale,
            confidence: buddyResult.confidence,
            samples: buddyResult.samples,
          });
        }
      }
    },
    [
      applyPersonaFeedBuddyLearningUiUpdate,
      incrementPersonaFeedBuddyMissionProgress,
      logPersonaFeedBuddyModeAbEvent,
      loadPersonaDwellLearningSnapshot,
      personaFeedBasePersona,
      personaFeedBuddyLearningModeAb,
      personaFeedBuddyLearningMode,
      personaFeedBuddyMission,
      personaFeedStrategy,
      updatePersonaBuddyLearningState,
      updatePersonaDwellLearningState,
      userId,
    ]
  );

  const flushPersonaFeedSkips = useCallback(() => {
    const now = Date.now();
    personaFeedItems.forEach((item) => {
      if (!item?.id) return;
      if (!personaFeedSeenAtRef.current.has(item.id)) return;
      if (personaFeedActionedRef.current.has(item.id)) return;
      if (personaFeedSkipSentRef.current.has(item.id)) return;

      const started = personaFeedSeenAtRef.current.get(item.id) ?? now;
      const dwell = clamp(now - started, 0, 120_000);
      if (dwell < 300) return;

      personaFeedSkipSentRef.current.add(item.id);
      void logPersonaFeedFeedback({
        postId: item.id,
        personaKey: item.persona_match?.key ?? null,
        basePersona: personaFeedBasePersona,
        reason: item.persona_match?.reason ?? null,
        event: "skip",
        dwellMs: dwell,
      });
    });
  }, [logPersonaFeedFeedback, personaFeedBasePersona, personaFeedItems]);

  const loadPersonaFeed = useCallback(
    async (reset = false) => {
      if (!userId || personaFeedLoading) return;
      const offset = reset ? 0 : personaFeedOffset;
      if (reset) {
        flushPersonaFeedSkips();
        personaFeedSeenAtRef.current.clear();
        personaFeedActionedRef.current.clear();
        personaFeedSkipSentRef.current.clear();
      }
      setPersonaFeedLoading(true);
      setPersonaFeedError(null);

      try {
        const up = await fetchMobilePersonaFeedTopPersona({ userId });

        let basePersona = up.data?.persona_key ?? null;
        if (!basePersona && personaRows.length > 0) {
          basePersona = personaRows[0]?.persona_key ?? null;
        }
        if (!basePersona) {
          const derived = await derivePersonaRowsForUser(6);
          basePersona = derived[0]?.persona_key ?? null;
          if (basePersona && derived.length > 0) {
            void persistPersonaRows(derived.slice(0, 12));
          }
        }
        if (!basePersona) {
          const fallback = await fetchMobileFeedLatestRange({
            offset,
            limit: PERSONA_FEED_PAGE,
          });

          const items = filterBlockedFeedItems(
            ((fallback.data ?? []) as FeedItem[]).map((p) => ({
              ...p,
              persona_match: {
                key: null,
                weighted_score: null,
                raw_score: null,
                weight: null,
                reason: "global_fallback",
              },
            }))
          );

          setPersonaFeedBasePersona(null);
          setPersonaFeedUsedPersonas([]);
          setPersonaFeedBuddyPersonas([]);
          setPersonaFeedItems((prev) => (reset ? items : [...prev, ...items]));
          items.forEach((item) => {
            if (!personaFeedSeenAtRef.current.has(item.id)) {
              personaFeedSeenAtRef.current.set(item.id, Date.now());
              void logPersonaFeedFeedback({
                postId: item.id,
                personaKey: item.persona_match?.key ?? null,
                basePersona,
                reason: item.persona_match?.reason ?? null,
                event: "impression",
                dwellMs: 0,
              });
            }
          });
          setPersonaFeedHasMore(items.length === PERSONA_FEED_PAGE);
          setPersonaFeedOffset(offset + PERSONA_FEED_PAGE);
          return;
        }

        const buddyModePref = await loadPersonaFeedBuddyModePreference();
        const buddyModeAb = !buddyModePref.hasExplicit
          ? await loadOrAssignPersonaFeedBuddyModeAb()
          : {
              available: false,
              experimentKey: BUDDY_MODE_AB_EXPERIMENT,
              variantKey: null as "A" | "B" | null,
              assignedMode: null as BuddyLearningMode | null,
              source: "default" as const,
            };
        const buddyModeOptimization = !buddyModePref.hasExplicit
          ? await loadOptimizedPersonaFeedBuddyModeFromEvents()
          : {
              available: false,
              recommendedMode: null as BuddyLearningMode | null,
              reason: "preference_override",
            };
        const runtimeBuddyMode =
          !buddyModePref.hasExplicit && buddyModeOptimization.available && buddyModeOptimization.recommendedMode
            ? buddyModeOptimization.recommendedMode
            : !buddyModePref.hasExplicit && buddyModeAb.available && buddyModeAb.assignedMode
            ? buddyModeAb.assignedMode
            : buddyModePref.mode;
        setPersonaFeedBuddyLearningMode(runtimeBuddyMode);
        setPersonaFeedBuddyLearningModeAvailable(buddyModePref.available);
        setPersonaFeedBuddyLearningModeSource(
          buddyModePref.hasExplicit
            ? "preference"
            : buddyModeOptimization.available && buddyModeOptimization.recommendedMode
            ? "ab_optimized"
            : buddyModeAb.available && buddyModeAb.assignedMode
            ? "ab_assignment"
            : "default"
        );
        setPersonaFeedBuddyLearningModeAb(
          buddyModeAb.available && buddyModeAb.variantKey
            ? {
                experiment_key: buddyModeAb.experimentKey,
                variant_key: buddyModeAb.variantKey,
                assigned_mode: buddyModeAb.assignedMode,
                source: buddyModeAb.source,
              }
            : null
        );
        void logPersonaFeedBuddyModeAbEvent({
          eventType: "feed_load",
          mode: runtimeBuddyMode,
          strategy: personaFeedStrategy,
          assignment:
            buddyModeAb.available && buddyModeAb.variantKey
              ? {
                  available: true,
                  experimentKey: buddyModeAb.experimentKey,
                  variantKey: buddyModeAb.variantKey,
                }
              : null,
        });

        const ownBuddyPosts = await fetchMobileOwnPostsAnalysis({
          userId,
          limit: 240,
        });
        const buddyPersonas = deriveBuddyPersonaWeights({
          posts: (ownBuddyPosts.data ?? []) as Array<{ created_at: string; analysis: any }>,
          basePersona,
          limit: 10,
        });
        const buddyLearning = await loadPersonaBuddyLearningState(
          basePersona,
          buddyPersonas.map((x) => x.key)
        );
        const buddyHistory = await loadPersonaBuddyLearningHistory(
          basePersona,
          buddyPersonas.map((x) => x.key),
          10
        );
        const enrichedBuddyPersonas = buddyPersonas.map((x) => {
          const learned = buddyLearning.byBuddy.get(x.key);
          const rawBonus = normalizeBuddyBonusScale(
            learned?.bonus,
            buddyLearning.globalBonus
          );
          const effectiveBonus = effectiveBuddyBonusScaleByMode({
            rawBonusScale: rawBonus,
            mode: runtimeBuddyMode,
          });
          return {
            key: x.key,
            score: x.score,
            bonus_scale: effectiveBonus,
            raw_bonus_scale: rawBonus,
            learned_samples: learned?.samples ?? 0,
            learning_confidence: learned?.confidence ?? 0,
            history_points: buddyHistory.byBuddy.get(x.key) ?? [],
          } satisfies BuddyPersonaWeight;
        });
        const buddyScoreMap = new Map<string, number>(
          enrichedBuddyPersonas.map((x) => [x.key, x.score])
        );
        const buddyBonusMap = new Map<string, number>(
          enrichedBuddyPersonas.map((x) => [
            x.key,
            normalizeBuddyBonusScale(x.bonus_scale, buddyLearning.globalBonus),
          ])
        );
        setPersonaFeedBuddyPersonas(enrichedBuddyPersonas);

        const weightMap = new Map<string, number>();
        weightMap.set(basePersona, 1.15);

        if (personaFeedStrategy === "compat") {
          const compat = await fetchMobilePersonaCompatWeights({
            basePersona,
            limit: 8,
          });
          (compat.data ?? []).forEach((r: any) => {
            if (!r?.b || r.b === basePersona) return;
            weightMap.set(r.b, normalizeWeight(r.weight, 0.7));
          });
          enrichedBuddyPersonas.forEach((b) => {
            const base = normalizeWeight(weightMap.get(b.key), 0.72);
            const buddyBonus = normalizeBuddyBonusScale(
              b.bonus_scale,
              buddyLearning.globalBonus
            );
            const buddyFactor = 1 + b.score * buddyBonus;
            weightMap.set(b.key, normalizeWeight(base * buddyFactor, base));
          });
        }

        const personaKeys = Array.from(weightMap.keys());
        const affinity = await fetchMobileUserPersonaAffinity({
          userId,
          personaKeys,
        });
        (affinity.data ?? []).forEach((r: any) => {
          if (!r?.persona_key) return;
          const base = normalizeWeight(weightMap.get(r.persona_key), 0.7);
          const learned = normalizeWeight(r.weight, 1);
          weightMap.set(r.persona_key, normalizeWeight(base * learned, base));
        });

        const ps = await fetchMobilePostScoresByPersona({
          personaKeys,
          limit: Math.max(300, PERSONA_FEED_PAGE * 30),
        });

        const rows = ps.data ?? [];
        if (!rows.length) {
          const fallback = await fetchMobileFeedLatestRange({
            offset,
            limit: PERSONA_FEED_PAGE,
          });
          const items = filterBlockedFeedItems(
            ((fallback.data ?? []) as FeedItem[]).map((p) => ({
              ...p,
              persona_match: {
                key: null,
                weighted_score: null,
                raw_score: null,
                weight: null,
                reason: "fallback_no_scores",
              },
            }))
          );
          setPersonaFeedItems((prev) => (reset ? items : [...prev, ...items]));
          items.forEach((item) => {
            if (!personaFeedSeenAtRef.current.has(item.id)) {
              personaFeedSeenAtRef.current.set(item.id, Date.now());
              void logPersonaFeedFeedback({
                postId: item.id,
                personaKey: item.persona_match?.key ?? null,
                basePersona,
                reason: item.persona_match?.reason ?? null,
                event: "impression",
                dwellMs: 0,
              });
            }
          });
          setPersonaFeedHasMore(items.length === PERSONA_FEED_PAGE);
          setPersonaFeedOffset(offset + PERSONA_FEED_PAGE);
          setPersonaFeedBasePersona(basePersona);
          setPersonaFeedUsedPersonas(personaKeys);
          return;
        }

        const bestByPost = new Map<
          string,
          {
            weighted: number;
            raw: number;
            key: string;
            weight: number;
            reason: string;
            buddy_score: number;
            buddy_weight: number;
            buddy_bonus_scale: number;
          }
        >();

        rows.forEach((r: any) => {
          if (!r?.post_id || !r?.persona_key) return;
          const raw = Number(r.final_score ?? 0);
          if (!Number.isFinite(raw)) return;
          const w = weightMap.get(r.persona_key) ?? 0.5;
          const weighted = raw * w;
          const buddyScore = clamp(buddyScoreMap.get(r.persona_key) ?? 0, 0, 1);
          const buddyBonus = normalizeBuddyBonusScale(
            buddyBonusMap.get(r.persona_key),
            buddyLearning.globalBonus
          );
          const buddyWeight = 1 + buddyScore * buddyBonus;
          const reason =
            r.persona_key === basePersona
              ? "same_persona"
              : buddyScore > 0.08 && buddyBonus > 0.14
              ? `buddy_compat_${r.persona_key}`
              : `compat_${r.persona_key}`;
          const cur = bestByPost.get(r.post_id);
          if (!cur || weighted > cur.weighted) {
            bestByPost.set(r.post_id, {
              weighted,
              raw,
              key: r.persona_key,
              weight: w,
              reason,
              buddy_score: buddyScore,
              buddy_weight: buddyWeight,
              buddy_bonus_scale: buddyBonus,
            });
          }
        });

        const candidates = Array.from(bestByPost.entries()).map(([post_id, v]) => ({
          post_id,
          ...v,
        }));
        const candidateIds = candidates.map((x) => x.post_id);
        const [analysisRowsRes, buzzCalibration] = await Promise.all([
          fetchMobilePostAnalysesByIds(candidateIds),
          loadPersonaBuzzCalibration(),
        ]);
        const analysisById = new Map<string, any>();
        ((analysisRowsRes.data ?? []) as Array<{ id: string; analysis: any }>).forEach((x) => {
          if (!x?.id) return;
          analysisById.set(x.id, x.analysis);
        });

        const ranked = candidates
          .map((r) => {
            const analysis = parseAnalysisBlob(analysisById.get(r.post_id));
            const basePredicted = extractBuzzScoreFromAnalysis(analysis, 0.5);
            const calib =
              buzzCalibration.byPersona.get(r.key) ??
              buzzCalibration.byPersona.get(GLOBAL_BUZZ_PERSONA_KEY) ??
              buzzCalibration.global;
            const predictedResponse = applyPersonaCalibration(basePredicted, calib);
            const rankingScore = computePersonaFeedRankingScore(r.weighted, predictedResponse);
            return {
              ...r,
              predicted_response: predictedResponse,
              predicted_base: basePredicted,
              ranking_score: rankingScore,
              calibration_multiplier: calib.multiplier,
              calibration_samples: calib.samples,
            };
          })
          .sort((a, b) => b.ranking_score - a.ranking_score)
          .slice(offset, offset + PERSONA_FEED_PAGE);

        const ids = ranked.map((x) => x.post_id);
        if (ids.length === 0) {
          setPersonaFeedHasMore(false);
          return;
        }

        const enrichedPosts = (await fetchMobilePostsByIdsEnrichedFirst(ids)) as FeedItem[];
        const byId = new Map(enrichedPosts.map((p: any) => [p.id, p]));

        const items = ranked
          .map((r) => {
            const post = byId.get(r.post_id);
            if (!post || isBlockedAuthor(post.author)) return null;
            return {
              ...post,
              persona_match: {
                key: r.key,
                weighted_score: r.weighted,
                raw_score: r.raw,
                weight: r.weight,
                reason: r.reason,
                buddy_score: r.buddy_score,
                buddy_weight: r.buddy_weight,
                buddy_bonus_scale: r.buddy_bonus_scale,
                predicted_response: r.predicted_response,
                predicted_base: r.predicted_base,
                ranking_score: r.ranking_score,
                calibration_multiplier: r.calibration_multiplier,
                calibration_samples: r.calibration_samples,
              },
            } as FeedItem;
          })
          .filter(Boolean) as FeedItem[];

        setPersonaFeedBasePersona(basePersona);
        setPersonaFeedUsedPersonas(personaKeys);
        setPersonaFeedItems((prev) => {
          const merged = reset ? [] : [...prev];
          const seen = new Set(merged.map((x) => x.id));
          items.forEach((x) => {
            if (!seen.has(x.id)) merged.push(x);
          });
          return merged;
        });
        setPersonaFeedOffset(offset + PERSONA_FEED_PAGE);
        setPersonaFeedHasMore(items.length === PERSONA_FEED_PAGE);

        items.forEach((item) => {
          if (!personaFeedSeenAtRef.current.has(item.id)) {
            personaFeedSeenAtRef.current.set(item.id, Date.now());
            void logPersonaFeedFeedback({
              postId: item.id,
              personaKey: item.persona_match?.key ?? null,
              basePersona,
              reason: item.persona_match?.reason ?? null,
              event: "impression",
              dwellMs: 0,
            });
          }
        });
      } catch (e: any) {
        setPersonaFeedError(e?.message ?? "キャラ別TLの取得に失敗しました");
        if (reset) setPersonaFeedBuddyPersonas([]);
      } finally {
        setPersonaFeedLoading(false);
      }
    },
    [
      filterBlockedFeedItems,
      flushPersonaFeedSkips,
      isBlockedAuthor,
      logPersonaFeedFeedback,
      loadPersonaBuddyLearningHistory,
      loadPersonaBuddyLearningState,
      loadOrAssignPersonaFeedBuddyModeAb,
      loadOptimizedPersonaFeedBuddyModeFromEvents,
      loadPersonaFeedBuddyModePreference,
      logPersonaFeedBuddyModeAbEvent,
      loadPersonaBuzzCalibration,
      personaFeedLoading,
      personaFeedOffset,
      personaFeedStrategy,
      personaRows,
      userId,
    ]
  );

  useEffect(() => {
    if (!personaFeedBuddyMissionCandidates.length) return;
    void loadPersonaFeedBuddyMissionProgress({
      basePersona: personaFeedBasePersona,
      buddyKeys: personaFeedBuddyMissionCandidates.slice(0, 6).map((x) => x.key),
      missionDate: todayLocalKey(),
    });
  }, [
    loadPersonaFeedBuddyMissionProgress,
    personaFeedBasePersona,
    personaFeedBuddyMissionCandidates,
  ]);

  useEffect(() => {
    void refreshPersonaFeedRewriteLearningState({
      basePersona: personaFeedBasePersona,
      buddyPersona: personaFeedBuddyMission?.key ?? null,
    });
  }, [personaFeedBasePersona, personaFeedBuddyMission?.key, refreshPersonaFeedRewriteLearningState]);

  const loadPersonaEvolution = useCallback(async () => {
    if (!userId) return;
    setEvolutionLoading(true);
    setEvolutionError(null);

    try {
      const postsRes = await supabase
        .from("posts")
        .select("id,created_at")
        .eq("author", userId)
        .order("created_at", { ascending: true })
        .limit(500);
      const posts = (postsRes.data ?? []) as Array<{ id: string; created_at: string }>;

      if (!posts.length) {
        setEvolutionSnapshots([]);
        setEvolutionTitles({});
        setEvolutionSource("posts");
        return;
      }

      const ids = posts.map((p) => p.id);
      const scoreRes = await supabase
        .from("post_scores")
        .select("post_id,persona_key,final_score")
        .in("post_id", ids)
        .limit(20000);

      const rows = scoreRes.data ?? [];
      if (!rows.length) {
        const up = await supabase
          .from("user_personas")
          .select("persona_key,score,confidence,updated_at,version")
          .eq("user_id", userId)
          .order("updated_at", { ascending: true })
          .limit(2000);
        const grouped = new Map<
          string,
          {
            at: string;
            items: Array<{ persona_key: string; score: number; confidence: number }>;
          }
        >();
        (up.data ?? []).forEach((r: any) => {
          const key = r.version != null ? `v:${r.version}` : String(r.updated_at).slice(0, 10);
          if (!grouped.has(key)) grouped.set(key, { at: r.updated_at, items: [] });
          grouped.get(key)?.items.push({
            persona_key: r.persona_key,
            score: normalize01(r.score),
            confidence: normalize01(r.confidence),
          });
        });
        const snapshots = Array.from(grouped.values())
          .map((g) => {
            const top = [...g.items].sort((a, b) => b.score - a.score)[0];
            return {
              at: g.at,
              top_key: top?.persona_key ?? "unknown",
              top_score: top?.score ?? 0,
              confidence: top?.confidence ?? 0,
              posts: g.items.length,
            } as PersonaEvolutionSnapshot;
          })
          .sort((a, b) => a.at.localeCompare(b.at))
          .slice(-60);

        const titles = await resolvePersonaTitles(snapshots.map((x) => x.top_key));
        setEvolutionSnapshots(snapshots);
        setEvolutionTitles(titles);
        setEvolutionSource("user_personas");
        return;
      }

      const topByPost = new Map<string, { key: string; score: number }>();
      rows.forEach((r: any) => {
        if (!r?.post_id || !r?.persona_key) return;
        const s = normalize01(r.final_score);
        const cur = topByPost.get(r.post_id);
        if (!cur || s > cur.score) {
          topByPost.set(r.post_id, { key: r.persona_key, score: s });
        }
      });

      const byDay = new Map<string, Array<{ key: string; score: number }>>();
      posts.forEach((p) => {
        const top = topByPost.get(p.id);
        if (!top) return;
        const day = String(p.created_at).slice(0, 10);
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day)?.push(top);
      });

      const snapshots = Array.from(byDay.entries())
        .map(([day, entries]) => {
          const m = new Map<string, { n: number; total: number }>();
          entries.forEach((e) => {
            const cur = m.get(e.key) ?? { n: 0, total: 0 };
            cur.n += 1;
            cur.total += e.score;
            m.set(e.key, cur);
          });
          const top = Array.from(m.entries())
            .map(([key, v]) => ({
              key,
              n: v.n,
              avg: v.total / Math.max(1, v.n),
            }))
            .sort((a, b) => {
              if (b.n !== a.n) return b.n - a.n;
              return b.avg - a.avg;
            })[0];

          return {
            at: day,
            top_key: top?.key ?? "unknown",
            top_score: normalize01(top?.avg),
            confidence: normalize01((top?.n ?? 0) / Math.max(1, entries.length)),
            posts: entries.length,
          } as PersonaEvolutionSnapshot;
        })
        .sort((a, b) => a.at.localeCompare(b.at))
        .slice(-60);

      const titles = await resolvePersonaTitles(snapshots.map((x) => x.top_key));
      setEvolutionSnapshots(snapshots);
      setEvolutionTitles(titles);
      setEvolutionSource("post_scores");
    } catch (e: any) {
      setEvolutionError(e?.message ?? "キャラ進化の取得に失敗しました");
      setEvolutionSnapshots([]);
      setEvolutionTitles({});
      setEvolutionSource("");
    } finally {
      setEvolutionLoading(false);
    }
  }, [resolvePersonaTitles, userId]);

  const loadDialogueCompat = useCallback(async () => {
    if (!dialogueSourceKey) return;
    setDialogueCompatLoading(true);
    setDialogueCompatError(null);
    try {
      let items: PersonaCompatItem[] = [];
      const webBase = (process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "").trim().replace(/\/$/, "");
      if (webBase) {
        const params = new URLSearchParams({
          key: dialogueSourceKey,
          mode: dialogueMode,
          limit: "24",
        });
        const res = await fetch(`${webBase}/api/personas/compat?${params.toString()}`);
        const json = await res.json().catch(() => null);
        if (res.ok && json?.items && Array.isArray(json.items)) {
          items = (json.items as Array<any>).map((x) => ({
            targetKey: String(x.targetKey ?? ""),
            score: Number(x.score ?? 0) || 0,
            relationLabel: x.relationLabel == null ? null : String(x.relationLabel),
            title: String(x.title ?? x.targetKey ?? "unknown"),
            insights: x.insights ?? null,
          }));
        }
      }

      if (items.length === 0) {
        const r = await supabase
          .from("persona_compat")
          .select("target_key,score,relation_label")
          .eq("source_key", dialogueSourceKey)
          .eq("kind", dialogueMode)
          .neq("target_key", dialogueSourceKey)
          .order("score", { ascending: false })
          .limit(24);
        if (r.error) throw r.error;

        const rows = (r.data ?? []) as Array<{
          target_key: string;
          score: number;
          relation_label: string | null;
        }>;
        const titles = await resolvePersonaTitles(rows.map((x) => x.target_key));
        items = rows.map((x) => ({
          targetKey: x.target_key,
          score: Number(x.score ?? 0) || 0,
          relationLabel: x.relation_label ?? null,
          title: titles[x.target_key] ?? x.target_key,
          insights: null,
        }));
      }

      setDialogueCompatItems(items);
      setDialogueTargetKey((prev) =>
        prev && items.some((x) => x.targetKey === prev)
          ? prev
          : (items[0]?.targetKey ?? "")
      );
    } catch (e: any) {
      setDialogueCompatError(e?.message ?? "相性データ取得に失敗しました");
      setDialogueCompatItems([]);
      setDialogueTargetKey("");
    } finally {
      setDialogueCompatLoading(false);
    }
  }, [dialogueMode, dialogueSourceKey, resolvePersonaTitles]);

  const loadComposeCompat = useCallback(
    async (sourceKey: string) => {
      const key = String(sourceKey ?? "").trim();
      if (!key) {
        setComposeCompatItems([]);
        setComposeCompatError(null);
        setComposeCompatLoading(false);
        return;
      }

      setComposeCompatLoading(true);
      setComposeCompatError(null);
      try {
        let items: PersonaCompatItem[] = [];
        const webBase = (process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "").trim().replace(/\/$/, "");
        if (webBase) {
          const params = new URLSearchParams({
            key,
            mode: "friendship",
            limit: "12",
          });
          const res = await fetch(`${webBase}/api/personas/compat?${params.toString()}`);
          const json = await res.json().catch(() => null);
          if (res.ok && json?.items && Array.isArray(json.items)) {
            items = (json.items as Array<any>).map((x) => ({
              targetKey: String(x.targetKey ?? ""),
              score: Number(x.score ?? 0) || 0,
              relationLabel: x.relationLabel == null ? null : String(x.relationLabel),
              title: String(x.title ?? x.targetKey ?? "unknown"),
              insights: x.insights ?? null,
            }));
          }
        }

        if (items.length === 0) {
          const r = await supabase
            .from("persona_compat")
            .select("target_key,score,relation_label")
            .eq("source_key", key)
            .eq("kind", "friendship")
            .neq("target_key", key)
            .order("score", { ascending: false })
            .limit(12);
          if (r.error) throw r.error;

          const rows = (r.data ?? []) as Array<{
            target_key: string;
            score: number;
            relation_label: string | null;
          }>;
          const titles = await resolvePersonaTitles(rows.map((x) => x.target_key));
          items = rows.map((x) => ({
            targetKey: x.target_key,
            score: Number(x.score ?? 0) || 0,
            relationLabel: x.relation_label ?? null,
            title: titles[x.target_key] ?? x.target_key,
            insights: null,
          }));
        }

        const filtered = items.filter((x) => x.targetKey && x.targetKey !== key).slice(0, 10);
        setComposeCompatItems(filtered);
        setComposeBlendSecondaryKey((prev) =>
          prev && filtered.some((x) => x.targetKey === prev)
            ? prev
            : (filtered[0]?.targetKey ?? prev)
        );
      } catch (e: any) {
        setComposeCompatItems([]);
        setComposeCompatError(e?.message ?? "相性データ取得に失敗しました");
      } finally {
        setComposeCompatLoading(false);
      }
    },
    [resolvePersonaTitles]
  );

  const generateDialogueDrafts = useCallback(async () => {
    if (!dialogueSourceKey || !dialogueTargetKey || dialogueLoading) return;
    setDialogueLoading(true);
    setDialogueError(null);

    try {
      const selectedCompat =
        dialogueCompatItems.find((x) => x.targetKey === dialogueTargetKey) ?? null;
      const fallback = buildDialogueFallback({
        sourceTitle: dialogueSourceDef?.title ?? dialogueSourceKey,
        targetTitle: dialogueTargetDef?.title ?? dialogueTargetKey,
        mode: dialogueMode,
        relationLabel: selectedCompat?.relationLabel ?? null,
        context: dialogueContext,
        replyToText: dialogueReplyToText,
        sourceTalk: dialogueSourceDef?.talk_style ?? null,
        targetTalk: dialogueTargetDef?.talk_style ?? null,
        sourceProfileSummary: dialogueSourceProfile.summary,
        targetProfileSummary: dialogueTargetProfile.summary,
        sourceHook: dialogueSourceProfile.hook,
        targetHook: dialogueTargetProfile.hook,
      });

      const base = (process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "").trim().replace(/\/$/, "");
      if (!base) {
        setDialogueResult(fallback);
        return;
      }

      const res = await fetch(`${base}/api/personas/dialogue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceKey: dialogueSourceKey,
          targetKey: dialogueTargetKey,
          mode: dialogueMode,
          context: dialogueContext.trim(),
          replyToText: dialogueReplyToText.trim(),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) {
        throw new Error(json?.error ?? "対話草案の生成に失敗しました");
      }

      setDialogueResult({
        drafts: (json.drafts ?? []).map((x: any) => String(x)).slice(0, 3),
        strategy: String(json.strategy ?? "llm"),
        tips: (json.tips ?? []).map((x: any) => String(x)).slice(0, 4),
      });
    } catch (e: any) {
      setDialogueError(e?.message ?? "対話草案の生成に失敗しました");
      const selectedCompat =
        dialogueCompatItems.find((x) => x.targetKey === dialogueTargetKey) ?? null;
      setDialogueResult(
        buildDialogueFallback({
          sourceTitle: dialogueSourceDef?.title ?? dialogueSourceKey,
          targetTitle: dialogueTargetDef?.title ?? dialogueTargetKey,
          mode: dialogueMode,
          relationLabel: selectedCompat?.relationLabel ?? null,
          context: dialogueContext,
          replyToText: dialogueReplyToText,
          sourceTalk: dialogueSourceDef?.talk_style ?? null,
          targetTalk: dialogueTargetDef?.talk_style ?? null,
          sourceProfileSummary: dialogueSourceProfile.summary,
          targetProfileSummary: dialogueTargetProfile.summary,
          sourceHook: dialogueSourceProfile.hook,
          targetHook: dialogueTargetProfile.hook,
        })
      );
    } finally {
      setDialogueLoading(false);
    }
  }, [
    dialogueCompatItems,
    dialogueContext,
    dialogueLoading,
    dialogueMode,
    dialogueReplyToText,
    dialogueSourceDef,
    dialogueSourceProfile,
    dialogueSourceKey,
    dialogueTargetDef,
    dialogueTargetProfile,
    dialogueTargetKey,
  ]);

  const hydrateOpenedPostState = useCallback(
    async (postIds: string[]) => {
      if (!userId || !openedPostStateEnabledRef.current) return;
      const unique = Array.from(
        new Set(postIds.map((x) => String(x ?? "").trim()).filter((x) => x.length > 0))
      );
      if (unique.length === 0) return;
      const missing = unique.filter((x) => !openedPostStateRequestedRef.current.has(x));
      if (missing.length === 0) return;
      missing.forEach((x) => openedPostStateRequestedRef.current.add(x));

      const res = await supabase
        .from("user_post_open_state")
        .select("post_id")
        .eq("user_id", userId)
        .in("post_id", missing)
        .limit(missing.length);

      if (res.error) {
        if (isMissingOpenStateTableError(res.error)) {
          openedPostStateEnabledRef.current = false;
          return;
        }
        missing.forEach((x) => openedPostStateRequestedRef.current.delete(x));
        return;
      }

      const opened = Array.from(
        new Set(
          (res.data ?? [])
            .map((r: any) => String(r?.post_id ?? "").trim())
            .filter((x: string) => x.length > 0)
        )
      );
      if (opened.length === 0) return;
      opened.forEach((x) => openedPostStatePersistedRef.current.add(x));
      setOpenedPostIds((prev) => uniq([...opened, ...prev]).slice(0, MAX_OPENED_POST_STATE));
    },
    [userId]
  );

  const persistOpenedPostState = useCallback(
    async (postId: string, source = "detail") => {
      if (!userId || !openedPostStateEnabledRef.current) return;
      const id = String(postId ?? "").trim();
      if (!id) return;
      const now = new Date().toISOString();
      const up = await supabase.from("user_post_open_state").upsert(
        {
          user_id: userId,
          post_id: id,
          source,
          opened_at: now,
          updated_at: now,
        },
        { onConflict: "user_id,post_id" }
      );
      if (up.error) {
        if (isMissingOpenStateTableError(up.error)) {
          openedPostStateEnabledRef.current = false;
        }
        openedPostStatePersistedRef.current.delete(id);
      }
    },
    [userId]
  );

  const markPostOpened = useCallback((postId: string, source = "detail") => {
    const id = String(postId ?? "").trim();
    if (!id) return;
    setOpenedPostIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [id, ...prev];
      return next.slice(0, MAX_OPENED_POST_STATE);
    });
    if (openedPostStatePersistedRef.current.has(id)) return;
    openedPostStatePersistedRef.current.add(id);
    void persistOpenedPostState(id, source);
  }, [persistOpenedPostState]);

  const loadDetailSaveState = useCallback(
    async (postId: string) => {
      const id = String(postId ?? "").trim();
      if (!id || !userId) {
        setDetailSaved(false);
        setDetailSaveCount(0);
        setDetailSaveCollectionKey("saved");
        setDetailSaveCollectionLabel("保存");
        setDetailSaveCollectionAvailable(false);
        return;
      }

      try {
        const [countRes, meRes, collectionRes] = await Promise.all([
          supabase
            .from("reactions")
            .select("id", { count: "exact", head: true })
            .eq("post_id", id)
            .eq("kind", "save"),
          supabase
            .from("reactions")
            .select("id")
            .eq("post_id", id)
            .eq("user_id", userId)
            .eq("kind", "save")
            .maybeSingle(),
          supabase
            .from("user_saved_post_collections")
            .select("collection_key,collection_label")
            .eq("user_id", userId)
            .eq("post_id", id)
            .maybeSingle(),
        ]);

        if (countRes.error) throw countRes.error;
        const saveCount =
          typeof countRes.count === "number" ? Math.max(0, countRes.count) : 0;
        setDetailSaveCount(saveCount);
        setDetailSaved(Boolean(meRes.data));

        if (collectionRes.error) {
          if (isMissingRelationError(collectionRes.error, "user_saved_post_collections")) {
            setDetailSaveCollectionAvailable(false);
            setDetailSaveCollectionKey("saved");
            setDetailSaveCollectionLabel("保存");
            setPostSaveStateById((prev) => ({
              ...prev,
              [id]: {
                ...(prev[id] ?? { saved: Boolean(meRes.data), saveCount }),
                saved: Boolean(meRes.data),
                saveCount,
                busy: false,
                collectionKey: "saved",
                collectionLabel: "保存",
              },
            }));
          } else {
            throw collectionRes.error;
          }
        } else {
          setDetailSaveCollectionAvailable(true);
          const nextKey = normalizeCollectionKey((collectionRes.data as any)?.collection_key);
          const nextLabel = normalizeCollectionLabel((collectionRes.data as any)?.collection_label);
          setDetailSaveCollectionKey(nextKey);
          setDetailSaveCollectionLabel(nextLabel);
          setPostSaveStateById((prev) => ({
            ...prev,
            [id]: {
              ...(prev[id] ?? { saved: Boolean(meRes.data), saveCount }),
              saved: Boolean(meRes.data),
              saveCount,
              busy: false,
              collectionKey: nextKey,
              collectionLabel: nextLabel,
            },
          }));
        }
      } catch {
        // Avoid interrupting detail UI; save controls still work as retry path.
      }
    },
    [userId]
  );

  const saveDetailPost = useCallback(
    async (args?: { collectionKey?: string; collectionLabel?: string; saved?: boolean }) => {
      if (!userId || !detailPost?.id || detailSaveBusy) return;
      const postId = String(detailPost.id ?? "").trim();
      if (!postId) return;
      const requestedSaved = typeof args?.saved === "boolean" ? args.saved : true;
      const nextCollectionKey = normalizeCollectionKey(args?.collectionKey ?? detailSaveCollectionKey);
      const nextCollectionLabel = normalizeCollectionLabel(
        args?.collectionLabel ?? detailSaveCollectionLabel
      );

      setDetailSaveBusy(true);
      try {
        if (requestedSaved) {
          const now = new Date().toISOString();
          const saveUp = await supabase.from("reactions").upsert(
            {
              post_id: postId,
              user_id: userId,
              kind: "save",
              created_at: now,
            },
            { onConflict: "post_id,user_id,kind" }
          );
          if (saveUp.error) throw saveUp.error;

          const collUp = await supabase.from("user_saved_post_collections").upsert(
            {
              user_id: userId,
              post_id: postId,
              collection_key: nextCollectionKey,
              collection_label: nextCollectionLabel,
              updated_at: now,
            },
            { onConflict: "user_id,post_id" }
          );
          if (collUp.error) {
            if (isMissingRelationError(collUp.error, "user_saved_post_collections")) {
              setDetailSaveCollectionAvailable(false);
              setSavedCollectionsAvailable(false);
            } else {
              throw collUp.error;
            }
          } else {
            setDetailSaveCollectionAvailable(true);
          }
        } else {
          const [delReaction, delCollection] = await Promise.all([
            supabase
              .from("reactions")
              .delete()
              .eq("post_id", postId)
              .eq("user_id", userId)
              .eq("kind", "save"),
            supabase
              .from("user_saved_post_collections")
              .delete()
              .eq("user_id", userId)
              .eq("post_id", postId),
          ]);
          if (delReaction.error) throw delReaction.error;
          if (
            delCollection.error &&
            !isMissingRelationError(delCollection.error, "user_saved_post_collections")
          ) {
            throw delCollection.error;
          }
          if (
            delCollection.error &&
            isMissingRelationError(delCollection.error, "user_saved_post_collections")
          ) {
            setDetailSaveCollectionAvailable(false);
            setSavedCollectionsAvailable(false);
          }
        }

        await loadDetailSaveState(postId);
        setSavedFeed((prev) =>
          requestedSaved
            ? prev.map((x) =>
                x.id === postId
                  ? {
                      ...x,
                      save_meta: {
                        collection_key: nextCollectionKey,
                        collection_label: nextCollectionLabel,
                        saved_at: new Date().toISOString(),
                      },
                    }
                  : x
              )
            : prev.filter((x) => x.id !== postId)
        );
        if (tab === "saved") {
          void loadSavedFeed(true);
        }
        void loadSavedCollectionsSummary();
      } catch (e: any) {
        Alert.alert("保存操作に失敗", e?.message ?? "保存/コレクションの更新に失敗しました");
      } finally {
        setDetailSaveBusy(false);
      }
    },
    [
      detailPost?.id,
      detailSaveBusy,
      detailSaveCollectionKey,
      detailSaveCollectionLabel,
      loadDetailSaveState,
      loadSavedCollectionsSummary,
      loadSavedFeed,
      tab,
      userId,
    ]
  );

  const loadSaveSnapshotForPost = useCallback(
    async (postId: string) => {
      const id = String(postId ?? "").trim();
      if (!id || !userId) return null;
      const [countRes, meRes, collectionRes] = await Promise.all([
        supabase
          .from("reactions")
          .select("id", { count: "exact", head: true })
          .eq("post_id", id)
          .eq("kind", "save"),
        supabase
          .from("reactions")
          .select("id")
          .eq("post_id", id)
          .eq("user_id", userId)
          .eq("kind", "save")
          .maybeSingle(),
        supabase
          .from("user_saved_post_collections")
          .select("collection_key,collection_label")
          .eq("user_id", userId)
          .eq("post_id", id)
          .maybeSingle(),
      ]);
      if (countRes.error) throw countRes.error;
      let collectionAvailable = true;
      let collectionKey: string | null = "saved";
      let collectionLabel: string | null = "保存";
      if (collectionRes.error) {
        if (isMissingRelationError(collectionRes.error, "user_saved_post_collections")) {
          collectionAvailable = false;
          collectionKey = "saved";
          collectionLabel = "保存";
        } else {
          throw collectionRes.error;
        }
      } else if (collectionRes.data) {
        collectionKey = normalizeCollectionKey((collectionRes.data as any)?.collection_key);
        collectionLabel = normalizeCollectionLabel((collectionRes.data as any)?.collection_label);
      }
      return {
        saved: Boolean(meRes.data),
        saveCount: typeof countRes.count === "number" ? Math.max(0, countRes.count) : 0,
        collectionAvailable,
        collectionKey,
        collectionLabel,
      };
    },
    [userId]
  );

  const toggleSaveOnPostCard = useCallback(
    async (item: FeedItem | SearchPost | PostDetailItem) => {
      if (!userId) return;
      const postId = String(item.id ?? "").trim();
      if (!postId) return;

      setPostSaveStateById((prev) => {
        const base = prev[postId];
        return {
          ...prev,
          [postId]: {
            saved:
              typeof base?.saved === "boolean"
                ? base.saved
                : Boolean(("save_meta" in (item as any) && (item as any)?.save_meta) || false),
            saveCount: Math.max(0, Number(base?.saveCount ?? 0) || 0),
            collectionKey: base?.collectionKey ?? "saved",
            collectionLabel: base?.collectionLabel ?? "保存",
            busy: true,
          },
        };
      });

      try {
        const current = postSaveStateById[postId] ?? null;
        const known =
          current ??
          (await loadSaveSnapshotForPost(postId)) ?? {
            saved: Boolean(("save_meta" in (item as any) && (item as any)?.save_meta) || false),
            saveCount: 0,
            collectionAvailable: savedCollectionsAvailable,
            collectionKey: "saved",
            collectionLabel: "保存",
          };

        const shouldSave = !known.saved;
        const now = new Date().toISOString();
        const preferred =
          savedCollectionKey !== "all"
            ? savedCollections.find((x) => x.key === savedCollectionKey) ?? null
            : null;
        const nextCollectionKey = normalizeCollectionKey(
          preferred?.key ?? known.collectionKey ?? "saved"
        );
        const nextCollectionLabel = normalizeCollectionLabel(
          preferred?.label ?? known.collectionLabel ?? "保存"
        );

        if (shouldSave) {
          const saveUp = await supabase.from("reactions").upsert(
            {
              post_id: postId,
              user_id: userId,
              kind: "save",
              created_at: now,
            },
            { onConflict: "post_id,user_id,kind" }
          );
          if (saveUp.error) throw saveUp.error;

          const collUp = await supabase.from("user_saved_post_collections").upsert(
            {
              user_id: userId,
              post_id: postId,
              collection_key: nextCollectionKey,
              collection_label: nextCollectionLabel,
              updated_at: now,
            },
            { onConflict: "user_id,post_id" }
          );
          if (collUp.error) {
            if (isMissingRelationError(collUp.error, "user_saved_post_collections")) {
              setSavedCollectionsAvailable(false);
            } else {
              throw collUp.error;
            }
          } else {
            setSavedCollectionsAvailable(true);
          }

          setPostSaveStateById((prev) => ({
            ...prev,
            [postId]: {
              saved: true,
              saveCount: Math.max(0, Number(known.saveCount ?? 0) || 0) + (known.saved ? 0 : 1),
              busy: false,
              collectionKey: nextCollectionKey,
              collectionLabel: nextCollectionLabel,
            },
          }));
          if (tab === "saved") {
            void loadSavedFeed(true);
          }
        } else {
          const [delReaction, delCollection] = await Promise.all([
            supabase
              .from("reactions")
              .delete()
              .eq("post_id", postId)
              .eq("user_id", userId)
              .eq("kind", "save"),
            supabase
              .from("user_saved_post_collections")
              .delete()
              .eq("user_id", userId)
              .eq("post_id", postId),
          ]);
          if (delReaction.error) throw delReaction.error;
          if (
            delCollection.error &&
            !isMissingRelationError(delCollection.error, "user_saved_post_collections")
          ) {
            throw delCollection.error;
          }
          if (delCollection.error) setSavedCollectionsAvailable(false);

          setPostSaveStateById((prev) => ({
            ...prev,
            [postId]: {
              saved: false,
              saveCount: Math.max(0, (Number(known.saveCount ?? 0) || 0) - 1),
              busy: false,
              collectionKey: known.collectionKey ?? "saved",
              collectionLabel: known.collectionLabel ?? "保存",
            },
          }));
          setSavedFeed((prev) => prev.filter((x) => x.id !== postId));
          if (tab === "saved") {
            void loadSavedFeed(true);
          }
        }

        if (detailVisible && detailPost?.id === postId) {
          void loadDetailSaveState(postId);
        }
        void loadSavedCollectionsSummary();
      } catch (e: any) {
        setPostSaveStateById((prev) => ({
          ...prev,
          [postId]: {
            ...(prev[postId] ?? {
              saved: false,
              saveCount: 0,
              collectionKey: "saved",
              collectionLabel: "保存",
            }),
            busy: false,
          },
        }));
        Alert.alert("保存操作に失敗", e?.message ?? "保存/解除に失敗しました");
      }
    },
    [
      detailPost?.id,
      detailVisible,
      loadDetailSaveState,
      loadSaveSnapshotForPost,
      loadSavedCollectionsSummary,
      loadSavedFeed,
      postSaveStateById,
      savedCollectionKey,
      savedCollections,
      savedCollectionsAvailable,
      tab,
      userId,
    ]
  );

  const resolveDetailSequence = useCallback(
    (postId: string) => {
      let ids: string[] = [];
      if (tab === "timeline") {
        ids = feed.map((x) => x.id);
      } else if (tab === "following") {
        ids = followingFeed.map((x) => x.id);
      } else if (tab === "saved") {
        ids = savedFeed.map((x) => x.id);
      } else if (tab === "personaFeed") {
        ids = personaFeedItems.map((x) => x.id);
      } else if (tab === "search") {
        ids = searchItems.map((x) => x.id);
      } else if (tab === "notifications") {
        ids = filteredNotifications
          .map((x) => String(x.post_id ?? "").trim())
          .filter((x) => x.length > 0);
      } else {
        ids = [];
      }

      const sequence = uniq(ids.filter(Boolean));
      if (!sequence.includes(postId)) sequence.unshift(postId);
      return {
        ids: sequence,
        index: Math.max(0, sequence.indexOf(postId)),
      };
    },
    [feed, filteredNotifications, followingFeed, personaFeedItems, savedFeed, searchItems, tab]
  );

  const loadPostDetail = useCallback(async (postId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    setReplyText("");
    setDetailReplies([]);
    setDetailSaveBusy(false);
    setDetailSaved(false);
    setDetailSaveCount(0);
    setDetailSaveCollectionKey("saved");
    setDetailSaveCollectionLabel("保存");
    setDetailSaveCollectionAvailable(false);
    setDetailLieFeedback({
      opens: 0,
      reports: 0,
      truthTrueVotes: 0,
      truthFalseVotes: 0,
    });

    try {
      let post: PostDetailItem | null = null;
      const fromView = await supabase
        .from("v_posts_enriched")
        .select("*")
        .eq("id", postId)
        .maybeSingle();
      if (!fromView.error && fromView.data) {
        post = fromView.data as PostDetailItem;
      }

      if (!post) {
        const raw = await supabase
          .from("posts")
          .select("*")
          .eq("id", postId)
          .maybeSingle();
        if (raw.error) throw raw.error;
        post = (raw.data as PostDetailItem | null) ?? null;
      }

      if (!post) {
        setDetailError("投稿が見つかりませんでした。");
        setDetailPost(null);
        return;
      }

      post = ((await enrichMobilePostAuthorProfiles([post]))[0] ?? post) as PostDetailItem;

      if (isBlockedAuthor(post.author)) {
        setDetailError("この投稿は表示対象外です。");
        setDetailPost(null);
        return;
      }

      setDetailPost(post);
      const saveStatePromise = loadDetailSaveState(postId);
      const feedbackCountsPromise = Promise.all([
        supabase
          .from("user_post_open_state")
          .select("id", { count: "exact", head: true })
          .eq("post_id", postId),
        supabase
          .from("truth_votes")
          .select("id", { count: "exact", head: true })
          .eq("post_id", postId)
          .eq("value", 1),
        supabase
          .from("truth_votes")
          .select("id", { count: "exact", head: true })
          .eq("post_id", postId)
          .eq("value", -1),
        supabase
          .from("user_reports")
          .select("id", { count: "exact", head: true })
          .eq("post_id", postId),
      ])
        .then(([opensRes, truthTrueRes, truthFalseRes, reportsRes]) => {
          setDetailLieFeedback({
            opens: typeof opensRes.count === "number" ? Math.max(0, opensRes.count) : 0,
            reports:
              !reportsRes.error && typeof reportsRes.count === "number"
                ? Math.max(0, reportsRes.count)
                : 0,
            truthTrueVotes:
              typeof truthTrueRes.count === "number" ? Math.max(0, truthTrueRes.count) : 0,
            truthFalseVotes:
              typeof truthFalseRes.count === "number" ? Math.max(0, truthFalseRes.count) : 0,
          });
        })
        .catch(() => {
          // ignore optional feedback stats
        });

      const repliesFromView = await supabase
        .from("v_posts_enriched")
        .select("*")
        .eq("parent_id", postId)
        .order("created_at", { ascending: true });

      if (!repliesFromView.error && repliesFromView.data) {
        const enrichedReplies = (await enrichMobilePostAuthorProfiles(
          (repliesFromView.data ?? []) as PostDetailItem[]
        )) as PostDetailItem[];
        setDetailReplies(filterBlockedDetailItems(enrichedReplies));
      } else {
        const repliesRaw = await supabase
          .from("posts")
          .select("*")
          .eq("parent_id", postId)
          .order("created_at", { ascending: true });
        if (repliesRaw.error) throw repliesRaw.error;
        const enrichedReplies = (await enrichMobilePostAuthorProfiles(
          (repliesRaw.data ?? []) as PostDetailItem[]
        )) as PostDetailItem[];
        setDetailReplies(filterBlockedDetailItems(enrichedReplies));
      }
      await Promise.all([saveStatePromise, feedbackCountsPromise]);
    } catch (e: any) {
      setDetailError(e?.message ?? "投稿詳細の取得に失敗しました");
      setDetailPost(null);
      setDetailReplies([]);
    } finally {
      setDetailLoading(false);
    }
  }, [filterBlockedDetailItems, isBlockedAuthor, loadDetailSaveState]);

  const moveDetailBy = useCallback(
    async (delta: -1 | 1) => {
      if (detailLoading || detailSequenceIds.length === 0) return;
      const nextIndex = detailSequenceIndex + delta;
      if (nextIndex < 0 || nextIndex >= detailSequenceIds.length) return;
      const nextId = detailSequenceIds[nextIndex];
      if (!nextId) return;
      setDetailSequenceIndex(nextIndex);
      markPostOpened(nextId, "detail_swipe");
      await loadPostDetail(nextId);
    },
    [detailLoading, detailSequenceIds, detailSequenceIndex, loadPostDetail, markPostOpened]
  );

  const onDetailTouchStart = useCallback((e: any) => {
    detailSwipeStartXRef.current = Number(e?.nativeEvent?.pageX ?? NaN);
  }, []);

  const onDetailTouchEnd = useCallback(
    (e: any) => {
      const start = Number(detailSwipeStartXRef.current ?? NaN);
      const end = Number(e?.nativeEvent?.pageX ?? NaN);
      detailSwipeStartXRef.current = null;
      if (!Number.isFinite(start) || !Number.isFinite(end)) return;
      const dx = end - start;
      if (Math.abs(dx) < 72) return;
      if (dx < 0) {
        void moveDetailBy(1);
      } else {
        void moveDetailBy(-1);
      }
    },
    [moveDetailBy]
  );

  const openPostDetailShell = useCallback(
    (
      postId: string,
      options?: {
        personaMatch?: FeedItem["persona_match"];
        source?: string;
      }
    ) => {
      if (!postId) return false;
      const sequence = resolveDetailSequence(postId);
      setDetailPersonaMatch({
        key: options?.personaMatch?.key ?? null,
        reason: options?.personaMatch?.reason ?? null,
      });
      setDetailSequenceIds(sequence.ids);
      setDetailSequenceIndex(sequence.index);
      markPostOpened(postId, options?.source ?? tab);
      if (options?.personaMatch?.key) {
        void logPersonaFeedFeedback({
          postId,
          personaKey: options.personaMatch.key,
          basePersona: personaFeedBasePersona,
          reason: options.personaMatch.reason ?? null,
          event: "open",
        });
      }
      setDetailVisible(true);
      return true;
    },
    [logPersonaFeedFeedback, markPostOpened, personaFeedBasePersona, resolveDetailSequence, tab]
  );

  const openPostDetail = useCallback(
    async (
      postId: string,
      options?: {
        personaMatch?: FeedItem["persona_match"];
        source?: string;
      }
    ) => {
      const opened = openPostDetailShell(postId, options);
      if (!opened) return;
      await loadPostDetail(postId);
    },
    [loadPostDetail, openPostDetailShell]
  );

  const openPostDetailNonBlocking = useCallback(
    (
      postId: string,
      options?: {
        personaMatch?: FeedItem["persona_match"];
        source?: string;
      }
    ) => {
      const opened = openPostDetailShell(postId, options);
      if (!opened) return;
      void loadPostDetail(postId).catch((e) => {
        try {
          console.log(`[detail-open-nonblocking] ${e?.message ?? e}`);
        } catch {}
      });
    },
    [loadPostDetail, openPostDetailShell]
  );

  const loadPushDeviceState = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await supabase
        .from("user_push_devices")
        .select("expo_push_token,enabled,updated_at")
        .eq("user_id", userId)
        .eq("provider", "expo")
        .order("updated_at", { ascending: false })
        .limit(3);
      if (res.error) {
        if (isMissingRelationError(res.error, "user_push_devices")) {
          setPushSetupAvailable(false);
          setPushEnabled(false);
          setPushTokenPreview(null);
          setPushSetupMessage(
            "Push通知DBが未適用です。user_push_devices migration を適用するとバックグラウンド通知を有効化できます。"
          );
          return;
        }
        throw res.error;
      }
      setPushSetupAvailable(true);
      const rows = (res.data ?? []) as Array<{
        expo_push_token?: string | null;
        enabled?: boolean | null;
      }>;
      const active = rows.find((x) => x.enabled !== false) ?? rows[0] ?? null;
      setPushEnabled(Boolean(active && active.enabled !== false));
      const token = String(active?.expo_push_token ?? "").trim();
      setPushTokenPreview(token ? `${token.slice(0, 18)}...${token.slice(-8)}` : null);
      if (!rows.length) {
        setPushSetupMessage("Push通知は未登録です。成績通知をバックグラウンド受信するには有効化してください。");
      }
    } catch (e: any) {
      setPushSetupMessage(e?.message ?? "Push状態の取得に失敗しました");
    }
  }, [userId]);

  const registerExpoGrowthPush = useCallback(async () => {
    if (!userId || pushSetupBusy) return;
    setPushSetupBusy(true);
    setPushSetupMessage(null);
    try {
      let Notifications: any;
      let Device: any;
      let Constants: any;
      try {
        Notifications = require("expo-notifications");
        Device = require("expo-device");
        Constants = require("expo-constants");
      } catch {
        setPushSetupAvailable(false);
        throw new Error(
          "expo-notifications / expo-device / expo-constants が未導入です。`npx expo install expo-notifications expo-device expo-constants` を実行してください。"
        );
      }

      if (typeof Notifications?.setNotificationHandler === "function") {
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
          }),
        });
      }

      if (Device && Device.isDevice === false) {
        throw new Error("Push通知は実機でのみ有効化できます。");
      }

      const currentPerm = await Notifications.getPermissionsAsync();
      let finalStatus = currentPerm?.status ?? "undetermined";
      if (finalStatus !== "granted") {
        const requested = await Notifications.requestPermissionsAsync();
        finalStatus = requested?.status ?? finalStatus;
      }
      if (finalStatus !== "granted") {
        throw new Error("通知権限が許可されていません。設定アプリで通知を許可してください。");
      }

      const projectId =
        Constants?.easConfig?.projectId ||
        Constants?.expoConfig?.extra?.eas?.projectId ||
        undefined;
      const tokenRes = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync();
      const expoPushToken = String(tokenRes?.data ?? "").trim();
      if (!expoPushToken) {
        throw new Error("Expo Push Token の取得に失敗しました。");
      }

      const appVersion =
        String(
          Constants?.expoConfig?.version ??
            Constants?.manifest2?.extra?.expoClient?.version ??
            Constants?.manifest?.version ??
            ""
        ).trim() || null;

      const up = await supabase.from("user_push_devices").upsert(
        {
          user_id: userId,
          provider: "expo",
          expo_push_token: expoPushToken,
          platform: Platform.OS,
          enabled: true,
          permission_status: finalStatus,
          device_name:
            String(Device?.deviceName ?? Device?.modelName ?? "").trim() || null,
          app_version: appVersion,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "expo_push_token" }
      );
      if (up.error) {
        if (isMissingRelationError(up.error, "user_push_devices")) {
          setPushSetupAvailable(false);
          throw new Error(
            "Push通知DBが未適用です。`user_push_devices` migration 適用後に再度実行してください。"
          );
        }
        throw up.error;
      }

      setPushSetupAvailable(true);
      setPushEnabled(true);
      setPushTokenPreview(`${expoPushToken.slice(0, 18)}...${expoPushToken.slice(-8)}`);
      setPushSetupMessage("Push通知を有効化しました。成績通知をバックグラウンドでも受信できます。");
      void loadPushDeviceState();
    } catch (e: any) {
      setPushEnabled(false);
      setPushSetupMessage(e?.message ?? "Push通知の設定に失敗しました");
    } finally {
      setPushSetupBusy(false);
    }
  }, [loadPushDeviceState, pushSetupBusy, userId]);

  const disableExpoGrowthPush = useCallback(async () => {
    if (!userId || pushSetupBusy) return;
    setPushSetupBusy(true);
    setPushSetupMessage(null);
    try {
      const up = await supabase
        .from("user_push_devices")
        .update({ enabled: false, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("provider", "expo");
      if (up.error) {
        if (isMissingRelationError(up.error, "user_push_devices")) {
          setPushSetupAvailable(false);
          throw new Error("Push通知DBが未適用です。");
        }
        throw up.error;
      }
      setPushEnabled(false);
      setPushSetupMessage("Push通知をオフにしました。");
      void loadPushDeviceState();
    } catch (e: any) {
      setPushSetupMessage(e?.message ?? "Push通知の無効化に失敗しました");
    } finally {
      setPushSetupBusy(false);
    }
  }, [loadPushDeviceState, pushSetupBusy, userId]);

  const logPushOpenEvent = useCallback(
    async (payload: {
      pushJobId?: string | null;
      notificationId?: string | null;
      postId?: string | null;
      kind?: string | null;
    }) => {
      if (!userId) return;
      const kind = String(payload.kind ?? "__all__").trim() || "__all__";
      const jobId = String(payload.pushJobId ?? "").trim() || null;
      const notificationId = String(payload.notificationId ?? "").trim() || null;
      const postId = String(payload.postId ?? "").trim() || null;
      const createdAt = new Date().toISOString();
      const evIns = await supabase.from("push_delivery_events").insert({
        user_id: userId,
        job_id: jobId,
        notification_id: notificationId,
        post_id: postId,
        kind,
        provider: "expo",
        event_type: "open",
        status: "open",
        metadata: { source: "mobile_push_tap" },
        created_at: createdAt,
      });
      if (evIns.error) {
        if (isMissingRelationError(evIns.error, "push_delivery_events")) return;
        return;
      }
      await supabase.rpc("push_delivery_bump_daily_metrics", {
        p_user_id: userId,
        p_day: createdAt.slice(0, 10),
        p_kind: "__all__",
        p_open_delta: 1,
      });
      if (kind !== "__all__") {
        await supabase.rpc("push_delivery_bump_daily_metrics", {
          p_user_id: userId,
          p_day: createdAt.slice(0, 10),
          p_kind: kind,
          p_open_delta: 1,
        });
      }
    },
    [userId]
  );

  useEffect(() => {
    if (!userId) return;
    void loadPushDeviceState();
  }, [loadPushDeviceState, userId]);

  useEffect(() => {
    if (!userId || !pushEnabled) return;
    let Notifications: any;
    try {
      Notifications = require("expo-notifications");
    } catch {
      return;
    }

    if (!pushReceiveSubRef.current && typeof Notifications?.addNotificationReceivedListener === "function") {
      pushReceiveSubRef.current = Notifications.addNotificationReceivedListener((notification: any) => {
        const requestContent = notification?.request?.content ?? {};
        const data = requestContent?.data ?? {};
        const kind = String(data?.kind ?? requestContent?.data?.kind ?? "").trim();
        if (isCreatorGrowthNotificationKind(kind)) {
          const msg =
            String(requestContent?.title ?? "").trim() ||
            String(requestContent?.body ?? "").trim() ||
            growthNotificationPromptLabel(kind);
          if (msg) {
            Alert.alert("投稿の成績アップデート", msg);
          }
        }
      });
    }

    if (!pushResponseSubRef.current && typeof Notifications?.addNotificationResponseReceivedListener === "function") {
      pushResponseSubRef.current = Notifications.addNotificationResponseReceivedListener((response: any) => {
        const content = response?.notification?.request?.content ?? {};
        const data = content?.data ?? {};
        const postId = String(data?.post_id ?? data?.postId ?? "").trim();
        void logPushOpenEvent({
          pushJobId: data?.push_job_id ?? data?.pushJobId ?? null,
          notificationId: data?.notification_id ?? data?.notificationId ?? null,
          postId,
          kind: data?.kind ?? null,
        });
        if (postId) {
          void openPostDetail(postId, { source: "push_notification" });
          setTab("notifications");
        }
      });
    }

    return () => {
      try {
        pushReceiveSubRef.current?.remove?.();
      } catch {}
      try {
        pushResponseSubRef.current?.remove?.();
      } catch {}
      pushReceiveSubRef.current = null;
      pushResponseSubRef.current = null;
    };
  }, [logPushOpenEvent, openPostDetail, pushEnabled, userId]);

  const loadNotifications = useCallback(async () => {
    if (!userId) return;
    setNotificationsLoading(true);
    setNotificationsError(null);

    try {
      const result = await loadMobileNotifications({ userId, limit: 50 });
      const items = ((result.items ?? []) as NotificationItem[]).filter(
        (n) => !isBlockedAuthor(n.actor_id)
      );
      setNotifications(items);
    } catch (e: any) {
      setNotificationsError(e?.message ?? "通知の取得に失敗しました");
      setNotifications([]);
    } finally {
      setNotificationsLoading(false);
    }
  }, [isBlockedAuthor, userId]);

  const maybeShowCreatorGrowthAlert = useCallback(
    (n: NotificationItem) => {
      const id = String(n.id ?? "").trim();
      if (!id || creatorGrowthAlertShownRef.current.has(id)) return;
      if (!isCreatorGrowthNotificationKind(n.kind)) return;
      if (tab === "notifications") return;
      creatorGrowthAlertShownRef.current.add(id);
      Alert.alert(
        "投稿の成績アップデート",
        n.title || n.body || growthNotificationPromptLabel(n.kind)
      );
    },
    [tab]
  );

  const markNotificationsRead = useCallback(
    async (ids: string[]) => {
      if (!userId || notificationsBusy || ids.length === 0) return;
      setNotificationsBusy(true);
      try {
        const { error } = await supabase
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("user_id", userId)
          .in("id", ids);
        if (error) throw error;

        setNotifications((prev) =>
          prev.map((n) =>
            ids.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n
          )
        );
      } catch (e: any) {
        setNotificationsError(e?.message ?? "既読化に失敗しました");
      } finally {
        setNotificationsBusy(false);
      }
    },
    [notificationsBusy, userId]
  );

  const renderNotificationCard = useCallback(
    (n: NotificationItem) => (
      <View key={n.id} style={[styles.postCard, !n.read_at && styles.unreadCard]}>
        <View style={styles.postMetaRow}>
          <View
            style={[
              styles.kindChip,
              { backgroundColor: notificationMeta(n.kind).bg },
            ]}
          >
            <Text
              style={[
                styles.kindChipText,
                { color: notificationMeta(n.kind).fg },
              ]}
            >
              {notificationMeta(n.kind).label}
            </Text>
          </View>
          <Text style={styles.postMeta}>{formatRelativeTime(n.created_at)}</Text>
        </View>
        <Text style={styles.postText}>
          {n.title ||
            n.body ||
            `${n.actor_display || n.actor_handle || "だれか"}さん: ${
              notificationMeta(n.kind).fallbackText
            }`}
        </Text>
        <View style={styles.screenHeader}>
          <Text style={styles.postMeta}>{n.read_at ? "既読" : "未読"}</Text>
          <View style={styles.headerActions}>
            {n.post_id ? (
              <Pressable
                style={styles.outlineButton}
                onPress={() => {
                  if (!n.read_at) {
                    void markNotificationsRead([n.id]);
                  }
                  void openPostDetail(n.post_id as string, { source: "notification" });
                }}
              >
                <Text style={styles.outlineButtonText}>投稿を開く</Text>
              </Pressable>
            ) : null}
            {!n.read_at ? (
              <Pressable
                style={styles.outlineButton}
                onPress={() => void markNotificationsRead([n.id])}
                disabled={notificationsBusy}
              >
                <Text style={styles.outlineButtonText}>既読にする</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    ),
    [markNotificationsRead, notificationsBusy, openPostDetail]
  );

  const runSearch = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (!q) {
      setSearchItems([]);
      setSearchError(null);
      return;
    }

    setSearchLoading(true);
    setSearchError(null);
    try {
      const fromView = await supabase
        .from("v_posts_enriched")
        .select("*")
        .ilike("text", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(40);

      if (!fromView.error && fromView.data) {
        setSearchItems(filterBlockedSearchItems(fromView.data as SearchPost[]));
        return;
      }

      const fromPosts = await supabase
        .from("posts")
        .select("id,created_at,text,author,score")
        .ilike("text", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(40);

      if (fromPosts.error) throw fromPosts.error;
      setSearchItems(filterBlockedSearchItems((fromPosts.data ?? []) as SearchPost[]));
    } catch (e: any) {
      setSearchError(e?.message ?? "検索に失敗しました");
      setSearchItems([]);
    } finally {
      setSearchLoading(false);
    }
  }, [filterBlockedSearchItems]);

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    setProfileLoading(true);
    setProfileMessage(null);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("handle,display_name,bio")
        .eq("id", userId)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      const row = (data ?? null) as ProfileRow | null;
      setHandle(row?.handle ?? "");
      setDisplayName(row?.display_name ?? "");
      setBio(row?.bio ?? "");
    } catch (e: any) {
      setProfileMessage(e?.message ?? "プロフィール取得に失敗しました");
    } finally {
      setProfileLoading(false);
    }
  }, [userId]);

  async function derivePersonaRowsForUser(limit = 12) {
    if (!userId) return [] as PersonaScoreRow[];

    const postsRes = await supabase
      .from("posts")
      .select("id,created_at,analysis")
      .eq("author", userId)
      .order("created_at", { ascending: false })
      .limit(600);
    if (postsRes.error) throw postsRes.error;

    const posts = (postsRes.data ?? []) as Array<{
      id: string;
      created_at: string;
      analysis: any;
    }>;
    if (posts.length === 0) return [];

    const ids = posts.map((p) => p.id);
    const scoreRes = await supabase
      .from("post_scores")
      .select("post_id,persona_key,final_score")
      .in("post_id", ids)
      .limit(30000);
    const scoreRows = (scoreRes.data ??
      []) as Array<{ post_id: string; persona_key: string; final_score: number | null }>;

    return derivePersonaRowsFromSignalsLocal({
      posts,
      scoreRows: scoreRes.error ? [] : scoreRows,
      limit,
    });
  }

  async function persistPersonaRows(rows: PersonaScoreRow[]) {
    if (!userId || rows.length === 0) {
      return {
        persisted: false,
        error: null as string | null,
      };
    }

    const nowIso = new Date().toISOString();
    const version = Math.floor(Date.now() / 1000);
    const rowsWithVersion = rows.map((r) => ({
      user_id: userId,
      persona_key: r.persona_key,
      score: normalize01(r.score),
      confidence: normalize01(r.confidence),
      updated_at: nowIso,
      version,
    }));
    const rowsWithoutVersion = rowsWithVersion.map(({ version: _v, ...rest }) => rest);

    const del = await supabase.from("user_personas").delete().eq("user_id", userId);
    if (del.error) {
      return {
        persisted: false,
        error: del.error.message ?? "user_personas の削除に失敗しました",
      };
    }

    let ins = await supabase.from("user_personas").insert(rowsWithVersion);
    if (ins.error && isMissingVersionColumnError(ins.error)) {
      ins = await supabase.from("user_personas").insert(rowsWithoutVersion);
    }
    if (ins.error) {
      return {
        persisted: false,
        error: ins.error.message ?? "user_personas の保存に失敗しました",
      };
    }
    return {
      persisted: true,
      error: null as string | null,
    };
  }

  const loadPersonaData = useCallback(async () => {
    if (!userId) return;

    setPersonaLoading(true);
    setPersonaError(null);
    setSoulmateError(null);
    try {
      const personasRes = await supabase
        .from("user_personas")
        .select("persona_key,score,confidence")
        .eq("user_id", userId)
        .order("score", { ascending: false })
        .limit(12);
      const queryWarning = personasRes.error
        ? `user_personas の取得に失敗したため投稿履歴で推定します: ${personasRes.error.message}`
        : null;

      let baseRows = (personasRes.error ? [] : personasRes.data ?? []) as PersonaScoreRow[];
      let warningMessage: string | null = queryWarning;

      if (baseRows.length === 0) {
        const derived = await derivePersonaRowsForUser(12);
        if (derived.length > 0) {
          baseRows = derived;
          const persisted = await persistPersonaRows(derived);
          if (!persisted.persisted) {
            warningMessage = persisted.error
              ? `投稿履歴からキャラを推定しました（DB保存失敗: ${persisted.error}）`
              : "投稿履歴からキャラを推定しました（DB保存は未反映）";
          }
        }
      }

      const keys = Array.from(new Set(baseRows.map((r) => r.persona_key).filter(Boolean)));

      let defsMap = new Map<string, PersonaDefRow>();
      if (keys.length > 0) {
        const defsRes = await supabase
          .from("persona_archetype_defs")
          .select("key,title,theme")
          .in("key", keys);
        if (!defsRes.error && defsRes.data) {
          defsMap = new Map(
            ((defsRes.data ?? []) as PersonaDefRow[]).map((d) => [d.key, d])
          );
        }
      }

      setPersonaRows(
        baseRows.map((r) => ({
          ...r,
          title: defsMap.get(r.persona_key)?.title ?? r.persona_key,
          theme: defsMap.get(r.persona_key)?.theme ?? null,
        }))
      );
      if (warningMessage) {
        setPersonaError(warningMessage);
      }
      setDialogueSourceKey((prev) => prev || baseRows[0]?.persona_key || "");

      const dominantKey = baseRows[0]?.persona_key ?? null;
      if (!dominantKey) {
        setDominantPersonaTitle(null);
        setDominantTalkStyle(null);
      } else {
        const dominantTitle = defsMap.get(dominantKey)?.title ?? dominantKey;
        setDominantPersonaTitle(dominantTitle);

        const talkRes = await supabase
          .from("persona_defs")
          .select("talk_style,title")
          .eq("key", dominantKey)
          .maybeSingle();
        if (!talkRes.error && talkRes.data) {
          setDominantPersonaTitle(talkRes.data.title ?? dominantTitle);
          setDominantTalkStyle(talkRes.data.talk_style ?? null);
        } else {
          setDominantTalkStyle(null);
        }
      }

      const soulmateRes = await supabase.rpc("recommend_soulmates", {
        p_user_id: userId,
        p_limit: 8,
        p_offset: 0,
      });

      if (soulmateRes.error) {
        setSoulmates([]);
        setSoulmateError("ソウルメイト候補はまだ取得できません。");
      } else {
        const rows = (soulmateRes.data ?? []) as SoulmateRow[];
        if (rows.length === 0) {
          setSoulmates([]);
        } else {
          const targetIds = Array.from(
            new Set(rows.map((r) => r.target_user_id).filter(Boolean))
          );
          const personaKeys = Array.from(
            new Set(rows.map((r) => r.target_persona_key).filter(Boolean))
          );

          const [profilesRes, defsRes] = await Promise.all([
            supabase
              .from("profiles")
              .select("id,handle,display_name")
              .in("id", targetIds),
            supabase
              .from("persona_defs")
              .select("key,title")
              .in("key", personaKeys),
          ]);

          const profileMap = new Map<string, { handle: string | null; display_name: string | null }>();
          (profilesRes.data ?? []).forEach((p: any) => {
            profileMap.set(p.id, {
              handle: p.handle ?? null,
              display_name: p.display_name ?? null,
            });
          });

          const defMap = new Map<string, string>();
          (defsRes.data ?? []).forEach((d: any) => {
            defMap.set(d.key, d.title ?? d.key);
          });

          setSoulmates(
            rows.map((r) => {
              const prof = profileMap.get(r.target_user_id);
              return {
                user_id: r.target_user_id,
                handle: prof?.handle ?? null,
                display_name: prof?.display_name ?? null,
                persona_key: r.target_persona_key,
                persona_title:
                  defMap.get(r.target_persona_key) ?? r.target_persona_key,
                percent: toPercent01(r.romance_score),
                relation_label: r.relation_label ?? null,
              };
            })
          );
        }
      }
    } catch (e: any) {
      setPersonaError(e?.message ?? "キャラ情報の取得に失敗しました");
      setPersonaRows([]);
      setSoulmates([]);
      setSoulmateError(null);
      setDominantPersonaTitle(null);
      setDominantTalkStyle(null);
    } finally {
      setPersonaLoading(false);
    }
  }, [userId]);

  const loadPersonaInsights = useCallback(async () => {
    if (!userId) return;
    setPersonaInsightLoading(true);
    setPersonaInsightError(null);

    try {
      const postsRes = await supabase
        .from("posts")
        .select("id,created_at,analysis")
        .eq("author", userId)
        .order("created_at", { ascending: false })
        .limit(500);
      const posts = (postsRes.data ?? []) as Array<{
        id: string;
        created_at: string;
        analysis: any;
      }>;

      if (!posts.length) {
        setPersonaInsight(null);
        return;
      }

      const ids = posts.map((p) => p.id);
      const scoreRes = await supabase
        .from("post_scores")
        .select("post_id,persona_key,final_score")
        .in("post_id", ids)
        .limit(20000);

      const topByPost = new Map<string, { key: string; score: number }>();
      (scoreRes.data ?? []).forEach((r: any) => {
        if (!r?.post_id || !r?.persona_key) return;
        const s = normalize01(r.final_score);
        const cur = topByPost.get(r.post_id);
        if (!cur || s > cur.score) {
          topByPost.set(r.post_id, { key: r.persona_key, score: s });
        }
      });

      const rows: Array<{ created_at: string; key: string }> = [];
      posts.forEach((p) => {
        const key =
          topByPost.get(p.id)?.key ??
          p.analysis?.persona?.selected ??
          p.analysis?.persona?.candidates?.[0]?.key ??
          null;
        if (!key) return;
        rows.push({ created_at: p.created_at, key });
      });

      if (!rows.length) {
        setPersonaInsight(null);
        return;
      }

      const countMap = new Map<string, number>();
      rows.forEach((r) => {
        countMap.set(r.key, (countMap.get(r.key) ?? 0) + 1);
      });
      const dominant = Array.from(countMap.entries()).sort((a, b) => b[1] - a[1])[0];
      const dominantKey = dominant?.[0] ?? null;

      const now = new Date();
      const startCurrent = new Date(now);
      startCurrent.setDate(now.getDate() - 6);
      startCurrent.setHours(0, 0, 0, 0);
      const startPrev = new Date(startCurrent);
      startPrev.setDate(startCurrent.getDate() - 7);

      let count7d = 0;
      let countPrev7d = 0;
      rows.forEach((r) => {
        if (!dominantKey || r.key !== dominantKey) return;
        const ts = new Date(r.created_at);
        if (ts >= startCurrent) count7d += 1;
        else if (ts >= startPrev) countPrev7d += 1;
      });

      const perDay = new Map<string, Map<string, number>>();
      rows.forEach((r) => {
        const day = toDayKey(r.created_at);
        if (!perDay.has(day)) perDay.set(day, new Map());
        const m = perDay.get(day)!;
        m.set(r.key, (m.get(r.key) ?? 0) + 1);
      });
      const daySeries = Array.from(perDay.entries())
        .map(([day, m]) => {
          const top = Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0];
          return {
            day,
            top_key: top?.[0] ?? "unknown",
          };
        })
        .sort((a, b) => a.day.localeCompare(b.day));

      let streakDays = 0;
      if (dominantKey) {
        for (let i = daySeries.length - 1; i >= 0; i -= 1) {
          if (daySeries[i].top_key !== dominantKey) break;
          streakDays += 1;
        }
      }

      const topPersonas = Array.from(countMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([key, count]) => ({
          key,
          count,
          share: count / Math.max(1, rows.length),
        }));

      const titles = await resolvePersonaTitles([
        dominantKey ?? "",
        ...topPersonas.map((x) => x.key),
      ]);

      setPersonaInsight({
        dominantKey,
        dominantTitle: dominantKey ? titles[dominantKey] ?? dominantKey : null,
        streakDays,
        count7d,
        countPrev7d,
        momentumDelta: count7d - countPrev7d,
        trend:
          count7d - countPrev7d >= 3
            ? "up"
            : count7d - countPrev7d <= -3
            ? "down"
            : "stable",
        topPersonas: topPersonas.map((x) => ({
          ...x,
          title: titles[x.key] ?? x.key,
        })),
      });
    } catch (e: any) {
      setPersonaInsightError(e?.message ?? "キャラインサイト取得に失敗しました");
      setPersonaInsight(null);
    } finally {
      setPersonaInsightLoading(false);
    }
  }, [resolvePersonaTitles, userId]);

  const recomputePersona = useCallback(async () => {
    if (!userId || recomputeBusy) return;
    setRecomputeBusy(true);
    setPersonaError(null);
    try {
      const rpc = await supabase.rpc("assign_top_persona", { p_user: userId });
      if (rpc.error) {
        const derived = await derivePersonaRowsForUser(12);
        if (derived.length === 0) {
          throw new Error(
            rpc.error.message ??
              "キャラ再評価に失敗しました（投稿履歴が不足している可能性があります）"
          );
        }
        const persisted = await persistPersonaRows(derived);
        if (!persisted.persisted) {
          setPersonaError(
            persisted.error
              ? `RPC失敗のため投稿履歴で再計算しましたがDB保存に失敗しました: ${persisted.error}`
              : "RPC失敗のため投稿履歴で再計算しました（DB保存は未反映）"
          );
        }
      }
      await loadPersonaData();
    } catch (e: any) {
      setPersonaError(e?.message ?? "キャラ再評価に失敗しました");
    } finally {
      setRecomputeBusy(false);
    }
  }, [loadPersonaData, recomputeBusy, userId]);

  const loadDailyPrompt = useCallback(async () => {
    setPromptLoading(true);
    setPromptError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const r = await supabase
        .from("prompts_of_day")
        .select("*")
        .eq("date", today)
        .maybeSingle();

      if (r.error && r.error.code !== "PGRST116") {
        throw r.error;
      }
      setDailyPrompt((r.data as PromptOfDayRow | null) ?? null);
    } catch (e: any) {
      setPromptError(e?.message ?? "今日のお題の取得に失敗しました");
      setDailyPrompt(null);
    } finally {
      setPromptLoading(false);
    }
  }, []);

  const submitReply = useCallback(async () => {
    if (!userId || !detailPost || replying) return;
    const body = replyText.trim();
    if (!body) return;

    setReplying(true);
    setDetailError(null);
    try {
      const viaRpc = await supabase.rpc("create_reply", {
        parent: detailPost.id,
        body,
      });

      if (viaRpc.error) {
        const fallback = await supabase.from("posts").insert({
          author: userId,
          parent_id: detailPost.id,
          text: body,
          score: computeLieScore({ text: body }),
          analysis: {
            persona: {
              selected: detailPersonaMatch?.key ?? null,
              source: "mobile_reply",
            },
          },
        });
        if (fallback.error) throw fallback.error;
      }

      if (detailPersonaMatch?.key) {
        void logPersonaFeedFeedback({
          postId: detailPost.id,
          personaKey: detailPersonaMatch.key,
          basePersona: personaFeedBasePersona,
          reason: detailPersonaMatch.reason ?? null,
          event: "reply",
        });
      }

      setReplyText("");
      await loadPostDetail(detailPost.id);

      if (tab === "timeline") await loadFeed();
      if (tab === "following") await loadFollowingFeed();
      if (tab === "notifications") await loadNotifications();
    } catch (e: any) {
      setDetailError(e?.message ?? "返信の投稿に失敗しました");
    } finally {
      setReplying(false);
    }
  }, [
    detailPersonaMatch,
    detailPost,
    loadFeed,
    loadFollowingFeed,
    loadNotifications,
    loadPostDetail,
    logPersonaFeedFeedback,
    personaFeedBasePersona,
    replying,
    replyText,
    tab,
    userId,
  ]);

  useEffect(() => {
    let alive = true;
    const applyUser = (user: any | null | undefined) => {
      setAccountEmail(String(user?.email ?? ""));
      setAccountEmailConfirmedAt(
        typeof user?.email_confirmed_at === "string" ? user.email_confirmed_at : null
      );
      setAccountLastSignInAt(
        typeof user?.last_sign_in_at === "string" ? user.last_sign_in_at : null
      );
      setAccountCreatedAt(typeof user?.created_at === "string" ? user.created_at : null);
    };

    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      setUserId(data.user?.id ?? null);
      applyUser(data.user);
      setAuthLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setUserId(session?.user?.id ?? null);
      applyUser(session?.user ?? null);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authCooldownUntil) return;
    if (authCooldownUntil <= Date.now()) {
      setAuthCooldownUntil(null);
      return;
    }
    const timer = setInterval(() => {
      if (authCooldownUntil <= Date.now()) {
        setAuthCooldownUntil(null);
      } else {
        setAuthCooldownTick((prev) => prev + 1);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [authCooldownUntil]);

  useEffect(() => {
    if (!feedLoading) return;
    const timer = setTimeout(() => {
      feedLoadInFlightRef.current = false;
      setFeedLoading(false);
      setFeedError((prev) => prev ?? "タイムライン取得が長引いています。再読込してください。");
    }, 15_000);
    return () => clearTimeout(timer);
  }, [feedLoading]);

  useEffect(() => {
    if (!userId) {
      if (loggedOutResetAppliedRef.current) return;
      loggedOutResetAppliedRef.current = true;
      userBootstrapLoadedRef.current = null;
      feedLoadInFlightRef.current = false;
      if (pushReceiveSubRef.current) {
        try {
          pushReceiveSubRef.current.remove?.();
        } catch {}
        pushReceiveSubRef.current = null;
      }
      if (pushResponseSubRef.current) {
        try {
          pushResponseSubRef.current.remove?.();
        } catch {}
        pushResponseSubRef.current = null;
      }
      setFeed([]);
      setFeedError(null);
      setFollowingFeed([]);
      setFollowingError(null);
      setSavedFeed([]);
      setSavedFeedLoading(false);
      setSavedFeedError(null);
      setSavedFeedOffset(0);
      setSavedFeedHasMore(true);
      setSavedCollections([]);
      setSavedCollectionKey("all");
      setSavedCollectionsAvailable(true);
      setPersonaFeedItems([]);
      setPersonaFeedError(null);
      setPersonaFeedOffset(0);
      setPersonaFeedHasMore(true);
      setPersonaFeedBasePersona(null);
      setPersonaFeedUsedPersonas([]);
      setPersonaFeedBuddyLearningMode(DEFAULT_BUDDY_LEARNING_MODE);
      setPersonaFeedBuddyLearningModeAvailable(false);
      setPersonaFeedBuddyLearningModeSource("default");
      setPersonaFeedBuddyLearningModeAb(null);
      setPersonaFeedBuddyMissionCounts({});
      setPersonaFeedBuddyMissionStreaks({});
      setPersonaFeedBuddyMissionProgressAvailable(false);
      setPersonaFeedBuddyMissionXpAvailable(false);
      setPersonaFeedBuddyMissionXpByBuddy({});
      setPersonaFeedBuddyMissionRewriteSeed("");
      setPersonaFeedRewriteLearningByStyle({});
      setPersonaFeedRewriteLearningAvailable(false);
      setPersonaFeedRewriteLearningSource("default");
      setPersonaFeedRewriteLearningContextLabel("");
      setPersonaFeedBuddyPersonas([]);
      personaFeedSeenAtRef.current.clear();
      personaFeedActionedRef.current.clear();
      personaFeedSkipSentRef.current.clear();
      personaFeedMissionOpenedRef.current.clear();
      setEvolutionSnapshots([]);
      setEvolutionTitles({});
      setEvolutionSource("");
      setEvolutionError(null);
      setComposeText("");
      setComposeLastPostedResult(null);
      setComposeLastPostedResultLoading(false);
      setComposeLastPostedResultError(null);
      setComposePersonaCandidates([]);
      setComposePersonaSelected(null);
      setComposeMissionRewriteAttribution(null);
      setDailyPrompt(null);
      setPromptError(null);
      setSearchQuery("");
      setSecurityMessage(null);
      setSecurityBusyKey(null);
      setSecurityNewPassword("");
      setSecurityConfirmPassword("");
      setAccountEmail("");
      setAccountEmailConfirmedAt(null);
      setAccountLastSignInAt(null);
      setAccountCreatedAt(null);
      setSearchItems([]);
      setSearchError(null);
      setNotifications([]);
      setNotificationsError(null);
      setNotificationFilter("all");
      setPushSetupBusy(false);
      setPushSetupMessage(null);
      setPushSetupAvailable(true);
      setPushEnabled(false);
      setPushTokenPreview(null);
      creatorGrowthAlertShownRef.current.clear();
      composeGrowthAlertCheckpointRef.current.clear();
      setDetailVisible(false);
      setDetailPost(null);
      setDetailReplies([]);
      setPostSaveStateById({});
      setDetailError(null);
      setDetailSaveBusy(false);
      setDetailSaved(false);
      setDetailSaveCount(0);
      setDetailSaveCollectionKey("saved");
      setDetailSaveCollectionLabel("保存");
      setDetailSaveCollectionAvailable(false);
      setDetailSequenceIds([]);
      setDetailSequenceIndex(0);
      setReplyText("");
      setDetailPersonaMatch(null);
      setFormatRailViewerVisible(false);
      setFormatRailViewerSource("");
      setFormatRailViewerItems([]);
      setFormatRailViewerIndex(0);
      setOpenedPostIds([]);
      feedItemsRef.current = [];
      followingFeedItemsRef.current = [];
      savedFeedItemsRef.current = [];
      notificationsRef.current = [];
      personaFeedItemsRef.current = [];
      openedPostStateRequestedRef.current.clear();
      openedPostStatePersistedRef.current.clear();
      openedPostStateEnabledRef.current = true;
      setPersonaRows([]);
      setPersonaError(null);
      setPersonaInsight(null);
      setPersonaInsightError(null);
      setPersonaQuests([]);
      setQuestXp(0);
      setSoulmates([]);
      setSoulmateError(null);
      setDominantPersonaTitle(null);
      setDominantTalkStyle(null);
      setPersonaDefs([]);
      setPersonaCatalogImageErrors({});
      setDialogueSourceKey("");
      setDialogueTargetKey("");
      setDialogueCompatItems([]);
      setDialogueCompatError(null);
      setDialogueContext("");
      setDialogueReplyToText("");
      setDialogueResult(null);
      setDialogueError(null);
      setHandle("");
      setDisplayName("");
      setBio("");
      setBlockedUsers([]);
      setModerationMessage(null);
      setModerationBusy(false);
      setAccountDeleteBusy(false);
      devUiSmokeRunningRef.current = false;
      devUiSmokeCompletedUserRef.current = null;
      setDevUiSmokeStatus(null);
      setDevUiSmokeHistory([]);
      return;
    }
    if (userBootstrapLoadedRef.current === userId) return;
    userBootstrapLoadedRef.current = userId;
    loggedOutResetAppliedRef.current = false;
    devUiSmokeRunningRef.current = false;
    void loadFeed();
    void loadPersonaData();
    void loadDailyPrompt();
    void loadPersonaDefs();
    void loadBlockedUsers();
  }, [userId, loadBlockedUsers, loadDailyPrompt, loadFeed, loadPersonaData, loadPersonaDefs]);

  useEffect(() => {
    return () => {
      try {
        pushReceiveSubRef.current?.remove?.();
      } catch {}
      try {
        pushResponseSubRef.current?.remove?.();
      } catch {}
      pushReceiveSubRef.current = null;
      pushResponseSubRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    void loadPersonaInsights();
  }, [userId, loadPersonaInsights]);

  useEffect(() => {
    if (!userId || feed.length === 0) return;
    void hydrateOpenedPostState(feed.map((x) => x.id));
  }, [feed, hydrateOpenedPostState, userId]);

  useEffect(() => {
    if (!userId || followingFeed.length === 0) return;
    void hydrateOpenedPostState(followingFeed.map((x) => x.id));
  }, [followingFeed, hydrateOpenedPostState, userId]);

  useEffect(() => {
    if (!userId || savedFeed.length === 0) return;
    void hydrateOpenedPostState(savedFeed.map((x) => x.id));
  }, [hydrateOpenedPostState, savedFeed, userId]);

  useEffect(() => {
    if (!userId || personaFeedItems.length === 0) return;
    void hydrateOpenedPostState(personaFeedItems.map((x) => x.id));
  }, [hydrateOpenedPostState, personaFeedItems, userId]);

  useEffect(() => {
    if (!userId || searchItems.length === 0) return;
    void hydrateOpenedPostState(searchItems.map((x) => x.id));
  }, [hydrateOpenedPostState, searchItems, userId]);

  useEffect(() => {
    if (!userId || filteredNotifications.length === 0) return;
    const postIds = filteredNotifications
      .map((x) => String(x.post_id ?? "").trim())
      .filter((x) => x.length > 0);
    if (postIds.length === 0) return;
    void hydrateOpenedPostState(postIds);
  }, [filteredNotifications, hydrateOpenedPostState, userId]);

  useEffect(() => {
    feedItemsRef.current = feed;
  }, [feed]);

  useEffect(() => {
    followingFeedItemsRef.current = followingFeed;
  }, [followingFeed]);

  useEffect(() => {
    savedFeedItemsRef.current = savedFeed;
  }, [savedFeed]);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  useEffect(() => {
    personaFeedItemsRef.current = personaFeedItems;
  }, [personaFeedItems]);

  useEffect(() => {
    detailVisibleRef.current = detailVisible;
  }, [detailVisible]);

  useEffect(() => {
    if (tab === "following" && userId) {
      void loadFollowingFeed();
    }
  }, [tab, userId, loadFollowingFeed]);

  useEffect(() => {
    if (tab === "saved" && userId) {
      void loadSavedFeed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedCollectionKey, tab, userId]);

  useEffect(() => {
    if (tab === "personaFeed" && userId) {
      if (personaFeedItems.length === 0) {
        void loadPersonaFeed(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaFeedItems.length, tab, userId]);

  useEffect(() => {
    if (tab !== "personaFeed") {
      flushPersonaFeedSkips();
    }
  }, [flushPersonaFeedSkips, tab]);

  useEffect(() => {
    if (!userId) return;
    flushPersonaFeedSkips();
    setPersonaFeedOffset(0);
    setPersonaFeedItems([]);
    setPersonaFeedHasMore(true);
    setPersonaFeedBuddyPersonas([]);
    personaFeedSeenAtRef.current.clear();
    personaFeedActionedRef.current.clear();
    personaFeedSkipSentRef.current.clear();
    if (tab === "personaFeed") {
      void loadPersonaFeed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaFeedStrategy, tab, userId]);

  useEffect(() => {
    return () => {
      flushPersonaFeedSkips();
    };
  }, [flushPersonaFeedSkips]);

  useEffect(() => {
    if (tab === "evolution" && userId) {
      void loadPersonaEvolution();
    }
  }, [loadPersonaEvolution, tab, userId]);

  useEffect(() => {
    if (tab === "notifications" && userId) {
      void loadNotifications();
    }
  }, [tab, userId, loadNotifications]);

  useEffect(() => {
    if (tab === "persona" && userId) {
      void loadPersonaData();
      void loadPersonaInsights();
    }
  }, [tab, userId, loadPersonaData, loadPersonaInsights]);

  useEffect(() => {
    if (tab === "personaCatalog") {
      if (personaCatalogDefs.length === 0) {
        void loadPersonaCatalogDefs();
      }
    }
  }, [loadPersonaCatalogDefs, personaCatalogDefs.length, tab]);

  useEffect(() => {
    setPersonaQuests(localPersonaQuests);
    setQuestXp(
      localPersonaQuests.filter((q) => q.completed).reduce((acc, q) => acc + q.xp, 0)
    );
  }, [localPersonaQuests]);

  useEffect(() => {
    if (!userId || personaRows.length === 0) return;
    setDialogueSourceKey((prev) => prev || personaRows[0].persona_key);
  }, [personaRows, userId]);

  useEffect(() => {
    if (!dialogueSourceKey) return;
    void loadDialogueCompat();
  }, [dialogueMode, dialogueSourceKey, loadDialogueCompat]);

  useEffect(() => {
    if (tab === "profile" && userId) {
      void loadProfile();
      void loadBlockedUsers();
    }
  }, [tab, userId, loadBlockedUsers, loadProfile]);

  useEffect(() => {
    if (!composeText.trim() || personaDefs.length === 0) {
      setComposePersonaCandidates([]);
      setComposePersonaSelected((prev) =>
        prev && personaDefs.some((x) => x.key === prev) ? prev : null
      );
      return;
    }
    const items = suggestPersonasFromText(personaDefs, composeText, 6);
    setComposePersonaCandidates(items);
    if (items.length === 0) {
      setComposePersonaSelected(null);
      return;
    }
    setComposePersonaSelected((prev) =>
      prev && items.some((x) => x.key === prev) ? prev : items[0].key
    );
  }, [composeText, personaDefs]);

  useEffect(() => {
    if (!composePersonaSelected) {
      setComposeCompatItems([]);
      setComposeCompatError(null);
      setComposeCompatLoading(false);
      return;
    }
    void loadComposeCompat(composePersonaSelected);
  }, [composePersonaSelected, loadComposeCompat]);

  useEffect(() => {
    if (composeBlendSecondaryOptions.length === 0) {
      setComposeBlendSecondaryKey("");
      return;
    }
    if (
      composeBlendSecondaryKey &&
      composeBlendSecondaryOptions.some((x) => x.key === composeBlendSecondaryKey)
    ) {
      return;
    }
    setComposeBlendSecondaryKey(composeBlendSecondaryOptions[0].key);
  }, [composeBlendSecondaryKey, composeBlendSecondaryOptions]);

  useEffect(() => {
    if (!userId || tab !== "compose") {
      setComposeBuzzCalibration(null);
      return;
    }
    let stop = false;
    (async () => {
      const snapshot = await loadPersonaBuzzCalibration();
      if (stop) return;
      const key = composePersonaSelected || GLOBAL_BUZZ_PERSONA_KEY;
      const stat =
        snapshot.byPersona.get(key) ??
        snapshot.byPersona.get(GLOBAL_BUZZ_PERSONA_KEY) ??
        snapshot.global;
      setComposeBuzzCalibration(stat);
    })();
    return () => {
      stop = true;
    };
  }, [composePersonaSelected, loadPersonaBuzzCalibration, tab, userId]);

  useEffect(() => {
    if (tab !== "search") return;

    const timer = setTimeout(() => {
      void runSearch(searchQuery);
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [runSearch, searchQuery, tab]);

  useEffect(() => {
    setFeed((prev) => filterBlockedFeedItems(prev));
    setFollowingFeed((prev) => filterBlockedFeedItems(prev));
    setPersonaFeedItems((prev) => filterBlockedFeedItems(prev));
    setSearchItems((prev) => filterBlockedSearchItems(prev));
    setDetailReplies((prev) => filterBlockedDetailItems(prev));
    setNotifications((prev) => prev.filter((n) => !isBlockedAuthor(n.actor_id)));
    setDetailPost((prev) =>
      prev && isBlockedAuthor(prev.author) ? null : prev
    );
  }, [
    filterBlockedDetailItems,
    filterBlockedFeedItems,
    filterBlockedSearchItems,
    isBlockedAuthor,
  ]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`mobile-notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload: any) => {
          const eventType = String(payload?.eventType ?? "").toUpperCase();
          if (eventType === "INSERT" && payload?.new) {
            const next = payload.new as NotificationItem;
            if (!isBlockedAuthor(next.actor_id)) {
              setNotifications((prev) => {
                const merged = [next, ...prev.filter((x) => x.id !== next.id)];
                return merged.slice(0, 80);
              });
              maybeShowCreatorGrowthAlert(next);
            }
          } else if (eventType === "UPDATE" && payload?.new) {
            const next = payload.new as NotificationItem;
            setNotifications((prev) => prev.map((x) => (x.id === next.id ? { ...x, ...next } : x)));
          } else if (eventType === "DELETE" && payload?.old?.id) {
            const id = String(payload.old.id);
            setNotifications((prev) => prev.filter((x) => x.id !== id));
          }
          if (tab === "notifications") {
            void loadNotifications();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isBlockedAuthor, loadNotifications, maybeShowCreatorGrowthAlert, tab, userId]);

  const applyAuthUserSummary = useCallback((user: any | null | undefined) => {
    setAccountEmail(String(user?.email ?? ""));
    setAccountEmailConfirmedAt(
      typeof user?.email_confirmed_at === "string" ? user.email_confirmed_at : null
    );
    setAccountLastSignInAt(
      typeof user?.last_sign_in_at === "string" ? user.last_sign_in_at : null
    );
    setAccountCreatedAt(typeof user?.created_at === "string" ? user.created_at : null);
  }, []);

  const refreshAuthUserSummary = useCallback(async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    applyAuthUserSummary(data.user);
    return data.user ?? null;
  }, [applyAuthUserSummary]);

  const onAuthSubmit = useCallback(async () => {
    if (authBusy) return;
    if (authCooldownSeconds > 0) {
      setAuthMessage(`試行回数が多いため、${authCooldownSeconds}秒後に再度お試しください。`);
      return;
    }
    const e = email.trim();
    if (!e || !password) {
      setAuthMessage("メールアドレスとパスワードを入力してください。");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      setAuthMessage("メールアドレスの形式を確認してください。");
      return;
    }
    if (authMode === "signup") {
      if (password.length < 8) {
        setAuthMessage("パスワードは8文字以上にしてください。");
        return;
      }
      if (password !== authConfirmPassword) {
        setAuthMessage("確認用パスワードが一致しません。");
        return;
      }
    }

    setAuthBusy(true);
    setAuthMessage(null);

    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: e,
          password,
        });
        if (error) throw error;
        setAuthFailedCount(0);
        setAuthCooldownUntil(null);
        if (data.session) {
          applyAuthUserSummary(data.session.user);
          setAuthMessage(null);
        } else {
          setAuthMessage("確認メールを送信しました。認証後にログインしてください。");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: e,
          password,
        });
        if (error) throw error;
        setAuthFailedCount(0);
        setAuthCooldownUntil(null);
        void refreshAuthUserSummary().catch(() => null);
        setAuthMessage(null);
      }
    } catch (err: any) {
      const nextFailed = authFailedCount + 1;
      setAuthFailedCount(nextFailed);
      if (nextFailed >= 5) {
        setAuthCooldownUntil(Date.now() + 30_000);
      }
      setAuthMessage(err?.message ?? "認証に失敗しました");
    } finally {
      setAuthBusy(false);
    }
  }, [
    applyAuthUserSummary,
    authBusy,
    authConfirmPassword,
    authCooldownSeconds,
    authFailedCount,
    authMode,
    email,
    password,
    refreshAuthUserSummary,
  ]);

  const onRequestAuthPasswordReset = useCallback(async () => {
    const e = email.trim();
    if (!e) {
      setAuthMessage("メールアドレスを入力してください。");
      return;
    }
    setAuthBusy(true);
    try {
      const redirectTo = webBaseUrl ? `${webBaseUrl}/auth/reset` : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(
        e,
        redirectTo ? { redirectTo } : undefined
      );
      if (error) throw error;
      setAuthMessage("パスワード再設定メールを送信しました。");
    } catch (err: any) {
      setAuthMessage(err?.message ?? "パスワード再設定メールの送信に失敗しました");
    } finally {
      setAuthBusy(false);
    }
  }, [email, webBaseUrl]);

  const onDevQuickLogin = useCallback(async () => {
    if (!devQuickLoginAvailable || authBusy) return;
    if (authCooldownSeconds > 0) {
      setAuthMessage(`試行回数が多いため、${authCooldownSeconds}秒後に再度お試しください。`);
      return;
    }
    setAuthMode("signin");
    setEmail(devQuickLoginEmail);
    setPassword(devQuickLoginPassword);
    setAuthBusy(true);
    setAuthMessage(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: devQuickLoginEmail,
        password: devQuickLoginPassword,
      });
      if (error) throw error;
      setAuthFailedCount(0);
      setAuthCooldownUntil(null);
      void refreshAuthUserSummary().catch(() => null);
      setAuthMessage(null);
    } catch (err: any) {
      const nextFailed = authFailedCount + 1;
      setAuthFailedCount(nextFailed);
      if (nextFailed >= 5) {
        setAuthCooldownUntil(Date.now() + 30_000);
      }
      setAuthMessage(err?.message ?? "DEVクイックログインに失敗しました");
    } finally {
      setAuthBusy(false);
    }
  }, [
    authBusy,
    authCooldownSeconds,
    authFailedCount,
    devQuickLoginAvailable,
    devQuickLoginEmail,
    devQuickLoginPassword,
    refreshAuthUserSummary,
  ]);

  const onSignOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert("ログアウト失敗", error.message);
      return;
    }
    setTab("timeline");
  }, []);

  useEffect(() => {
    if (!devAutoLoginEnabled || !devQuickLoginAvailable) return;
    if (authLoading || authBusy || userId) return;
    if (devAutoLoginAttemptedRef.current) return;
    devAutoLoginAttemptedRef.current = true;
    void onDevQuickLogin();
  }, [authBusy, authLoading, devAutoLoginEnabled, devQuickLoginAvailable, onDevQuickLogin, userId]);

  const onChangePasswordInProfile = useCallback(async () => {
    if (securityBusyKey) return;
    const nextPassword = securityNewPassword.trim();
    setSecurityMessage(null);
    if (nextPassword.length < 8) {
      setSecurityMessage("新しいパスワードは8文字以上にしてください。");
      return;
    }
    if (nextPassword !== securityConfirmPassword) {
      setSecurityMessage("確認用パスワードが一致しません。");
      return;
    }
    setSecurityBusyKey("password");
    try {
      const { error } = await supabase.auth.updateUser({ password: nextPassword });
      if (error) throw error;
      setSecurityNewPassword("");
      setSecurityConfirmPassword("");
      setSecurityMessage("パスワードを更新しました。");
      void refreshAuthUserSummary().catch(() => null);
    } catch (e: any) {
      setSecurityMessage(e?.message ?? "パスワード更新に失敗しました");
    } finally {
      setSecurityBusyKey(null);
    }
  }, [
    refreshAuthUserSummary,
    securityBusyKey,
    securityConfirmPassword,
    securityNewPassword,
  ]);

  const onSendResetMailInProfile = useCallback(async () => {
    if (securityBusyKey) return;
    const target = accountEmail.trim() || email.trim();
    if (!target) {
      setSecurityMessage("メールアドレスを取得できません。");
      return;
    }
    setSecurityBusyKey("reset");
    setSecurityMessage(null);
    try {
      const redirectTo = webBaseUrl ? `${webBaseUrl}/auth/reset` : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(
        target,
        redirectTo ? { redirectTo } : undefined
      );
      if (error) throw error;
      setSecurityMessage("パスワード再設定メールを送信しました。");
    } catch (e: any) {
      setSecurityMessage(e?.message ?? "メール送信に失敗しました");
    } finally {
      setSecurityBusyKey(null);
    }
  }, [accountEmail, email, securityBusyKey, webBaseUrl]);

  const onSignOutOtherDevices = useCallback(async () => {
    if (securityBusyKey) return;
    setSecurityBusyKey("others");
    setSecurityMessage(null);
    try {
      const { error } = await (supabase.auth as any).signOut({ scope: "others" });
      if (error) throw error;
      setSecurityMessage("他の端末からログアウトしました。");
    } catch (e: any) {
      setSecurityMessage(e?.message ?? "他端末ログアウトに失敗しました");
    } finally {
      setSecurityBusyKey(null);
    }
  }, [securityBusyKey]);

  const onSignOutAllDevices = useCallback(() => {
    if (securityBusyKey) return;
    Alert.alert(
      "全端末をログアウト",
      "この端末を含む全端末からログアウトします。再ログインが必要です。",
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "実行",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setSecurityBusyKey("global");
              setSecurityMessage(null);
              try {
                const { error } = await (supabase.auth as any).signOut({ scope: "global" });
                if (error) throw error;
                setSecurityMessage("全端末をログアウトしました。");
              } catch (e: any) {
                setSecurityMessage(e?.message ?? "全端末ログアウトに失敗しました");
                setSecurityBusyKey(null);
              }
            })();
          },
        },
      ]
    );
  }, [securityBusyKey]);

  const refreshComposeLastPostedResult = useCallback(
    async (args: {
      postId: string;
      createdAt?: string | null;
      text?: string;
      liePct?: number;
      personaKey?: string | null;
      buzzScore?: number;
      calibratedBuzzScore?: number;
      buzzLevel?: string;
    }) => {
      const postId = String(args.postId ?? "").trim();
      if (!postId) return;
      setComposeLastPostedResultLoading(true);
      setComposeLastPostedResultError(null);
      try {
        const [reactionsRes, repliesRes, opensRes, pfEventsRes] = await Promise.all([
          supabase.from("reactions").select("kind").eq("post_id", postId),
          supabase.from("posts").select("id").eq("parent_id", postId),
          supabase.from("user_post_open_state").select("user_id").eq("post_id", postId),
          supabase
            .from("persona_feed_mode_ab_events")
            .select("event_type")
            .eq("post_id", postId)
            .in("event_type", ["impression", "open"]),
        ]);

        const reactionCounts = { likes: 0, boosts: 0, saves: 0 };
        (reactionsRes.data ?? []).forEach((r: any) => {
          const kind = normalizeReactionKind(r?.kind);
          if (kind === "like") reactionCounts.likes += 1;
          else if (kind === "boost") reactionCounts.boosts += 1;
          else if (kind === "save") reactionCounts.saves += 1;
        });

        const replies = Math.max(0, (repliesRes.data ?? []).length);
        const opens = Math.max(0, (opensRes.data ?? []).length);
        let impressions = 0;
        let personaFeedOpens = 0;
        (pfEventsRes.data ?? []).forEach((r: any) => {
          const ev = String(r?.event_type ?? "").trim();
          if (ev === "impression") impressions += 1;
          if (ev === "open") personaFeedOpens += 1;
        });

        const savePerOpen = opens > 0 ? reactionCounts.saves / opens : null;
        const replyPerOpen = opens > 0 ? replies / opens : null;
        const personaFeedOpenRate = impressions > 0 ? personaFeedOpens / impressions : null;

        const suggestions: string[] = [];
        if ((personaFeedOpenRate ?? 0) < 0.18) {
          suggestions.push("冒頭1文を短く強めにすると開封率が上がりやすいです。");
        }
        if ((replyPerOpen ?? 0) < 0.06) {
          suggestions.push("最後に質問や二択を入れると返信率が伸びやすいです。");
        }
        if ((savePerOpen ?? 0) < 0.05) {
          suggestions.push("数字・手順・比較を入れると保存率が上がりやすいです。");
        }
        if (!suggestions.length) {
          suggestions.push("反応は良好です。次は投稿時間帯を変えて再現性を確認してください。");
        }

        const nextResult = {
          postId,
          createdAt: String(args.createdAt ?? new Date().toISOString()),
          text: String(args.text ?? ""),
          liePct: Math.max(0, Math.round(Number(args.liePct ?? 0) || 0)),
          personaKey: args.personaKey ?? null,
          buzzScore: Math.max(0, Math.round(Number(args.buzzScore ?? 0) || 0)),
          calibratedBuzzScore: Math.max(0, Math.round(Number(args.calibratedBuzzScore ?? 0) || 0)),
          buzzLevel: String(args.buzzLevel ?? ""),
          counts: {
            opens,
            saves: reactionCounts.saves,
            replies,
            likes: reactionCounts.likes,
            boosts: reactionCounts.boosts,
            impressions,
            personaFeedOpens,
          },
          rates: {
            savePerOpen,
            replyPerOpen,
            personaFeedOpenRate,
          },
          suggestions: suggestions.slice(0, 3),
        };
        setComposeLastPostedResult(nextResult);

        const nextCheckpoint = {
          saves: nextResult.counts.saves,
          replies: nextResult.counts.replies,
          opens: nextResult.counts.opens,
          saveRateBucket:
            nextResult.rates.savePerOpen == null
              ? 0
              : Math.floor((nextResult.rates.savePerOpen * 100) / 5),
          replyRateBucket:
            nextResult.rates.replyPerOpen == null
              ? 0
              : Math.floor((nextResult.rates.replyPerOpen * 100) / 5),
        };
        const prevCheckpoint = composeGrowthAlertCheckpointRef.current.get(postId) ?? {
          saves: 0,
          replies: 0,
          opens: 0,
          saveRateBucket: 0,
          replyRateBucket: 0,
        };
        const alertMessages: string[] = [];
        const crossed = (before: number, after: number, thresholds: number[]) =>
          thresholds.some((t) => before < t && after >= t);
        if (crossed(prevCheckpoint.saves, nextCheckpoint.saves, [1, 3, 5, 10, 20])) {
          alertMessages.push(`保存数が${nextCheckpoint.saves}件に到達しました。`);
        }
        if (crossed(prevCheckpoint.replies, nextCheckpoint.replies, [1, 3, 5, 10])) {
          alertMessages.push(`返信数が${nextCheckpoint.replies}件に到達しました。`);
        }
        if (crossed(prevCheckpoint.opens, nextCheckpoint.opens, [5, 10, 20, 50])) {
          alertMessages.push(`開封数が${nextCheckpoint.opens}件に増えています。`);
        }
        if (
          nextResult.rates.savePerOpen != null &&
          crossed(prevCheckpoint.saveRateBucket, nextCheckpoint.saveRateBucket, [2, 3, 4, 6])
        ) {
          alertMessages.push(
            `保存率が${Math.round(nextResult.rates.savePerOpen * 100)}%に伸びています。`
          );
        }
        if (
          nextResult.rates.replyPerOpen != null &&
          crossed(prevCheckpoint.replyRateBucket, nextCheckpoint.replyRateBucket, [2, 3, 4])
        ) {
          alertMessages.push(
            `返信率が${Math.round(nextResult.rates.replyPerOpen * 100)}%に伸びています。`
          );
        }
        composeGrowthAlertCheckpointRef.current.set(postId, nextCheckpoint);
        if (alertMessages.length > 0 && tab !== "notifications") {
          Alert.alert("投稿成績アップデート", alertMessages[0]);
        }
      } catch (e: any) {
        setComposeLastPostedResultError(e?.message ?? "投稿結果の集計に失敗しました");
      } finally {
        setComposeLastPostedResultLoading(false);
      }
    },
    [tab]
  );

  const onSubmitPost = useCallback(async () => {
    if (!userId || posting) return;
    const text = composeText.trim();
    if (!text) {
      Alert.alert("入力が必要です", "投稿内容を入力してください。");
      return;
    }

    setPosting(true);
    try {
      const insertPayload = {
        author: userId,
        text,
        score,
        analysis: {
          buzz: {
            score: composeBuzz.score,
            calibratedScore: composeCalibratedBuzzScore,
            level: composeBuzz.level,
            metrics: composeBuzz.metrics.map((m) => ({
              key: m.key,
              label: m.label,
              score: m.score,
            })),
            tips: composeBuzz.tips.slice(0, 4),
            hashtags: composeBuzz.hashtags.slice(0, 4),
            replyPrompt: composeBuzz.replyPrompt,
            calibration: composeBuzzCalibration
              ? {
                  multiplier: composeBuzzCalibration.multiplier,
                  confidence: composeBuzzCalibration.confidence,
                  samples: composeBuzzCalibration.samples,
                }
              : null,
            source: "persona_buzz_v1_mobile",
          },
          persona: {
            selected: composePersonaSelected,
            candidates: composePersonaCandidates
              .slice(0, 3)
              .map((x) => ({ key: x.key, title: x.title, score: x.score })),
            blend:
              composePersonaSelected &&
              composeBlendSecondaryDef &&
              composeBlendSecondaryDef.key !== composePersonaSelected
                ? {
                    secondary: composeBlendSecondaryDef.key,
                    primaryShare: clamp(composeBlendPrimarySharePct / 100, 0, 1),
                    source: "buddy_assist_v1_mobile",
                  }
                : null,
            rewrite_mission: composeMissionRewriteAttribution
              ? {
                  source: "persona_mission",
                  styleKey: composeMissionRewriteAttribution.styleKey,
                  styleLabel: composeMissionRewriteAttribution.styleLabel,
                  buddyPersonaKey: composeMissionRewriteAttribution.buddyPersonaKey,
                  basePersonaKey: composeMissionRewriteAttribution.basePersonaKey,
                  suggestedAt: composeMissionRewriteAttribution.suggestedAt,
                  appliedAt: new Date().toISOString(),
                }
              : null,
            source: "mobile_compose",
          },
        },
      };

      const inserted = await supabase
        .from("posts")
        .insert(insertPayload)
        .select("id,created_at")
        .single();
      if (inserted.error) throw inserted.error;
      const createdId = String(inserted.data?.id ?? "").trim();
      const createdAt = String(inserted.data?.created_at ?? new Date().toISOString());

      setComposeLastPostedResult({
        postId: createdId,
        createdAt,
        text,
        liePct: Math.round((Number(score ?? 0) || 0) * 100),
        personaKey: composePersonaSelected,
        buzzScore: composeBuzz.score,
        calibratedBuzzScore: composeCalibratedBuzzScore,
        buzzLevel: composeBuzz.level,
        counts: {
          opens: 0,
          saves: 0,
          replies: 0,
          likes: 0,
          boosts: 0,
          impressions: 0,
          personaFeedOpens: 0,
        },
        rates: {
          savePerOpen: null,
          replyPerOpen: null,
          personaFeedOpenRate: null,
        },
        suggestions: [
          "投稿直後です。数分後に更新すると保存率・返信率の初動が見えます。",
          "冒頭1文の反応を比較したい場合は、短文版をもう1本作ってみてください。",
        ],
      });
      if (createdId) {
        void refreshComposeLastPostedResult({
          postId: createdId,
          createdAt,
          text,
          liePct: Math.round((Number(score ?? 0) || 0) * 100),
          personaKey: composePersonaSelected,
          buzzScore: composeBuzz.score,
          calibratedBuzzScore: composeCalibratedBuzzScore,
          buzzLevel: composeBuzz.level,
        });
      }

      setComposeText("");
      setComposePersonaCandidates([]);
      setComposePersonaSelected(null);
      setComposeMissionRewriteAttribution(null);
      setTab("compose");
      void loadFeed();
    } catch (e: any) {
      Alert.alert("投稿失敗", e?.message ?? "投稿に失敗しました");
    } finally {
      setPosting(false);
    }
  }, [
    composePersonaCandidates,
    composePersonaSelected,
    composeMissionRewriteAttribution,
    composeBlendPrimarySharePct,
    composeBlendSecondaryDef,
    composeBuzz,
    composeBuzzCalibration,
    composeCalibratedBuzzScore,
    composeText,
    loadFeed,
    posting,
    refreshComposeLastPostedResult,
    score,
    userId,
  ]);

  const applyStarter = useCallback((starter: string) => {
    setComposeText((prev) => {
      const base = prev.trim();
      if (!base) return starter;
      return `${base}\n${starter}`;
    });
  }, []);

  const appendComposeBuzzPrompt = useCallback(() => {
    const prompt = composeBuzz.replyPrompt.trim();
    if (!prompt) return;
    setComposeText((prev) => {
      const base = prev.trim();
      const merged = base ? `${base}\n${prompt}` : prompt;
      return merged.slice(0, MAX_POST_LENGTH);
    });
  }, [composeBuzz.replyPrompt]);

  const applyComposeRewrite = useCallback((nextText: string) => {
    setComposeText(nextText.slice(0, MAX_POST_LENGTH));
  }, []);

  const onSaveProfile = useCallback(async () => {
    if (!userId || profileSaving) return;
    setProfileSaving(true);
    setProfileMessage(null);

    const normalizedHandle = handle.trim();
    if (normalizedHandle && !/^[A-Za-z0-9_]{3,20}$/.test(normalizedHandle)) {
      setProfileMessage("ユーザー名は3〜20文字の英数字と _ のみです。");
      setProfileSaving(false);
      return;
    }

    try {
      const { error } = await supabase
        .from("profiles")
        .upsert(
          {
            id: userId,
            handle: normalizedHandle || null,
            display_name: displayName.trim() || null,
            bio: bio.trim() || null,
          },
          { onConflict: "id" }
        );

      if (error) throw error;
      setProfileMessage("保存しました。");
    } catch (e: any) {
      setProfileMessage(e?.message ?? "保存に失敗しました");
    } finally {
      setProfileSaving(false);
    }
  }, [bio, displayName, handle, profileSaving, userId]);

  const applyBlockedUserLocally = useCallback(
    (blockedUserId: string) => {
      if (!blockedUserId) return;
      setFeed((prev) => prev.filter((x) => String(x.author ?? "") !== blockedUserId));
      setFollowingFeed((prev) => prev.filter((x) => String(x.author ?? "") !== blockedUserId));
      setPersonaFeedItems((prev) => prev.filter((x) => String(x.author ?? "") !== blockedUserId));
      setSearchItems((prev) => prev.filter((x) => String(x.author ?? "") !== blockedUserId));
      setNotifications((prev) => prev.filter((x) => String(x.actor_id ?? "") !== blockedUserId));
      setDetailReplies((prev) => prev.filter((x) => String(x.author ?? "") !== blockedUserId));
      setDetailPost((prev) =>
        prev && String(prev.author ?? "") === blockedUserId ? null : prev
      );
      if (detailPost && String(detailPost.author ?? "") === blockedUserId) {
        setDetailVisible(false);
        setDetailPersonaMatch(null);
      }
    },
    [detailPost]
  );

  const reportPost = useCallback(
    async (
      post: FeedItem | SearchPost | PostDetailItem,
      reason: (typeof MODERATION_REPORT_REASONS)[number]
    ) => {
      if (!userId || moderationBusy) return;
      setModerationBusy(true);
      setModerationMessage(null);
      try {
        const { error } = await supabase.from("user_reports").insert({
          reporter_id: userId,
          target_user_id: post.author ?? null,
          post_id: post.id,
          reason,
          detail: `source=mobile tab=${tab}`,
          created_at: new Date().toISOString(),
        });
        if (error) {
          if (isMissingRelationError(error, "user_reports")) {
            throw new Error(
              "通報テーブルが未設定です。docs/sql/app_store_safety.sql を適用してください。"
            );
          }
          throw error;
        }
        setModerationMessage("通報を受け付けました。審査チームが確認します。");
        Alert.alert("通報完了", "通報を受け付けました。");
      } catch (e: any) {
        const msg = e?.message ?? "通報に失敗しました";
        setModerationMessage(msg);
        Alert.alert("通報失敗", msg);
      } finally {
        setModerationBusy(false);
      }
    },
    [moderationBusy, tab, userId]
  );

  const askReportPost = useCallback(
    (post: FeedItem | SearchPost | PostDetailItem) => {
      if (!userId || !post?.id) return;
      Alert.alert("投稿を通報", "理由を選択してください。", [
        {
          text: "スパム",
          onPress: () => {
            void reportPost(post, "spam");
          },
        },
        {
          text: "不快・攻撃的",
          onPress: () => {
            void reportPost(post, "harassment");
          },
        },
        {
          text: "その他",
          onPress: () => {
            void reportPost(post, "other");
          },
        },
        {
          text: "キャンセル",
          style: "cancel",
        },
      ]);
    },
    [reportPost, userId]
  );

  const blockUser = useCallback(
    async (targetUserId: string, label?: string | null) => {
      if (!userId || moderationBusy) return;
      const target = String(targetUserId ?? "").trim();
      if (!target || target === userId) return;

      setModerationBusy(true);
      setModerationMessage(null);
      try {
        const nowIso = new Date().toISOString();
        const { error } = await supabase.from("user_blocks").upsert(
          {
            blocker_id: userId,
            blocked_id: target,
            created_at: nowIso,
          },
          { onConflict: "blocker_id,blocked_id" }
        );
        if (error) {
          if (isMissingRelationError(error, "user_blocks")) {
            throw new Error(
              "ブロックテーブルが未設定です。docs/sql/app_store_safety.sql を適用してください。"
            );
          }
          throw error;
        }

        setBlockedUsers((prev) => {
          if (prev.some((x) => x.blocked_id === target)) return prev;
          return [
            {
              blocked_id: target,
              handle: null,
              display_name: label?.trim() || null,
              created_at: nowIso,
            },
            ...prev,
          ];
        });
        applyBlockedUserLocally(target);
        setModerationMessage("ユーザーをブロックしました。");
        Alert.alert("ブロックしました", `${label ?? "このユーザー"}の投稿は非表示になります。`);
        void loadBlockedUsers();
      } catch (e: any) {
        const msg = e?.message ?? "ブロックに失敗しました";
        setModerationMessage(msg);
        Alert.alert("ブロック失敗", msg);
      } finally {
        setModerationBusy(false);
      }
    },
    [applyBlockedUserLocally, loadBlockedUsers, moderationBusy, userId]
  );

  const askBlockUser = useCallback(
    (post: FeedItem | SearchPost | PostDetailItem) => {
      const target = String(post.author ?? "").trim();
      if (!target || !userId || target === userId) return;
      const name = post.author_display || post.author_handle || target.slice(0, 8);
      Alert.alert(
        "ユーザーをブロック",
        `${name}をブロックすると、このユーザーの投稿と通知を非表示にします。`,
        [
          { text: "キャンセル", style: "cancel" },
          {
            text: "ブロック",
            style: "destructive",
            onPress: () => {
              void blockUser(target, name);
            },
          },
        ]
      );
    },
    [blockUser, userId]
  );

  const unblockUser = useCallback(
    async (targetUserId: string) => {
      if (!userId || moderationBusy) return;
      const target = String(targetUserId ?? "").trim();
      if (!target) return;
      setModerationBusy(true);
      try {
        const { error } = await supabase
          .from("user_blocks")
          .delete()
          .eq("blocker_id", userId)
          .eq("blocked_id", target);
        if (error) throw error;
        setBlockedUsers((prev) => prev.filter((x) => x.blocked_id !== target));
        setModerationMessage("ブロックを解除しました。");
        void loadFeed();
        if (tab === "following") void loadFollowingFeed();
        if (tab === "search" && searchQuery.trim()) void runSearch(searchQuery);
        if (tab === "notifications") void loadNotifications();
      } catch (e: any) {
        const msg = e?.message ?? "ブロック解除に失敗しました";
        setModerationMessage(msg);
        Alert.alert("解除失敗", msg);
      } finally {
        setModerationBusy(false);
      }
    },
    [
      loadFeed,
      loadFollowingFeed,
      loadNotifications,
      moderationBusy,
      runSearch,
      searchQuery,
      tab,
      userId,
    ]
  );

  const askDeleteAccount = useCallback(() => {
    if (!userId || accountDeleteBusy) return;
    Alert.alert(
      "アカウントを完全削除",
      "投稿・プロフィール・通知を削除して復元できません。本当に削除しますか？",
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "削除する",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setAccountDeleteBusy(true);
              setModerationMessage(null);
              try {
                const rpc = await supabase.rpc("delete_my_account");
                if (rpc.error) {
                  if (isMissingFunctionError(rpc.error, "delete_my_account")) {
                    throw new Error(
                      "delete_my_account RPC が未設定です。docs/sql/app_store_safety.sql を適用してください。"
                    );
                  }
                  throw rpc.error;
                }
                await supabase.auth.signOut();
                setModerationMessage("アカウントを削除しました。");
                setTab("timeline");
                Alert.alert("削除完了", "アカウントを削除しました。");
              } catch (e: any) {
                const msg = e?.message ?? "アカウント削除に失敗しました";
                setModerationMessage(msg);
                Alert.alert("削除失敗", msg);
              } finally {
                setAccountDeleteBusy(false);
              }
            })();
          },
        },
      ]
    );
  }, [accountDeleteBusy, userId]);

  const renderPostCard = useCallback(
    (
      item: FeedItem | SearchPost | PostDetailItem,
      opts?: {
        showOpenHint?: boolean;
        personaMatch?: FeedItem["persona_match"];
        opened?: boolean;
        source?: string;
      }
	    ) => {
	      const authorIdentity = resolvePostAuthorIdentity(item);
	      const authorLabels = resolveSocialIdentityLabels(authorIdentity);
	      const authorPrimaryLabel = authorLabels.primary;
	      const authorSecondaryLabel = authorLabels.secondary;
	      const content =
	        "body" in item
	          ? ((item.text ?? item.body ?? "") as string)
          : ((item.text ?? "") as string);
      const lieAnalysis = analyzeLieScore({ text: content });
      const calibratedLie = calibrateLieScoreWithFeedback(lieAnalysis, {
        replies: Math.max(0, Math.floor(Number((item as any).reply_count ?? 0) || 0)),
      });
      const percent = Math.round(calibratedLie.score * 100);
      const lieLevelLabel =
        calibratedLie.level === "high" ? "高め" : calibratedLie.level === "mid" ? "中" : "低め";
      const personaMatch = opts?.personaMatch ?? (item as FeedItem).persona_match;
      const matchScore = toPercent01(personaMatch?.weighted_score ?? 0);
      const predictedScore = toPercent01(personaMatch?.predicted_response ?? 0);
      const authorId = String(item.author ?? "").trim();
      const isOwnPost = !!authorId && authorId === userId;
      const saveMeta =
        "save_meta" in (item as any) && (item as any).save_meta
          ? ((item as any).save_meta as SavedFeedItem["save_meta"])
          : null;
      const cardSaveState = postSaveStateById[item.id] ?? null;
      const cardSaved = cardSaveState?.saved ?? Boolean(saveMeta);
      const cardSaveBusy = Boolean(cardSaveState?.busy);
      const cardSaveCount = Math.max(
        0,
        Number(
          cardSaveState?.saveCount ??
            (detailPost?.id === item.id ? detailSaveCount : saveMeta ? 1 : 0)
        ) || 0
      );
      const cardCollectionLabel =
        cardSaveState?.collectionLabel ?? saveMeta?.collection_label ?? null;
      const analysisPersonaKey = String(
        (item as FeedItem)?.analysis?.persona?.selected ??
          (item as FeedItem)?.analysis?.persona?.candidates?.[0]?.key ??
          ""
      ).trim();

      return (
        <Pressable
          key={item.id}
          style={[styles.postCard, opts?.opened && styles.openedPostCard]}
          onPress={() =>
            void openPostDetail(item.id, {
              personaMatch: personaMatch ?? undefined,
              source: opts?.source,
            })
          }
	        >
	          <View style={styles.postMetaRow}>
	            <View style={styles.postAuthorBlock}>
	              <Text style={styles.postAuthor} numberOfLines={1}>
	                {authorPrimaryLabel}
	              </Text>
	              {authorSecondaryLabel ? (
	                <Text style={styles.postAuthorHandle} numberOfLines={1}>
	                  {authorSecondaryLabel}
	                </Text>
	              ) : null}
	            </View>
	            <Text style={styles.postMeta}>{formatRelativeTime(item.created_at)}</Text>
	          </View>
          {personaMatch?.key ? (
            <View style={styles.matchRow}>
              <Text style={styles.matchChip}>match @{personaMatch.key}</Text>
              <Text style={styles.postMeta}>{matchScore}%</Text>
              <Text style={styles.postMeta}>予測反応 {predictedScore}%</Text>
              {String(personaMatch.reason ?? "").startsWith("buddy_compat_") ? (
                <Text style={styles.matchChip}>buddy</Text>
              ) : null}
            </View>
          ) : analysisPersonaKey ? (
            <View style={styles.matchRow}>
              <Text style={styles.matchChip}>投稿キャラ @{analysisPersonaKey}</Text>
            </View>
          ) : null}
          <Text style={styles.postText}>{content}</Text>
          <Text style={styles.postMeta}>
            嘘っぽさ {percent}% ・ 判定 {lieLevelLabel}
          </Text>
          {calibratedLie.cautionChips.length > 0 || calibratedLie.reliefChips.length > 0 ? (
            <View style={styles.matchRow}>
              {calibratedLie.cautionChips.slice(0, 2).map((chip: string) => (
                <Text key={`lie-caution-${item.id}-${chip}`} style={styles.matchChip}>
                  {chip}
                </Text>
              ))}
              {calibratedLie.reliefChips.slice(0, 2).map((chip: string) => (
                <Text
                  key={`lie-relief-${item.id}-${chip}`}
                  style={[styles.matchChip, { backgroundColor: "#ECFDF5", color: "#065F46" }]}
                >
                  {chip}
                </Text>
              ))}
            </View>
          ) : null}
          {Math.abs(calibratedLie.adjustment) >= 0.01 ? (
            <Text style={styles.postMeta}>
              反応補正 {calibratedLie.adjustment > 0 ? "+" : ""}
              {Math.round(calibratedLie.adjustment * 100)}pt
            </Text>
          ) : null}
          {calibratedLie.reasons[0] ? (
            <Text style={styles.postMeta}>{calibratedLie.reasons[0]}</Text>
          ) : null}
          {saveMeta ? (
            <View style={styles.matchRow}>
              <Text style={styles.matchChip}>保存先 {saveMeta.collection_label}</Text>
              <Text style={styles.postMeta}>{formatRelativeTime(saveMeta.saved_at)}</Text>
            </View>
          ) : null}
          {opts?.opened ? <Text style={styles.postMeta}>開封済み</Text> : null}
          {opts?.showOpenHint === false ? null : (
            <Text style={styles.postMeta}>タップで投稿詳細を開く</Text>
          )}
          <View style={styles.postActionRow}>
            <Pressable
              style={[
                cardSaved ? styles.saveButtonActive : styles.outlineButton,
                cardSaveBusy && styles.disabledButton,
              ]}
              onPress={(e) => {
                e.stopPropagation();
                void toggleSaveOnPostCard(item);
              }}
              disabled={cardSaveBusy}
            >
              <Text style={cardSaved ? styles.saveButtonActiveText : styles.outlineButtonText}>
                {cardSaveBusy ? "更新中…" : cardSaved ? "保存解除" : "保存"}
              </Text>
            </Pressable>
            <Text style={styles.postMeta}>
              保存 {cardSaveCount}
              {cardSaved && cardCollectionLabel ? ` ・ ${cardCollectionLabel}` : ""}
            </Text>
          </View>
          {!authorId || isOwnPost ? null : (
            <View style={styles.postActionRow}>
              <Pressable
                style={[styles.outlineButton, moderationBusy && styles.disabledButton]}
                onPress={(e) => {
                  e.stopPropagation();
                  askReportPost(item);
                }}
                disabled={moderationBusy}
              >
                <Text style={styles.outlineButtonText}>通報</Text>
              </Pressable>
              <Pressable
                style={[styles.warnButton, moderationBusy && styles.disabledButton]}
                onPress={(e) => {
                  e.stopPropagation();
                  askBlockUser(item);
                }}
                disabled={moderationBusy}
              >
                <Text style={styles.warnButtonText}>ブロック</Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      );
    },
    [
      askBlockUser,
      askReportPost,
      detailPost?.id,
      detailSaveCount,
      moderationBusy,
      openPostDetail,
      postSaveStateById,
      toggleSaveOnPostCard,
      userId,
    ]
  );

  const openFormatRailViewer = useCallback(
    (items: FormatRailItem[], source: string, startId?: string | null) => {
      const list = items.filter((x) => !!x?.id);
      if (list.length === 0) return;
      const idx = Math.max(
        0,
        startId ? list.findIndex((x) => x.id === startId) : 0
      );
      const nextIndex = idx >= 0 ? idx : 0;
      setFormatRailViewerItems(list);
      setFormatRailViewerSource(source);
      setFormatRailViewerIndex(nextIndex);
      setFormatRailViewerVisible(true);
      const current = list[nextIndex];
      if (current?.id) {
        markPostOpened(current.id, `${source}_viewer`);
      }
    },
    [markPostOpened]
  );

  const closeFormatRailViewer = useCallback(() => {
    setFormatRailViewerVisible(false);
    setFormatRailViewerItems([]);
    setFormatRailViewerIndex(0);
    setFormatRailViewerSource("");
    formatRailSwipeStartYRef.current = null;
    formatRailSwipeStartXRef.current = null;
  }, []);

  const moveFormatRailViewerBy = useCallback(
    (delta: -1 | 1) => {
      setFormatRailViewerIndex((prev) => {
        const next = prev + delta;
        if (next < 0 || next >= formatRailViewerItems.length) return prev;
        const item = formatRailViewerItems[next];
        if (item?.id) {
          markPostOpened(item.id, `${formatRailViewerSource || "format_rail"}_viewer`);
        }
        return next;
      });
    },
    [formatRailViewerItems, formatRailViewerSource, markPostOpened]
  );

  const onFormatRailTouchStart = useCallback((e: any) => {
    formatRailSwipeStartYRef.current = Number(e?.nativeEvent?.pageY ?? NaN);
    formatRailSwipeStartXRef.current = Number(e?.nativeEvent?.pageX ?? NaN);
  }, []);

  const onFormatRailTouchEnd = useCallback(
    (e: any) => {
      const startY = Number(formatRailSwipeStartYRef.current ?? NaN);
      const startX = Number(formatRailSwipeStartXRef.current ?? NaN);
      const endY = Number(e?.nativeEvent?.pageY ?? NaN);
      const endX = Number(e?.nativeEvent?.pageX ?? NaN);
      formatRailSwipeStartYRef.current = null;
      formatRailSwipeStartXRef.current = null;
      if (!Number.isFinite(startY) || !Number.isFinite(endY) || !Number.isFinite(startX) || !Number.isFinite(endX)) {
        return;
      }
      const dy = endY - startY;
      const dx = endX - startX;
      if (Math.abs(dy) < 64 || Math.abs(dy) < Math.abs(dx)) return;
      if (dy < 0) {
        moveFormatRailViewerBy(1);
      } else {
        moveFormatRailViewerBy(-1);
      }
    },
    [moveFormatRailViewerBy]
  );

  const currentFormatRailViewerItem = useMemo(
    () => formatRailViewerItems[formatRailViewerIndex] ?? null,
    [formatRailViewerIndex, formatRailViewerItems]
  );

  useEffect(() => {
    if (!devUiSmokeEnabled || !userId) return;
    if (devUiSmokeRunningRef.current) return;
    if (devUiSmokeCompletedUserRef.current === userId) return;

    devUiSmokeRunningRef.current = true;
    setDevUiSmokeStatus("開始: 主要タブ/詳細/Storyを順に検証します");
    setDevUiSmokeHistory([]);

    let cancelled = false;
    let activeStep:
      | {
          id: number;
          label: string;
          startedAt: number;
          warned: boolean;
        }
      | null = null;
    let stepSeq = 0;
    const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    const withStepTimeout = async (label: string, promise: Promise<any>, ms = 9000) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      try {
        return await Promise.race([
          promise,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
    const safeSetStatus = (value: string) => {
      if (cancelled) return;
      setDevUiSmokeStatus(value);
      setDevUiSmokeHistory((prev) => {
        const stamp = new Date();
        const hh = String(stamp.getHours()).padStart(2, "0");
        const mm = String(stamp.getMinutes()).padStart(2, "0");
        const ss = String(stamp.getSeconds()).padStart(2, "0");
        const next = [`${hh}:${mm}:${ss} ${value}`, ...prev];
        return next.slice(0, 10);
      });
      try {
        console.log(`[dev-ui-smoke] ${value}`);
      } catch {}
    };
    const beginSmokeStep = (label: string) => {
      stepSeq += 1;
      activeStep = {
        id: stepSeq,
        label,
        startedAt: Date.now(),
        warned: false,
      };
      safeSetStatus(`STEP開始 #${stepSeq}: ${label}`);
    };
    const endSmokeStep = (label: string) => {
      const elapsedMs = activeStep?.label === label ? Date.now() - activeStep.startedAt : 0;
      safeSetStatus(
        `STEP完了: ${label}${elapsedMs > 0 ? ` (${Math.round(elapsedMs / 100) / 10}s)` : ""}`
      );
      if (activeStep?.label === label) activeStep = null;
    };
    const runSmokeStep = async <T,>(
      label: string,
      runner: () => Promise<T> | T,
      timeoutMs = 9000
    ): Promise<T> => {
      beginSmokeStep(label);
      try {
        const result = await withStepTimeout(
          label,
          Promise.resolve().then(() => runner()),
          timeoutMs
        );
        endSmokeStep(label);
        return result as T;
      } catch (e: any) {
        safeSetStatus(`STEP失敗: ${label} (${e?.message ?? "unknown"})`);
        if (activeStep?.label === label) activeStep = null;
        throw e;
      }
    };
    const watchdogTimer = setInterval(() => {
      if (!activeStep || cancelled) return;
      const elapsed = Date.now() - activeStep.startedAt;
      if (elapsed < 7000 || activeStep.warned) return;
      activeStep.warned = true;
      safeSetStatus(
        `WATCHDOG: #${activeStep.id} ${activeStep.label} が ${Math.round(elapsed / 100) / 10}s 継続中`
      );
    }, 1000);
    const switchTabForSmoke = async (nextTab: AppTab, label: string, waitMs = 450) => {
      safeSetStatus(`タブ移動: ${label}`);
      setTab(nextTab);
      await wait(waitMs);
    };
    const closeDetailForSmoke = async (label: string) => {
      safeSetStatus(`${label}: 詳細クローズ要求`);
      if (!cancelled) {
        setDetailVisible(false);
        setDetailPersonaMatch(null);
        setDetailSequenceIds([]);
        setDetailSequenceIndex(0);
      }
      await wait(300);
      safeSetStatus(
        detailVisibleRef.current
          ? `${label}: 詳細クローズ未完了（継続）`
          : `${label}: 詳細クローズ完了`
      );
      if (detailVisibleRef.current && !cancelled) {
        setDetailVisible(false);
      }
      await wait(150);
    };
    const openDetailForSmoke = async (
      label: string,
      postId: string,
      options?: { personaMatch?: FeedItem["persona_match"]; source?: string }
    ) => {
      if (!postId) return;
      safeSetStatus(label);
      // Use dedicated non-blocking path so smoke can continue even if detail data is slow.
      openPostDetailNonBlocking(postId, options);
      safeSetStatus(`${label}: 詳細オープン要求済み`);
      await wait(1400);
      await closeDetailForSmoke(label);
    };

    const run = async () => {
      try {
        await switchTabForSmoke("timeline", "TL", 250);
        await runSmokeStep("TL loadFeed", () => loadFeed());
        safeSetStatus("TL: 読み込み完了");
        await wait(700);
        safeSetStatus("TL: 画面表示確認");

        await switchTabForSmoke("following", "フォロー中");
        await runSmokeStep("following load", () => loadFollowingFeed());
        safeSetStatus("フォロー中: 読み込み完了");
        await wait(700);
        safeSetStatus("フォロー中: 画面表示確認");

        await switchTabForSmoke("notifications", "通知");
        await runSmokeStep("notifications load", () => loadNotifications());
        safeSetStatus("通知: 読み込み完了");
        await wait(700);
        safeSetStatus("通知: 画面表示確認");

        await switchTabForSmoke("saved", "保存");
        await runSmokeStep("saved load", () => loadSavedFeed(true), 12_000);
        safeSetStatus("保存: 読み込み完了");
        await wait(700);
        safeSetStatus("保存: 画面表示確認");

        await switchTabForSmoke("personaFeed", "キャラTL");
        await runSmokeStep("personaFeed load", () => loadPersonaFeed(true), 14_000);
        safeSetStatus("キャラTL: 読み込み完了");
        await wait(900);
        safeSetStatus("キャラTL: 画面表示確認");

        await switchTabForSmoke("evolution", "進化");
        safeSetStatus("進化: 画面表示確認");
        await wait(700);

        await switchTabForSmoke("dialogue", "対話AI");
        safeSetStatus("対話AI: 画面表示確認");
        await wait(700);

        await switchTabForSmoke("compose", "投稿");
        safeSetStatus("投稿: 画面表示確認");
        await wait(700);

        await switchTabForSmoke("search", "検索");
        safeSetStatus("検索: 画面表示確認");
        await wait(700);

        await switchTabForSmoke("personaCatalog", "キャラ図鑑");
        safeSetStatus("キャラ図鑑: 画面表示確認");
        await wait(700);

        await switchTabForSmoke("persona", "分析");
        safeSetStatus("分析: 画面表示確認");
        await wait(700);

        await switchTabForSmoke("profile", "プロフィール");
        safeSetStatus("プロフィール: 読み込み");
        await runSmokeStep("profile load", () => loadProfile());
        safeSetStatus("プロフィール: 読み込み完了");
        await wait(700);

        safeSetStatus("全タブ巡回: 完了");

        const firstTimeline = feedItemsRef.current[0];
        if (firstTimeline?.id) {
          await runSmokeStep(`TL detail ${firstTimeline.id.slice(0, 8)}`, () =>
            openDetailForSmoke(`TL: 投稿詳細(${firstTimeline.id.slice(0, 8)})`, firstTimeline.id, {
              personaMatch: firstTimeline.persona_match,
              source: "dev_ui_smoke_tl",
            }),
          12_000);
          safeSetStatus("TL: 投稿詳細確認完了");
        }

        const firstFollowing = followingFeedItemsRef.current[0];
        if (firstFollowing?.id) {
          await switchTabForSmoke("following", "フォロー中", 250);
          await runSmokeStep(`following detail ${firstFollowing.id.slice(0, 8)}`, () =>
            openDetailForSmoke(
              `フォロー中: 投稿詳細(${firstFollowing.id.slice(0, 8)})`,
              firstFollowing.id,
              {
                personaMatch: firstFollowing.persona_match,
                source: "dev_ui_smoke_following",
              }
            ),
          12_000);
          safeSetStatus("フォロー中: 投稿詳細確認完了");
        }

        const notifWithPost = notificationsRef.current.find((n) => String(n.post_id ?? "").trim());
        if (notifWithPost?.post_id) {
          await switchTabForSmoke("notifications", "通知", 250);
          await runSmokeStep(`notifications detail ${String(notifWithPost.post_id).slice(0, 8)}`, () =>
            openDetailForSmoke(
              `通知: 投稿詳細(${String(notifWithPost.post_id).slice(0, 8)})`,
              String(notifWithPost.post_id),
              {
                source: "dev_ui_smoke_notifications",
              }
            ),
          12_000);
          safeSetStatus("通知: 投稿詳細確認完了");
        }

        const firstSaved = savedFeedItemsRef.current[0];
        if (firstSaved?.id) {
          await switchTabForSmoke("saved", "保存", 250);
          await runSmokeStep(`saved detail ${firstSaved.id.slice(0, 8)}`, () =>
            openDetailForSmoke(`保存: 投稿詳細(${firstSaved.id.slice(0, 8)})`, firstSaved.id, {
              personaMatch: firstSaved.persona_match,
              source: "dev_ui_smoke_saved",
            }),
          12_000);
          safeSetStatus("保存: 投稿詳細確認完了");
        }

        await switchTabForSmoke("personaFeed", "キャラTL", 250);
        const personaRailItems = extractFormatRailItems(personaFeedItemsRef.current, 8);
        if (personaRailItems.length > 0) {
          await runSmokeStep("personaFeed format viewer", async () => {
            safeSetStatus(
              `キャラTL: ${personaRailItems[0].format === "story" ? "Story" : "Short"} Viewer`
            );
            openFormatRailViewer(personaRailItems, "dev_ui_smoke_persona_rail");
            await wait(1400);
            safeSetStatus("キャラTL: Viewerクローズ要求");
            if (!cancelled) closeFormatRailViewer();
            await wait(300);
            safeSetStatus("キャラTL: Viewerクローズ完了");
          }, 10_000);
        } else {
          safeSetStatus("キャラTL: Story/Short対象なし");
        }
        const firstPersona = personaFeedItemsRef.current[0];
        if (firstPersona?.id) {
          await runSmokeStep(`personaFeed detail ${firstPersona.id.slice(0, 8)}`, () =>
            openDetailForSmoke(`キャラTL: 投稿詳細(${firstPersona.id.slice(0, 8)})`, firstPersona.id, {
              personaMatch: firstPersona.persona_match,
              source: "dev_ui_smoke_persona",
            }),
          12_000);
          safeSetStatus("キャラTL: 投稿詳細確認完了");
        }

        await switchTabForSmoke("personaCatalog", "キャラ図鑑", 250);
        safeSetStatus("キャラ図鑑: 最終表示");

        safeSetStatus(
          "完了: 全タブ + 主要詳細/Viewer（TL/フォロー/通知/保存/キャラTL/キャラ図鑑/分析）確認"
        );
        devUiSmokeCompletedUserRef.current = userId;
      } catch (e: any) {
        const message = e?.message ?? "unknown error";
        safeSetStatus(`失敗: ${message}`);
        devUiSmokeCompletedUserRef.current = userId;
      } finally {
        clearInterval(watchdogTimer);
        devUiSmokeRunningRef.current = false;
      }
    };

    void run();

    return () => {
      cancelled = true;
      clearInterval(watchdogTimer);
    };
    // Intentionally only keyed by login/session flags so the smoke run is not cancelled
    // by unrelated callback identity changes during bootstrap renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devUiSmokeEnabled, userId]);

  useEffect(() => {
    if (!formatRailViewerVisible) return;
    const current = formatRailViewerItems[formatRailViewerIndex];
    if (!current || current.format !== "story") return;
    const timer = setTimeout(() => {
      setFormatRailViewerIndex((prev) => {
        if (!formatRailViewerVisible) return prev;
        const next = prev + 1;
        if (next >= formatRailViewerItems.length) return prev;
        const item = formatRailViewerItems[next];
        if (item?.id) markPostOpened(item.id, `${formatRailViewerSource || "format_rail"}_viewer_auto`);
        return next;
      });
    }, 5500);
    return () => clearTimeout(timer);
  }, [
    formatRailViewerIndex,
    formatRailViewerItems,
    formatRailViewerSource,
    formatRailViewerVisible,
    markPostOpened,
  ]);

  const renderFormatRailViewerModal = () => (
    <Modal
      visible={formatRailViewerVisible}
      animationType="fade"
      onRequestClose={closeFormatRailViewer}
    >
      <SafeAreaView style={styles.formatViewerContainer}>
        {__DEV__ && devUiSmokeEnabled ? (
          <View
            style={[
              styles.personaCard,
              {
                marginHorizontal: 12,
                marginTop: 8,
                marginBottom: 8,
                borderColor: "#4338CA",
                backgroundColor: "rgba(238,242,255,0.95)",
              },
            ]}
          >
            <Text style={[styles.postMeta, { color: "#312E81" }]}>DEV UI Smoke</Text>
            <Text style={[styles.subtle, { color: "#312E81" }]}>
              {devUiSmokeStatus ?? "待機中"}
            </Text>
            {devUiSmokeHistory.slice(0, 4).map((line, idx) => (
              <Text
                key={`fmt-dev-smoke-${idx}-${line}`}
                numberOfLines={1}
                style={[styles.postMeta, { color: "#4338CA" }]}
              >
                {line}
              </Text>
            ))}
          </View>
        ) : null}
        <View style={styles.formatViewerHeader}>
          <View style={styles.formatViewerProgressRow}>
            {formatRailViewerItems.slice(0, 12).map((x, idx) => (
              <View
                key={`fmt-progress-${x.id}`}
                style={[
                  styles.formatViewerProgressTrack,
                  idx === formatRailViewerIndex && styles.formatViewerProgressTrackActive,
                ]}
              />
            ))}
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={styles.outlineButton}
              onPress={() => {
                const cur = currentFormatRailViewerItem;
                if (!cur?.id) return;
                closeFormatRailViewer();
                void openPostDetail(cur.id, { source: `${formatRailViewerSource || "format_rail"}_detail` });
              }}
            >
              <Text style={styles.outlineButtonText}>詳細</Text>
            </Pressable>
            <Pressable style={styles.outlineButton} onPress={closeFormatRailViewer}>
              <Text style={styles.outlineButtonText}>閉じる</Text>
            </Pressable>
          </View>
        </View>

        {!currentFormatRailViewerItem ? (
          <View style={styles.centerBox}>
            <Text style={[styles.subtle, { color: "#D1D5DB" }]}>表示できる投稿がありません。</Text>
          </View>
        ) : (
          <View
            style={styles.formatViewerBody}
            onTouchStart={onFormatRailTouchStart}
            onTouchEnd={onFormatRailTouchEnd}
          >
            <View
              style={[
                styles.formatViewerCard,
                currentFormatRailViewerItem.format === "story"
                  ? styles.formatViewerCardStory
                  : styles.formatViewerCardShort,
              ]}
            >
              <View style={styles.postMetaRow}>
                <Text style={[styles.matchChip, { backgroundColor: "#FFFFFF" }]}>
                  {currentFormatRailViewerItem.format === "story" ? "Story" : "Short"}
                </Text>
                <Text style={[styles.postMeta, { color: "#E5E7EB" }]}>
                  {formatRelativeTime(currentFormatRailViewerItem.created_at)}
                </Text>
              </View>
              <Text style={styles.formatViewerAuthor}>
                {currentFormatRailViewerItem.author_display ||
                  currentFormatRailViewerItem.author_handle ||
                  (currentFormatRailViewerItem.author
                    ? String(currentFormatRailViewerItem.author).slice(0, 8)
                    : "user")}
                {currentFormatRailViewerItem.personaKey
                  ? ` / @${currentFormatRailViewerItem.personaKey}`
                  : ""}
              </Text>
              <ScrollView style={styles.formatViewerTextWrap} showsVerticalScrollIndicator={false}>
                <Text style={styles.formatViewerText}>{currentFormatRailViewerItem.text}</Text>
              </ScrollView>
              <View style={styles.formatViewerFooter}>
                <Text style={styles.formatViewerHint}>上スワイプで次へ / 下スワイプで前へ</Text>
                <Text style={styles.formatViewerHint}>
                  {formatRailViewerIndex + 1} / {formatRailViewerItems.length}
                </Text>
              </View>
            </View>

            <View style={styles.formatViewerNav}>
              <Pressable
                style={[
                  styles.outlineButton,
                  (formatRailViewerIndex <= 0 || formatRailViewerItems.length <= 1) && styles.disabledButton,
                ]}
                onPress={() => moveFormatRailViewerBy(-1)}
                disabled={formatRailViewerIndex <= 0 || formatRailViewerItems.length <= 1}
              >
                <Text style={styles.outlineButtonText}>↑ 前の投稿</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.outlineButton,
                  (formatRailViewerIndex >= formatRailViewerItems.length - 1 ||
                    formatRailViewerItems.length <= 1) &&
                    styles.disabledButton,
                ]}
                onPress={() => moveFormatRailViewerBy(1)}
                disabled={
                  formatRailViewerIndex >= formatRailViewerItems.length - 1 ||
                  formatRailViewerItems.length <= 1
                }
              >
                <Text style={styles.outlineButtonText}>↓ 次の投稿</Text>
              </Pressable>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );

  const renderFormatRail = useCallback(
    (items: FormatRailItem[], source: string) => {
      if (!items.length) return null;
      return (
        <View style={styles.personaCard}>
          <View style={styles.postMetaRow}>
            <Text style={styles.sectionTitle}>Stories / Shorts</Text>
            <Text style={styles.postMeta}>フォーマット別レール</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipWrap}>
              {items.map((item) => {
                const author =
                  item.author_display || item.author_handle || (item.author ? String(item.author).slice(0, 8) : "user");
                const excerpt =
                  item.format === "story"
                    ? item.text.split(/\n+/).slice(0, 3).join("\n")
                    : item.text.replace(/\s+/g, " ").slice(0, 80);
                return (
                  <Pressable
                    key={`${source}-fmt-${item.id}`}
                    style={{
                      width: 210,
                      minHeight: 132,
                      borderWidth: 1,
                      borderColor: item.format === "story" ? "#C7D2FE" : "#A7F3D0",
                      borderRadius: 14,
                      backgroundColor: item.format === "story" ? "#EEF2FF" : "#ECFDF5",
                      padding: 10,
                      gap: 6,
                      marginRight: 8,
                    }}
                    onPress={() => {
                      openFormatRailViewer(items, source, item.id);
                    }}
                  >
                    <View style={styles.postMetaRow}>
                      <Text style={[styles.matchChip, { backgroundColor: "#FFFFFF" }]}>
                        {item.format === "story" ? "Story" : "Short"}
                      </Text>
                      <Text style={[styles.postMeta, { fontSize: 11 }]}>{formatRelativeTime(item.created_at)}</Text>
                    </View>
                    <Text numberOfLines={item.format === "story" ? 4 : 3} style={styles.postText}>
                      {excerpt}
                    </Text>
                    <Text style={[styles.postMeta, { fontSize: 11 }]}>
                      {author}
                      {item.personaKey ? ` / @${item.personaKey}` : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          <Text style={styles.subtle}>縦向け/短尺フォーマットの投稿をまとめて発見できます。</Text>
        </View>
      );
    },
    [openFormatRailViewer]
  );

  const renderTimeline = () => (
    <View style={styles.screen}>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>タイムライン</Text>
        <Pressable style={styles.outlineButton} onPress={() => void loadFeed()}>
          <Text style={styles.outlineButtonText}>更新</Text>
        </Pressable>
      </View>

      {feedLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator />
          <Text style={styles.subtle}>読み込み中…</Text>
        </View>
      ) : feedError ? (
        <Text style={styles.errorText}>{feedError}</Text>
      ) : feed.length === 0 ? (
        <View style={styles.personaCard}>
          <Text style={styles.sectionTitle}>投稿がまだありません</Text>
          <Text style={styles.subtle}>
            まだ表示できる投稿がありません。最初の投稿を作成するか、再読込してください。
          </Text>
          <View style={styles.headerActions}>
            <Pressable
              style={styles.outlineButton}
              onPress={() => {
                setTab("compose");
              }}
            >
              <Text style={styles.outlineButtonText}>投稿する</Text>
            </Pressable>
            <Pressable style={styles.outlineButton} onPress={() => void loadFeed()}>
              <Text style={styles.outlineButtonText}>再読込</Text>
            </Pressable>
          </View>
          <Text style={styles.postMeta}>
            ヒント: Web版と同じデータ基盤を参照しているため、Webで投稿するとMobileにも反映されます。
          </Text>
        </View>
      ) : (
        renderVirtualRowsList({
          listKey: "timeline",
          refreshing: feedLoading,
          onRefresh: () => void loadFeed(),
          renderPost: renderPostCard,
          renderNotification: renderNotificationCard,
          rows: [
            ...(timelineFormatRailItems.length
              ? [
                  {
                    key: "timeline-rail",
                    type: "block" as const,
                    node: renderFormatRail(timelineFormatRailItems, "timeline_format_rail"),
                    estimatedHeight: 220,
                  },
                ]
              : []),
            ...((timelineHighlights.popular.length > 0 || timelineHighlights.forYou.length > 0)
              ? [
                  {
                    key: "timeline-highlights",
                    type: "block" as const,
                    estimatedHeight: 260,
                    node: (
                      <View style={styles.personaCard}>
                        <View style={styles.postMetaRow}>
                          <Text style={styles.sectionTitle}>見つけやすく表示</Text>
                          <Text style={styles.postMeta}>
                            人気 {timelineHighlights.popular.length} / あなた向け {timelineHighlights.forYou.length}
                          </Text>
                        </View>
                        <Text style={styles.subtle}>
                          反応されやすい投稿と、あなたが開きやすい傾向の投稿を先にまとめています。
                        </Text>

                        {timelineHighlights.popular.length > 0 ? (
                          <View style={{ gap: 6 }}>
                            <Text style={styles.sectionTitle}>人気の投稿</Text>
                            {timelineHighlights.popular.map((item) => {
                              const labels = resolveSocialIdentityLabels(resolvePostAuthorIdentity(item));
                              return (
                                <Pressable
                                  key={`tl-popular-${item.id}`}
                                  style={styles.timelineHighlightRow}
                                  onPress={() =>
                                    void openPostDetail(item.id, { source: "timeline_popular" })
                                  }
                                >
                                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                                    <Text style={styles.timelineHighlightTitle} numberOfLines={1}>
                                      {labels.primary}
                                    </Text>
                                    <Text style={styles.timelineHighlightBody} numberOfLines={2}>
                                      {String(item.text ?? item.body ?? "").trim() || "本文なし"}
                                    </Text>
                                  </View>
                                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                                    <Text style={styles.badge}>人気</Text>
                                    <Text style={styles.postMeta}>
                                      {Math.round((Number(item.score ?? 0) || 0) * 100)}%
                                    </Text>
                                  </View>
                                </Pressable>
                              );
                            })}
                          </View>
                        ) : null}

                        {timelineHighlights.forYou.length > 0 ? (
                          <View style={{ gap: 6 }}>
                            <Text style={styles.sectionTitle}>あなた向け</Text>
                            {timelineHighlights.forYou.map(({ item, reason }) => {
                              const labels = resolveSocialIdentityLabels(resolvePostAuthorIdentity(item));
                              return (
                                <Pressable
                                  key={`tl-foryou-${item.id}`}
                                  style={styles.timelineHighlightRow}
                                  onPress={() =>
                                    void openPostDetail(item.id, { source: "timeline_for_you" })
                                  }
                                >
                                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                                    <Text style={styles.timelineHighlightTitle} numberOfLines={1}>
                                      {labels.primary}
                                    </Text>
                                    <Text style={styles.timelineHighlightBody} numberOfLines={2}>
                                      {String(item.text ?? item.body ?? "").trim() || "本文なし"}
                                    </Text>
                                    <Text style={styles.postMeta} numberOfLines={1}>
                                      {reason}
                                    </Text>
                                  </View>
                                  <Text style={styles.matchChip}>おすすめ</Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                    ),
                  },
                ]
              : []),
            {
              key: "timeline-fresh-header",
              type: "block" as const,
              estimatedHeight: 64,
              node: (
                <View style={styles.personaCard}>
                  <View style={styles.postMetaRow}>
                    <Text style={styles.sectionTitle}>新着</Text>
                    <Text style={styles.badge}>{timelineFreshItems.length}</Text>
                  </View>
                  {timelineFreshItems.length === 0 ? (
                    <Text style={styles.subtle}>新着はありません。</Text>
                  ) : null}
                </View>
              ),
            },
            ...timelineFreshItems.map(
              (item) =>
                ({
                  key: `timeline-fresh-${item.id}`,
                  type: "post" as const,
                  item,
                  opts: { opened: false, source: "timeline" },
                  estimatedHeight: 180,
                }) satisfies VirtualListRow
            ),
            {
              key: "timeline-past-header",
              type: "block" as const,
              estimatedHeight: 64,
              node: (
                <View style={styles.personaCard}>
                  <View style={styles.postMetaRow}>
                    <Text style={styles.sectionTitle}>過去</Text>
                    <Text style={styles.badge}>{timelinePastItems.length}</Text>
                  </View>
                  {timelinePastItems.length === 0 ? (
                    <Text style={styles.subtle}>まだ開封済み投稿はありません。</Text>
                  ) : null}
                </View>
              ),
            },
            ...timelinePastItems.map(
              (item) =>
                ({
                  key: `timeline-past-${item.id}`,
                  type: "post" as const,
                  item,
                  opts: { opened: true, source: "timeline" },
                  estimatedHeight: 180,
                }) satisfies VirtualListRow
            ),
          ],
        })
      )}
    </View>
  );

  const renderFollowing = () => (
    <View style={styles.screen}>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>フォロー中</Text>
        <Pressable style={styles.outlineButton} onPress={() => void loadFollowingFeed()}>
          <Text style={styles.outlineButtonText}>更新</Text>
        </Pressable>
      </View>

      {followingLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator />
          <Text style={styles.subtle}>読み込み中…</Text>
        </View>
      ) : followingError ? (
        <Text style={styles.errorText}>{followingError}</Text>
      ) : followingFeed.length === 0 ? (
        <Text style={styles.subtle}>フォロー中ユーザーの投稿はまだありません。</Text>
      ) : (
        renderVirtualRowsList({
          listKey: "following",
          refreshing: followingLoading,
          onRefresh: () => void loadFollowingFeed(),
          renderPost: renderPostCard,
          renderNotification: renderNotificationCard,
          rows: [
            ...(followingFormatRailItems.length
              ? [
                  {
                    key: "following-rail",
                    type: "block" as const,
                    estimatedHeight: 220,
                    node: renderFormatRail(followingFormatRailItems, "following_format_rail"),
                  },
                ]
              : []),
            {
              key: "following-fresh-header",
              type: "block" as const,
              estimatedHeight: 64,
              node: (
                <View style={styles.personaCard}>
                  <View style={styles.postMetaRow}>
                    <Text style={styles.sectionTitle}>新着</Text>
                    <Text style={styles.badge}>{followingFreshItems.length}</Text>
                  </View>
                  {followingFreshItems.length === 0 ? (
                    <Text style={styles.subtle}>新着はありません。</Text>
                  ) : null}
                </View>
              ),
            },
            ...followingFreshItems.map(
              (item) =>
                ({
                  key: `following-fresh-${item.id}`,
                  type: "post" as const,
                  item,
                  opts: { opened: false, source: "following" },
                  estimatedHeight: 180,
                }) satisfies VirtualListRow
            ),
            {
              key: "following-past-header",
              type: "block" as const,
              estimatedHeight: 64,
              node: (
                <View style={styles.personaCard}>
                  <View style={styles.postMetaRow}>
                    <Text style={styles.sectionTitle}>過去</Text>
                    <Text style={styles.badge}>{followingPastItems.length}</Text>
                  </View>
                  {followingPastItems.length === 0 ? (
                    <Text style={styles.subtle}>まだ開封済み投稿はありません。</Text>
                  ) : null}
                </View>
              ),
            },
            ...followingPastItems.map(
              (item) =>
                ({
                  key: `following-past-${item.id}`,
                  type: "post" as const,
                  item,
                  opts: { opened: true, source: "following" },
                  estimatedHeight: 180,
                }) satisfies VirtualListRow
            ),
          ],
        })
      )}
    </View>
  );

  const renderSaved = () => {
    const collectionChoices = savedCollections.length
      ? savedCollections
      : [{ key: "all", label: "すべて", count: savedFeed.length } as SavedCollectionSummary];

    return (
      <View style={styles.screen}>
        <View style={styles.screenHeader}>
          <Text style={styles.screenTitle}>保存 / コレクション</Text>
          <View style={styles.headerActions}>
            <Pressable
              style={styles.outlineButton}
              onPress={() => {
                void loadSavedFeed(true);
              }}
            >
              <Text style={styles.outlineButtonText}>更新</Text>
            </Pressable>
          </View>
        </View>

        {renderVirtualRowsList({
          listKey: `saved-${savedCollectionKey}`,
          refreshing: savedFeedLoading,
          onRefresh: () => void loadSavedFeed(true),
          renderPost: renderPostCard,
          renderNotification: renderNotificationCard,
          rows: [
            {
              key: "saved-collections-block",
              type: "block",
              estimatedHeight: 180,
              node: (
                <View style={styles.personaCard}>
                  <View style={styles.postMetaRow}>
                    <Text style={styles.sectionTitle}>コレクション</Text>
                    <Text style={styles.postMeta}>
                      {savedCollectionsAvailable ? "DB保存" : "保存のみ（分類DB未適用）"}
                    </Text>
                  </View>
                  {!savedCollectionsAvailable ? (
                    <Text style={styles.subtle}>
                      `user_saved_post_collections` 未適用のため、分類は使えません。保存一覧は引き続き利用できます。
                    </Text>
                  ) : null}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.chipWrap}>
                      {collectionChoices.map((x) => (
                        <Pressable
                          key={`saved-collection-${x.key}`}
                          style={[styles.assistChip, savedCollectionKey === x.key && styles.modeButtonActive]}
                          onPress={() => {
                            if (savedCollectionKey === x.key) return;
                            setSavedCollectionKey(x.key);
                          }}
                          disabled={savedFeedLoading}
                        >
                          <Text style={styles.assistChipText}>
                            {x.label} ({x.count})
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              ),
            },
            ...(savedFeedLoading && savedFeed.length === 0
              ? [
                  {
                    key: "saved-loading",
                    type: "block" as const,
                    estimatedHeight: 120,
                    node: (
                      <View style={styles.centerBox}>
                        <ActivityIndicator />
                        <Text style={styles.subtle}>保存一覧を読み込み中…</Text>
                      </View>
                    ),
                  },
                ]
              : []),
            ...(savedFeedError
              ? [
                  {
                    key: "saved-error",
                    type: "block" as const,
                    estimatedHeight: 60,
                    node: <Text style={styles.errorText}>{savedFeedError}</Text>,
                  },
                ]
              : []),
            ...(!savedFeedLoading && !savedFeedError && savedFeed.length === 0
              ? [
                  {
                    key: "saved-empty",
                    type: "block" as const,
                    estimatedHeight: 60,
                    node: <Text style={styles.subtle}>保存した投稿はまだありません。</Text>,
                  },
                ]
              : []),
            ...(!savedFeedLoading && !savedFeedError && savedFeed.length > 0
              ? [
                  ...(savedFormatRailItems.length
                    ? [
                        {
                          key: "saved-rail",
                          type: "block" as const,
                          estimatedHeight: 220,
                          node: renderFormatRail(savedFormatRailItems, "saved_format_rail"),
                        },
                      ]
                    : []),
                  {
                    key: "saved-fresh-header",
                    type: "block" as const,
                    estimatedHeight: 64,
                    node: (
                      <View style={styles.personaCard}>
                        <View style={styles.postMetaRow}>
                          <Text style={styles.sectionTitle}>新着</Text>
                          <Text style={styles.badge}>{savedFreshItems.length}</Text>
                        </View>
                        {savedFreshItems.length === 0 ? (
                          <Text style={styles.subtle}>新着はありません。</Text>
                        ) : null}
                      </View>
                    ),
                  },
                  ...savedFreshItems.map(
                    (item) =>
                      ({
                        key: `saved-fresh-${item.id}`,
                        type: "post" as const,
                        item,
                        opts: { opened: false, source: "saved" },
                        estimatedHeight: 190,
                      }) satisfies VirtualListRow
                  ),
                  {
                    key: "saved-past-header",
                    type: "block" as const,
                    estimatedHeight: 64,
                    node: (
                      <View style={styles.personaCard}>
                        <View style={styles.postMetaRow}>
                          <Text style={styles.sectionTitle}>過去</Text>
                          <Text style={styles.badge}>{savedPastItems.length}</Text>
                        </View>
                        {savedPastItems.length === 0 ? (
                          <Text style={styles.subtle}>まだ開封済み保存投稿はありません。</Text>
                        ) : null}
                      </View>
                    ),
                  },
                  ...savedPastItems.map(
                    (item) =>
                      ({
                        key: `saved-past-${item.id}`,
                        type: "post" as const,
                        item,
                        opts: { opened: true, source: "saved" },
                        estimatedHeight: 190,
                      }) satisfies VirtualListRow
                  ),
                  {
                    key: "saved-load-more",
                    type: "block" as const,
                    estimatedHeight: 56,
                    node: (
                      <Pressable
                        style={[
                          styles.outlineButton,
                          (!savedFeedHasMore || savedFeedLoading) && styles.disabledButton,
                        ]}
                        onPress={() => {
                          void loadSavedFeed(false);
                        }}
                        disabled={!savedFeedHasMore || savedFeedLoading}
                      >
                        <Text style={styles.outlineButtonText}>
                          {savedFeedLoading
                            ? "読み込み中…"
                            : savedFeedHasMore
                            ? "さらに読み込む"
                            : "最後まで表示済み"}
                        </Text>
                      </Pressable>
                    ),
                  },
                ]
              : []),
          ],
        })}
      </View>
    );
  };

  const renderPersonaFeed = () => (
    <View style={styles.screen}>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>キャラ別TL</Text>
        <Pressable style={styles.outlineButton} onPress={() => void loadPersonaFeed(true)}>
          <Text style={styles.outlineButtonText}>更新</Text>
        </Pressable>
      </View>

      <View style={styles.headerActions}>
        <Pressable
          style={[
            styles.outlineButton,
            personaFeedStrategy === "same" && styles.modeButtonActive,
          ]}
          onPress={() => setPersonaFeedStrategy("same")}
        >
          <Text style={styles.outlineButtonText}>同キャラ優先</Text>
        </Pressable>
        <Pressable
          style={[
            styles.outlineButton,
            personaFeedStrategy === "compat" && styles.modeButtonActive,
          ]}
          onPress={() => setPersonaFeedStrategy("compat")}
        >
          <Text style={styles.outlineButtonText}>相性優先</Text>
        </Pressable>
      </View>

      {personaFeedTrendingTopics.length > 0 ? (
        <View style={styles.personaCard}>
          <View style={styles.postMetaRow}>
            <Text style={styles.sectionTitle}>トレンドトピック（For You）</Text>
            <Text style={styles.postMeta}>X / Insta 風</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipWrap}>
              {personaFeedTrendingTopics.map((topic) => (
                <Pressable
                  key={`pf-topic-${topic.label}`}
                  style={styles.assistChip}
                  onPress={() => {
                    const label = topic.label.startsWith("#") ? topic.label : `#${topic.label}`;
                    setComposeText((prev) => {
                      const base = prev.trim();
                      const next = base ? `${base}\n${label}` : `${label} `;
                      return next.slice(0, MAX_POST_LENGTH);
                    });
                    setSearchQuery(topic.label.replace(/^#/, ""));
                    setTab("compose");
                  }}
                >
                  <Text style={styles.assistChipText}>
                    {topic.label.startsWith("#") ? topic.label : `#${topic.label}`}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <Text style={styles.subtle}>
            タップで投稿下書きに追加（検索キーワードも同時セット）
          </Text>
        </View>
      ) : null}

      <View style={styles.personaCard}>
        <View style={styles.postMetaRow}>
          <Text style={styles.sectionTitle}>バディ学習の強さ</Text>
          <Text style={styles.postMeta}>
            {personaFeedBuddyLearningModeAvailable ? "DB保存" : "ローカル/既定"}
          </Text>
        </View>
        <Text style={styles.subtle}>
          {personaFeedBuddyLearningModeSource === "preference"
            ? "あなたが選択した設定を使用中"
            : personaFeedBuddyLearningModeSource === "ab_optimized"
            ? "A/B実績（開封率/再訪率）に基づく自動最適化を使用中"
            : personaFeedBuddyLearningModeSource === "ab_assignment" &&
              personaFeedBuddyLearningModeAb?.variant_key
            ? `A/B最適化中: variant ${personaFeedBuddyLearningModeAb.variant_key}（既定 ${personaFeedBuddyLearningModeAb.assigned_mode}）`
            : "既定の学習モードを使用中"}
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            style={[
              styles.outlineButton,
              personaFeedBuddyLearningMode === "adaptive" && styles.modeButtonActive,
              personaFeedSavingBuddyLearningMode && styles.disabledButton,
            ]}
            disabled={personaFeedSavingBuddyLearningMode}
            onPress={() => {
              if (personaFeedBuddyLearningMode === "adaptive") return;
              void (async () => {
                await savePersonaFeedBuddyLearningModePreference("adaptive");
                await loadPersonaFeed(true);
              })();
            }}
          >
            <Text style={styles.outlineButtonText}>adaptive</Text>
          </Pressable>
          <Pressable
            style={[
              styles.outlineButton,
              personaFeedBuddyLearningMode === "stable" && styles.modeButtonActive,
              personaFeedSavingBuddyLearningMode && styles.disabledButton,
            ]}
            disabled={personaFeedSavingBuddyLearningMode}
            onPress={() => {
              if (personaFeedBuddyLearningMode === "stable") return;
              void (async () => {
                await savePersonaFeedBuddyLearningModePreference("stable");
                await loadPersonaFeed(true);
              })();
            }}
          >
            <Text style={styles.outlineButtonText}>stable</Text>
          </Pressable>
        </View>
        <Text style={styles.subtle}>
          {personaFeedBuddyLearningMode === "adaptive"
            ? "新しい反応から表示順を素早く調整。変化を感じやすいモードです。"
            : "表示順の急変を抑えて安定表示。学習は継続しつつ反映を穏やかにします。"}
        </Text>
      </View>

      {personaFeedBasePersona ? (
        <Text style={styles.postMeta}>base @{personaFeedBasePersona}</Text>
      ) : (
        <Text style={styles.subtle}>キャラ分析未作成のため通常TLに近い表示です。</Text>
      )}

      {personaFeedUsedPersonas.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipWrap}>
            {personaFeedUsedPersonas.map((k) => (
              <Text key={k} style={styles.matchChip}>
                @{k}
              </Text>
            ))}
          </View>
        </ScrollView>
      ) : null}
      {personaFeedBuddyPersonas.length > 0 ? (
        <View style={styles.personaCard}>
          <View style={styles.postMetaRow}>
            <Text style={styles.sectionTitle}>
              バディ優先（{buddyLearningModeLabel(personaFeedBuddyLearningMode)} / 最近の投稿傾向）
            </Text>
            {personaFeedBuddyMissionCandidates.length > 1 ? (
              <Pressable
                style={styles.outlineButton}
                onPress={() => setPersonaFeedBuddyMissionCursor((prev) => prev + 1)}
              >
                <Text style={styles.outlineButtonText}>ミッション変更</Text>
              </Pressable>
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipWrap}>
              {personaFeedBuddyPersonas.slice(0, 8).map((x) => (
                <Text key={`pf-buddy-${x.key}`} style={styles.matchChip}>
                  @{x.key} {(clamp(x.score, 0, 1) * 100).toFixed(0)}% / 係数+
                  {Math.round(normalizeBuddyBonusScale(x.bonus_scale, DEFAULT_BUDDY_BONUS_SCALE) * 100)}
                  % / 信頼
                  {Math.round(learningConfidenceFromSamples(x.learned_samples) * 100)}%
                  {personaFeedBuddyMissionXpAvailable
                    ? ` / Lv${missionLevelStats(personaFeedBuddyMissionXpByBuddy[x.key]?.xpTotal).level}`
                    : ""}
                </Text>
              ))}
            </View>
          </ScrollView>
          {personaFeedBuddyProgressRows.length > 0 ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: "#D1FAE5",
                backgroundColor: "#F0FDF4",
                borderRadius: 10,
                padding: 10,
                gap: 8,
              }}
            >
              <Text style={styles.sectionTitle}>学習進捗</Text>
              {personaFeedBuddyProgressRows.slice(0, 3).map((x) => (
                <View key={`pf-buddy-progress-${x.key}`} style={{ gap: 4 }}>
                  <View style={styles.postMetaRow}>
                    <Text style={styles.postMeta}>
                      @{x.key} {x.stageLabel}
                    </Text>
                    <Text style={styles.postMeta}>
                      {Math.round(x.progress * 100)}% / 信頼{Math.round(x.confidence * 100)}%
                    </Text>
                  </View>
                  <View style={[styles.progressTrack, { backgroundColor: "#D1FAE5" }]}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${Math.round(x.progress * 100)}%`, backgroundColor: "#10B981" },
                      ]}
                    />
                  </View>
                  {Array.isArray(x.history_points) && x.history_points.length > 1 ? (
                    <View style={{ gap: 4 }}>
                      <Text style={[styles.postMeta, { fontSize: 11 }]}>
                        係数推移（最近）: TLが自分向けに育っているか確認
                      </Text>
                      <View
                        style={{
                          height: 34,
                          borderWidth: 1,
                          borderColor: "#D1FAE5",
                          borderRadius: 8,
                          backgroundColor: "#ECFDF5",
                          paddingHorizontal: 6,
                          paddingVertical: 5,
                          flexDirection: "row",
                          alignItems: "flex-end",
                          gap: 3,
                        }}
                      >
                        {x.history_points.slice(-12).map((pt, idx, arr) => {
                          const values = arr.map((v) =>
                            normalizeBuddyBonusScale(v?.bonus_scale, x.bonus_scale)
                          );
                          const min = Math.min(...values);
                          const max = Math.max(...values);
                          const cur = values[idx];
                          const ratio = max - min > 0.0001 ? (cur - min) / (max - min) : 0.5;
                          const h = 6 + Math.round(ratio * 16);
                          return (
                            <View
                              key={`pf-buddy-hist-${x.key}-${idx}-${String(pt?.created_at ?? idx)}`}
                              style={{
                                width: 4,
                                height: h,
                                borderRadius: 2,
                                backgroundColor: "#10B981",
                                opacity: 0.9,
                              }}
                            />
                          );
                        })}
                      </View>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
          <Text style={styles.subtle}>相性優先モードでは、この係数を表示順にも反映します。</Text>
          {personaFeedBuddyMission ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: "#D1FAE5",
                backgroundColor: "#F0FDF4",
                borderRadius: 10,
                padding: 10,
                gap: 8,
              }}
            >
              <Text style={styles.postMeta}>{personaFeedBuddyMission.text}</Text>
              <Text style={styles.subtle}>
                連続達成 {personaFeedBuddyMission.streakDays}日 ・{" "}
                {personaFeedBuddyMissionProgressAvailable ? "進捗はDB保存" : "進捗はローカル保持"}
                {personaFeedBuddyMissionXpAvailable
                  ? ` ・ Lv${missionLevelStats(personaFeedBuddyMission.xp?.xpTotal).level}`
                  : ""}
              </Text>
              {personaFeedBuddyMissionXpAvailable ? (
                <View style={{ gap: 4 }}>
                  {(() => {
                    const xp = missionLevelStats(personaFeedBuddyMission.xp?.xpTotal);
                    const completed = Math.max(
                      0,
                      Math.floor(Number(personaFeedBuddyMission.xp?.completedMissions ?? 0) || 0)
                    );
                    return (
                      <>
                        <View style={styles.postMetaRow}>
                          <Text style={styles.postMeta}>
                            XP {xp.currentLevelXp}/{xp.nextLevelXp}（累計 {xp.xpTotal}）
                          </Text>
                          <Text style={styles.postMeta}>達成 {completed}回</Text>
                        </View>
                        <View style={[styles.progressTrack, { backgroundColor: "#BFDBFE" }]}>
                          <View
                            style={[
                              styles.progressFill,
                              {
                                width: `${Math.round(clamp(xp.levelProgressRatio, 0, 1) * 100)}%`,
                                backgroundColor: "#06B6D4",
                              },
                            ]}
                          />
                        </View>
                      </>
                    );
                  })()}
                </View>
              ) : null}
              <View style={styles.postMetaRow}>
                <View style={[styles.progressTrack, { flex: 1, backgroundColor: "#D1FAE5" }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.round(
                          clamp(
                            personaFeedBuddyMission.progress / Math.max(1, personaFeedBuddyMission.goal),
                            0,
                            1
                          ) * 100
                        )}%`,
                        backgroundColor: personaFeedBuddyMission.unlocked ? "#F59E0B" : "#10B981",
                      },
                    ]}
                  />
                </View>
                <Text style={styles.postMeta}>
                  {personaFeedBuddyMission.progress}/{personaFeedBuddyMission.goal}
                </Text>
              </View>
              {!personaFeedBuddyMission.unlocked ? (
                <Text style={styles.subtle}>
                  ミッション達成で「攻め/共感/短文」の3パターン自動リライトを解放
                </Text>
              ) : (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: "#FDE68A",
                    backgroundColor: "#FFFBEB",
                    borderRadius: 10,
                    padding: 10,
                    gap: 8,
                  }}
                >
                  <Text style={styles.sectionTitle}>
                    リライト提案 解放済み（@{personaFeedBuddyMission.key} ミッション達成）
                  </Text>
                  <Text style={styles.subtle}>
                    {personaFeedRewriteLearningLoading
                      ? "実反応学習を更新中…"
                      : personaFeedRewriteLearningAvailable
                      ? `実反応学習 ${personaFeedRewriteLearningSource}${
                          personaFeedRewriteLearningContextLabel
                            ? ` / ${personaFeedRewriteLearningContextLabel}`
                            : ""
                        }`
                      : "学習データ準備中"}
                  </Text>
                  <TextInput
                    value={personaFeedBuddyMissionRewriteSeed}
                    onChangeText={setPersonaFeedBuddyMissionRewriteSeed}
                    placeholder="下書きを入れると3パターンに変換（空欄なら定型）"
                    style={[
                      styles.textInput,
                      styles.bioInput,
                      { minHeight: 72, backgroundColor: "#FFFFFF" },
                    ]}
                    multiline
                  />
                  {personaFeedMissionRewrites.map((v, idx) => (
                    <View
                      key={`pf-mission-rewrite-${idx}`}
                      style={{
                        borderWidth: 1,
                        borderColor: "#FDE68A",
                        borderRadius: 10,
                        backgroundColor: "#FFFFFF",
                        padding: 10,
                        gap: 6,
                      }}
                    >
                      <View style={styles.postMetaRow}>
                        <View style={{ flex: 1, gap: 4 }}>
                          <Text style={styles.sectionTitle}>{v.style}</Text>
                          <Text style={[styles.postMeta, { fontSize: 11 }]}>
                            補正 x{Number(v.learning?.multiplier ?? 1).toFixed(2)} / 信頼
                            {Math.round(clamp(Number(v.learning?.confidence ?? 0) || 0, 0, 1) * 100)}
                            % / n={Math.max(0, Math.floor(Number(v.learning?.samples ?? 0) || 0))}
                          </Text>
                        </View>
                        <Pressable
                          style={styles.outlineButton}
                          onPress={() => {
                            setComposeText(v.text);
                            setComposeMissionRewriteAttribution({
                              styleKey: v.styleKey,
                              styleLabel: v.style,
                              buddyPersonaKey: personaFeedBuddyMission.key,
                              basePersonaKey: personaFeedBasePersona,
                              suggestedAt: new Date().toISOString(),
                            });
                            setTab("compose");
                          }}
                        >
                          <Text style={styles.outlineButtonText}>作成に使う</Text>
                        </Pressable>
                      </View>
                      <Text style={styles.postText}>{v.text}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : null}
        </View>
      ) : null}

      {personaFeedLoading && personaFeedItems.length === 0 ? (
        <View style={styles.centerBox}>
          <ActivityIndicator />
          <Text style={styles.subtle}>読み込み中…</Text>
        </View>
      ) : personaFeedError ? (
        <Text style={styles.errorText}>{personaFeedError}</Text>
      ) : personaFeedItems.length === 0 ? (
        <Text style={styles.subtle}>表示できる投稿がありません。</Text>
      ) : (
        renderVirtualRowsList({
          listKey: `persona-feed-${personaFeedStrategy}-${personaFeedBasePersona ?? "none"}`,
          refreshing: personaFeedLoading,
          onRefresh: () => void loadPersonaFeed(true),
          renderPost: renderPostCard,
          renderNotification: renderNotificationCard,
          rows: [
            ...(personaFeedFormatRailItems.length
              ? [
                  {
                    key: "persona-feed-rail",
                    type: "block" as const,
                    estimatedHeight: 220,
                    node: renderFormatRail(personaFeedFormatRailItems, "persona_feed_format_rail"),
                  },
                ]
              : []),
            {
              key: "persona-feed-fresh-header",
              type: "block" as const,
              estimatedHeight: 64,
              node: (
                <View style={styles.personaCard}>
                  <View style={styles.postMetaRow}>
                    <Text style={styles.sectionTitle}>新着</Text>
                    <Text style={styles.badge}>{personaFeedFreshItems.length}</Text>
                  </View>
                  {personaFeedFreshItems.length === 0 ? (
                    <Text style={styles.subtle}>新着はありません。</Text>
                  ) : null}
                </View>
              ),
            },
            ...personaFeedFreshItems.map(
              (item) =>
                ({
                  key: `persona-feed-fresh-${item.id}`,
                  type: "block" as const,
                  estimatedHeight: 260,
                  node: (
                    <View style={styles.personaCard}>
                      {renderPostCard(item, {
                        personaMatch: item.persona_match,
                        opened: false,
                        source: "personaFeed",
                      })}
                      <View style={styles.postMetaRow}>
                        <Text style={styles.postMeta}>
                          {personaFeedReasonLabel(item.persona_match?.reason)}
                        </Text>
                        <View style={styles.headerActions}>
                          <Pressable
                            style={styles.outlineButton}
                            onPress={() => {
                              Alert.alert(
                                "表示理由",
                                explainPersonaFeedReason(item, personaFeedBasePersona)
                              );
                            }}
                          >
                            <Text style={styles.outlineButtonText}>なぜ表示？</Text>
                          </Pressable>
                          <Pressable
                            style={styles.outlineButton}
                            onPress={() => {
                              setPersonaFeedItems((prev) => prev.filter((x) => x.id !== item.id));
                              void logPersonaFeedFeedback({
                                postId: item.id,
                                personaKey: item.persona_match?.key ?? null,
                                basePersona: personaFeedBasePersona,
                                reason: item.persona_match?.reason ?? null,
                                event: "hide",
                              });
                            }}
                          >
                            <Text style={styles.outlineButtonText}>興味なし</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  ),
                }) satisfies VirtualListRow
            ),
            {
              key: "persona-feed-past-header",
              type: "block" as const,
              estimatedHeight: 64,
              node: (
                <View style={styles.personaCard}>
                  <View style={styles.postMetaRow}>
                    <Text style={styles.sectionTitle}>過去</Text>
                    <Text style={styles.badge}>{personaFeedPastItems.length}</Text>
                  </View>
                  {personaFeedPastItems.length === 0 ? (
                    <Text style={styles.subtle}>まだ開封済み投稿はありません。</Text>
                  ) : null}
                </View>
              ),
            },
            ...personaFeedPastItems.map(
              (item) =>
                ({
                  key: `persona-feed-past-${item.id}`,
                  type: "block" as const,
                  estimatedHeight: 260,
                  node: (
                    <View style={styles.personaCard}>
                      {renderPostCard(item, {
                        personaMatch: item.persona_match,
                        opened: true,
                        source: "personaFeed",
                      })}
                      <View style={styles.postMetaRow}>
                        <Text style={styles.postMeta}>
                          {personaFeedReasonLabel(item.persona_match?.reason)}
                        </Text>
                        <View style={styles.headerActions}>
                          <Pressable
                            style={styles.outlineButton}
                            onPress={() => {
                              Alert.alert(
                                "表示理由",
                                explainPersonaFeedReason(item, personaFeedBasePersona)
                              );
                            }}
                          >
                            <Text style={styles.outlineButtonText}>なぜ表示？</Text>
                          </Pressable>
                          <Pressable
                            style={styles.outlineButton}
                            onPress={() => {
                              setPersonaFeedItems((prev) => prev.filter((x) => x.id !== item.id));
                              void logPersonaFeedFeedback({
                                postId: item.id,
                                personaKey: item.persona_match?.key ?? null,
                                basePersona: personaFeedBasePersona,
                                reason: item.persona_match?.reason ?? null,
                                event: "hide",
                              });
                            }}
                          >
                            <Text style={styles.outlineButtonText}>興味なし</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  ),
                }) satisfies VirtualListRow
            ),
            {
              key: "persona-feed-load-more",
              type: "block" as const,
              estimatedHeight: 56,
              node: (
                <Pressable
                  style={[
                    styles.outlineButton,
                    (!personaFeedHasMore || personaFeedLoading) && styles.disabledButton,
                  ]}
                  onPress={() => void loadPersonaFeed(false)}
                  disabled={!personaFeedHasMore || personaFeedLoading}
                >
                  <Text style={styles.outlineButtonText}>
                    {personaFeedLoading
                      ? "読み込み中…"
                      : personaFeedHasMore
                      ? "もっと読む"
                      : "これ以上ありません"}
                  </Text>
                </Pressable>
              ),
            },
          ],
        })
      )}
    </View>
  );

  const renderEvolution = () => (
    <View style={styles.screen}>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>キャラ進化</Text>
        <Pressable style={styles.outlineButton} onPress={() => void loadPersonaEvolution()}>
          <Text style={styles.outlineButtonText}>更新</Text>
        </Pressable>
      </View>

      {evolutionLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator />
          <Text style={styles.subtle}>読み込み中…</Text>
        </View>
      ) : evolutionError ? (
        <Text style={styles.errorText}>{evolutionError}</Text>
      ) : evolutionSnapshots.length === 0 ? (
        <Text style={styles.subtle}>投稿履歴がまだ不足しています。</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.feedList}>
          <View style={styles.personaCard}>
            <Text style={styles.sectionTitle}>遷移ポイント {evolutionTransitions.length} 回</Text>
            <Text style={styles.postMeta}>source: {evolutionSource || "-"}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipWrap}>
                {evolutionTransitions.map((s) => (
                  <Text key={`${s.at}:${s.top_key}`} style={styles.matchChip}>
                    {String(s.at).slice(5, 10)} {evolutionTitles[s.top_key] ?? s.top_key}
                  </Text>
                ))}
              </View>
            </ScrollView>
          </View>

          {evolutionSnapshots
            .slice()
            .reverse()
            .map((s) => {
              const scorePct = toPercent01(s.top_score);
              const confPct = toPercent01(s.confidence);
              return (
                <View key={`${s.at}:${s.top_key}`} style={styles.personaCard}>
                  <View style={styles.postMetaRow}>
                    <Text style={styles.postAuthor}>
                      {evolutionTitles[s.top_key] ?? s.top_key}
                    </Text>
                    <Text style={styles.postMeta}>{String(s.at).slice(0, 10)}</Text>
                  </View>
                  <Text style={styles.postMeta}>主キャラスコア {scorePct}%</Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${Math.max(4, scorePct)}%` }]} />
                  </View>
                  <Text style={styles.postMeta}>
                    信頼度 {confPct}% ・ 投稿数 {s.posts}
                  </Text>
                </View>
              );
            })}
        </ScrollView>
      )}
    </View>
  );

  const renderDialogue = () => (
    <View style={styles.screen}>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>キャラ対話AI</Text>
        <Pressable style={styles.outlineButton} onPress={() => void generateDialogueDrafts()}>
          <Text style={styles.outlineButtonText}>{dialogueLoading ? "生成中…" : "草案生成"}</Text>
        </Pressable>
      </View>

      <View style={styles.headerActions}>
        <Pressable
          style={[
            styles.outlineButton,
            dialogueMode === "friendship" && styles.modeButtonActive,
          ]}
          onPress={() => setDialogueMode("friendship")}
        >
          <Text style={styles.outlineButtonText}>友情</Text>
        </Pressable>
        <Pressable
          style={[styles.outlineButton, dialogueMode === "romance" && styles.modeButtonActive]}
          onPress={() => setDialogueMode("romance")}
        >
          <Text style={styles.outlineButtonText}>恋愛</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipWrap}>
          {(personaRows.length > 0 ? personaRows.map((x) => x.persona_key) : personaDefs.map((x) => x.key))
            .slice(0, 16)
            .map((key) => {
              const active = key === dialogueSourceKey;
              const title = personaDefs.find((d) => d.key === key)?.title ?? key;
              return (
                <Pressable
                  key={key}
                  style={[styles.assistChip, active && styles.modeButtonActive]}
                  onPress={() => setDialogueSourceKey(key)}
                >
                  <Text style={styles.assistChipText}>{title}</Text>
                </Pressable>
              );
            })}
        </View>
      </ScrollView>

      {dialogueCompatLoading ? (
        <Text style={styles.subtle}>相性候補を計算中…</Text>
      ) : dialogueCompatError ? (
        <Text style={styles.errorText}>{dialogueCompatError}</Text>
      ) : dialogueCompatItems.length === 0 ? (
        <Text style={styles.subtle}>相性候補がありません。</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipWrap}>
            {dialogueCompatItems.slice(0, 14).map((x) => {
              const active = x.targetKey === dialogueTargetKey;
              return (
                <Pressable
                  key={x.targetKey}
                  style={[styles.assistChip, active && styles.modeButtonActive]}
                  onPress={() => setDialogueTargetKey(x.targetKey)}
                >
                  <Text style={styles.assistChipText}>
                    {x.title} {toPercent01(x.score)}%
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}

      {selectedDialogueCompat?.insights ? (
        <View style={styles.personaCard}>
          <Text style={styles.sectionTitle}>
            相性診断: {selectedDialogueCompat.insights.chemistryType} (
            {selectedDialogueCompat.insights.overallScore}%)
          </Text>
          <View style={styles.chipWrap}>
            {selectedDialogueCompat.insights.dimensions.map((d) => (
              <Text key={d.key} style={styles.matchChip}>
                {d.label} {d.score}%
              </Text>
            ))}
          </View>
          {selectedDialogueCompat.insights.strengths.slice(0, 2).map((s) => (
            <Text key={`strength-${s}`} style={styles.postMeta}>
              強み: {s}
            </Text>
          ))}
          {selectedDialogueCompat.insights.risks.slice(0, 2).map((r) => (
            <Text key={`risk-${r}`} style={styles.postMeta}>
              注意: {r}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.personaCard}>
        <Text style={styles.sectionTitle}>キャラ口調ガイド</Text>
        <Text style={styles.postMeta}>
          話し手: {(dialogueSourceDef?.title ?? dialogueSourceKey) || "-"} ・{" "}
          {dialogueSourceProfile.summary}
        </Text>
        <Text style={styles.postMeta}>口調: {dialogueSourceProfile.toneGuide}</Text>
        <Text style={styles.postMeta}>返信フック: {dialogueSourceProfile.hook}</Text>
        <Text style={styles.postMeta}>
          相手: {(dialogueTargetDef?.title ?? dialogueTargetKey) || "-"} ・{" "}
          {dialogueTargetProfile.summary}
        </Text>
      </View>

      <TextInput
        value={dialogueContext}
        onChangeText={setDialogueContext}
        multiline
        placeholder="会話の文脈（任意）"
        style={[styles.textInput, styles.replyInput]}
      />
      <TextInput
        value={dialogueReplyToText}
        onChangeText={setDialogueReplyToText}
        multiline
        placeholder="返信先投稿本文（任意）"
        style={[styles.textInput, styles.replyInput]}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipWrap}>
          {dialogueQuickContexts.map((x) => (
            <Pressable key={x} style={styles.assistChip} onPress={() => setDialogueContext(x)}>
              <Text style={styles.assistChipText}>{x}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {dialogueError ? <Text style={styles.errorText}>{dialogueError}</Text> : null}

      {dialogueResult ? (
        <ScrollView contentContainerStyle={styles.feedList}>
          <View style={styles.personaCard}>
            <Text style={styles.sectionTitle}>方針: {dialogueResult.strategy || "-"}</Text>
            {dialogueResult.tips.map((tip) => (
              <Text key={tip} style={styles.postMeta}>
                ・{tip}
              </Text>
            ))}
          </View>
          {dialogueResult.drafts.map((draft) => (
            <View key={draft} style={styles.personaCard}>
              <Text style={styles.postText}>{draft}</Text>
              <Pressable
                style={styles.outlineButton}
                onPress={() => {
                  setComposeText((prev) => (prev.trim() ? `${prev}\n${draft}` : draft));
                  setTab("compose");
                }}
              >
                <Text style={styles.outlineButtonText}>投稿に使う</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );

  const renderCompose = () => (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.feedList}>
        <Text style={styles.screenTitle}>投稿</Text>

        {composeLastPostedResult ? (
          <View style={styles.personaCard}>
            <View style={styles.postMetaRow}>
              <Text style={styles.sectionTitle}>投稿結果サマリー</Text>
              <View style={styles.headerActions}>
                <Pressable
                  style={[styles.outlineButton, composeLastPostedResultLoading && styles.disabledButton]}
                  onPress={() =>
                    void refreshComposeLastPostedResult({
                      postId: composeLastPostedResult.postId,
                      createdAt: composeLastPostedResult.createdAt,
                      text: composeLastPostedResult.text,
                      liePct: composeLastPostedResult.liePct,
                      personaKey: composeLastPostedResult.personaKey,
                      buzzScore: composeLastPostedResult.buzzScore,
                      calibratedBuzzScore: composeLastPostedResult.calibratedBuzzScore,
                      buzzLevel: composeLastPostedResult.buzzLevel,
                    })
                  }
                  disabled={composeLastPostedResultLoading}
                >
                  <Text style={styles.outlineButtonText}>
                    {composeLastPostedResultLoading ? "更新中…" : "結果更新"}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.outlineButton}
                  onPress={() => {
                    void openPostDetail(composeLastPostedResult.postId, { source: "compose_result" });
                  }}
                >
                  <Text style={styles.outlineButtonText}>投稿詳細</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.postMeta}>
              {formatDateTime(composeLastPostedResult.createdAt)} ・ 嘘っぽさ {composeLastPostedResult.liePct}% ・
              バズ予測 {composeLastPostedResult.calibratedBuzzScore}% ({composeLastPostedResult.buzzLevel})
            </Text>
            <Text style={styles.postMeta}>
              {composeLastPostedResult.personaKey
                ? `投稿キャラ @${composeLastPostedResult.personaKey}`
                : "投稿キャラ未設定"}
            </Text>
            <View style={styles.chipWrap}>
              <Text style={styles.matchChip}>開封 {composeLastPostedResult.counts.opens}</Text>
              <Text style={styles.matchChip}>保存 {composeLastPostedResult.counts.saves}</Text>
              <Text style={styles.matchChip}>返信 {composeLastPostedResult.counts.replies}</Text>
              <Text style={styles.matchChip}>いいね {composeLastPostedResult.counts.likes}</Text>
              <Text style={styles.matchChip}>拡散 {composeLastPostedResult.counts.boosts}</Text>
            </View>
            <Text style={styles.postMeta}>
              保存率{" "}
              {composeLastPostedResult.rates.savePerOpen == null
                ? "-"
                : `${Math.round(composeLastPostedResult.rates.savePerOpen * 100)}%`}
              {" "}・ 返信率{" "}
              {composeLastPostedResult.rates.replyPerOpen == null
                ? "-"
                : `${Math.round(composeLastPostedResult.rates.replyPerOpen * 100)}%`}
              {" "}・ 開封率（キャラTL）{" "}
              {composeLastPostedResult.rates.personaFeedOpenRate == null
                ? "-"
                : `${Math.round(composeLastPostedResult.rates.personaFeedOpenRate * 100)}%`}
            </Text>
            <View style={{ gap: 4 }}>
              <Text style={styles.sectionTitle}>次に何を直すと伸びるか</Text>
              {composeLastPostedResult.suggestions.map((s) => (
                <Text key={s} style={styles.postMeta}>
                  ・{s}
                </Text>
              ))}
            </View>
            {composeLastPostedResultError ? (
              <Text style={styles.errorText}>{composeLastPostedResultError}</Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.personaCard}>
          <View style={styles.screenHeader}>
            <Text style={styles.sectionTitle}>キャラ文体アシスト</Text>
            <Pressable style={styles.outlineButton} onPress={() => void loadPersonaData()}>
              <Text style={styles.outlineButtonText}>更新</Text>
            </Pressable>
          </View>
          {dominantPersonaTitle ? (
            <>
              <Text style={styles.postMeta}>現在のメインキャラ: {dominantPersonaTitle}</Text>
              <Text style={styles.postMeta}>
                話し方ヒント: {normalizeTalkStyle(dominantTalkStyle)}
              </Text>
              <View style={styles.chipWrap}>
                {personaStarters.map((starter) => (
                  <Pressable
                    key={starter}
                    style={styles.assistChip}
                    onPress={() => applyStarter(starter)}
                  >
                    <Text style={styles.assistChipText}>{starter}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <Text style={styles.subtle}>キャラ分析データがまだありません。</Text>
          )}
        </View>

        <View style={styles.personaCard}>
          <View style={styles.screenHeader}>
            <Text style={styles.sectionTitle}>今日のお題</Text>
            <Pressable style={styles.outlineButton} onPress={() => void loadDailyPrompt()}>
              <Text style={styles.outlineButtonText}>更新</Text>
            </Pressable>
          </View>
          {promptLoading ? (
            <Text style={styles.subtle}>読み込み中…</Text>
          ) : promptError ? (
            <Text style={styles.errorText}>{promptError}</Text>
          ) : !dailyPrompt ? (
            <Text style={styles.subtle}>今日はまだお題がありません。</Text>
          ) : (
            <>
              <Text style={styles.postAuthor}>{dailyPrompt.title}</Text>
              {dailyPrompt.body ? (
                <Text style={styles.postMeta}>{dailyPrompt.body}</Text>
              ) : null}
              <Pressable
                style={styles.outlineButton}
                onPress={() =>
                  applyStarter(
                    `【今日のお題】${dailyPrompt.title}\n${dailyPrompt.body ?? ""}\n`
                  )
                }
              >
                <Text style={styles.outlineButtonText}>このお題で書き始める</Text>
              </Pressable>
            </>
          )}
        </View>

        <TextInput
          value={composeText}
          onChangeText={(v) => setComposeText(v.slice(0, MAX_POST_LENGTH))}
          multiline
          placeholder="いま何してる？"
          style={styles.composeInput}
        />
        {composeMissionRewriteAttribution ? (
          <View style={styles.personaCard}>
            <Text style={styles.sectionTitle}>ミッションリライト適用中</Text>
            <Text style={styles.postMeta}>
              @{composeMissionRewriteAttribution.buddyPersonaKey} /{" "}
              {composeMissionRewriteAttribution.styleLabel}
            </Text>
            <Pressable
              style={styles.outlineButton}
              onPress={() => setComposeMissionRewriteAttribution(null)}
            >
              <Text style={styles.outlineButtonText}>リライトタグを外す</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.personaCard}>
          <Text style={styles.sectionTitle}>投稿キャラ付け</Text>
          {composePersonaCandidates.length === 0 ? (
            <Text style={styles.subtle}>投稿文から自動推定します（2文字以上）</Text>
          ) : (
            <View style={styles.chipWrap}>
              {composePersonaCandidates.map((c) => (
                <Pressable
                  key={c.key}
                  style={[
                    styles.assistChip,
                    composePersonaSelected === c.key && styles.modeButtonActive,
                  ]}
                  onPress={() => setComposePersonaSelected(c.key)}
                >
                  <Text style={styles.assistChipText}>
                    {c.title} {toPercent01(c.score / 5)}%
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        <View style={styles.personaCard}>
          <Text style={styles.sectionTitle}>相性バディ提案</Text>
          {!composePersonaSelected ? (
            <Text style={styles.subtle}>主キャラを選ぶと、相性の良い副キャラを提案します。</Text>
          ) : composeCompatLoading ? (
            <Text style={styles.subtle}>相性データを取得中…</Text>
          ) : composeCompatItems.length === 0 ? (
            <Text style={styles.subtle}>この主キャラの相性候補はまだありません。</Text>
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipWrap}>
                  {composeCompatItems.slice(0, 10).map((item) => (
                    <Pressable
                      key={`compose-compat-${item.targetKey}`}
                      style={[
                        styles.assistChip,
                        composeBlendSecondaryKey === item.targetKey && styles.modeButtonActive,
                      ]}
                      onPress={() => {
                        setComposeBlendSecondaryKey(item.targetKey);
                        setComposeBlendPrimarySharePct(65);
                      }}
                    >
                      <Text style={styles.assistChipText}>
                        {item.title} {toCompatPercent(item.score)}%
                        {item.relationLabel ? ` / ${item.relationLabel}` : ""}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
              <Text style={styles.postMeta}>
                タップで副キャラ設定（主65% / 副35%）に自動調整します。
              </Text>
            </>
          )}
          {composeCompatError ? <Text style={styles.errorText}>{composeCompatError}</Text> : null}
        </View>
        <View style={styles.personaCard}>
          <View style={styles.screenHeader}>
            <Text style={styles.sectionTitle}>キャラ文脈バズ診断</Text>
            <Text style={styles.postMeta}>
              {composeBuzz.score} / {composeBuzz.level}
            </Text>
          </View>
          <Text style={styles.postMeta}>
            補正後予測 {composeCalibratedBuzzScore}%{" "}
            {composeBuzzCalibration
              ? `(x${composeBuzzCalibration.multiplier.toFixed(2)} / 信頼 ${(composeBuzzCalibration.confidence * 100).toFixed(0)}% / n=${composeBuzzCalibration.samples})`
              : "(補正データなし)"}
          </Text>
          <View style={styles.chipWrap}>
            {composeBuzz.metrics.map((m) => (
              <View key={m.key} style={styles.assistChip}>
                <Text style={styles.assistChipText}>
                  {m.label} {m.score}%
                </Text>
              </View>
            ))}
          </View>
          {composeBuzz.tips.slice(0, 3).map((tip) => (
            <Text key={tip} style={styles.postMeta}>
              ・{tip}
            </Text>
          ))}
          {composeBuzz.hashtags.length > 0 ? (
            <Text style={styles.postMeta}>{composeBuzz.hashtags.join(" ")}</Text>
          ) : null}
          <Text style={styles.postMeta}>返信促進: {composeBuzz.replyPrompt}</Text>
          <Pressable style={styles.outlineButton} onPress={appendComposeBuzzPrompt}>
            <Text style={styles.outlineButtonText}>返信導線を末尾に追加</Text>
          </Pressable>
        </View>
        <View style={styles.personaCard}>
          <Text style={styles.sectionTitle}>自動リライト（ワンタップ）</Text>
          {composeRewriteVariants.length === 0 ? (
            <Text style={styles.subtle}>本文を入力すると 3 パターンを生成します。</Text>
          ) : (
            composeRewriteVariants.map((v) => (
              <View key={v.key} style={styles.soulmateRow}>
                <Text style={styles.postMeta}>
                  {v.label} - {v.intent}
                </Text>
                <Text style={styles.postText}>{v.text}</Text>
                <Pressable
                  style={styles.outlineButton}
                  onPress={() => applyComposeRewrite(v.text)}
                >
                  <Text style={styles.outlineButtonText}>この文に置き換える</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>
        <View style={styles.personaCard}>
          <Text style={styles.sectionTitle}>デュアルキャラ・ブレンド草案</Text>
          {!composePersonaSelected ? (
            <Text style={styles.subtle}>主キャラを選ぶと、2キャラ混合の草案を生成できます。</Text>
          ) : composeBlendSecondaryOptions.length === 0 ? (
            <Text style={styles.subtle}>副キャラ候補がありません。</Text>
          ) : (
            <>
              <Text style={styles.postMeta}>
                主 {composeBlendPrimarySharePct}% / 副 {100 - composeBlendPrimarySharePct}%
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipWrap}>
                  {[30, 50, 70].map((pct) => (
                    <Pressable
                      key={`blend-pct-${pct}`}
                      style={[
                        styles.assistChip,
                        composeBlendPrimarySharePct === pct && styles.modeButtonActive,
                      ]}
                      onPress={() => setComposeBlendPrimarySharePct(pct)}
                    >
                      <Text style={styles.assistChipText}>
                        主{pct}%/副{100 - pct}%
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipWrap}>
                  {composeBlendSecondaryOptions.slice(0, 20).map((def) => (
                    <Pressable
                      key={`blend-secondary-${def.key}`}
                      style={[
                        styles.assistChip,
                        composeBlendSecondaryDef?.key === def.key && styles.modeButtonActive,
                      ]}
                      onPress={() => setComposeBlendSecondaryKey(def.key)}
                    >
                      <Text style={styles.assistChipText}>{def.title ?? def.key}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
              {composeBlendRewrites.length === 0 ? (
                <Text style={styles.subtle}>本文入力後に混合草案を生成します。</Text>
              ) : (
                composeBlendRewrites.map((v) => (
                  <View key={`blend-${v.key}`} style={styles.soulmateRow}>
                    <Text style={styles.postMeta}>
                      {v.label} - 主 {Math.round(v.primaryShare * 100)}% / 副{" "}
                      {Math.round(v.secondaryShare * 100)}%
                    </Text>
                    <Text style={styles.postText}>{v.text}</Text>
                    <Pressable
                      style={styles.outlineButton}
                      onPress={() => applyComposeRewrite(v.text)}
                    >
                      <Text style={styles.outlineButtonText}>この文に置き換える</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </>
          )}
        </View>
        <View style={styles.composeMetaRow}>
          <Text style={styles.subtle}>残り {MAX_POST_LENGTH - composeText.length} 文字</Text>
          <Text style={styles.subtle}>嘘っぽさ {(score * 100).toFixed(1)}%</Text>
        </View>
        {composeText.trim() ? (
          <View style={styles.personaCard}>
            <View style={styles.postMetaRow}>
              <Text style={styles.sectionTitle}>嘘スコア診断（投稿前チェック）</Text>
              <Text style={styles.postMeta}>
                {composeLieAnalysis.level === "high"
                  ? "高め"
                  : composeLieAnalysis.level === "mid"
                  ? "中"
                  : "低め"}
              </Text>
            </View>
            <View style={styles.chipWrap}>
              {composeLieAnalysis.cautionChips.map((chip) => (
                <Text key={`compose-lie-caution-${chip}`} style={styles.matchChip}>
                  {chip}
                </Text>
              ))}
              {composeLieAnalysis.reliefChips.map((chip) => (
                <Text
                  key={`compose-lie-relief-${chip}`}
                  style={[styles.matchChip, { backgroundColor: "#ECFDF5", color: "#065F46" }]}
                >
                  {chip}
                </Text>
              ))}
            </View>
            {composeLieAnalysis.reasons.map((reason) => (
              <Text key={`compose-lie-reason-${reason}`} style={styles.postMeta}>
                ・{reason}
              </Text>
            ))}
            <Text style={styles.subtle}>
              数値・出典・前提条件を足すと、見た人に伝わる精度が上がりやすくなります。
            </Text>
          </View>
        ) : null}
        <Pressable
          style={[styles.primaryButton, (!composeText.trim() || posting) && styles.disabledButton]}
          onPress={() => void onSubmitPost()}
          disabled={!composeText.trim() || posting}
        >
          <Text style={styles.primaryButtonText}>{posting ? "投稿中…" : "投稿する"}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );

  const renderProfile = () => {
    const profileCompletionChecks = [
      Boolean(handle.trim()),
      Boolean(displayName.trim()),
      bio.trim().length >= 20,
      Boolean(accountEmailConfirmedAt),
      pushEnabled,
    ];
    const profileCompletionPercent = Math.round(
      (profileCompletionChecks.filter(Boolean).length / profileCompletionChecks.length) * 100
    );
    const unreadGrowthNotifications = notifications.filter(
      (n) => !n.read_at && isCreatorGrowthNotificationKind(n.kind)
    ).length;

    return (
      <View style={styles.screen}>
        <Text style={styles.screenTitle}>プロフィール</Text>
        {profileLoading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator />
            <Text style={styles.subtle}>読み込み中…</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.profileForm}>
          <Text style={styles.label}>@ユーザー名</Text>
          <TextInput
            value={handle}
            onChangeText={setHandle}
            placeholder="your_id"
            autoCapitalize="none"
            style={styles.textInput}
          />

          <Text style={styles.label}>表示名</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="表示名"
            style={styles.textInput}
          />

          <Text style={styles.label}>自己紹介</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="自己紹介"
            multiline
            style={[styles.textInput, styles.bioInput]}
          />

          <Pressable
            style={[styles.primaryButton, profileSaving && styles.disabledButton]}
            onPress={() => void onSaveProfile()}
            disabled={profileSaving}
          >
            <Text style={styles.primaryButtonText}>{profileSaving ? "保存中…" : "保存する"}</Text>
          </Pressable>

          {profileMessage ? (
            <Text style={profileMessage === "保存しました。" ? styles.subtle : styles.errorText}>
              {profileMessage}
            </Text>
          ) : null}

          {moderationMessage ? (
            <Text style={styles.subtle}>{moderationMessage}</Text>
          ) : null}

          <View style={styles.personaCard}>
            <View style={styles.postMetaRow}>
              <Text style={styles.sectionTitle}>プロフィール完成度</Text>
              <Text style={styles.badge}>{profileCompletionPercent}%</Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: "#E5E7EB" }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.max(8, profileCompletionPercent)}%`,
                    backgroundColor:
                      profileCompletionPercent >= 80
                        ? "#10B981"
                        : profileCompletionPercent >= 50
                        ? "#2563EB"
                        : "#F59E0B",
                  },
                ]}
              />
            </View>
            <Text style={styles.subtle}>
              {bio.trim().length < 20
                ? "自己紹介を20文字以上にすると発見されやすくなります。"
                : !accountEmailConfirmedAt
                ? "メール確認を完了すると信頼性が上がります。"
                : !pushEnabled
                ? "成績通知Pushを有効化すると再訪導線が強くなります。"
                : "プロフィール設定は十分です。投稿と保存で回遊を増やしましょう。"}
            </Text>
          </View>

          <View style={styles.personaCard}>
            <View style={styles.postMetaRow}>
              <Text style={styles.sectionTitle}>利用状況 / クイック移動</Text>
              <Text style={styles.postMeta}>使いやすさ重視</Text>
            </View>
            <Text style={styles.postMeta}>
              未読通知 {unreadNotificationIds.length} / 成績通知 {unreadGrowthNotifications} / 保存{" "}
              {savedFeed.length} 件 / 開封済み {openedPostIds.length} 件
            </Text>
            <Text style={styles.postMeta}>
              TL {feed.length} 件 / フォロー {followingFeed.length} 件 / キャラ別TL {personaFeedItems.length} 件
            </Text>
            <View style={styles.headerActions}>
              <Pressable
                style={styles.outlineButton}
                onPress={() => {
                  setTab("notifications");
                }}
              >
                <Text style={styles.outlineButtonText}>通知へ</Text>
              </Pressable>
              <Pressable
                style={styles.outlineButton}
                onPress={() => {
                  setTab("saved");
                }}
              >
                <Text style={styles.outlineButtonText}>保存へ</Text>
              </Pressable>
              <Pressable
                style={styles.outlineButton}
                onPress={() => {
                  setTab("personaFeed");
                }}
              >
                <Text style={styles.outlineButtonText}>キャラ別TLへ</Text>
              </Pressable>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                style={styles.outlineButton}
                onPress={() => {
                  setTab("compose");
                }}
              >
                <Text style={styles.outlineButtonText}>投稿する</Text>
              </Pressable>
              <Pressable
                style={styles.outlineButton}
                onPress={() => {
                  void Promise.allSettled([loadFeed(), loadSavedFeed(true), loadNotifications()]);
                }}
              >
                <Text style={styles.outlineButtonText}>主要データ再読込</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.personaCard}>
            <View style={styles.postMetaRow}>
              <Text style={styles.sectionTitle}>通知 / 配信状態</Text>
              <Text style={styles.postMeta}>
                {pushSetupAvailable ? (pushEnabled ? "Push有効" : "Push未設定") : "DB未適用"}
              </Text>
            </View>
            <Text style={styles.subtle}>
              成績通知のバックグラウンド受信は通知タブから設定できます。
            </Text>
            {pushTokenPreview ? <Text style={styles.postMeta}>token: {pushTokenPreview}</Text> : null}
            <View style={styles.headerActions}>
              <Pressable
                style={styles.outlineButton}
                onPress={() => {
                  setTab("notifications");
                }}
              >
                <Text style={styles.outlineButtonText}>通知設定を開く</Text>
              </Pressable>
              {webBaseUrl ? (
                <Pressable
                  style={styles.outlineButton}
                  onPress={() => {
                    void (async () => {
                      const url = `${webBaseUrl}/dashboard/push-delivery`;
                      const can = await Linking.canOpenURL(url);
                      if (!can) {
                        Alert.alert("リンクエラー", "ダッシュボードURLを開けませんでした。");
                        return;
                      }
                      await Linking.openURL(url);
                    })();
                  }}
                >
                  <Text style={styles.outlineButtonText}>配信ダッシュボード</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.personaCard}>
            <Text style={styles.sectionTitle}>セキュリティ設定</Text>
            <Text style={styles.postMeta}>メール: {accountEmail || "未取得"}</Text>
            <Text style={styles.postMeta}>
              メール確認:{" "}
              {accountEmailConfirmedAt
                ? `確認済み (${formatDateTime(accountEmailConfirmedAt)})`
                : "未確認"}
            </Text>
            <Text style={styles.postMeta}>最終ログイン: {formatDateTime(accountLastSignInAt)}</Text>
            <Text style={styles.postMeta}>登録日時: {formatDateTime(accountCreatedAt)}</Text>

            <Text style={styles.label}>新しいパスワード</Text>
            <TextInput
              value={securityNewPassword}
              onChangeText={setSecurityNewPassword}
              placeholder="8文字以上"
              secureTextEntry
              style={styles.textInput}
            />
            <Text style={styles.label}>新しいパスワード（確認）</Text>
            <TextInput
              value={securityConfirmPassword}
              onChangeText={setSecurityConfirmPassword}
              placeholder="確認用"
              secureTextEntry
              style={styles.textInput}
            />
            <Text style={styles.postMeta}>強度: {securityPasswordStrength.label}</Text>
            <View style={[styles.progressTrack, { backgroundColor: "#E5E7EB" }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.max(6, (securityPasswordStrength.score / 5) * 100)}%`,
                    backgroundColor:
                      securityPasswordStrength.score <= 2
                        ? "#EF4444"
                        : securityPasswordStrength.score <= 4
                        ? "#F59E0B"
                        : "#10B981",
                  },
                ]}
              />
            </View>

            <View style={styles.headerActions}>
              <Pressable
                style={[
                  styles.outlineButton,
                  (securityBusyKey === "password" || !!securityBusyKey) && styles.disabledButton,
                ]}
                onPress={() => void onChangePasswordInProfile()}
                disabled={!!securityBusyKey}
              >
                <Text style={styles.outlineButtonText}>
                  {securityBusyKey === "password" ? "更新中…" : "パスワード変更"}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.outlineButton,
                  (securityBusyKey === "reset" || !!securityBusyKey) && styles.disabledButton,
                ]}
                onPress={() => void onSendResetMailInProfile()}
                disabled={!!securityBusyKey}
              >
                <Text style={styles.outlineButtonText}>
                  {securityBusyKey === "reset" ? "送信中…" : "再設定メール"}
                </Text>
              </Pressable>
            </View>

            <View style={styles.headerActions}>
              <Pressable
                style={[styles.outlineButton, !!securityBusyKey && styles.disabledButton]}
                onPress={() => void onSignOutOtherDevices()}
                disabled={!!securityBusyKey}
              >
                <Text style={styles.outlineButtonText}>
                  {securityBusyKey === "others" ? "処理中…" : "他端末ログアウト"}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.warnButton, !!securityBusyKey && styles.disabledButton]}
                onPress={() => onSignOutAllDevices()}
                disabled={!!securityBusyKey}
              >
                <Text style={styles.warnButtonText}>
                  {securityBusyKey === "global" ? "処理中…" : "全端末ログアウト"}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.subtle}>
              端末紛失・共有端末利用後は「他端末ログアウト」または「全端末ログアウト」を実行してください。
            </Text>
            {securityMessage ? (
              <Text
                style={
                  securityMessage.includes("失敗") || securityMessage.includes("一致")
                    ? styles.errorText
                    : styles.subtle
                }
              >
                {securityMessage}
              </Text>
            ) : null}
          </View>

          <View style={styles.personaCard}>
            <Text style={styles.sectionTitle}>法務とサポート</Text>
            {LEGAL_LINKS.map((x) => (
              <Pressable
                key={x.key}
                style={styles.outlineButton}
                onPress={() => {
                  void openLegalLink(x.path);
                }}
              >
                <Text style={styles.outlineButtonText}>{x.label}</Text>
              </Pressable>
            ))}
            <Pressable
              style={styles.outlineButton}
              onPress={() => {
                void (async () => {
                  const url = "mailto:support@persona-lens.app";
                  const can = await Linking.canOpenURL(url);
                  if (!can) {
                    Alert.alert("リンクエラー", "メールアプリを起動できませんでした。");
                    return;
                  }
                  await Linking.openURL(url);
                })();
              }}
            >
              <Text style={styles.outlineButtonText}>サポートに連絡</Text>
            </Pressable>
          </View>

          <View style={styles.personaCard}>
            <View style={styles.postMetaRow}>
              <Text style={styles.sectionTitle}>ブロック中ユーザー</Text>
              <Pressable style={styles.outlineButton} onPress={() => void loadBlockedUsers()}>
                <Text style={styles.outlineButtonText}>更新</Text>
              </Pressable>
            </View>
            {blockedUsers.length === 0 ? (
              <Text style={styles.subtle}>ブロック中のユーザーはいません。</Text>
            ) : (
              blockedUsers.map((x) => (
                <View key={x.blocked_id} style={styles.soulmateRow}>
                  <View style={styles.postMetaRow}>
                    <Text style={styles.postAuthor}>
                      {x.display_name || x.handle || x.blocked_id.slice(0, 8)}
                    </Text>
                    <Pressable
                      style={styles.outlineButton}
                      onPress={() => {
                        void unblockUser(x.blocked_id);
                      }}
                    >
                      <Text style={styles.outlineButtonText}>解除</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.postMeta}>
                    {x.handle ? `@${x.handle}` : x.blocked_id}
                  </Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.personaCard}>
            <Text style={styles.sectionTitle}>アカウント管理</Text>
            <Text style={styles.postMeta}>
              App Store 審査向けに、アプリ内からアカウントを完全削除できます。
            </Text>
            <Pressable
              style={[styles.warnButton, accountDeleteBusy && styles.disabledButton]}
              onPress={() => askDeleteAccount()}
              disabled={accountDeleteBusy}
            >
              <Text style={styles.warnButtonText}>
                {accountDeleteBusy ? "削除中…" : "アカウントを削除"}
              </Text>
            </Pressable>
          </View>
          </ScrollView>
        )}
      </View>
    );
  };

  const renderSearch = () => (
    <View style={styles.screen}>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>検索</Text>
        <Pressable style={styles.outlineButton} onPress={() => void runSearch(searchQuery)}>
          <Text style={styles.outlineButtonText}>再検索</Text>
        </Pressable>
      </View>

      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="投稿本文を検索..."
        autoCapitalize="none"
        style={styles.textInput}
      />
      {searchQuery.trim().length > 0 ? (
        <View style={styles.headerActions}>
          <Pressable
            style={styles.outlineButton}
            onPress={() => {
              setSearchQuery("");
              setSearchItems([]);
              setSearchError(null);
            }}
          >
            <Text style={styles.outlineButtonText}>クリア</Text>
          </Pressable>
        </View>
      ) : null}

      {searchLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator />
          <Text style={styles.subtle}>検索中…</Text>
        </View>
      ) : searchError ? (
        <Text style={styles.errorText}>{searchError}</Text>
      ) : searchQuery.trim().length === 0 ? (
        <Text style={styles.subtle}>キーワードを入力してください。</Text>
      ) : searchItems.length === 0 ? (
        <Text style={styles.subtle}>該当する投稿はありません。</Text>
      ) : (
        renderVirtualRowsList({
          listKey: `search-${searchQuery.trim()}`,
          refreshing: searchLoading,
          onRefresh: () => {
            void runSearch(searchQuery);
          },
          renderPost: renderPostCard,
          renderNotification: renderNotificationCard,
          rows: [
            {
              key: "search-fresh-header",
              type: "block" as const,
              estimatedHeight: 64,
              node: (
                <View style={styles.personaCard}>
                  <View style={styles.postMetaRow}>
                    <Text style={styles.sectionTitle}>新着</Text>
                    <Text style={styles.badge}>{searchFreshItems.length}</Text>
                  </View>
                  {searchFreshItems.length === 0 ? (
                    <Text style={styles.subtle}>新着はありません。</Text>
                  ) : null}
                </View>
              ),
            },
            ...searchFreshItems.map(
              (item) =>
                ({
                  key: `search-fresh-${item.id}`,
                  type: "post" as const,
                  item,
                  opts: { opened: false, source: "search" },
                  estimatedHeight: 180,
                }) satisfies VirtualListRow
            ),
            {
              key: "search-past-header",
              type: "block" as const,
              estimatedHeight: 64,
              node: (
                <View style={styles.personaCard}>
                  <View style={styles.postMetaRow}>
                    <Text style={styles.sectionTitle}>過去</Text>
                    <Text style={styles.badge}>{searchPastItems.length}</Text>
                  </View>
                  {searchPastItems.length === 0 ? (
                    <Text style={styles.subtle}>まだ開封済み投稿はありません。</Text>
                  ) : null}
                </View>
              ),
            },
            ...searchPastItems.map(
              (item) =>
                ({
                  key: `search-past-${item.id}`,
                  type: "post" as const,
                  item,
                  opts: { opened: true, source: "search" },
                  estimatedHeight: 180,
                }) satisfies VirtualListRow
            ),
          ],
        })
      )}
    </View>
  );

  const renderNotifications = () => (
    <View style={styles.screen}>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>通知</Text>
        <View style={styles.headerActions}>
          <Text style={styles.badge}>未読 {unreadNotificationIds.length}</Text>
          <Pressable
            style={[styles.outlineButton, unreadNotificationIds.length === 0 && styles.disabledButton]}
            onPress={() => void markNotificationsRead(unreadNotificationIds)}
            disabled={notificationsBusy || unreadNotificationIds.length === 0}
          >
            <Text style={styles.outlineButtonText}>全既読</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.personaCard}>
        <View style={styles.postMetaRow}>
          <Text style={styles.sectionTitle}>バックグラウンドPush（成績通知）</Text>
          <Text style={styles.postMeta}>{pushEnabled ? "有効" : "未設定/無効"}</Text>
        </View>
        <Text style={styles.subtle}>
          保存率・返信率などの成績通知を、アプリを閉じていても受け取れます。
        </Text>
        {pushTokenPreview ? <Text style={styles.postMeta}>token: {pushTokenPreview}</Text> : null}
        {!pushSetupAvailable ? (
          <Text style={styles.errorText}>
            Push通知DB未適用。`user_push_devices` migration を適用してください。
          </Text>
        ) : null}
        {pushSetupMessage ? (
          <Text
            style={
              pushSetupMessage.includes("失敗") ||
              pushSetupMessage.includes("未導入") ||
              pushSetupMessage.includes("未適用")
                ? styles.errorText
                : styles.postMeta
            }
          >
            {pushSetupMessage}
          </Text>
        ) : null}
        <View style={styles.headerActions}>
          <Pressable
            style={[styles.outlineButton, pushSetupBusy && styles.disabledButton]}
            onPress={() => void registerExpoGrowthPush()}
            disabled={pushSetupBusy}
          >
            <Text style={styles.outlineButtonText}>
              {pushSetupBusy ? "設定中…" : pushEnabled ? "再設定 / 再登録" : "Pushを有効化"}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.warnButton, (pushSetupBusy || !pushEnabled) && styles.disabledButton]}
            onPress={() => void disableExpoGrowthPush()}
            disabled={pushSetupBusy || !pushEnabled}
          >
            <Text style={styles.warnButtonText}>Pushをオフ</Text>
          </Pressable>
        </View>
      </View>

      {notificationsLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator />
          <Text style={styles.subtle}>読み込み中…</Text>
        </View>
      ) : notificationsError ? (
        <Text style={styles.errorText}>{notificationsError}</Text>
      ) : notifications.length === 0 ? (
        <Text style={styles.subtle}>通知はまだありません。</Text>
      ) : (
        renderVirtualRowsList({
          listKey: `notifications-${notificationFilter}`,
          refreshing: notificationsLoading,
          onRefresh: () => void loadNotifications(),
          renderPost: renderPostCard,
          renderNotification: renderNotificationCard,
          rows: [
            {
              key: "notifications-filter",
              type: "block",
              estimatedHeight: 74,
              node: (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chipWrap}>
                    {(
                      [
                        { key: "all", label: "すべて" },
                        { key: "reply", label: "返信" },
                        { key: "like", label: "いいね" },
                        { key: "follow", label: "フォロー" },
                        { key: "boost", label: "拡散" },
                        { key: "growth", label: "成績" },
                      ] as Array<{ key: NotificationFilter; label: string }>
                    ).map((x) => (
                      <Pressable
                        key={x.key}
                        style={[
                          styles.assistChip,
                          notificationFilter === x.key && styles.modeButtonActive,
                        ]}
                        onPress={() => setNotificationFilter(x.key)}
                      >
                        <Text style={styles.assistChipText}>{x.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              ),
            },
            ...(filteredNotifications.length === 0
              ? [
                  {
                    key: "notifications-empty-filter",
                    type: "block" as const,
                    estimatedHeight: 56,
                    node: <Text style={styles.subtle}>この種類の通知はありません。</Text>,
                  },
                ]
              : [
                  {
                    key: "notifications-fresh-header",
                    type: "block" as const,
                    estimatedHeight: 64,
                    node: (
                      <View style={styles.personaCard}>
                        <View style={styles.postMetaRow}>
                          <Text style={styles.sectionTitle}>新着</Text>
                          <Text style={styles.badge}>{freshNotifications.length}</Text>
                        </View>
                        {freshNotifications.length === 0 ? (
                          <Text style={styles.subtle}>新着はありません。</Text>
                        ) : null}
                      </View>
                    ),
                  },
                  ...freshNotifications.map(
                    (item) =>
                      ({
                        key: `notification-fresh-${item.id}`,
                        type: "notification" as const,
                        item,
                        estimatedHeight: 108,
                      }) satisfies VirtualListRow
                  ),
                  {
                    key: "notifications-past-header",
                    type: "block" as const,
                    estimatedHeight: 64,
                    node: (
                      <View style={styles.personaCard}>
                        <View style={styles.postMetaRow}>
                          <Text style={styles.sectionTitle}>過去</Text>
                          <Text style={styles.badge}>{pastNotifications.length}</Text>
                        </View>
                        {pastNotifications.length === 0 ? (
                          <Text style={styles.subtle}>過去通知はまだありません。</Text>
                        ) : null}
                      </View>
                    ),
                  },
                  ...pastNotifications.map(
                    (item) =>
                      ({
                        key: `notification-past-${item.id}`,
                        type: "notification" as const,
                        item,
                        estimatedHeight: 108,
                      }) satisfies VirtualListRow
                  ),
                ]),
          ],
        })
      )}
    </View>
  );

  const renderPersonaCatalog = () => (
    <View style={styles.screen}>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>キャラ図鑑</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.outlineButton} onPress={() => void loadPersonaCatalogDefs()}>
            <Text style={styles.outlineButtonText}>図鑑更新</Text>
          </Pressable>
          <Pressable style={styles.outlineButton} onPress={() => void loadPersonaDefs()}>
            <Text style={styles.outlineButtonText}>定義更新</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.feedList}>
        <View style={styles.personaCard}>
          <View style={styles.postMetaRow}>
            <Text style={styles.sectionTitle}>全キャラ一覧</Text>
            <Text style={styles.badge}>{personaCatalogDefs.length}</Text>
          </View>
          <Text style={styles.subtle}>
            キャラ別TL・相性・対話AIで使われるキャラを一覧できます。
          </Text>
          {personaCatalogError ? <Text style={styles.errorText}>{personaCatalogError}</Text> : null}
          {!personaImageHostBaseUrl ? (
            <Text style={styles.errorText}>
              EXPO_PUBLIC_WEB_BASE_URL 未設定のため、キャラ画像を取得できません。
            </Text>
          ) : null}
          {personaCatalogCategories.length > 0 ? (
            <View style={styles.personaCatalogCategoryChips}>
              {personaCatalogCategories.map((cat) => (
                <View key={`catalog-chip-${cat}`} style={styles.personaCatalogCategoryChip}>
                  <Text style={styles.personaCatalogCategoryChipText}>{cat}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {personaCatalogLoading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator />
            <Text style={styles.subtle}>キャラ図鑑を読み込み中…</Text>
          </View>
        ) : personaCatalogDefs.length === 0 ? (
          <View style={styles.personaCard}>
            <Text style={styles.subtle}>キャラ図鑑データが未取得です。更新を押してください。</Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {personaCatalogCategories.map((cat) => {
              const list = personaCatalogGroups.get(cat) ?? [];
              return (
                <View key={`catalog-section-${cat}`} style={styles.personaCard}>
                  <View style={styles.postMetaRow}>
                    <Text style={styles.sectionTitle}>{cat}</Text>
                    <Text style={styles.badge}>{list.length}</Text>
                  </View>
                  <View style={styles.personaCatalogGrid}>
                    {list.map((def) => {
                      const candidates = buildPersonaCatalogImageCandidates(def);
                      const imageIdx = Math.max(0, Number(personaCatalogImageErrors[def.key] ?? 0) || 0);
                      const imageUrl = candidates[imageIdx] ?? null;
                      const imageFailed = !imageUrl;
                      return (
                        <Pressable
                          key={`catalog-${def.key}`}
                          style={styles.personaCatalogCard}
                          onPress={() => setPersonaCatalogDetail(def)}
                        >
                          {imageUrl && !imageFailed ? (
                            <Image
                              source={{ uri: imageUrl }}
                              style={styles.personaCatalogImage}
                              resizeMode="cover"
                              onError={() =>
                                setPersonaCatalogImageErrors((prev) => ({
                                  ...prev,
                                  [def.key]: Math.min(imageIdx + 1, candidates.length),
                                }))
                              }
                            />
                          ) : (
                            <View style={styles.personaCatalogImageFallback}>
                              <Text style={styles.personaCatalogImageFallbackText}>
                                {String(def.title ?? def.key).slice(0, 2)}
                              </Text>
                              <Text style={styles.personaCatalogImageFallbackSubText}>
                                no image
                              </Text>
                            </View>
                          )}
                          <Text numberOfLines={1} style={styles.personaCatalogCardTitle}>
                            {def.title}
                          </Text>
                          <Text numberOfLines={1} style={styles.postMeta}>
                            @{def.key}
                          </Text>
                          {def.theme ? (
                            <Text numberOfLines={1} style={styles.postMeta}>
                              {def.theme}
                            </Text>
                          ) : null}
                          {def.blurb ? (
                            <Text numberOfLines={2} style={styles.postMeta}>
                              {def.blurb}
                            </Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );

  const renderPersonaCatalogDetailModal = () => {
    const detail = personaCatalogDetail;
    if (!detail) return null;
    const candidates = buildPersonaCatalogImageCandidates(detail);
    const imageIdx = Math.max(0, Number(personaCatalogImageErrors[detail.key] ?? 0) || 0);
    const imageUrl = candidates[imageIdx] ?? null;
    const sourceDef = personaDefs.find((x) => x.key === detail.key) ?? null;
    const selectedCompat =
      personaCatalogDetailCompatItems.find((x) => x.targetKey === personaCatalogDetailDialogueTargetKey) ?? null;
    const targetDef =
      personaDefs.find((x) => x.key === personaCatalogDetailDialogueTargetKey) ??
      personaCatalogDefs.find((x) => x.key === personaCatalogDetailDialogueTargetKey) ??
      null;
    const dialoguePreview =
      selectedCompat && personaCatalogDetailDialogueTargetKey
        ? buildDialogueFallback({
            sourceTitle: sourceDef?.title ?? detail.title ?? detail.key,
            targetTitle:
              targetDef?.title ?? selectedCompat.title ?? personaCatalogDetailDialogueTargetKey,
            mode: "friendship",
            relationLabel: selectedCompat.relationLabel ?? null,
            context: `${detail.title} の口調で短く返す`,
            replyToText: "",
            sourceTalk: sourceDef?.talk_style ?? null,
            targetTalk: (targetDef as any)?.talk_style ?? null,
            sourceProfileSummary: buildPersonaProfile({
              key: detail.key,
              title: sourceDef?.title ?? detail.title ?? detail.key,
              theme: sourceDef?.theme ?? detail.theme ?? null,
              blurb: sourceDef?.blurb ?? detail.blurb ?? null,
              talkStyle: sourceDef?.talk_style ?? null,
              relationStyle: sourceDef?.relation_style ?? null,
              vibeTags: sourceDef?.vibe_tags ?? [],
            }).summary,
            targetProfileSummary: buildPersonaProfile({
              key: personaCatalogDetailDialogueTargetKey,
              title:
                (targetDef as any)?.title ??
                selectedCompat.title ??
                personaCatalogDetailDialogueTargetKey,
              theme: (targetDef as any)?.theme ?? null,
              blurb: (targetDef as any)?.blurb ?? null,
              talkStyle: (targetDef as any)?.talk_style ?? null,
              relationStyle: (targetDef as any)?.relation_style ?? null,
              vibeTags: (targetDef as any)?.vibe_tags ?? [],
            }).summary,
            sourceHook: buildPersonaProfile({
              key: detail.key,
              title: sourceDef?.title ?? detail.title ?? detail.key,
              theme: sourceDef?.theme ?? detail.theme ?? null,
              blurb: sourceDef?.blurb ?? detail.blurb ?? null,
              talkStyle: sourceDef?.talk_style ?? null,
              relationStyle: sourceDef?.relation_style ?? null,
              vibeTags: sourceDef?.vibe_tags ?? [],
            }).hook,
            targetHook: buildPersonaProfile({
              key: personaCatalogDetailDialogueTargetKey,
              title:
                (targetDef as any)?.title ??
                selectedCompat.title ??
                personaCatalogDetailDialogueTargetKey,
              theme: (targetDef as any)?.theme ?? null,
              blurb: (targetDef as any)?.blurb ?? null,
              talkStyle: (targetDef as any)?.talk_style ?? null,
              relationStyle: (targetDef as any)?.relation_style ?? null,
              vibeTags: (targetDef as any)?.vibe_tags ?? [],
            }).hook,
          })
        : null;

    return (
      <Modal
        visible
        animationType="slide"
        onRequestClose={() => setPersonaCatalogDetail(null)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.screenTitle}>キャラ詳細</Text>
            <Pressable style={styles.outlineButton} onPress={() => setPersonaCatalogDetail(null)}>
              <Text style={styles.outlineButtonText}>閉じる</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.feedList}>
            <View style={styles.personaCard}>
              {imageUrl ? (
                <Image
                  source={{ uri: imageUrl }}
                  style={[styles.personaCatalogImage, { width: "100%", alignSelf: "stretch" }]}
                  resizeMode="cover"
                  onError={() =>
                    setPersonaCatalogImageErrors((prev) => ({
                      ...prev,
                      [detail.key]: Math.min(imageIdx + 1, candidates.length),
                    }))
                  }
                />
              ) : (
                <View style={styles.personaCatalogImageFallback}>
                  <Text style={styles.personaCatalogImageFallbackText}>
                    {String(detail.title ?? detail.key).slice(0, 2)}
                  </Text>
                </View>
              )}
              <Text style={styles.personaTitle}>{detail.title}</Text>
              <Text style={styles.postMeta}>@{detail.key}</Text>
              {detail.category ? <Text style={styles.postMeta}>カテゴリ: {detail.category}</Text> : null}
              {detail.theme ? <Text style={styles.postMeta}>テーマ: {detail.theme}</Text> : null}
              {detail.blurb ? <Text style={styles.postText}>{detail.blurb}</Text> : null}
            </View>

            <View style={styles.personaCard}>
              <Text style={styles.sectionTitle}>このキャラで使う</Text>
              <View style={styles.headerActions}>
                <Pressable
                  style={styles.outlineButton}
                  onPress={() => {
                    setComposePersonaSelected(detail.key);
                    setTab("compose");
                    setPersonaCatalogDetail(null);
                  }}
                >
                  <Text style={styles.outlineButtonText}>投稿で使う</Text>
                </Pressable>
                <Pressable
                  style={styles.outlineButton}
                  onPress={() => {
                    setDialogueTargetKey(detail.key);
                    setTab("dialogue");
                    setPersonaCatalogDetail(null);
                  }}
                >
                  <Text style={styles.outlineButtonText}>対話AIで使う</Text>
                </Pressable>
                <Pressable
                  style={styles.outlineButton}
                  onPress={() => {
                    setPersonaFeedStrategy("compat");
                    setTab("personaFeed");
                    setPersonaCatalogDetail(null);
                  }}
                >
                  <Text style={styles.outlineButtonText}>キャラTLを見る</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.personaCard}>
              <View style={styles.postMetaRow}>
                <Text style={styles.sectionTitle}>詳細タブ</Text>
                <Text style={styles.postMeta}>Web版詳細に寄せた表示</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipWrap}>
                  {[
                    { key: "compat", label: "相性" },
                    { key: "dialogue", label: "対話AI" },
                    { key: "examples", label: "投稿例" },
                  ].map((x) => (
                    <Pressable
                      key={`persona-detail-tab-${x.key}`}
                      style={[
                        styles.assistChip,
                        personaCatalogDetailTab === x.key && styles.modeButtonActive,
                      ]}
                      onPress={() =>
                        setPersonaCatalogDetailTab(x.key as "compat" | "dialogue" | "examples")
                      }
                    >
                      <Text style={styles.assistChipText}>{x.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>

              {personaCatalogDetailTab === "compat" ? (
                <View style={{ gap: 8 }}>
                  {personaCatalogDetailCompatLoading ? (
                    <Text style={styles.subtle}>相性候補を読み込み中…</Text>
                  ) : personaCatalogDetailCompatError ? (
                    <Text style={styles.errorText}>{personaCatalogDetailCompatError}</Text>
                  ) : personaCatalogDetailCompatItems.length === 0 ? (
                    <Text style={styles.subtle}>相性データはまだありません。</Text>
                  ) : (
                    <>
                      <Text style={styles.postMeta}>相性が高い順に表示しています。</Text>
                      {personaCatalogDetailCompatItems.slice(0, 8).map((item) => (
                        <View key={`persona-detail-compat-${item.targetKey}`} style={styles.soulmateRow}>
                          <View style={styles.postMetaRow}>
                            <Text style={styles.postAuthor}>
                              {item.title} @{item.targetKey}
                            </Text>
                            <Text style={styles.badge}>{toCompatPercent(item.score)}%</Text>
                          </View>
                          {item.relationLabel ? (
                            <Text style={styles.postMeta}>{item.relationLabel}</Text>
                          ) : (
                            <Text style={styles.subtle}>対話AIタブで返信草案プレビューに使えます。</Text>
                          )}
                          <View style={styles.headerActions}>
                            <Pressable
                              style={styles.outlineButton}
                              onPress={() => {
                                setPersonaCatalogDetailDialogueTargetKey(item.targetKey);
                                setPersonaCatalogDetailTab("dialogue");
                              }}
                            >
                              <Text style={styles.outlineButtonText}>対話AIプレビューへ</Text>
                            </Pressable>
                            <Pressable
                              style={styles.outlineButton}
                              onPress={() => {
                                setDialogueSourceKey(detail.key);
                                setDialogueTargetKey(item.targetKey);
                                setTab("dialogue");
                                setPersonaCatalogDetail(null);
                              }}
                            >
                              <Text style={styles.outlineButtonText}>対話AIで開く</Text>
                            </Pressable>
                          </View>
                        </View>
                      ))}
                    </>
                  )}
                </View>
              ) : null}

              {personaCatalogDetailTab === "dialogue" ? (
                <View style={{ gap: 8 }}>
                  {personaCatalogDetailCompatLoading ? (
                    <Text style={styles.subtle}>相性候補を読み込み中…</Text>
                  ) : personaCatalogDetailCompatItems.length === 0 ? (
                    <Text style={styles.subtle}>先に相性データを取得してください。</Text>
                  ) : (
                    <>
                      <Text style={styles.postMeta}>
                        話し手 @{detail.key} / 相手 @{personaCatalogDetailDialogueTargetKey || "-"}
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={styles.chipWrap}>
                          {personaCatalogDetailCompatItems.slice(0, 10).map((x) => (
                            <Pressable
                              key={`persona-detail-dialogue-target-${x.targetKey}`}
                              style={[
                                styles.assistChip,
                                personaCatalogDetailDialogueTargetKey === x.targetKey &&
                                  styles.modeButtonActive,
                              ]}
                              onPress={() => setPersonaCatalogDetailDialogueTargetKey(x.targetKey)}
                            >
                              <Text style={styles.assistChipText}>
                                {x.title} {toCompatPercent(x.score)}%
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </ScrollView>
                      {dialoguePreview ? (
                        <>
                          <Text style={styles.subtle}>
                            相性とキャラ口調から草案プレビューを生成（詳細版は対話AI画面で編集可）
                          </Text>
                          {dialoguePreview.drafts.slice(0, 3).map((draft) => (
                            <View key={`persona-detail-dialogue-preview-${draft}`} style={styles.soulmateRow}>
                              <Text style={styles.postText}>{draft}</Text>
                              <View style={styles.headerActions}>
                                <Pressable
                                  style={styles.outlineButton}
                                  onPress={() => {
                                    setComposeText((prev) => (prev.trim() ? `${prev}\n${draft}` : draft));
                                    setComposePersonaSelected(detail.key);
                                    setTab("compose");
                                    setPersonaCatalogDetail(null);
                                  }}
                                >
                                  <Text style={styles.outlineButtonText}>投稿に使う</Text>
                                </Pressable>
                                <Pressable
                                  style={styles.outlineButton}
                                  onPress={() => {
                                    setDialogueSourceKey(detail.key);
                                    setDialogueTargetKey(personaCatalogDetailDialogueTargetKey);
                                    setTab("dialogue");
                                    setPersonaCatalogDetail(null);
                                  }}
                                >
                                  <Text style={styles.outlineButtonText}>対話AIで編集</Text>
                                </Pressable>
                              </View>
                            </View>
                          ))}
                          <View style={styles.personaCard}>
                            <Text style={styles.sectionTitle}>返信のコツ</Text>
                            {dialoguePreview.tips.slice(0, 3).map((tip) => (
                              <Text key={`persona-detail-dialogue-tip-${tip}`} style={styles.postMeta}>
                                ・{tip}
                              </Text>
                            ))}
                          </View>
                        </>
                      ) : (
                        <Text style={styles.subtle}>相手キャラを選ぶと草案プレビューを表示します。</Text>
                      )}
                    </>
                  )}
                </View>
              ) : null}

              {personaCatalogDetailTab === "examples" ? (
                <View style={{ gap: 8 }}>
                  {personaCatalogDetailExamplesLoading ? (
                    <Text style={styles.subtle}>投稿例を読み込み中…</Text>
                  ) : personaCatalogDetailExamplesError ? (
                    <Text style={styles.errorText}>{personaCatalogDetailExamplesError}</Text>
                  ) : personaCatalogDetailExamples.length === 0 ? (
                    <Text style={styles.subtle}>このキャラの投稿例はまだありません。</Text>
                  ) : (
                    <>
                      <Text style={styles.postMeta}>投稿例は高スコア順で表示しています。</Text>
                      {personaCatalogDetailExamples.slice(0, 6).map((post) => {
                        const identity = resolveSocialIdentityLabels(resolvePostAuthorIdentity(post));
                        const text = String(post.text ?? post.body ?? "").trim();
                        const lie = analyzeLieScore({ text });
                        return (
                          <Pressable
                            key={`persona-detail-example-${post.id}`}
                            style={styles.soulmateRow}
                            onPress={() => {
                              setPersonaCatalogDetail(null);
                              void openPostDetail(post.id, { source: "persona_catalog_examples" });
                            }}
                          >
                            <View style={styles.postMetaRow}>
                              <Text style={styles.postAuthor}>{identity.primary}</Text>
                              <Text style={styles.postMeta}>{formatRelativeTime(post.created_at)}</Text>
                            </View>
                            {identity.secondary ? (
                              <Text style={styles.postMeta}>{identity.secondary}</Text>
                            ) : null}
                            <Text numberOfLines={3} style={styles.postText}>
                              {text || "本文なし"}
                            </Text>
                            <View style={styles.matchRow}>
                              <Text style={styles.matchChip}>嘘 {Math.round(lie.score * 100)}%</Text>
                              {lie.cautionChips.slice(0, 1).map((chip) => (
                                <Text key={`persona-detail-example-caution-${post.id}-${chip}`} style={styles.matchChip}>
                                  {chip}
                                </Text>
                              ))}
                              {lie.reliefChips.slice(0, 1).map((chip) => (
                                <Text
                                  key={`persona-detail-example-relief-${post.id}-${chip}`}
                                  style={[styles.matchChip, { backgroundColor: "#ECFDF5", color: "#065F46" }]}
                                >
                                  {chip}
                                </Text>
                              ))}
                            </View>
                          </Pressable>
                        );
                      })}
                    </>
                  )}
                </View>
              ) : null}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  const renderPersona = () => (
    <View style={styles.screen}>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>キャラ分析</Text>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.outlineButton}
            onPress={() => {
              void loadPersonaData();
              void loadPersonaDefs();
            }}
          >
            <Text style={styles.outlineButtonText}>更新</Text>
          </Pressable>
          <Pressable
            style={[styles.outlineButton, recomputeBusy && styles.disabledButton]}
            onPress={() => void recomputePersona()}
            disabled={recomputeBusy}
          >
            <Text style={styles.outlineButtonText}>
              {recomputeBusy ? "再評価中…" : "再評価"}
            </Text>
          </Pressable>
        </View>
      </View>

      {personaLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator />
          <Text style={styles.subtle}>読み込み中…</Text>
        </View>
      ) : personaError ? (
        <Text style={styles.errorText}>{personaError}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.feedList}>
          {personaRows.length > 0 ? (
            <View style={styles.personaCard}>
              <Text style={styles.sectionTitle}>メインキャラ</Text>
              <Text style={styles.personaTitle}>{personaRows[0].title}</Text>
              <Text style={styles.postMeta}>
                スコア {toPercent01(personaRows[0].score)}% / 信頼度{" "}
                {toPercent01(personaRows[0].confidence)}%
              </Text>
            </View>
          ) : (
            <View style={styles.personaCard}>
              <Text style={styles.sectionTitle}>あなたの分析結果</Text>
              <Text style={styles.subtle}>まだキャラ分析データがありません。投稿後に再評価すると反映されます。</Text>
            </View>
          )}

          {personaRows.length > 0 && dominantPersonaProfile ? (
            <View style={styles.personaCard}>
              <Text style={styles.sectionTitle}>メインキャラ性格プロファイル</Text>
              <Text style={styles.postMeta}>{dominantPersonaProfile.summary}</Text>
              <Text style={styles.postMeta}>口調: {dominantPersonaProfile.toneGuide}</Text>
              <Text style={styles.postMeta}>関係性: {dominantPersonaProfile.relationGuide}</Text>
              <Text style={styles.postMeta}>返信フック: {dominantPersonaProfile.hook}</Text>
              <View style={styles.chipWrap}>
                {dominantPersonaProfile.avoid.slice(0, 3).map((x) => (
                  <Text key={x} style={styles.matchChip}>
                    注意: {x}
                  </Text>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.personaCard}>
            <View style={styles.screenHeader}>
              <Text style={styles.sectionTitle}>キャラインサイト</Text>
              <Pressable style={styles.outlineButton} onPress={() => void loadPersonaInsights()}>
                <Text style={styles.outlineButtonText}>更新</Text>
              </Pressable>
            </View>
            {personaInsightLoading ? (
              <Text style={styles.subtle}>分析中…</Text>
            ) : personaInsightError ? (
              <Text style={styles.errorText}>{personaInsightError}</Text>
            ) : !personaInsight?.dominantKey ? (
              <Text style={styles.subtle}>十分な投稿データがありません。</Text>
            ) : (
              <>
                <Text style={styles.postMeta}>
                  主軸: {personaInsight.dominantTitle ?? personaInsight.dominantKey}
                </Text>
                <Text style={styles.postMeta}>
                  連続日数 {personaInsight.streakDays}日 / 直近7日 {personaInsight.count7d}投稿
                </Text>
                <Text
                  style={[
                    styles.postMeta,
                    {
                      color:
                        personaInsight.trend === "up"
                          ? "#15803D"
                          : personaInsight.trend === "down"
                          ? "#B91C1C"
                          : "#374151",
                    },
                  ]}
                >
                  モメンタム {personaInsight.momentumDelta > 0 ? "+" : ""}
                  {personaInsight.momentumDelta}
                </Text>
                <View style={styles.chipWrap}>
                  {personaInsight.topPersonas.slice(0, 6).map((x) => (
                    <Text key={x.key} style={styles.matchChip}>
                      {x.title} {(x.share * 100).toFixed(0)}%
                    </Text>
                  ))}
                </View>
              </>
            )}
          </View>

          <View style={styles.personaCard}>
            <View style={styles.postMetaRow}>
              <Text style={styles.sectionTitle}>キャラクエスト</Text>
              <Text style={styles.postMeta}>本日XP {questXp}</Text>
            </View>
            {personaQuests.length === 0 ? (
              <Text style={styles.subtle}>クエスト生成中…</Text>
            ) : (
              personaQuests.map((q) => (
                <View key={q.id} style={styles.soulmateRow}>
                  <View style={styles.postMetaRow}>
                    <Text style={styles.postAuthor}>{q.title}</Text>
                    <Text style={styles.postMeta}>{q.xp} XP</Text>
                  </View>
                  <Text style={styles.postMeta}>{q.description}</Text>
                  <Pressable
                    style={styles.outlineButton}
                    onPress={() => {
                      setComposeText((prev) => (prev.trim() ? `${prev}\n${q.seed}` : q.seed));
                      setTab("compose");
                    }}
                  >
                    <Text style={styles.outlineButtonText}>このクエストで投稿</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>

          <View style={styles.personaCard}>
            <Text style={styles.sectionTitle}>キャラ分布</Text>
            {personaRows.length === 0 ? (
              <Text style={styles.subtle}>分析結果がまだないため、分布は表示されません。</Text>
            ) : (
              personaRows.map((row) => {
                const scorePct = toPercent01(row.score);
                const confPct = toPercent01(row.confidence);
                return (
                  <View key={row.persona_key} style={styles.personaRow}>
                    <View style={styles.postMetaRow}>
                      <Text style={styles.postAuthor}>{row.title}</Text>
                      <Text style={styles.postMeta}>{scorePct}%</Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${Math.max(4, scorePct)}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.postMeta}>
                      信頼度 {confPct}% {row.theme ? `・${row.theme}` : ""}
                    </Text>
                  </View>
                );
              })
            )}
          </View>

          <View style={styles.personaCard}>
            <Text style={styles.sectionTitle}>ソウルメイト候補</Text>
            {soulmateError ? (
              <Text style={styles.subtle}>{soulmateError}</Text>
            ) : soulmates.length === 0 ? (
              <Text style={styles.subtle}>候補はまだありません。</Text>
            ) : (
              soulmates.map((s) => (
                <View key={`${s.user_id}:${s.persona_key}`} style={styles.soulmateRow}>
                  <View style={styles.postMetaRow}>
                    <Text style={styles.postAuthor}>
                      {s.display_name || s.handle || s.user_id.slice(0, 8)}
                    </Text>
                    <Text style={styles.postMeta}>{s.percent}%</Text>
                  </View>
                  <Text style={styles.postMeta}>
                    {s.persona_title}
                    {s.relation_label ? ` ・ ${s.relation_label}` : ""}
                  </Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );

  const renderPostDetailModal = () => (
    <Modal
      visible={detailVisible}
      animationType="slide"
      onRequestClose={() => {
        setDetailVisible(false);
        setDetailPersonaMatch(null);
        setDetailSequenceIds([]);
        setDetailSequenceIndex(0);
      }}
    >
      <SafeAreaView style={styles.modalContainer}>
        {__DEV__ && devUiSmokeEnabled ? (
          <View
            style={[
              styles.personaCard,
              {
                marginHorizontal: 12,
                marginTop: 8,
                marginBottom: 8,
                borderColor: "#4338CA",
                backgroundColor: "#EEF2FF",
              },
            ]}
          >
            <Text style={[styles.postMeta, { color: "#312E81" }]}>DEV UI Smoke</Text>
            <Text style={[styles.subtle, { color: "#312E81" }]}>
              {devUiSmokeStatus ?? "待機中"}
            </Text>
            {devUiSmokeHistory.slice(0, 5).map((line, idx) => (
              <Text
                key={`detail-dev-smoke-${idx}-${line}`}
                numberOfLines={1}
                style={[styles.postMeta, { color: "#4338CA" }]}
              >
                {line}
              </Text>
            ))}
          </View>
        ) : null}
        <View style={styles.modalHeader}>
          <Text style={styles.screenTitle}>投稿詳細</Text>
          <Pressable
            style={styles.outlineButton}
            onPress={() => {
              setDetailVisible(false);
              setDetailPersonaMatch(null);
              setDetailSequenceIds([]);
              setDetailSequenceIndex(0);
            }}
          >
            <Text style={styles.outlineButtonText}>閉じる</Text>
          </Pressable>
        </View>

        {detailLoading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator />
            <Text style={styles.subtle}>読み込み中…</Text>
          </View>
        ) : detailError ? (
          <View style={styles.modalBody}>
            <Text style={styles.errorText}>{detailError}</Text>
          </View>
        ) : !detailPost ? (
          <View style={styles.modalBody}>
            <Text style={styles.subtle}>投稿が見つかりませんでした。</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.modalBody}
            onTouchStart={onDetailTouchStart}
            onTouchEnd={onDetailTouchEnd}
          >
            {detailSequenceIds.length > 1 ? (
              <View style={styles.personaCard}>
                <View style={styles.postMetaRow}>
                  <Pressable
                    style={[styles.outlineButton, !canDetailPrev && styles.disabledButton]}
                    onPress={() => {
                      void moveDetailBy(-1);
                    }}
                    disabled={!canDetailPrev || detailLoading}
                  >
                    <Text style={styles.outlineButtonText}>← 前へ</Text>
                  </Pressable>
                  <Text style={styles.postMeta}>
                    {detailSequenceIndex + 1} / {detailSequenceIds.length}
                  </Text>
                  <Pressable
                    style={[styles.outlineButton, !canDetailNext && styles.disabledButton]}
                    onPress={() => {
                      void moveDetailBy(1);
                    }}
                    disabled={!canDetailNext || detailLoading}
                  >
                    <Text style={styles.outlineButtonText}>次へ →</Text>
                  </Pressable>
                </View>
                <Text style={styles.subtle}>左右スワイプでも前後投稿へ移動できます。</Text>
              </View>
            ) : null}
            {renderPostCard(detailPost, { showOpenHint: false })}
            {(() => {
              const text = String(detailPost.text ?? detailPost.body ?? "").trim();
              const lie = calibrateLieScoreWithFeedback(analyzeLieScore({ text }), {
                opens: detailLieFeedback.opens,
                replies: detailReplies.length,
                reports: detailLieFeedback.reports,
                truthTrueVotes: detailLieFeedback.truthTrueVotes,
                truthFalseVotes: detailLieFeedback.truthFalseVotes,
              });
              return (
                <View style={styles.personaCard}>
                  <View style={styles.postMetaRow}>
                    <Text style={styles.sectionTitle}>嘘スコア詳細</Text>
                    <Text style={styles.postMeta}>
                      {Math.round(lie.score * 100)}% ・{" "}
                    {lie.level === "high" ? "高め" : lie.level === "mid" ? "中" : "低め"}
                    </Text>
                  </View>
                  {Math.abs(lie.adjustment) >= 0.01 ? (
                    <Text style={styles.postMeta}>
                      反応補正 {lie.adjustment > 0 ? "+" : ""}
                      {Math.round(lie.adjustment * 100)}pt
                      {lie.feedbackSignals.opens > 0 ? ` / 開封 ${lie.feedbackSignals.opens}` : ""}
                      {lie.feedbackSignals.reports > 0 ? ` / 通報 ${lie.feedbackSignals.reports}` : ""}
                    </Text>
                  ) : null}
                  <View style={styles.chipWrap}>
                    {lie.cautionChips.map((chip: string) => (
                      <Text key={`detail-lie-caution-${detailPost.id}-${chip}`} style={styles.matchChip}>
                        {chip}
                      </Text>
                    ))}
                    {lie.reliefChips.map((chip: string) => (
                      <Text
                        key={`detail-lie-relief-${detailPost.id}-${chip}`}
                        style={[styles.matchChip, { backgroundColor: "#ECFDF5", color: "#065F46" }]}
                      >
                        {chip}
                      </Text>
                    ))}
                  </View>
                  {lie.reasons.map((reason: string) => (
                    <Text key={`detail-lie-reason-${detailPost.id}-${reason}`} style={styles.postMeta}>
                      ・{reason}
                    </Text>
                  ))}
                  {lie.feedbackReasons.slice(0, 2).map((reason: string) => (
                    <Text
                      key={`detail-lie-feedback-${detailPost.id}-${reason}`}
                      style={[styles.postMeta, { color: "#475569" }]}
                    >
                      ・{reason}
                    </Text>
                  ))}
                  <Text style={styles.subtle}>
                    数値・期間・条件・出典を足すと、誤解されにくい投稿になりやすいです。
                  </Text>
                </View>
              );
            })()}

            <View style={styles.personaCard}>
              <View style={styles.postMetaRow}>
                <Text style={styles.sectionTitle}>保存 / コレクション</Text>
                <Text style={styles.postMeta}>保存数 {detailSaveCount}</Text>
              </View>
              <Text style={styles.postMeta}>
                {detailSaved
                  ? `保存済み${detailSaveCollectionAvailable ? ` ・ ${detailSaveCollectionLabel}` : ""}`
                  : "未保存"}
              </Text>
              <View style={styles.headerActions}>
                <Pressable
                  style={[styles.outlineButton, detailSaveBusy && styles.disabledButton]}
                  onPress={() => {
                    void saveDetailPost({ saved: !detailSaved });
                  }}
                  disabled={detailSaveBusy}
                >
                  <Text style={styles.outlineButtonText}>
                    {detailSaveBusy ? "更新中…" : detailSaved ? "保存解除" : "保存する"}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.outlineButton}
                  onPress={() => {
                    setTab("saved");
                  }}
                >
                  <Text style={styles.outlineButtonText}>保存一覧へ</Text>
                </Pressable>
              </View>
              {detailSaveCollectionAvailable ? (
                <>
                  <Text style={styles.subtle}>保存先をタップで変更</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.chipWrap}>
                      {SAVED_COLLECTION_PRESETS.map((preset) => (
                        <Pressable
                          key={`detail-save-coll-${preset.key}`}
                          style={[
                            styles.assistChip,
                            detailSaved &&
                              detailSaveCollectionKey === preset.key &&
                              styles.modeButtonActive,
                            detailSaveBusy && styles.disabledButton,
                          ]}
                          onPress={() => {
                            void saveDetailPost({
                              saved: true,
                              collectionKey: preset.key,
                              collectionLabel: preset.label,
                            });
                          }}
                          disabled={detailSaveBusy}
                        >
                          <Text style={styles.assistChipText}>{preset.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                </>
              ) : (
                <Text style={styles.subtle}>
                  コレクション分類は未有効化です（保存機能は利用できます）。
                </Text>
              )}
            </View>

            <View style={styles.personaCard}>
              <Text style={styles.sectionTitle}>返信 ({detailReplies.length})</Text>
              {detailReplies.length === 0 ? (
                <Text style={styles.subtle}>返信はまだありません。</Text>
              ) : (
                detailReplies.map((r) => renderPostCard(r, { showOpenHint: false }))
              )}
            </View>

            <View style={styles.personaCard}>
              <Text style={styles.sectionTitle}>返信を書く</Text>
              <TextInput
                value={replyText}
                onChangeText={setReplyText}
                multiline
                placeholder="返信を入力..."
                style={[styles.textInput, styles.replyInput]}
              />
              <Pressable
                style={[
                  styles.primaryButton,
                  (!replyText.trim() || replying) && styles.disabledButton,
                ]}
                onPress={() => void submitReply()}
                disabled={!replyText.trim() || replying}
              >
                <Text style={styles.primaryButtonText}>
                  {replying ? "送信中…" : "返信を送信"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );

  if (authLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.centerBox]}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (!userId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.authBox}>
          <Text style={styles.appTitle}>PersonaLens Mobile</Text>
          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeButton, authMode === "signin" && styles.modeButtonActive]}
              onPress={() => setAuthMode("signin")}
            >
              <Text style={[styles.modeButtonText, authMode === "signin" && styles.modeButtonTextActive]}>
                ログイン
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modeButton, authMode === "signup" && styles.modeButtonActive]}
              onPress={() => setAuthMode("signup")}
            >
              <Text style={[styles.modeButtonText, authMode === "signup" && styles.modeButtonTextActive]}>
                新規登録
              </Text>
            </Pressable>
          </View>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.textInput}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="パスワード"
            secureTextEntry={!authShowPassword}
            style={styles.textInput}
          />
          {authMode === "signup" ? (
            <>
              <TextInput
                value={authConfirmPassword}
                onChangeText={setAuthConfirmPassword}
                placeholder="パスワード（確認）"
                secureTextEntry={!authShowPassword}
                style={styles.textInput}
              />
              <View style={styles.personaCard}>
                <Text style={styles.postMeta}>強度: {authPasswordStrength.label}</Text>
                <View style={[styles.progressTrack, { backgroundColor: "#E5E7EB" }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.max(6, (authPasswordStrength.score / 5) * 100)}%`,
                        backgroundColor:
                          authPasswordStrength.score <= 2
                            ? "#EF4444"
                            : authPasswordStrength.score <= 4
                            ? "#F59E0B"
                            : "#10B981",
                      },
                    ]}
                  />
                </View>
                <Text style={styles.subtle}>
                  8文字以上、英大文字・英小文字・数字・記号の組み合わせを推奨
                </Text>
              </View>
            </>
          ) : null}
          <Pressable
            style={styles.outlineButton}
            onPress={() => setAuthShowPassword((prev) => !prev)}
          >
            <Text style={styles.outlineButtonText}>
              {authShowPassword ? "パスワードを隠す" : "パスワードを表示"}
            </Text>
          </Pressable>
          {devQuickLoginAvailable ? (
            <Pressable
              style={[styles.outlineButton, authBusy && styles.disabledButton]}
              onPress={() => void onDevQuickLogin()}
              disabled={authBusy}
            >
              <Text style={styles.outlineButtonText}>DEVクイックログイン</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[
              styles.primaryButton,
              (authBusy || authCooldownSeconds > 0) && styles.disabledButton,
            ]}
            onPress={() => void onAuthSubmit()}
            disabled={authBusy || authCooldownSeconds > 0}
          >
            <Text style={styles.primaryButtonText}>
              {authBusy
                ? "処理中…"
                : authCooldownSeconds > 0
                ? `再試行まで ${authCooldownSeconds}秒`
                : authMode === "signin"
                ? "ログイン"
                : "登録する"}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.outlineButton, authBusy && styles.disabledButton]}
            onPress={() => void onRequestAuthPasswordReset()}
            disabled={authBusy}
          >
            <Text style={styles.outlineButtonText}>パスワード再設定メールを送る</Text>
          </Pressable>

          <Text style={styles.subtle}>
            セキュリティ保護のため、失敗が続くと短時間クールダウンされます。
          </Text>

          {authMessage ? <Text style={styles.errorText}>{authMessage}</Text> : null}
          {__DEV__ && !devQuickLoginAvailable ? (
            <Text style={styles.subtle}>
              DEVログイン未設定（EXPO_PUBLIC_DEV_LOGIN_EMAIL / PASSWORD）
            </Text>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.appTitle}>PersonaLens</Text>
        <Pressable style={styles.outlineButton} onPress={() => void onSignOut()}>
          <Text style={styles.outlineButtonText}>ログアウト</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabRowScroll}
        contentContainerStyle={styles.tabRow}
      >
        {(
          [
            "timeline",
            "following",
            "saved",
            "personaFeed",
            "personaCatalog",
            "evolution",
            "dialogue",
            "compose",
            "search",
            "notifications",
            "persona",
            "profile",
          ] as AppTab[]
        ).map((name) => (
          <Pressable
            key={name}
            onPress={() => setTab(name)}
            style={[styles.tabButton, tab === name && styles.tabButtonActive]}
          >
            <Text style={[styles.tabButtonText, tab === name && styles.tabButtonTextActive]}>
              {name === "timeline"
                ? "TL"
                : name === "following"
                ? "フォロー中"
                : name === "saved"
                ? "保存"
                : name === "personaFeed"
                ? "キャラTL"
                : name === "personaCatalog"
                ? "キャラ図鑑"
                : name === "evolution"
                ? "進化"
                : name === "dialogue"
                ? "対話AI"
                : name === "compose"
                ? "投稿"
                : name === "search"
                ? "検索"
                : name === "notifications"
                ? "通知"
                : name === "persona"
                ? "分析"
                : "プロフィール"}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {__DEV__ && devUiSmokeEnabled ? (
        <View
          style={[
            styles.personaCard,
            {
              marginHorizontal: 16,
              marginTop: 8,
              marginBottom: 0,
              borderColor: "#C7D2FE",
              backgroundColor: "#EEF2FF",
            },
          ]}
        >
          <Text style={[styles.postMeta, { color: "#3730A3" }]}>DEV UI Smoke</Text>
          <Text style={[styles.subtle, { color: "#312E81" }]}>
            {devUiSmokeStatus ?? "待機中（ログイン後に自動実行）"}
          </Text>
          {devUiSmokeHistory.length ? (
            <View style={{ marginTop: 6, gap: 2 }}>
              {devUiSmokeHistory.map((line, idx) => (
                <Text
                  key={`dev-smoke-log-${idx}-${line}`}
                  numberOfLines={1}
                  style={[styles.postMeta, { color: "#4338CA" }]}
                >
                  {line}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {tab === "timeline" && renderTimeline()}
      {tab === "following" && renderFollowing()}
      {tab === "saved" && renderSaved()}
      {tab === "personaFeed" && renderPersonaFeed()}
      {tab === "personaCatalog" && renderPersonaCatalog()}
      {tab === "evolution" && renderEvolution()}
      {tab === "dialogue" && renderDialogue()}
      {tab === "compose" && renderCompose()}
      {tab === "search" && renderSearch()}
      {tab === "notifications" && renderNotifications()}
      {tab === "persona" && renderPersona()}
      {tab === "profile" && renderProfile()}
      {showQuickComposeFab ? (
        <Pressable style={styles.fabCompose} onPress={() => setTab("compose")}>
          <Text style={styles.fabComposeText}>投稿</Text>
        </Pressable>
      ) : null}
      {renderPersonaCatalogDetailModal()}
      {renderPostDetailModal()}
      {renderFormatRailViewerModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F6F8",
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  appTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  tabRowScroll: {
    flexGrow: 0,
    flexShrink: 0,
    height: 58,
    backgroundColor: "#FFFFFF",
  },
  tabButton: {
    minWidth: 86,
    alignItems: "center",
    justifyContent: "center",
    height: 36,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
  },
  tabButtonActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  tabButtonText: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "600",
  },
  tabButtonTextActive: {
    color: "#FFFFFF",
  },
  screen: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  screenHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  badge: {
    fontSize: 12,
    color: "#374151",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#F9FAFB",
  },
  kindChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  kindChipText: {
    fontSize: 11,
    fontWeight: "700",
  },
  feedList: {
    gap: 12,
    paddingBottom: 24,
  },
  virtualList: {
    flex: 1,
    minHeight: 120,
  },
  virtualListContent: {
    paddingBottom: 24,
  },
  virtualListSeparator: {
    height: 12,
  },
  postCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  openedPostCard: {
    opacity: 0.84,
    borderColor: "#D1D5DB",
  },
  unreadCard: {
    borderColor: "#F59E0B",
    backgroundColor: "#FFFBEB",
  },
  postMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  postAuthorBlock: {
    flexShrink: 1,
    minWidth: 0,
    gap: 1,
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  matchChip: {
    fontSize: 11,
    color: "#1D4ED8",
    borderWidth: 1,
    borderColor: "#93C5FD",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "#EFF6FF",
  },
  postAuthor: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
    flexShrink: 1,
  },
  postAuthorHandle: {
    color: "#6B7280",
    fontSize: 11,
    flexShrink: 1,
  },
  postText: {
    color: "#111827",
    fontSize: 15,
    lineHeight: 22,
  },
  postMeta: {
    color: "#6B7280",
    fontSize: 12,
  },
  postActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  subtle: {
    color: "#6B7280",
    fontSize: 13,
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 13,
  },
  composeInput: {
    minHeight: 180,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
    fontSize: 15,
    color: "#111827",
  },
  composeMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    color: "#111827",
  },
  bioInput: {
    minHeight: 120,
    textAlignVertical: "top",
  },
  label: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
  },
  profileForm: {
    gap: 8,
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "700",
  },
  personaCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  personaTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  personaRow: {
    gap: 4,
    marginTop: 2,
  },
  personaCatalogGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  personaCatalogCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 10,
    gap: 4,
  },
  personaCatalogImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
  },
  personaCatalogImageFallback: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#C7D2FE",
    alignItems: "center",
    justifyContent: "center",
  },
  personaCatalogImageFallbackText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#4338CA",
  },
  personaCatalogImageFallbackSubText: {
    fontSize: 10,
    color: "#6366F1",
    fontWeight: "600",
    marginTop: 4,
    textTransform: "uppercase",
  },
  personaCatalogCardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  personaCatalogCategoryChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  personaCatalogCategoryChip: {
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  personaCatalogCategoryChipText: {
    color: "#1D4ED8",
    fontSize: 11,
    fontWeight: "700",
  },
  timelineHighlightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
    padding: 10,
  },
  timelineHighlightTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
  },
  timelineHighlightBody: {
    fontSize: 12,
    lineHeight: 17,
    color: "#374151",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  assistChip: {
    borderWidth: 1,
    borderColor: "#93C5FD",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#EFF6FF",
    maxWidth: "100%",
  },
  assistChipText: {
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: "600",
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#3B82F6",
  },
  soulmateRow: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#F4F6F8",
  },
  formatViewerContainer: {
    flex: 1,
    backgroundColor: "#030712",
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10,
  },
  formatViewerHeader: {
    gap: 10,
    paddingTop: 6,
  },
  formatViewerProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  formatViewerProgressTrack: {
    flex: 1,
    minWidth: 14,
    height: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  formatViewerProgressTrackActive: {
    backgroundColor: "#FFFFFF",
  },
  formatViewerBody: {
    flex: 1,
    gap: 10,
    justifyContent: "space-between",
  },
  formatViewerCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  formatViewerCardStory: {
    backgroundColor: "#1F2937",
    borderColor: "#6366F1",
  },
  formatViewerCardShort: {
    backgroundColor: "#111827",
    borderColor: "#10B981",
  },
  formatViewerAuthor: {
    color: "#F9FAFB",
    fontSize: 13,
    fontWeight: "700",
  },
  formatViewerTextWrap: {
    flex: 1,
  },
  formatViewerText: {
    color: "#F9FAFB",
    fontSize: 22,
    lineHeight: 32,
    fontWeight: "600",
  },
  formatViewerFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  formatViewerHint: {
    color: "#CBD5E1",
    fontSize: 12,
  },
  formatViewerNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  modalHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalBody: {
    padding: 16,
    gap: 12,
    paddingBottom: 24,
  },
  replyInput: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  primaryButton: {
    backgroundColor: "#2563EB",
    borderRadius: 10,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#FFFFFF",
  },
  outlineButtonText: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "600",
  },
  saveButtonActive: {
    borderWidth: 1,
    borderColor: "#93C5FD",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#DBEAFE",
  },
  saveButtonActiveText: {
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: "700",
  },
  warnButton: {
    borderWidth: 1,
    borderColor: "#FCA5A5",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#FEF2F2",
  },
  warnButtonText: {
    color: "#B91C1C",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  disabledButton: {
    opacity: 0.6,
  },
  fabCompose: {
    position: "absolute",
    right: 16,
    bottom: 20,
    height: 52,
    borderRadius: 999,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#0F172A",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
  },
  fabComposeText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  authBox: {
    marginTop: 32,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    padding: 16,
    gap: 10,
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    backgroundColor: "#F9FAFB",
  },
  modeButtonActive: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  modeButtonText: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "600",
  },
  modeButtonTextActive: {
    color: "#1D4ED8",
  },
});
