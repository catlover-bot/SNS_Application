// apps/web/src/app/compose/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  analyzeLieScore,
  analyzePersonaBuzz,
  buildPersonaBlendRewrites,
  buildPersonaRewrites,
  computeLieScore,
} from "@sns/core";
import { supabaseClient as supabase } from "@/lib/supabase/client";

type AnalysisFlags = {
  noExif?: boolean;
  possibleAIGenerated?: boolean;
  heavyEditing?: boolean;
};
type Analysis = {
  elaScore?: number;
  flags?: AnalysisFlags;
  reasons?: string[];
  post_format?: ComposeFormatMode;
  buzz?: {
    score: number;
    calibratedScore?: number;
    level: string;
    metrics: Array<{ key: string; label: string; score: number }>;
    tips: string[];
    hashtags: string[];
    replyPrompt: string;
    calibration?: {
      multiplier: number;
      confidence: number;
      samples: number;
      personaKey: string;
    } | null;
    source: string;
  };
  persona?: {
    selected: string | null;
    candidates: Array<{ key: string; title: string; score: number }>;
    blend?: {
      secondary: string;
      primaryShare: number;
      source: string;
    } | null;
    rewrite_mission?: {
      source: "persona_mission";
      styleKey: string;
      styleLabel: string;
      buddyPersonaKey: string;
      basePersonaKey: string | null;
      suggestedAt: string;
      appliedAt: string;
    } | null;
    source: string;
  };
};

type PersonaSuggestion = {
  key: string;
  title: string;
  score: number;
  reasonTokens?: string[];
};

type PersonaCatalogItem = {
  key: string;
  title: string;
  theme?: string | null;
  blurb?: string | null;
};

type CompatSuggestion = {
  targetKey: string;
  title: string;
  score: number;
  relationLabel?: string | null;
};

type ComposeFormatMode = "post" | "short" | "story";

type PostPerformanceResponse = {
  ok: boolean;
  post: {
    id: string;
    created_at: string;
    text: string;
    lieScorePct: number;
    persona?: { selected?: string | null } | null;
    buzz?: {
      score?: number;
      calibratedScore?: number;
      level?: string;
      metrics?: Array<{ key: string; label: string; score: number }>;
      hashtags?: string[];
      replyPrompt?: string;
    } | null;
  };
  scorecard: {
    counts: {
      likes: number;
      boosts: number;
      saves: number;
      replies: number;
      uniqueOpens: number;
      personaFeedImpressions: number;
      personaFeedOpens: number;
    };
    rates: {
      likePerOpen: number | null;
      replyPerOpen: number | null;
      savePerOpen: number | null;
      boostPerOpen: number | null;
      personaFeedOpenRate: number | null;
    };
    score: {
      composite: number | null;
      grade: string;
    };
    highlights: string[];
    suggestions: string[];
  };
  comparison: {
    samples: number;
    delta: {
      likePerOpen: number | null;
      replyPerOpen: number | null;
      savePerOpen: number | null;
      boostPerOpen: number | null;
      personaFeedOpenRate: number | null;
      composite: number | null;
    };
    averages: {
      likePerOpen: number | null;
      replyPerOpen: number | null;
      savePerOpen: number | null;
      boostPerOpen: number | null;
      personaFeedOpenRate: number | null;
      composite: number | null;
    };
  };
  trend: {
    points: Array<{
      at: string;
      label: string;
      counts: { opens: number; saves: number; replies: number; likes: number; boosts: number };
      rates: { savePerOpen: number | null; replyPerOpen: number | null; likePerOpen: number | null };
    }>;
  };
};

const LIMIT = 280;

function toCompatPercent(v: number | null | undefined) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n <= 1) return Math.round(n * 100);
  if (n <= 100) return Math.round(n);
  return 100;
}

function buildShortStorySeed(args: {
  text: string;
  format: ComposeFormatMode;
  hashtags: string[];
  personaTitle?: string | null;
}) {
  const base = String(args.text ?? "").trim();
  if (!base) return "";
  if (args.format === "short") {
    const first = base.split(/\n+/)[0] ?? base;
    const compact = first.length > 78 ? `${first.slice(0, 77)}…` : first;
    const tag = args.hashtags?.[0] ? ` ${args.hashtags[0]}` : "";
    return `${compact}${tag}`.slice(0, LIMIT);
  }
  if (args.format === "story") {
    const lines = base
      .split(/\n+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 3);
    const lead = args.personaTitle ? `【${args.personaTitle} story】` : "【story】";
    const merged = [lead, ...lines].join("\n");
    return merged.slice(0, LIMIT);
  }
  return base.slice(0, LIMIT);
}

export default function Compose() {
  // ✅ Supabase クライアントを1度だけ生成
  const sb = useMemo(() => supabase(), []);

  const [text, setText] = useState("");
  const [score, setScore] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [posting, setPosting] = useState(false);
  const [personaLoading, setPersonaLoading] = useState(false);
  const [personaError, setPersonaError] = useState<string | null>(null);
  const [personaCandidates, setPersonaCandidates] = useState<PersonaSuggestion[]>([]);
  const [selectedPersonaKey, setSelectedPersonaKey] = useState<string | null>(null);
  const [personaCatalog, setPersonaCatalog] = useState<PersonaCatalogItem[]>([]);
  const [compatSuggestions, setCompatSuggestions] = useState<CompatSuggestion[]>([]);
  const [compatLoading, setCompatLoading] = useState(false);
  const [compatError, setCompatError] = useState<string | null>(null);
  const [blendSecondaryKey, setBlendSecondaryKey] = useState<string>("");
  const [blendPrimarySharePct, setBlendPrimarySharePct] = useState(70);
  const [buzzCalibration, setBuzzCalibration] = useState<{
    multiplier: number;
    confidence: number;
    samples: number;
    personaKey: string;
  } | null>(null);
  const [missionRewriteAttribution, setMissionRewriteAttribution] = useState<{
    styleKey: string;
    styleLabel: string;
    buddyPersonaKey: string;
    basePersonaKey: string | null;
    suggestedAt: string;
  } | null>(null);
  const [composeFormatMode, setComposeFormatMode] = useState<ComposeFormatMode>("post");
  const [lastPostedPostId, setLastPostedPostId] = useState<string | null>(null);
  const [lastPostedPerformance, setLastPostedPerformance] = useState<PostPerformanceResponse | null>(null);
  const [lastPostedPerformanceLoading, setLastPostedPerformanceLoading] = useState(false);
  const [lastPostedPerformanceError, setLastPostedPerformanceError] = useState<string | null>(null);
  const selectedPersona = useMemo(
    () => personaCandidates.find((x) => x.key === selectedPersonaKey) ?? null,
    [personaCandidates, selectedPersonaKey]
  );
  const buzz = useMemo(
    () =>
      analyzePersonaBuzz({
        text,
        personaKey: selectedPersonaKey,
        personaTitle: selectedPersona?.title ?? null,
        vibeTags: selectedPersona?.reasonTokens ?? [],
      }),
    [selectedPersona?.reasonTokens, selectedPersona?.title, selectedPersonaKey, text]
  );
  const calibratedBuzzScore = useMemo(() => {
    if (!buzzCalibration) return buzz.score;
    const confidence = Math.max(0, Math.min(1, Number(buzzCalibration.confidence ?? 0)));
    const multiplier = Math.max(0.72, Math.min(1.38, Number(buzzCalibration.multiplier ?? 1)));
    return Math.max(0, Math.min(100, Math.round(buzz.score * (1 + (multiplier - 1) * confidence))));
  }, [buzz.score, buzzCalibration]);
  const rewriteVariants = useMemo(
    () =>
      buildPersonaRewrites({
        text,
        personaKey: selectedPersonaKey,
        personaTitle: selectedPersona?.title ?? null,
        vibeTags: selectedPersona?.reasonTokens ?? [],
        maxLength: LIMIT,
        diagnostic: buzz,
      }),
    [buzz, selectedPersona?.reasonTokens, selectedPersona?.title, selectedPersonaKey, text]
  );

  const blendSecondaryOptions = useMemo(() => {
    const compatMap = new Map<string, number>();
    compatSuggestions.forEach((x) => {
      if (!x?.targetKey) return;
      compatMap.set(x.targetKey, toCompatPercent(x.score));
    });
    const map = new Map<string, PersonaCatalogItem>();
    personaCatalog.forEach((p) => {
      if (!p?.key) return;
      map.set(p.key, p);
    });
    personaCandidates.forEach((c) => {
      if (!c?.key) return;
      const prev = map.get(c.key);
      map.set(c.key, {
        key: c.key,
        title: c.title ?? prev?.title ?? c.key,
        theme: prev?.theme ?? null,
        blurb: prev?.blurb ?? null,
      });
    });
    return Array.from(map.values())
      .filter((x) => x.key !== selectedPersonaKey)
      .sort((a, b) => {
        const as = compatMap.get(a.key) ?? -1;
        const bs = compatMap.get(b.key) ?? -1;
        if (bs !== as) return bs - as;
        return a.title.localeCompare(b.title);
      });
  }, [compatSuggestions, personaCandidates, personaCatalog, selectedPersonaKey]);

  const blendSecondary = useMemo(
    () => blendSecondaryOptions.find((x) => x.key === blendSecondaryKey) ?? null,
    [blendSecondaryKey, blendSecondaryOptions]
  );

  const blendRewrites = useMemo(() => {
    if (!text.trim() || !selectedPersonaKey || !blendSecondary || blendSecondary.key === selectedPersonaKey) {
      return [];
    }
    return buildPersonaBlendRewrites({
      text,
      mixRatio: Math.max(0, Math.min(1, blendPrimarySharePct / 100)),
      maxLength: LIMIT,
      primary: {
        text,
        personaKey: selectedPersonaKey,
        personaTitle: selectedPersona?.title ?? selectedPersonaKey,
        vibeTags: selectedPersona?.reasonTokens ?? [],
      },
      secondary: {
        text,
        personaKey: blendSecondary.key,
        personaTitle: blendSecondary.title ?? blendSecondary.key,
        personaTheme: blendSecondary.theme ?? null,
      },
    });
  }, [blendPrimarySharePct, blendSecondary, selectedPersona?.reasonTokens, selectedPersona?.title, selectedPersonaKey, text]);
  const shortStoryOptimizedSeed = useMemo(
    () =>
      buildShortStorySeed({
        text,
        format: composeFormatMode,
        hashtags: buzz.hashtags ?? [],
        personaTitle: selectedPersona?.title ?? null,
      }),
    [buzz.hashtags, composeFormatMode, selectedPersona?.title, text]
  );
  const lieAnalysis = useMemo(() => analyzeLieScore({ text }), [text]);

  function onChangeText(v: string) {
    const s = v.slice(0, LIMIT);
    setText(s);
    setScore(Math.round(computeLieScore({ text: s }) * 100) / 100);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const seed = sp.get("seed") ?? sp.get("prompt");
    const rewriteSource = (sp.get("rewriteSource") ?? "").trim();
    const rewriteStyleKey = (sp.get("rewriteStyleKey") ?? "").trim();
    const rewriteStyleLabel = (sp.get("rewriteStyleLabel") ?? "").trim();
    const rewriteBuddyKey = (sp.get("rewriteBuddyKey") ?? "").trim();
    const rewriteBasePersona = (sp.get("rewriteBasePersona") ?? "").trim();
    const rewriteSuggestedAt =
      (sp.get("rewriteSuggestedAt") ?? "").trim() || new Date().toISOString();
    if (!seed) return;
    onChangeText(seed);
    if (
      rewriteSource === "persona_mission" &&
      rewriteStyleKey &&
      rewriteStyleLabel &&
      rewriteBuddyKey
    ) {
      setMissionRewriteAttribution({
        styleKey: rewriteStyleKey,
        styleLabel: rewriteStyleLabel,
        buddyPersonaKey: rewriteBuddyKey,
        basePersonaKey: rewriteBasePersona || null,
        suggestedAt: rewriteSuggestedAt,
      });
    }
    // 初回のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 6) {
      setPersonaCandidates([]);
      setPersonaError(null);
      setSelectedPersonaKey((prev) =>
        prev && personaCatalog.some((x) => x.key === prev) ? prev : null
      );
      return;
    }

    let stop = false;
    const timer = window.setTimeout(async () => {
      setPersonaLoading(true);
      setPersonaError(null);
      try {
        const res = await fetch("/api/personas/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: q, limit: 6 }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json) {
          throw new Error(json?.error ?? "キャラ候補の取得に失敗しました");
        }
        if (stop) return;
        const items = (json.items ?? []) as PersonaSuggestion[];
        setPersonaCandidates(items);
        if (items.length === 0) {
          setSelectedPersonaKey(null);
          return;
        }
        setSelectedPersonaKey((prev) =>
          prev && items.some((x) => x.key === prev) ? prev : items[0].key
        );
      } catch (e: any) {
        if (!stop) {
          setPersonaError(e?.message ?? "キャラ候補の取得に失敗しました");
          setPersonaCandidates([]);
        }
      } finally {
        if (!stop) setPersonaLoading(false);
      }
    }, 350);

    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [personaCatalog, text]);

  useEffect(() => {
    if (!selectedPersonaKey) {
      setCompatSuggestions([]);
      setCompatError(null);
      setCompatLoading(false);
      return;
    }

    let stop = false;
    (async () => {
      setCompatLoading(true);
      setCompatError(null);
      try {
        const params = new URLSearchParams({
          key: selectedPersonaKey,
          mode: "friendship",
          limit: "8",
        });
        const res = await fetch(`/api/personas/compat?${params.toString()}`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json) {
          throw new Error(json?.error ?? "相性データ取得に失敗しました");
        }
        if (stop) return;
        const items = Array.isArray(json.items)
          ? (json.items as Array<any>)
              .map((x) => ({
                targetKey: String(x?.targetKey ?? "").trim(),
                title: String(x?.title ?? x?.targetKey ?? "").trim(),
                score: Number(x?.score ?? 0) || 0,
                relationLabel:
                  x?.relationLabel == null ? null : String(x.relationLabel),
              }))
              .filter((x) => x.targetKey && x.targetKey !== selectedPersonaKey)
          : [];
        setCompatSuggestions(items);
      } catch (e: any) {
        if (stop) return;
        setCompatSuggestions([]);
        setCompatError(e?.message ?? "相性データ取得に失敗しました");
      } finally {
        if (!stop) setCompatLoading(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, [selectedPersonaKey]);

  useEffect(() => {
    const personaKey = selectedPersonaKey || "__all__";
    let stop = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/me/persona-buzz-learning?personaKey=${encodeURIComponent(personaKey)}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          if (!stop) setBuzzCalibration(null);
          return;
        }
        const json = await res.json().catch(() => null);
        if (!json?.selected || stop) {
          if (!stop) setBuzzCalibration(null);
          return;
        }
        setBuzzCalibration({
          multiplier: Number(json.selected.multiplier ?? 1) || 1,
          confidence: Number(json.selected.confidence ?? 0) || 0,
          samples: Math.max(0, Math.floor(Number(json.selected.samples ?? 0) || 0)),
          personaKey,
        });
      } catch {
        if (!stop) setBuzzCalibration(null);
      }
    })();
    return () => {
      stop = true;
    };
  }, [selectedPersonaKey]);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const res = await fetch("/api/personas", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok || !Array.isArray(json)) return;
        if (stop) return;
        const rows = (json as PersonaCatalogItem[]).filter((x) => x?.key);
        setPersonaCatalog(rows);
      } catch {
        if (!stop) setPersonaCatalog([]);
      }
    })();
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    if (blendSecondaryKey && blendSecondaryOptions.some((x) => x.key === blendSecondaryKey)) return;
    setBlendSecondaryKey(blendSecondaryOptions[0]?.key ?? "");
  }, [blendSecondaryKey, blendSecondaryOptions]);

  async function loadPostPerformance(postId: string) {
    const id = String(postId ?? "").trim();
    if (!id) return;
    setLastPostedPerformanceLoading(true);
    setLastPostedPerformanceError(null);
    try {
      const res = await fetch(`/api/me/post-performance/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? "投稿結果の取得に失敗しました");
      }
      setLastPostedPerformance(json as PostPerformanceResponse);
      setLastPostedPostId(id);
      void fetch(`/api/me/post-performance/${encodeURIComponent(id)}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "compose_scorecard" }),
      }).catch(() => null);
    } catch (e: any) {
      setLastPostedPerformanceError(e?.message ?? "投稿結果の取得に失敗しました");
      setLastPostedPostId(id);
    } finally {
      setLastPostedPerformanceLoading(false);
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setAnalysis(null);
    setPreview(f ? URL.createObjectURL(f) : null);
    if (!f) return;

    // 画像の簡易解析（任意API）
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/analyze-image", { method: "POST", body: fd });
      const json = await res.json();
      if (json?.ok) setAnalysis(json.result as Analysis);
    } catch {
      // 解析失敗は無視（投稿は継続可能）
    }
  }

  async function submit() {
    if (posting) return;
    setPosting(true);

    try {
      // 認証チェック
      const { data: { user } } = await sb.auth.getUser();
      if (!user) {
        alert("投稿するにはログインが必要です。");
        setPosting(false);
        return;
      }

      // 画像があれば Storage にアップロード
      let mediaUrl: string | undefined;
      if (file) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const up = await sb.storage.from("media").upload(path, file, { upsert: false });
        if (up.error) {
          alert("画像のアップロードに失敗しました: " + up.error.message);
          setPosting(false);
          return;
        }
        const pub = sb.storage.from("media").getPublicUrl(path);
        mediaUrl = pub.data.publicUrl;
      }

      // 投稿作成
      const composeAnalysis: Analysis = {
        ...(analysis ?? {}),
        post_format: composeFormatMode,
        buzz: {
          score: buzz.score,
          calibratedScore: calibratedBuzzScore,
          level: buzz.level,
          metrics: buzz.metrics.map((m) => ({
            key: m.key,
            label: m.label,
            score: m.score,
          })),
          tips: buzz.tips.slice(0, 4),
          hashtags: buzz.hashtags.slice(0, 4),
          replyPrompt: buzz.replyPrompt,
          calibration: buzzCalibration
            ? {
                multiplier: buzzCalibration.multiplier,
                confidence: buzzCalibration.confidence,
                samples: buzzCalibration.samples,
                personaKey: buzzCalibration.personaKey,
              }
            : null,
          source: "persona_buzz_v1",
        },
        persona: {
          selected: selectedPersonaKey,
          candidates: personaCandidates.slice(0, 3).map((x) => ({
            key: x.key,
            title: x.title,
            score: x.score,
          })),
          blend:
            selectedPersonaKey && blendSecondary && blendSecondary.key !== selectedPersonaKey
              ? {
                  secondary: blendSecondary.key,
                  primaryShare: Math.max(0, Math.min(1, blendPrimarySharePct / 100)),
                  source: "buddy_assist_v1",
                }
              : null,
          rewrite_mission: missionRewriteAttribution
            ? {
                source: "persona_mission",
                styleKey: missionRewriteAttribution.styleKey,
                styleLabel: missionRewriteAttribution.styleLabel,
                buddyPersonaKey: missionRewriteAttribution.buddyPersonaKey,
                basePersonaKey: missionRewriteAttribution.basePersonaKey,
                suggestedAt: missionRewriteAttribution.suggestedAt,
                appliedAt: new Date().toISOString(),
              }
            : null,
          source: "compose_v2",
        },
      };

      const { data, error } = await sb
        .from("posts")
        .insert({
          author: user.id,
          text,
          score,                          // 0..1 を想定
          media_urls: mediaUrl ? [mediaUrl] : [],
          analysis: composeAnalysis,      // JSONB
        })
        .select("id")
        .single();

      if (error) {
        alert(error.message);
      } else {
        // 投稿結果カードを表示するため、この画面に残す
        setLastPostedPostId(data.id);
        setLastPostedPerformance(null);
        setLastPostedPerformanceError(null);
        void loadPostPerformance(data.id);

        setText("");
        setFile(null);
        setPreview(null);
        setAnalysis(null);
        setPersonaCandidates([]);
        setSelectedPersonaKey(null);
        setComposeFormatMode("post");
        setMissionRewriteAttribution(null);
      }
    } finally {
      setPosting(false);
    }
  }

  function applyRewrite(nextText: string) {
    onChangeText(nextText);
  }

  function applyCompatBuddy(targetKey: string) {
    if (!targetKey) return;
    setBlendSecondaryKey(targetKey);
    setBlendPrimarySharePct(65);
  }

  function appendBuzzPrompt() {
    const prompt = buzz.replyPrompt.trim();
    if (!prompt) return;
    const next = text.trim() ? `${text.trim()}\n${prompt}` : prompt;
    onChangeText(next);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold">投稿フォーマット（SNS最適化）</div>
          <a href="/saved" className="text-xs underline">
            保存/コレクションを見る
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            ["post", "通常投稿", "情報量を保った標準投稿"],
            ["short", "短尺投稿", "Reels/X向けの短文フック重視"],
            ["story", "ストーリー", "縦読み・感情共有向け"],
          ] as Array<[ComposeFormatMode, string, string]>).map(([key, label, desc]) => (
            <button
              key={key}
              type="button"
              onClick={() => setComposeFormatMode(key)}
              className={`px-3 py-1.5 rounded-full border text-sm ${
                composeFormatMode === key ? "bg-slate-900 text-white border-slate-900" : "bg-white"
              }`}
              title={desc}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="text-xs opacity-70">
          {composeFormatMode === "post"
            ? "通常投稿: 分析・キャラ付け・リライトの標準フロー"
            : composeFormatMode === "short"
            ? "短尺投稿: 冒頭のフックを優先して短く圧縮"
            : "ストーリー: 1〜3行で感情共有しやすい形に変換"}
        </div>
        {text.trim() && composeFormatMode !== "post" && shortStoryOptimizedSeed && shortStoryOptimizedSeed !== text ? (
          <div className="rounded-lg border bg-slate-50 p-2 space-y-2">
            <div className="text-xs font-medium">フォーマット最適化プレビュー</div>
            <div className="text-sm whitespace-pre-wrap">{shortStoryOptimizedSeed}</div>
            <button
              type="button"
              onClick={() => onChangeText(shortStoryOptimizedSeed)}
              className="px-2 py-1 rounded border text-sm bg-white"
            >
              この形に置き換える
            </button>
          </div>
        ) : null}
      </div>

      {lastPostedPostId && (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">投稿結果カード</div>
              <div className="text-xs opacity-70">
                投稿直後の評価を1画面で確認できます（反応が増えたら更新）。
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="px-2 py-1 rounded border text-sm"
                onClick={() => void loadPostPerformance(lastPostedPostId)}
                disabled={lastPostedPerformanceLoading}
              >
                {lastPostedPerformanceLoading ? "更新中…" : "結果を更新"}
              </button>
              <a
                href={`/p/${encodeURIComponent(lastPostedPostId)}`}
                className="px-2 py-1 rounded border text-sm bg-slate-50"
              >
                投稿詳細へ
              </a>
              <a href="/" className="px-2 py-1 rounded border text-sm">
                TLへ戻る
              </a>
            </div>
          </div>

          {lastPostedPerformanceError && (
            <div className="text-sm text-red-600">{lastPostedPerformanceError}</div>
          )}

          {lastPostedPerformance ? (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs opacity-70">総合評価</div>
                  <div className="text-2xl font-bold">
                    {lastPostedPerformance.scorecard.score.grade}
                    <span className="text-sm font-normal opacity-70 ml-2">
                      {Math.round(
                        Math.max(
                          0,
                          Math.min(1, Number(lastPostedPerformance.scorecard.score.composite ?? 0))
                        ) * 100
                      )}
                      点
                    </span>
                  </div>
                  <div className="text-xs opacity-70 mt-1">
                    嘘っぽさ {lastPostedPerformance.post.lieScorePct}% /{" "}
                    {lastPostedPerformance.post.persona?.selected
                      ? `投稿キャラ @${lastPostedPerformance.post.persona.selected}`
                      : "キャラ未確定"}
                  </div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs opacity-70">反応カウント</div>
                  <div className="text-sm mt-1 space-y-1">
                    <div>開封 {lastPostedPerformance.scorecard.counts.uniqueOpens}</div>
                    <div>
                      保存 {lastPostedPerformance.scorecard.counts.saves} / 返信{" "}
                      {lastPostedPerformance.scorecard.counts.replies}
                    </div>
                    <div>
                      いいね {lastPostedPerformance.scorecard.counts.likes} / 拡散{" "}
                      {lastPostedPerformance.scorecard.counts.boosts}
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs opacity-70">率（対開封）</div>
                  <div className="text-sm mt-1 space-y-1">
                    <div>
                      保存率{" "}
                      {Math.round((Number(lastPostedPerformance.scorecard.rates.savePerOpen ?? 0) || 0) * 100)}%
                    </div>
                    <div>
                      返信率{" "}
                      {Math.round((Number(lastPostedPerformance.scorecard.rates.replyPerOpen ?? 0) || 0) * 100)}%
                    </div>
                    <div>
                      開封率（キャラTL）{" "}
                      {lastPostedPerformance.scorecard.rates.personaFeedOpenRate == null
                        ? "-"
                        : `${Math.round(lastPostedPerformance.scorecard.rates.personaFeedOpenRate * 100)}%`}
                    </div>
                  </div>
                </div>
              </div>

              {(lastPostedPerformance.scorecard.highlights?.length ?? 0) > 0 && (
                <div className="rounded-lg border bg-emerald-50 border-emerald-200 p-3 space-y-1">
                  <div className="text-sm font-medium">何が刺さったか</div>
                  <ul className="list-disc pl-5 text-sm">
                    {lastPostedPerformance.scorecard.highlights.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded-lg border bg-blue-50 border-blue-200 p-3 space-y-1">
                <div className="text-sm font-medium">前回比較（直近 {lastPostedPerformance.comparison.samples}投稿）</div>
                <div className="grid gap-2 md:grid-cols-3 text-sm">
                  <div>
                    保存率 {lastPostedPerformance.comparison.delta.savePerOpen == null ? "-" : `${lastPostedPerformance.comparison.delta.savePerOpen > 0 ? "+" : ""}${Math.round(lastPostedPerformance.comparison.delta.savePerOpen * 100)}pt`}
                  </div>
                  <div>
                    返信率 {lastPostedPerformance.comparison.delta.replyPerOpen == null ? "-" : `${lastPostedPerformance.comparison.delta.replyPerOpen > 0 ? "+" : ""}${Math.round(lastPostedPerformance.comparison.delta.replyPerOpen * 100)}pt`}
                  </div>
                  <div>
                    開封率 {lastPostedPerformance.comparison.delta.personaFeedOpenRate == null ? "-" : `${lastPostedPerformance.comparison.delta.personaFeedOpenRate > 0 ? "+" : ""}${Math.round(lastPostedPerformance.comparison.delta.personaFeedOpenRate * 100)}pt`}
                  </div>
                </div>
              </div>

              {(lastPostedPerformance.trend?.points?.length ?? 0) > 1 && (
                <div className="rounded-lg border bg-white p-3 space-y-2">
                  <div className="text-sm font-medium">保存数 / 開封 / 返信 の推移</div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {lastPostedPerformance.trend.points.slice(-10).map((pt) => {
                      const opens = Math.max(1, Number(pt.counts?.opens ?? 0));
                      const saveRate = Math.max(0, Math.min(1, Number(pt.rates?.savePerOpen ?? 0)));
                      const replyRate = Math.max(0, Math.min(1, Number(pt.rates?.replyPerOpen ?? 0)));
                      return (
                        <div key={pt.at} className="rounded border bg-slate-50 p-2 space-y-1">
                          <div className="text-[10px] opacity-70">{pt.label}</div>
                          <div className="text-[11px]">開封 {pt.counts.opens}</div>
                          <div className="h-1.5 rounded bg-slate-200 overflow-hidden">
                            <div className="h-full bg-amber-500" style={{ width: `${Math.round(saveRate * 100)}%` }} />
                          </div>
                          <div className="h-1.5 rounded bg-slate-200 overflow-hidden">
                            <div className="h-full bg-blue-500" style={{ width: `${Math.round(replyRate * 100)}%` }} />
                          </div>
                          <div className="text-[10px] opacity-70">
                            保存率 {Math.round(saveRate * 100)}% / 返信率 {Math.round(replyRate * 100)}%
                          </div>
                          <div className="text-[10px] opacity-60">保存 {pt.counts.saves} / 返信 {pt.counts.replies}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(lastPostedPerformance.scorecard.suggestions?.length ?? 0) > 0 && (
                <div className="rounded-lg border bg-amber-50 border-amber-200 p-3 space-y-1">
                  <div className="text-sm font-medium">次に何を直すと伸びるか</div>
                  <ul className="list-disc pl-5 text-sm">
                    {lastPostedPerformance.scorecard.suggestions.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : lastPostedPerformanceLoading ? (
            <div className="text-sm opacity-70">投稿結果を集計中…</div>
          ) : (
            <div className="text-sm opacity-70">投稿結果を読み込めませんでした。更新ボタンで再試行してください。</div>
          )}
        </div>
      )}

      <textarea
        className="w-full h-52 p-3 rounded border"
        placeholder="いま何してる？（最大280文字）"
        value={text}
        onChange={(e) => onChangeText(e.target.value)}
      />
      {missionRewriteAttribution && (
        <div className="text-xs rounded border border-amber-200 bg-amber-50 px-3 py-2 flex flex-wrap items-center gap-2">
          <span className="font-medium">ミッションリライト適用中</span>
          <span>@{missionRewriteAttribution.buddyPersonaKey}</span>
          <span>・</span>
          <span>{missionRewriteAttribution.styleLabel}</span>
          <button
            type="button"
            className="underline"
            onClick={() => setMissionRewriteAttribution(null)}
          >
            解除
          </button>
        </div>
      )}
      <div className="flex items-center justify-between opacity-70 text-sm">
        <div>残り {LIMIT - text.length} 文字</div>
        <div>嘘っぽさ {(score * 100).toFixed(1)}%</div>
      </div>
      {text.trim().length > 0 && (
        <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="font-medium">嘘スコア診断（投稿前チェック）</div>
            <div className="opacity-70">
              {lieAnalysis.level === "high" ? "高め" : lieAnalysis.level === "mid" ? "中" : "低め"}
            </div>
          </div>
          {(lieAnalysis.cautionChips.length > 0 || lieAnalysis.reliefChips.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {lieAnalysis.cautionChips.map((chip) => (
                <span key={`compose-lie-caution-${chip}`} className="px-2 py-0.5 rounded-full text-xs border bg-rose-50 border-rose-200">
                  {chip}
                </span>
              ))}
              {lieAnalysis.reliefChips.map((chip) => (
                <span key={`compose-lie-relief-${chip}`} className="px-2 py-0.5 rounded-full text-xs border bg-emerald-50 border-emerald-200">
                  {chip}
                </span>
              ))}
            </div>
          )}
          <ul className="list-disc pl-5 text-sm opacity-80">
            {lieAnalysis.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <div className="text-xs opacity-70">数値・期間・条件を足すと誤解されにくくなります。</div>
        </div>
      )}
      <div className="space-y-2">
        <div className="text-sm font-medium">キャラ付け（投稿文から推定）</div>
        {personaLoading ? (
          <div className="text-sm opacity-70">候補を解析中…</div>
        ) : personaCandidates.length === 0 ? (
          <div className="text-sm opacity-70">6文字以上入力すると候補を表示します。</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {personaCandidates.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setSelectedPersonaKey(c.key)}
                className={`px-2 py-1 rounded-full border text-sm ${
                  selectedPersonaKey === c.key
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white"
                }`}
              >
                {c.title} @{c.key}
              </button>
            ))}
          </div>
        )}
        {personaError && <div className="text-sm text-red-600">{personaError}</div>}
      </div>
      <div className="space-y-2 rounded-lg border p-3 bg-slate-50">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">キャラ文脈バズ診断</div>
          <div className="text-sm">
            スコア {buzz.score} / {buzz.level}
          </div>
        </div>
        <div className="text-sm opacity-80">
          補正後予測 {calibratedBuzzScore}%{" "}
          {buzzCalibration
            ? `(係数 x${buzzCalibration.multiplier.toFixed(2)} / 信頼 ${(buzzCalibration.confidence * 100).toFixed(0)}% / n=${buzzCalibration.samples})`
            : "(補正データなし)"}
        </div>
        <div className="flex flex-wrap gap-2">
          {buzz.metrics.map((m) => (
            <span key={m.key} className="px-2 py-0.5 rounded-full text-xs border bg-white">
              {m.label} {m.score}%
            </span>
          ))}
        </div>
        <ul className="list-disc pl-5 text-sm opacity-80">
          {buzz.tips.slice(0, 3).map((tip, i) => (
            <li key={i}>{tip}</li>
          ))}
        </ul>
        {buzz.hashtags.length > 0 ? (
          <div className="text-sm opacity-80">{buzz.hashtags.join(" ")}</div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm opacity-80">返信促進: {buzz.replyPrompt}</div>
          <button type="button" onClick={appendBuzzPrompt} className="px-2 py-1 rounded border text-sm bg-white">
            返信導線を末尾に追加
          </button>
        </div>
      </div>
      <div className="space-y-2 rounded-lg border p-3 bg-white">
        <div className="text-sm font-medium">自動リライト（ワンタップ）</div>
        {rewriteVariants.length === 0 ? (
          <div className="text-sm opacity-70">本文を入力すると 3 パターンを生成します。</div>
        ) : (
          <div className="space-y-2">
            {rewriteVariants.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => applyRewrite(r.text)}
                className="w-full text-left px-3 py-2 rounded border bg-slate-50 hover:bg-slate-100"
              >
                <div className="text-xs font-semibold opacity-80">
                  {r.label} - {r.intent}
                </div>
                <div className="text-sm">{r.text}</div>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-3 rounded-lg border p-3 bg-white">
        <div className="text-sm font-medium">相性バディ提案</div>
        {!selectedPersonaKey ? (
          <div className="text-sm opacity-70">主キャラを選ぶと、相性の良い副キャラを提案します。</div>
        ) : compatLoading ? (
          <div className="text-sm opacity-70">相性データを取得中…</div>
        ) : compatSuggestions.length === 0 ? (
          <div className="text-sm opacity-70">この主キャラの相性候補はまだありません。</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {compatSuggestions.slice(0, 8).map((item) => (
              <button
                key={`compat-${item.targetKey}`}
                type="button"
                onClick={() => applyCompatBuddy(item.targetKey)}
                className={`px-2 py-1 rounded-full border text-sm ${
                  blendSecondaryKey === item.targetKey
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-white"
                }`}
              >
                {item.title} {toCompatPercent(item.score)}%
                {item.relationLabel ? ` / ${item.relationLabel}` : ""}
              </button>
            ))}
          </div>
        )}
        {compatError && <div className="text-sm text-red-600">{compatError}</div>}
        <div className="text-xs opacity-70">タップすると副キャラに設定され、主65% / 副35%に自動調整します。</div>
      </div>
      <div className="space-y-3 rounded-lg border p-3 bg-white">
        <div className="text-sm font-medium">デュアルキャラ・ブレンド草案</div>
        {!selectedPersonaKey ? (
          <div className="text-sm opacity-70">まず主キャラを1つ選ぶと、混合草案を生成できます。</div>
        ) : blendSecondaryOptions.length === 0 ? (
          <div className="text-sm opacity-70">副キャラ候補がありません。</div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 gap-2">
              <label className="text-sm space-y-1">
                <div className="opacity-70">副キャラ</div>
                <select
                  className="w-full border rounded px-3 py-2 bg-white"
                  value={blendSecondaryKey}
                  onChange={(e) => setBlendSecondaryKey(e.target.value)}
                >
                  {blendSecondaryOptions.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.title} @{p.key}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm space-y-1">
                <div className="opacity-70">
                  主キャラ配分 {blendPrimarySharePct}% / 副キャラ {100 - blendPrimarySharePct}%
                </div>
                <input
                  type="range"
                  min={20}
                  max={80}
                  step={5}
                  value={blendPrimarySharePct}
                  onChange={(e) => setBlendPrimarySharePct(Number(e.target.value))}
                />
              </label>
            </div>

            {blendRewrites.length === 0 ? (
              <div className="text-sm opacity-70">本文を入力すると混合草案を生成します。</div>
            ) : (
              <div className="space-y-2">
                {blendRewrites.map((r) => (
                  <button
                    key={`blend-${r.key}`}
                    type="button"
                    onClick={() => applyRewrite(r.text)}
                    className="w-full text-left px-3 py-2 rounded border bg-indigo-50 hover:bg-indigo-100"
                  >
                    <div className="text-xs font-semibold opacity-80">
                      {r.label} - 主 {Math.round(r.primaryShare * 100)}% / 副{" "}
                      {Math.round(r.secondaryShare * 100)}%
                    </div>
                    <div className="text-sm">{r.text}</div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* 画像アップロード */}
      <div className="space-y-2">
        <input type="file" accept="image/*" onChange={onPick} />
        {preview && (
          <div className="flex items-start gap-3">
            <img src={preview} className="w-40 h-40 object-cover rounded border" alt="" />
            {analysis ? (
              <div className="text-sm space-y-1">
                <div>
                  編集推定:
                  <span
                    className={`ml-2 px-2 py-0.5 rounded ${
                      analysis.flags?.heavyEditing ? "bg-red-100" : "bg-green-100"
                    }`}
                  >
                    {analysis.flags?.heavyEditing ? "強い" : "弱い/なし"}
                  </span>
                  <span
                    className={`ml-2 px-2 py-0.5 rounded ${
                      analysis.flags?.possibleAIGenerated ? "bg-orange-100" : "bg-gray-100"
                    }`}
                  >
                    AI生成の可能性 {analysis.flags?.possibleAIGenerated ? "高い" : "低い"}
                  </span>
                </div>
                <div className="opacity-70">
                  ELA: {analysis.elaScore != null ? (analysis.elaScore * 100).toFixed(1) : "-"}% ・ EXIF:{" "}
                  {analysis.flags?.noExif ? "なし" : "あり"}
                </div>
                {analysis.reasons?.length ? (
                  <ul className="list-disc pl-5 opacity-70">
                    {analysis.reasons.slice(0, 3).map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : file ? (
              <div className="opacity-70 text-sm">解析中…</div>
            ) : null}
          </div>
        )}
      </div>

      <button
        onClick={submit}
        disabled={posting || (!text && !file)}
        className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
      >
        投稿する
      </button>
    </div>
  );
}
