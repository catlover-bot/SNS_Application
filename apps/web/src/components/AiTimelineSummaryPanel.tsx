// apps/web/src/components/AiTimelineSummaryPanel.tsx
"use client";

import { useState } from "react";

type TimelineSummary = {
  overview: string;
  strengths: string[];
  risks: string[];
  suggestions: string[];
};

export default function AiTimelineSummaryPanel() {
  const [summary, setSummary] = useState<TimelineSummary | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleFetch() {
    if (status === "loading") return;
    setStatus("loading");
    setMessage(null);

    try {
      const res = await fetch("/api/me/ai-summary");
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        if (json?.error === "premium_required") {
          setMessage(
            json.message ??
              "この機能は Premium 限定です（課金機能は現在準備中）。"
          );
          setStatus("idle");
          return;
        }
        throw new Error(json?.message || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setSummary(json.summary ?? null);
      if (json.message) setMessage(json.message);
      setStatus("idle");
    } catch (e: any) {
      console.error("[AiTimelineSummaryPanel] error", e);
      setStatus("error");
      setMessage(
        e?.message ?? "タイムラインのAIサマリー取得に失敗しました。"
      );
    }
  }

  return (
    <div className="border rounded-xl p-4 bg-white shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-sm font-semibold">
            タイムライン一括AI分析
            <span className="ml-2 inline-flex items-center rounded-full bg-yellow-100 text-yellow-800 text-[10px] px-2 py-0.5">
              Premium（課金機能は準備中）
            </span>
          </h2>
          <p className="text-xs text-gray-500">
            直近の投稿をまとめて分析して、あなたのキャラ傾向や注意ポイントをAIが整理します。
          </p>
        </div>
        <button
          type="button"
          onClick={handleFetch}
          disabled={status === "loading"}
          className="text-xs px-3 py-1 rounded-full border bg-gradient-to-r from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 disabled:opacity-60"
        >
          {status === "loading" ? "分析中…" : "AIサマリーを見る"}
        </button>
      </div>

      {message && (
        <div className="mt-1 text-[11px] text-gray-700 whitespace-pre-wrap">
          {message}
        </div>
      )}

      {summary && (
        <div className="mt-3 space-y-2 text-xs text-gray-800">
          <div>
            <div className="font-semibold mb-0.5">全体の傾向</div>
            <p className="whitespace-pre-wrap">{summary.overview}</p>
          </div>

          {summary.strengths?.length > 0 && (
            <div>
              <div className="font-semibold mb-0.5">強み</div>
              <ul className="list-disc list-inside space-y-0.5">
                {summary.strengths.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {summary.risks?.length > 0 && (
            <div>
              <div className="font-semibold mb-0.5">注意ポイント</div>
              <ul className="list-disc list-inside space-y-0.5">
                {summary.risks.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {summary.suggestions?.length > 0 && (
            <div>
              <div className="font-semibold mb-0.5">
                今後の投稿へのヒント
              </div>
              <ul className="list-disc list-inside space-y-0.5">
                {summary.suggestions.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
