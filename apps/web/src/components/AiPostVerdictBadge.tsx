// apps/web/src/components/AiPostVerdictBadge.tsx
"use client";

import { useEffect, useRef, useState } from "react";

export type AiScore = {
  post_id: string;
  truth: number | null;
  exaggeration: number | null;
  brag: number | null;
  joke: number | null;
  verdict: string;
  reason: string;
  tags: string[];
};

type Props = {
  postId: string;
  /** Post の本文（サーバ側で取っているなら省略可） */
  text?: string;
  /** 嘘っぽさ％が変わったら親（PostCard）に通知する */
  onLiePercentChange?: (pct: number | null) => void;
};

const REANALYZE_COOLDOWN_MS = 4_000;
const FALLBACK_TAG_KEYS = new Set(["dummy", "fallback", "beta", "parse_error"]);

// --------------------------------------------------
// 共通ユーティリティ
// --------------------------------------------------

function clamp01to100(v: unknown, def: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const x = Math.round(n);
  if (x < 0) return 0;
  if (x > 100) return 100;
  return x;
}

function toAiScore(row: any): AiScore {
  if (!row) {
    return {
      post_id: "",
      truth: null,
      exaggeration: null,
      brag: null,
      joke: null,
      verdict: "",
      reason: "",
      tags: [],
    };
  }

  return {
    post_id: row.post_id ?? row.id ?? "",
    truth: row.truth != null ? Number(row.truth) : null,
    exaggeration:
      row.exaggeration != null ? Number(row.exaggeration) : null,
    brag: row.brag != null ? Number(row.brag) : null,
    joke: row.joke != null ? Number(row.joke) : null,
    verdict: row.verdict ?? "",
    reason: row.reason ?? "",
    tags: Array.isArray(row.tags) ? row.tags : [],
  };
}

function isFallbackAiScore(score: AiScore | null): boolean {
  if (!score) return false;
  const hasFallbackTag = (score.tags ?? []).some((tag) =>
    FALLBACK_TAG_KEYS.has(String(tag).trim().toLowerCase())
  );
  const verdict = String(score.verdict ?? "").trim();
  return (
    hasFallbackTag ||
    verdict.includes("ダミー判定") ||
    verdict.includes("簡易判定")
  );
}

function computeLiePercent(score: AiScore | null): number | null {
  if (!score) return null;
  const truth = clamp01to100(score.truth, 50);
  const exaggeration = clamp01to100(score.exaggeration, 50);
  const joke = clamp01to100(score.joke, 0);

  // 嘘っぽさ = 「事実っぽさの逆」＋「盛り/ネタ度」を少し加味
  const base = 100 - truth;
  const extra = Math.max(exaggeration - 50, joke - 50, 0) * 0.5;
  const v = Math.round(base + extra);
  if (v < 0) return 0;
  if (v > 100) return 100;
  return v;
}

// 「バズり一言」用のトーン判定
function detectTone(score: AiScore | null): {
  label: string;
  description: string;
  emoji: string;
  colorClass: string;
} {
  if (!score) {
    return {
      label: "未分析",
      description: "まだ AI 判定は実行されていません。",
      emoji: "🕒",
      colorClass:
        "bg-slate-50 text-slate-700 border-slate-300",
    };
  }

  const truth = clamp01to100(score.truth, 50);
  const exaggeration = clamp01to100(score.exaggeration, 50);
  const brag = clamp01to100(score.brag, 0);
  const joke = clamp01to100(score.joke, 0);

  // ネタ強め
  if (joke >= 70 && truth <= 60) {
    return {
      label: "ネタ枠",
      description: "冗談・ネタ寄りの投稿として判定されています。",
      emoji: "😂",
      colorClass:
        "bg-purple-50 text-purple-700 border-purple-300",
    };
  }

  // 盛っている
  if (exaggeration >= 65 && truth <= 70) {
    return {
      label: "盛ってる",
      description:
        "やや盛った表現が多く、話を面白くしている印象です。",
      emoji: "📈",
      colorClass:
        "bg-orange-50 text-orange-700 border-orange-300",
    };
  }

  // 自慢トーン
  if (brag >= 60) {
    return {
      label: "自慢トーン",
      description:
        "ポジティブな自己アピールやマウント要素がやや強めです。",
      emoji: "👑",
      colorClass:
        "bg-amber-50 text-amber-700 border-amber-300",
    };
  }

  // ガチ本音
  if (truth >= 75 && exaggeration <= 40 && joke <= 40) {
    return {
      label: "ガチ本音",
      description:
        "比較的事実ベースで、落ち着いたトーンの投稿です。",
      emoji: "✅",
      colorClass:
        "bg-emerald-50 text-emerald-700 border-emerald-300",
    };
  }

  // 中間パターン
  return {
    label: "ふつうトーン",
    description:
      "事実・誇張・ネタがバランスよく混じった投稿です。",
    emoji: "💬",
    colorClass:
      "bg-sky-50 text-sky-700 border-sky-300",
  };
}

const fallbackTone = {
  label: "簡易判定",
  description: "一時的な簡易AI判定です。再分析すると詳しい結果に更新される場合があります。",
  emoji: "🪄",
  colorClass: "bg-slate-50 text-slate-700 border-slate-300",
};

// Verdict が JSON ぽくなってしまった場合の保険
function prettifyVerdict(raw: string, score: AiScore | null): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    const tone = detectTone(score);
    return `${tone.emoji} ${tone.label}`;
  }

  // 先頭が { で JSON っぽかったら、自動でトーンラベルに差し替える
  if (trimmed.startsWith("{")) {
    const tone = detectTone(score);
    return `${tone.emoji} ${tone.label}`;
  }

  // ものすごく長い場合もラベルに丸める
  if (trimmed.length > 80) {
    const tone = detectTone(score);
    return `${tone.emoji} ${tone.label}`;
  }

  return trimmed;
}

/**
 * 投稿ごとの「AI 一言タグ」を決める。
 * - LLM が返した tags からプレースホルダ（"一言タグ1" 等）は除外
 * - なにも無ければスコアからそれっぽいタグを自動生成
 * - 最大 5 個まで
 */
function buildDisplayTags(score: AiScore | null): string[] {
  if (!score) return [];
  const fallback = isFallbackAiScore(score);

  const truth = clamp01to100(score.truth, 50);
  const exaggeration = clamp01to100(score.exaggeration, 50);
  const brag = clamp01to100(score.brag, 0);
  const joke = clamp01to100(score.joke, 0);

  const rawTags = (score.tags ?? [])
    .map((t) => `${t}`.trim())
    .filter(
      (t) =>
        t &&
        !FALLBACK_TAG_KEYS.has(t.toLowerCase()) &&
        !/^一言タグ\d*$/i.test(t) &&
        t !== "タグ1" &&
        t !== "タグ2"
    );

  const tags: string[] = [];

  // トーンラベルを必ず 1 個入れる
  const tone = fallback ? fallbackTone : detectTone(score);
  if (tone.label) {
    tags.push(tone.label);
  }

  // LLM のタグ（あれば）
  for (const t of rawTags) {
    if (!tags.includes(t)) tags.push(t);
  }

  // 何もなければスコアから自前でタグ生成
  if (tags.length === 0) {
    if (truth <= 20) tags.push("超うさんくさい");
    if (exaggeration >= 80) tags.push("盛りすぎ注意");
    if (brag >= 70) tags.push("マウント警報");
    if (joke >= 80) tags.push("大喜利モード");
    if (tags.length === 0) tags.push("ふつう投稿");
  } else {
    // 追加でスパイス的なタグを足す
    if (truth <= 20 && !tags.includes("超うさんくさい"))
      tags.push("超うさんくさい");
    if (exaggeration >= 80 && !tags.includes("盛りすぎ注意"))
      tags.push("盛りすぎ注意");
    if (joke >= 80 && !tags.includes("大喜利モード"))
      tags.push("大喜利モード");
  }

  // 重複除去して 5 個まで
  return Array.from(new Set(tags)).slice(0, 5);
}

// --------------------------------------------------
// メインコンポーネント
// --------------------------------------------------

export function AiPostVerdictBadge({
  postId,
  onLiePercentChange,
}: Props) {
  const [ai, setAi] = useState<AiScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const requestBlockedRef = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      requestBlockedRef.current = false;
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    };
  }, []);

  // 初回：既存スコアを取得（GET /api/posts/[id]/ai-score）
  useEffect(() => {
    let canceled = false;

    (async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/ai-score`, {
          method: "GET",
        });

        if (res.status === 204 || res.status === 404) {
          // スコア未作成
          if (!canceled) {
            setAi(null);
            onLiePercentChange?.(null);
          }
          return;
        }

        if (!res.ok) {
          console.warn(
            "[AiPostVerdictBadge] GET failed",
            res.status
          );
          return;
        }

        const json = await res.json();
        const score = toAiScore(json);

        if (!canceled) {
          setAi(score);
          const lie = computeLiePercent(score);
          onLiePercentChange?.(lie);
        }
      } catch (e) {
        console.warn("[AiPostVerdictBadge] GET error", e);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [postId, onLiePercentChange]);

  // 再分析（POST /api/posts/[id]/ai-score）
  async function handleCalc() {
    if (requestBlockedRef.current || cooldown) return;
    requestBlockedRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/posts/${postId}/ai-score`, {
        method: "POST",
      });

      if (!res.ok) {
        console.warn("[AiPostVerdictBadge] POST failed", {
          status: res.status,
        });
        throw new Error("request_failed");
      }

      const json = await res.json();
      const score = toAiScore(json);

      if (!mountedRef.current) return;
      setAi(score);
      const lie = computeLiePercent(score);
      onLiePercentChange?.(lie);
      setOpen(true);
    } catch {
      console.warn("[AiPostVerdictBadge] POST request could not complete");
      if (mountedRef.current) {
        setError("AI 判定を更新できませんでした。少し時間をおいて再度お試しください。");
      }
    } finally {
      if (!mountedRef.current) {
        requestBlockedRef.current = false;
        return;
      }
      setLoading(false);
      setCooldown(true);
      cooldownTimerRef.current = setTimeout(() => {
        requestBlockedRef.current = false;
        setCooldown(false);
        cooldownTimerRef.current = null;
      }, REANALYZE_COOLDOWN_MS);
    }
  }

  const fallback = isFallbackAiScore(ai);
  const tone = fallback ? fallbackTone : detectTone(ai);
  const verdictLabel = fallback
    ? "一時的な簡易結果"
    : prettifyVerdict(ai?.verdict ?? "", ai);
  const displayReason = fallback
    ? "現在は簡易AI判定を表示しています。少し時間をおいて再分析すると、詳しい結果に更新される場合があります。"
    : ai?.reason ?? "";
  const actionDisabled = loading || cooldown;

  const truth = clamp01to100(ai?.truth, 50);
  const exaggeration = clamp01to100(ai?.exaggeration, 50);
  const brag = clamp01to100(ai?.brag, 0);
  const joke = clamp01to100(ai?.joke, 0);

  const displayTags = buildDisplayTags(ai);
  const primaryTag = displayTags[0];

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <div className="flex flex-col gap-1 text-xs">
      {/* 上の一行：バズり一言バッジ ＋ ボタン */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${tone.colorClass}`}
          title={tone.description}
        >
          <span>{tone.emoji}</span>
          <span>{fallback ? "AI 簡易判定" : "AI 判定"}</span>
          {ai ? (
            <>
              <span className="px-1 py-0.5 rounded-full bg-white/70 text-[10px]">
                {verdictLabel}
              </span>
              {primaryTag && (
                <span className="px-1 py-0.5 rounded-full bg-white/60 text-[10px] text-slate-700 border border-white/60">
                  #{primaryTag}
                </span>
              )}
            </>
          ) : (
            <span className="px-1 py-0.5 rounded-full bg-white/70 text-[10px]">
              まだ分析されていません
            </span>
          )}
        </span>

        {ai ? (
          <>
            <button
              type="button"
              className="rounded border px-2 py-1 text-[11px] bg-gray-50 hover:bg-gray-100"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? "詳細を隠す" : "詳細を見る"}
            </button>
            <button
              type="button"
              className="rounded border px-2 py-1 text-[11px] bg-blue-50 hover:bg-blue-100 disabled:opacity-60"
              onClick={handleCalc}
              disabled={actionDisabled}
            >
              {loading
                ? "再分析中…"
                : cooldown
                  ? "少し待って再分析"
                  : "再分析する"}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="rounded border px-2 py-1 text-[11px] bg-blue-50 hover:bg-blue-100 disabled:opacity-60"
            onClick={handleCalc}
            disabled={actionDisabled}
          >
            {loading
              ? "分析中…"
              : cooldown
                ? "少し待って再分析"
                : "この投稿を分析"}
          </button>
        )}

        {error && (
          <span className="text-[11px] text-red-600">
            {error}
          </span>
        )}
      </div>

      {/* 詳細カード */}
      {open && ai && (
        <div className="mt-1 rounded-xl border bg-slate-50 px-3 py-2 space-y-2 text-[11px]">
          {/* Verdict & Reason */}
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[11px] font-semibold">
              <span className="text-slate-700">
                {verdictLabel}
              </span>
            </div>
            {displayReason && (
              <p className="text-[11px] leading-relaxed text-slate-700 whitespace-pre-wrap">
                {displayReason}
              </p>
            )}
          </div>

          {/* メーター群 */}
          <div className="space-y-1">
            <DimensionRow
              label="事実っぽさ"
              value={truth}
              accent="truth"
            />
            <DimensionRow
              label="盛ってる度"
              value={exaggeration}
              accent="exaggeration"
            />
            <DimensionRow
              label="自慢・マウント感"
              value={brag}
              accent="brag"
            />
            <DimensionRow
              label="ネタ・ジョーク度"
              value={joke}
              accent="joke"
            />
          </div>

          {/* タグ（AI 一言タグ） */}
          {displayTags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {displayTags.map((t, i) => (
                <span
                  key={`${t}-${i}`}
                  className="rounded-full bg-white px-2 py-0.5 text-[10px] border border-slate-200 text-slate-700"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type DimensionRowProps = {
  label: string;
  value: number;
  accent: "truth" | "exaggeration" | "brag" | "joke";
};

function DimensionRow({
  label,
  value,
  accent,
}: DimensionRowProps) {
  let barClass = "bg-slate-400";
  if (accent === "truth") {
    barClass = "bg-emerald-500";
  } else if (accent === "exaggeration") {
    barClass = "bg-orange-500";
  } else if (accent === "brag") {
    barClass = "bg-amber-500";
  } else if (accent === "joke") {
    barClass = "bg-purple-500";
  }

  const v = clamp01to100(value, 0);

  return (
    <div className="space-y-0.5">
      <div className="flex justify-between items-center">
        <span className="text-[11px] text-slate-700">
          {label}
        </span>
        <span className="text-[11px] tabular-nums text-slate-700">
          {v}%
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}

export default AiPostVerdictBadge;
