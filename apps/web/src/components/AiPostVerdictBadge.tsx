// apps/web/src/components/AiPostVerdictBadge.tsx
"use client";

import { useEffect, useState } from "react";

type AiDimensions = {
  truth?: number;
  exaggeration?: number;
  brag?: number;
  joke?: number;
};

type AiScore = {
  post_id: string;
  truth?: number;
  exaggeration?: number;
  brag?: number;
  joke?: number;
  verdict: string | null;
  reason: string | null;
  tags: string[] | null;
};

type Props = {
  postId: string;
  /**
   * LLM から算出した「嘘っぽさ％」を親(PostCard)に渡したい場合のコールバック
   * 例: 嘘％ = 100 - truth
   */
  onLiePercentChange?: (pct: number | null) => void;
};

export function AiPostVerdictBadge({ postId, onLiePercentChange }: Props) {
  const [score, setScore] = useState<AiScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 初回に「既にスコアがあるか」を確認
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/ai-score`);
        if (res.status === 204) return; // まだなし
        if (!res.ok) return;

        const data = (await res.json()) as AiScore;
        if (cancelled) return;
        setScore(data);
      } catch {
        // 無視（初回読み込み失敗は UI 上は特に出さない）
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [postId]);

  // LLM からのスコアを元に「嘘％」を計算し、親に通知
  useEffect(() => {
    if (!onLiePercentChange) return;

    if (!score || typeof score.truth !== "number") {
      onLiePercentChange(null);
      return;
    }

    // シンプルに「truth が高いほど嘘％が低い」とみなす
    const rawTruth = Math.max(0, Math.min(100, score.truth));
    const liePercent = Math.max(0, Math.min(100, Math.round(100 - rawTruth)));
    onLiePercentChange(liePercent);
  }, [score, onLiePercentChange]);

  async function handleCalc() {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/posts/${postId}/ai-score`, {
        method: "POST",
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as AiScore;
      setScore(data);
      setExpanded(true);
    } catch (e: any) {
      console.error("[AiPostVerdictBadge] error", e);
      setError("AI 判定の取得に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  const hasScore = !!score;

  const dims: AiDimensions | null = score
    ? {
        truth: score.truth ?? undefined,
        exaggeration: score.exaggeration ?? undefined,
        brag: score.brag ?? undefined,
        joke: score.joke ?? undefined,
      }
    : null;

  function pct(v?: number) {
    if (typeof v !== "number" || Number.isNaN(v)) return 0;
    return Math.max(0, Math.min(100, Math.round(v)));
  }

  return (
    <div className="mt-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 border border-slate-200">
          <span className="text-[10px] font-semibold text-slate-500">
            AI 判定
          </span>
          {hasScore ? (
            <span className="font-semibold">
              {score?.verdict ?? "分析済み"}
            </span>
          ) : (
            <span className="text-slate-400">まだ分析されていません</span>
          )}
        </span>

        <button
          type="button"
          onClick={handleCalc}
          disabled={loading}
          className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] hover:bg-slate-50 disabled:opacity-60"
        >
          {loading
            ? "分析中…"
            : hasScore
            ? "再分析する"
            : "この投稿を分析"}
        </button>

        {hasScore && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] text-slate-500 hover:text-slate-700"
          >
            {expanded ? "詳細を閉じる" : "詳細を見る"}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-1 text-[11px] text-red-600">{error}</div>
      )}

      {hasScore && expanded && (
        <div className="mt-2 rounded-xl border bg-slate-50 px-3 py-2 space-y-2">
          {score?.reason && (
            <div className="text-[11px] text-slate-700 whitespace-pre-wrap">
              {score.reason}
            </div>
          )}

          <div className="space-y-1">
            <MetricRow label="事実っぽさ" value={pct(dims?.truth)} />
            <MetricRow label="盛ってる度" value={pct(dims?.exaggeration)} />
            <MetricRow label="自慢・マウント感" value={pct(dims?.brag)} />
            <MetricRow label="ネタ・ジョーク度" value={pct(dims?.joke)} />
          </div>

          {score?.tags && score.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {score.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-700 border border-slate-200"
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

function MetricRow({ label, value }: { label: string; value?: number }) {
  const v = typeof value === "number" ? value : 0;
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>{label}</span>
        <span>{v}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
        <div
          className="h-full rounded-full bg-slate-600"
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}
