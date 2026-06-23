// apps/web/src/app/compose/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeLieScore,
  analyzePersonaBuzz,
  buildPersonaBlendRewrites,
  buildPersonaRewrites,
  computeLieScore,
} from "@sns/core";
import { supabaseClient as supabase } from "@/lib/supabase/client";
import SignedInDemoGuide from "@/components/SignedInDemoGuide";

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
type AutomationStepStatus = "pending" | "done" | "retry";

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
const COMPOSE_SAVE_ERROR =
  "投稿を保存できませんでした。少し時間をおいてから、もう一度お試しください。";
const MEDIA_UPLOAD_ERROR =
  "画像をアップロードできませんでした。画像を外して投稿するか、時間をおいて再度お試しください。";

async function runPostSubmitAutomation(postId: string) {
  const results = await Promise.allSettled([
    fetch(`/api/posts/${encodeURIComponent(postId)}/ai-score`, { method: "POST" }),
    fetch("/api/personas/recompute", { method: "POST" }),
  ]);

  return {
    aiScoreOk: results[0].status === "fulfilled" && results[0].value.ok,
    personaRecomputeOk: results[1].status === "fulfilled" && results[1].value.ok,
  };
}

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
  const [formError, setFormError] = useState<string | null>(null);
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
  const [lastPostedNotice, setLastPostedNotice] = useState<string | null>(null);
  const [lastPostedAutomation, setLastPostedAutomation] = useState<{
    ai: AutomationStepStatus;
    persona: AutomationStepStatus;
  } | null>(null);
  const [lastPostedPerformance, setLastPostedPerformance] = useState<PostPerformanceResponse | null>(null);
  const [lastPostedPerformanceLoading, setLastPostedPerformanceLoading] = useState(false);
  const [lastPostedPerformanceError, setLastPostedPerformanceError] = useState<string | null>(null);
  const latestPostedPostIdRef = useRef<string | null>(null);
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
          throw new Error("成長傾向の取得に失敗しました");
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
          setPersonaError("キャラ成長への影響予測を取得できませんでした。本文を少し変えてもう一度お試しください。");
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
          throw new Error("相性データ取得に失敗しました");
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
        setCompatError("相性データを読み込めませんでした。主キャラを選び直してお試しください。");
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
        throw new Error("投稿結果の取得に失敗しました");
      }
      setLastPostedPerformance(json as PostPerformanceResponse);
      setLastPostedPostId(id);
      void fetch(`/api/me/post-performance/${encodeURIComponent(id)}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "compose_scorecard" }),
      }).catch(() => null);
    } catch (e: any) {
      setLastPostedPerformanceError("投稿結果を読み込めませんでした。更新ボタンで再試行してください。");
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
    if (!text.trim() && !file) {
      setFormError("本文または画像を追加してから投稿してください。");
      return;
    }
    setPosting(true);
    setFormError(null);
    setLastPostedAutomation(null);

    try {
      // 認証チェック
      const { data: { user } } = await sb.auth.getUser();
      if (!user) {
        setFormError("投稿するにはログインが必要です。ログイン後、この画面に戻って投稿できます。");
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
          setFormError(MEDIA_UPLOAD_ERROR);
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
        setFormError(COMPOSE_SAVE_ERROR);
      } else {
        const postId = String(data?.id ?? "").trim();
        // 投稿結果カードを表示するため、この画面に残す
        latestPostedPostIdRef.current = postId || null;
        setLastPostedPostId(postId || null);
        setLastPostedNotice(
          postId
            ? "投稿できました。AI判定とキャラ成長を更新しています…"
            : "投稿しました。分析はあとで再試行できます。"
        );
        setLastPostedAutomation(
          postId ? { ai: "pending", persona: "pending" } : { ai: "retry", persona: "retry" }
        );
        setLastPostedPerformance(null);
        setLastPostedPerformanceError(null);
        if (postId) {
          void loadPostPerformance(postId);
          void runPostSubmitAutomation(postId).then(({ aiScoreOk, personaRecomputeOk }) => {
            if (latestPostedPostIdRef.current !== postId) return;
            setLastPostedAutomation({
              ai: aiScoreOk ? "done" : "retry",
              persona: personaRecomputeOk ? "done" : "retry",
            });
            if (aiScoreOk && personaRecomputeOk) {
              setLastPostedNotice("投稿できました。AI判定が完了し、キャラ分析も更新されました。");
            } else if (personaRecomputeOk) {
              setLastPostedNotice("投稿できました。キャラ分析を更新しました。AI判定はあとで再試行できます。");
            } else if (aiScoreOk) {
              setLastPostedNotice("投稿できました。AI判定が完了しました。キャラ分析はあとで再試行できます。");
            } else {
              setLastPostedNotice("投稿できました。分析はあとで再試行できます。");
            }
          });
        }

        setText("");
        setFile(null);
        setPreview(null);
        setAnalysis(null);
        setPersonaCandidates([]);
        setSelectedPersonaKey(null);
        setComposeFormatMode("post");
        setMissionRewriteAttribution(null);
      }
    } catch {
      setFormError(COMPOSE_SAVE_ERROR);
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
      <header className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
          Persona Compose
        </div>
        <h1 className="mt-1 text-2xl font-bold">投稿からキャラを育てる</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          本文を書くと、AIが投稿のクセを読み取り、あなたのキャラ成長にどう影響しそうかを予測します。
          投稿後は、そのシグナルと反応が履歴に積み重なり、あなた自身のキャラとキャラTLが少しずつ育ちます。
        </p>
      </header>

      <section className="rounded-xl border border-blue-100 bg-blue-50 p-3">
        <div className="text-sm font-semibold text-blue-950">投稿すると起きること</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {[
            ["AI判定", "事実っぽさ・盛り・自慢・ネタの4つを見える化"],
            ["キャラ成長", "投稿の雰囲気が成長シグナルとして履歴に追加"],
            ["キャラTLへ反映", "似たキャラ傾向のユーザーや相性の良い話題と出会いやすくなる"],
          ].map(([title, body], index) => (
            <div key={title} className="rounded-lg border border-blue-100 bg-white p-3">
              <div className="text-xs font-semibold text-blue-700">STEP {index + 1}</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{title}</div>
              <p className="mt-1 text-xs leading-5 text-slate-600">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {!lastPostedPostId && text.trim().length === 0 ? <SignedInDemoGuide compact /> : null}

      {formError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {formError}
        </div>
      )}

      {lastPostedNotice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <div className="font-medium">{lastPostedNotice}</div>
          {lastPostedAutomation && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {[
                ["AI判定", lastPostedAutomation.ai],
                ["キャラ分析", lastPostedAutomation.persona],
              ].map(([label, status]) => (
                <span key={label} className="rounded-full border border-emerald-200 bg-white px-2 py-1">
                  {status === "pending" ? "⏳" : status === "done" ? "✓" : "↻"} {label}: {status === "pending" ? "更新中" : status === "done" ? "完了" : "あとで再試行"}
                </span>
              ))}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {lastPostedPostId ? (
              <a
                href={`/p/${encodeURIComponent(lastPostedPostId)}`}
                className="rounded-full bg-emerald-700 px-3 py-1.5 text-white"
              >
                投稿を開く
              </a>
            ) : null}
            <a href="/dashboard/persona" className="rounded-full border border-emerald-200 bg-white px-3 py-1.5">
              キャラ分析を見る
            </a>
            <a href="/persona-feed" className="rounded-full border border-emerald-200 bg-white px-3 py-1.5">
              キャラTLへ
            </a>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-white p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold">投稿フォーマット</div>
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
            ? "通常投稿: キャラ成長への影響予測とリライトを見ながら、いつもの投稿として出します。"
            : composeFormatMode === "short"
            ? "短尺投稿: 冒頭のフックを優先して短く整えます。"
            : "ストーリー: 1〜3行で感情共有しやすい形に整えます。"}
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
                    投稿のクセ {lastPostedPerformance.post.lieScorePct}% /{" "}
                    {lastPostedPerformance.post.persona?.selected
                      ? `成長シグナル @${lastPostedPerformance.post.persona.selected}`
                      : "成長シグナル未分析"}
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

      <div className="space-y-2">
        <div>
          <label htmlFor="compose-text" className="text-sm font-semibold text-slate-900">
            投稿の本文
          </label>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            本文を書くと、AI判定とキャラ成長への影響予測が表示されます。外部の事実確認ではなく、言葉のクセと雰囲気を楽しむ分析です。
          </p>
        </div>
        {!text.trim() && !lastPostedPostId && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-600">
            <div className="font-medium text-slate-900">何を書けばいい？</div>
            <p className="mt-1 text-xs leading-5">
              今日進んだこと、ちょっと盛って話したいこと、誰かにツッコんでほしい一言。短い近況から始められます。
            </p>
          </div>
        )}
        <textarea
          id="compose-text"
          className="h-52 w-full rounded-lg border border-slate-200 bg-white p-3 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          placeholder="例: 今日ついに新機能が動いた。たぶん世界が少し良くなった。"
          value={text}
          onChange={(e) => onChangeText(e.target.value)}
        />
      </div>
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
        <div>投稿前のAIクセ {(score * 100).toFixed(1)}%</div>
      </div>
      {text.trim().length > 0 && (
        <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="font-medium">投稿のクセ診断（投稿前チェック）</div>
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
        <div className="text-sm font-medium">この投稿が伸ばしそうな傾向</div>
        <p className="text-xs leading-5 text-slate-600">
          投稿自体にキャラを付けるものではなく、あなたのキャラ成長に加わるシグナルの予測です。
        </p>
        {personaLoading ? (
          <div className="text-sm opacity-70">成長傾向を解析中…</div>
        ) : personaCandidates.length === 0 ? (
          <div className="text-sm opacity-70">6文字以上入力すると、キャラ成長への影響予測を表示します。</div>
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
          あなた向け予測 {calibratedBuzzScore}%{" "}
          {buzzCalibration
            ? `(これまでの反応を少し反映)`
            : "(反応データが増えると精度が上がります)"}
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
        <div className="text-sm font-medium">相性の良い傾向を提案</div>
        {!selectedPersonaKey ? (
          <div className="text-sm opacity-70">中心にする成長傾向を選ぶと、相性の良い傾向を提案します。</div>
        ) : compatLoading ? (
          <div className="text-sm opacity-70">相性データを取得中…</div>
        ) : compatSuggestions.length === 0 ? (
          <div className="text-sm opacity-70">この成長傾向と相性の良い候補はまだありません。</div>
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
        <div className="text-xs opacity-70">タップすると混ぜる傾向に設定され、中心65% / ミックス35%に自動調整します。</div>
      </div>
      <div className="space-y-3 rounded-lg border p-3 bg-white">
        <div className="text-sm font-medium">2つの傾向を混ぜた草案</div>
        {!selectedPersonaKey ? (
          <div className="text-sm opacity-70">まず中心にする成長傾向を1つ選ぶと、混合草案を生成できます。</div>
        ) : blendSecondaryOptions.length === 0 ? (
          <div className="text-sm opacity-70">混ぜられる傾向がまだありません。</div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 gap-2">
              <label className="text-sm space-y-1">
                <div className="opacity-70">混ぜる傾向</div>
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
                  中心の傾向 {blendPrimarySharePct}% / 混ぜる傾向 {100 - blendPrimarySharePct}%
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
                  画像メタ情報: {analysis.flags?.noExif ? "少なめ" : "確認できました"}。
                  編集推定は参考値として扱ってください。
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
        type="button"
        onClick={submit}
        disabled={posting || (!text && !file)}
        className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {posting ? "投稿中…" : "投稿する"}
      </button>
    </div>
  );
}
