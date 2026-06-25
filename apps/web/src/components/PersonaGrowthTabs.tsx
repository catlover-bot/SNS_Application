"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AnimatedPersonaImage from "@/components/AnimatedPersonaImage";
import PersonaEvolutionPreviewStrip from "@/components/PersonaEvolutionPreviewStrip";
import PostCard from "@/components/PostCard";
import {
  getPersonaProfile,
  personaDisplayName,
} from "@/lib/personaCatalog";
import type { PersonaEvolutionProgress } from "@/lib/personaEvolution";

type PersonaProfileRow = {
  persona_key: string;
  score: number | null;
  confidence: number | null;
};

type PersonaScoreBreakdownLite = {
  totalScore: number;
  confidence: number;
  reason: string;
  recentSignals: string[];
  evolution: PersonaEvolutionProgress;
};

type PersonaFeedItem = {
  id: string;
  created_at: string;
  text?: string | null;
  body?: string | null;
  author?: string | null;
  author_handle?: string | null;
  author_display?: string | null;
  author_avatar?: string | null;
  score?: number | null;
  reply_count?: number | null;
  analysis?: any;
  persona_match?: {
    key?: string | null;
    weighted_score?: number | null;
    raw_score?: number | null;
    reason?: string | null;
    predicted_response?: number | null;
    ranking_score?: number | null;
  } | null;
};

type SavedDashboardItem = PersonaFeedItem & {
  save_meta?: {
    collection_key: string;
    collection_label: string;
    saved_at: string;
  };
};

type CollectionSummary = {
  key: string;
  label: string;
  count: number;
};

type PersonaGrowthTabsProps = {
  mainPersona: PersonaProfileRow | null;
  subPersonas: PersonaProfileRow[];
  mainEvolution: PersonaEvolutionProgress | null;
  mainBreakdown?: PersonaScoreBreakdownLite | null;
  profileLoading?: boolean;
};

type TabKey = "timeline" | "saved" | "evolution";
type TimelineFilter = "main" | "sub" | "all";
type TimelineSort = "strong" | "recent";

const TAB_DEFS: Array<{ key: TabKey; label: string; eyebrow: string }> = [
  { key: "timeline", label: "キャラTL", eyebrow: "成長シグナル" },
  { key: "saved", label: "保存", eyebrow: "見返す" },
  { key: "evolution", label: "進化", eyebrow: "次の姿" },
];

function parseAnalysis(raw: any) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

function postBody(post: PersonaFeedItem) {
  return String(post.text ?? post.body ?? "").trim();
}

function snippet(text: string, max = 130) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}…`;
}

function formatDate(raw: string | null | undefined) {
  const date = new Date(String(raw ?? ""));
  if (Number.isNaN(date.getTime())) return "日時不明";
  return date.toLocaleString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeMetric(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const pct = n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function pickMetric(post: PersonaFeedItem, key: "truth" | "exaggeration" | "brag" | "joke") {
  const analysis = parseAnalysis(post.analysis);
  const candidates = [
    (post as any)?.[key],
    analysis?.[key],
    analysis?.ai?.[key],
    analysis?.aiScore?.[key],
    analysis?.ai_score?.[key],
    analysis?.dimensions?.[key],
    analysis?.lieJudge?.[key],
    analysis?.persona?.ai?.[key],
  ];
  for (const value of candidates) {
    const pct = normalizeMetric(value);
    if (pct !== null) return pct;
  }
  return null;
}

function aiVerdict(post: PersonaFeedItem) {
  const analysis = parseAnalysis(post.analysis);
  const raw =
    analysis?.ai?.verdict ??
    analysis?.aiScore?.verdict ??
    analysis?.ai_score?.verdict ??
    analysis?.verdict ??
    analysis?.summary?.verdict ??
    "";
  return String(raw ?? "").trim();
}

function matchKey(post: PersonaFeedItem, fallbackKey?: string | null) {
  const explicit = String(post.persona_match?.key ?? "").trim();
  if (explicit) return explicit;
  const analysis = parseAnalysis(post.analysis);
  const selected = String(analysis?.persona?.selected ?? analysis?.persona_key ?? "").trim();
  return selected || String(fallbackKey ?? "").trim() || null;
}

function matchStrength(post: PersonaFeedItem) {
  const candidates = [
    post.persona_match?.weighted_score,
    post.persona_match?.raw_score,
    post.persona_match?.ranking_score,
    post.persona_match?.predicted_response,
  ];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function matchReasonLabel(reason: string | null | undefined) {
  const value = String(reason ?? "");
  if (value === "same_persona") return "この恐竜らしさ";
  if (value.startsWith("buddy_compat")) return "相性恐竜から発見";
  if (value.startsWith("compat")) return "近い投稿傾向";
  if (value === "global_fallback") return "最近の投稿";
  return "成長シグナル候補";
}

function signalLabelsFor(post: PersonaFeedItem, fallbackKey?: string | null) {
  const profile = getPersonaProfile(matchKey(post, fallbackKey));
  return profile.growthSignals.slice(0, 3);
}

function MetricPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: "truth" | "exaggeration" | "brag" | "joke";
}) {
  if (value === null) return null;
  const toneClass =
    tone === "truth"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "exaggeration"
        ? "border-orange-200 bg-orange-50 text-orange-800"
        : tone === "brag"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-purple-200 bg-purple-50 text-purple-800";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${toneClass}`}>
      {label} {value}%
    </span>
  );
}

function PersonaSignalPostCard({
  post,
  fallbackPersonaKey,
}: {
  post: PersonaFeedItem;
  fallbackPersonaKey?: string | null;
}) {
  const text = postBody(post);
  const personaKey = matchKey(post, fallbackPersonaKey);
  const personaName = personaDisplayName(personaKey);
  const verdict = aiVerdict(post);
  const signals = signalLabelsFor(post, fallbackPersonaKey);

  return (
    <article className="rounded-2xl border border-indigo-100 bg-white/90 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 font-semibold text-indigo-700">
            {personaName}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">
            {matchReasonLabel(post.persona_match?.reason)}
          </span>
        </div>
        <time className="text-xs text-slate-500" dateTime={post.created_at}>
          {formatDate(post.created_at)}
        </time>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-800">
        {snippet(text || "本文のない投稿です。")}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {signals.map((signal) => (
          <span
            key={signal}
            className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
          >
            {signal}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {verdict && (
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-800">
            AI判定 {verdict}
          </span>
        )}
        <MetricPill label="事実" value={pickMetric(post, "truth")} tone="truth" />
        <MetricPill label="盛り" value={pickMetric(post, "exaggeration")} tone="exaggeration" />
        <MetricPill label="自慢" value={pickMetric(post, "brag")} tone="brag" />
        <MetricPill label="ネタ" value={pickMetric(post, "joke")} tone="joke" />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <span className="text-[11px] text-slate-500">
          成長シグナル強度 {Math.round(matchStrength(post) * 100) / 100}
        </span>
        <Link
          href={`/p/${encodeURIComponent(post.id)}`}
          className="rounded-full border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
        >
          投稿詳細を見る
        </Link>
      </div>
    </article>
  );
}

function EmptyState({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-5 text-sm text-slate-600">
      <div className="font-semibold text-slate-950">{title}</div>
      <p className="mt-1 leading-6">{body}</p>
      <Link
        href={href}
        className="mt-3 inline-flex rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        {cta}
      </Link>
    </div>
  );
}

export default function PersonaGrowthTabs({
  mainPersona,
  subPersonas,
  mainEvolution,
  mainBreakdown,
  profileLoading = false,
}: PersonaGrowthTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("timeline");
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("main");
  const [timelineSort, setTimelineSort] = useState<TimelineSort>("strong");
  const [timelineItems, setTimelineItems] = useState<PersonaFeedItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [savedItems, setSavedItems] = useState<SavedDashboardItem[]>([]);
  const [savedCollections, setSavedCollections] = useState<CollectionSummary[]>([]);
  const [savedTotal, setSavedTotal] = useState(0);
  const [savedAvailable, setSavedAvailable] = useState(true);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);

  const mainPersonaKey = mainPersona?.persona_key ?? null;
  const mainProfile = useMemo(() => getPersonaProfile(mainPersonaKey), [mainPersonaKey]);
  const subPersonaKeys = useMemo(
    () => new Set(subPersonas.map((persona) => persona.persona_key).filter(Boolean)),
    [subPersonas]
  );

  const loadTimeline = useCallback(async () => {
    if (!mainPersonaKey) return;
    setTimelineLoading(true);
    setTimelineError(null);
    try {
      const params = new URLSearchParams({
        limit: "36",
        offset: "0",
        strategy: "compat",
      });
      const res = await fetch(`/api/me/persona-feed?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) throw new Error("persona_feed_unavailable");
      setTimelineItems(Array.isArray(json.items) ? (json.items as PersonaFeedItem[]) : []);
    } catch {
      setTimelineItems([]);
      setTimelineError("キャラTLを読み込めませんでした。時間をおいてもう一度お試しください。");
    } finally {
      setTimelineLoading(false);
    }
  }, [mainPersonaKey]);

  const loadSaved = useCallback(async () => {
    setSavedLoading(true);
    setSavedError(null);
    try {
      const params = new URLSearchParams({ limit: "12", offset: "0" });
      const res = await fetch(`/api/me/saved-posts?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) throw new Error("saved_posts_unavailable");
      setSavedAvailable(json.available !== false);
      setSavedItems(Array.isArray(json.items) ? (json.items as SavedDashboardItem[]) : []);
      setSavedCollections(Array.isArray(json.collections) ? json.collections : []);
      setSavedTotal(Math.max(0, Number(json.total ?? json.items?.length ?? 0) || 0));
    } catch {
      setSavedItems([]);
      setSavedCollections([]);
      setSavedTotal(0);
      setSavedError("保存した投稿を読み込めませんでした。時間をおいてもう一度お試しください。");
    } finally {
      setSavedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "timeline" && mainPersonaKey) {
      void loadTimeline();
    }
  }, [activeTab, loadTimeline, mainPersonaKey]);

  useEffect(() => {
    if (activeTab === "saved") {
      void loadSaved();
    }
  }, [activeTab, loadSaved]);

  const filteredTimelineItems = useMemo(() => {
    const mainKey = mainPersonaKey ?? "";
    const filtered = timelineItems.filter((post) => {
      const key = matchKey(post, mainPersonaKey);
      if (timelineFilter === "all") return true;
      if (timelineFilter === "main") return !key || key === mainKey;
      return Boolean(key && subPersonaKeys.has(key));
    });
    const sorted = filtered.slice().sort((a, b) => {
      if (timelineSort === "recent") {
        return Date.parse(b.created_at) - Date.parse(a.created_at);
      }
      return matchStrength(b) - matchStrength(a);
    });
    return sorted.slice(0, 12);
  }, [mainPersonaKey, subPersonaKeys, timelineFilter, timelineItems, timelineSort]);

  const nextStage = mainEvolution?.nextStage ?? null;
  const currentStage = mainEvolution?.stage ?? null;

  const selectTab = (next: TabKey) => setActiveTab(next);

  return (
    <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/60 to-violet-50/70 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
            Persona Growth Loop
          </div>
          <h2 className="mt-1 text-lg font-bold text-slate-950">
            投稿 → AI判定 → 成長シグナル → 恐竜進化
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            キャラTL・保存・進化をここでつなげて、どの投稿があなたの恐竜を育てているか確認できます。
          </p>
        </div>
        {mainPersonaKey && (
          <div className="flex items-center gap-2 rounded-2xl border border-white/80 bg-white/80 px-3 py-2 shadow-sm">
            <AnimatedPersonaImage
              personaKey={mainPersonaKey}
              stageKey={mainEvolution?.stage.key}
              displayName={mainProfile.displayName}
              iconEmoji={mainProfile.iconEmoji}
              silhouetteEmoji={mainProfile.silhouetteEmoji}
              variant="thumbnail"
              motion="sparkle"
              className="h-12 w-12 rounded-xl bg-indigo-50"
            />
            <div>
              <div className="text-sm font-bold text-slate-950">{mainProfile.displayName}</div>
              <div className="text-xs text-indigo-700">
                {currentStage ? currentStage.label : "成長準備中"}
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        className="mt-4 flex flex-wrap gap-2"
        role="tablist"
        aria-label="ペルソナ成長タブ"
      >
        {TAB_DEFS.map((tab) => (
          <button
            key={tab.key}
            id={`persona-growth-tab-${tab.key}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls={`persona-growth-panel-${tab.key}`}
            onClick={() => selectTab(tab.key)}
            className={`rounded-full border px-3 py-2 text-left text-sm transition ${
              activeTab === tab.key
                ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                : "border-white/80 bg-white/80 text-slate-700 hover:border-indigo-200 hover:bg-indigo-50"
            }`}
          >
            <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-75">
              {tab.eyebrow}
            </span>
            <span className="font-bold">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-4">
        {activeTab === "timeline" && (
          <div
            id="persona-growth-panel-timeline"
            role="tabpanel"
            aria-labelledby="persona-growth-tab-timeline"
            className="space-y-4"
          >
            <div className="rounded-2xl border border-white/80 bg-white/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-950">この恐竜らしさが出ている投稿</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    AI判定と投稿スコアから、成長シグナルになりやすい投稿を並べています。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadTimeline()}
                  disabled={timelineLoading || !mainPersonaKey}
                  className="rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-sm font-semibold text-indigo-700 disabled:opacity-50"
                >
                  {timelineLoading ? "更新中…" : "更新"}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ["main", "メイン恐竜"],
                  ["sub", "サブ恐竜"],
                  ["all", "すべて"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTimelineFilter(key as TimelineFilter)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      timelineFilter === key
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                {[
                  ["strong", "成長シグナルが強い順"],
                  ["recent", "最近"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTimelineSort(key as TimelineSort)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      timelineSort === key
                        ? "border-violet-600 bg-violet-600 text-white"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {timelineError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                {timelineError}
              </div>
            )}
            {!mainPersonaKey && !profileLoading ? (
              <EmptyState
                title="まだメイン恐竜が見つかっていません"
                body="まずは投稿して、AIにあなたの投稿のクセを読んでもらいましょう。"
                href="/compose"
                cta="投稿して育てる"
              />
            ) : timelineLoading && filteredTimelineItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-5 text-sm text-slate-600">
                キャラTLを読み込んでいます…
              </div>
            ) : filteredTimelineItems.length === 0 ? (
              <EmptyState
                title="まだこの恐竜らしい投稿が少ないです"
                body="同じ投稿傾向が増えると、ここに成長シグナルになった投稿が並びます。"
                href="/compose"
                cta="この恐竜を育てる投稿を書く"
              />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {filteredTimelineItems.map((post) => (
                  <PersonaSignalPostCard
                    key={`persona-signal-${post.id}`}
                    post={post}
                    fallbackPersonaKey={mainPersonaKey}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "saved" && (
          <div
            id="persona-growth-panel-saved"
            role="tabpanel"
            aria-labelledby="persona-growth-tab-saved"
            className="space-y-4"
          >
            <div className="rounded-2xl border border-white/80 bg-white/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-950">保存した投稿を見返す</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    気になる投稿を保存すると、後で読み返して次の投稿のヒントにできます。
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-indigo-700">{savedTotal}</div>
                  <div className="text-xs text-slate-500">保存済み</div>
                </div>
              </div>
              {savedCollections.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {savedCollections.slice(0, 6).map((collection) => (
                    <span
                      key={collection.key}
                      className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800"
                    >
                      {collection.label} {collection.count}
                    </span>
                  ))}
                </div>
              )}
              {!savedAvailable && (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  コレクション用テーブルがまだ利用できないため、保存一覧は準備中です。
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void loadSaved()}
                disabled={savedLoading}
                className="rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-sm font-semibold text-indigo-700 disabled:opacity-50"
              >
                {savedLoading ? "更新中…" : "保存一覧を更新"}
              </button>
            </div>

            {savedError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                {savedError}
              </div>
            )}
            {savedLoading && savedItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-5 text-sm text-slate-600">
                保存した投稿を読み込んでいます…
              </div>
            ) : savedItems.length === 0 ? (
              <EmptyState
                title="気になる投稿を保存すると、ここで見返せます"
                body="キャラTLやホームで保存ボタンを押すと、投稿のネタ帳として蓄積できます。"
                href="/persona-feed"
                cta="キャラTLで探す"
              />
            ) : (
              <div className="space-y-3">
                {savedItems.map((post) => (
                  <div key={`saved-dashboard-${post.id}`} className="space-y-1">
                    {post.save_meta?.saved_at && (
                      <div className="px-1 text-xs text-slate-500">
                        保存: {formatDate(post.save_meta.saved_at)}
                        {post.save_meta.collection_label
                          ? ` / ${post.save_meta.collection_label}`
                          : ""}
                      </div>
                    )}
                    <PostCard p={post} />
                  </div>
                ))}
                <Link
                  href="/saved"
                  className="inline-flex rounded-full border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50"
                >
                  保存コレクションを開く
                </Link>
              </div>
            )}
          </div>
        )}

        {activeTab === "evolution" && (
          <div
            id="persona-growth-panel-evolution"
            role="tabpanel"
            aria-labelledby="persona-growth-tab-evolution"
            className="space-y-4"
          >
            {!mainPersonaKey || !mainEvolution ? (
              <EmptyState
                title="進化ガイドはこれから育ちます"
                body="投稿が増えると、現在の進化段階と次の条件がここに表示されます。"
                href="/compose"
                cta="最初の投稿を書く"
              />
            ) : (
              <>
                <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                  <article className="rounded-2xl border border-white/80 bg-white/85 p-4 shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                      Current Form
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <AnimatedPersonaImage
                        personaKey={mainPersonaKey}
                        stageKey={mainEvolution.stage.key}
                        displayName={mainProfile.displayName}
                        iconEmoji={mainProfile.iconEmoji}
                        silhouetteEmoji={mainProfile.silhouetteEmoji}
                        variant="hero"
                        motion="sparkle"
                        className="persona-current-form h-28 w-28 shrink-0 rounded-3xl border border-white/80 bg-indigo-50"
                      />
                      <div>
                        <div className="text-xl font-bold text-slate-950">
                          {mainProfile.displayName}
                        </div>
                        <div className="text-sm font-semibold text-indigo-700">
                          {mainEvolution.stage.label}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          キャラスコア {mainBreakdown?.totalScore ?? "—"}pt / 確からしさ{" "}
                          {mainBreakdown?.confidence ?? "—"}%
                        </div>
                      </div>
                    </div>
                    <PersonaEvolutionPreviewStrip
                      personaKey={mainPersonaKey}
                      displayName={mainProfile.displayName}
                      currentStageKey={mainEvolution.stage.key}
                      unlockedStages={mainEvolution.unlockedStages}
                      variant="strip"
                      className="mt-4"
                    />
                  </article>

                  <article className="rounded-2xl border border-white/80 bg-white/85 p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                          Next Evolution
                        </div>
                        <h3 className="mt-1 font-bold text-slate-950">
                          {nextStage ? `${nextStage.label}までの条件` : "最終進化に到達しました"}
                        </h3>
                      </div>
                      <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
                        {nextStage ? `${mainEvolution.progressPercent}%` : "100%"}
                      </span>
                    </div>
                    <div className="mt-3 h-3 overflow-hidden rounded-full bg-indigo-100">
                      <div
                        className="persona-evolution-meter h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500"
                        style={{ width: `${mainEvolution.progressPercent}%` }}
                      />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-700">
                      {mainEvolution.nextRequirementText}
                    </p>
                    {mainEvolution.remainingHints.length > 0 && (
                      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                        {mainEvolution.remainingHints.map((hint) => (
                          <li
                            key={hint}
                            className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-800"
                          >
                            {hint}
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                </div>

                <div className="rounded-2xl border border-white/80 bg-white/85 p-4 shadow-sm">
                  <h3 className="font-bold text-slate-950">次に投稿すると伸びやすい内容</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                      <div className="text-xs font-semibold text-emerald-900">成長シグナル</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {mainProfile.growthSignals.slice(0, 4).map((signal) => (
                          <span
                            key={signal}
                            className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[11px] text-emerald-800"
                          >
                            {signal}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                      <div className="text-xs font-semibold text-blue-900">言葉の方向性</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(mainProfile.toneKeywords ?? []).slice(0, 4).map((keyword) => (
                          <span
                            key={keyword}
                            className="rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[11px] text-blue-800"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <div className="text-xs font-semibold text-amber-900">育てるヒント</div>
                      <p className="mt-2 text-xs leading-5 text-amber-950">
                        {mainProfile.evolutionHint}
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/compose"
                    className="mt-4 inline-flex rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    このヒントで投稿を書く
                  </Link>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
