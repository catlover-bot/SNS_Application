"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildTimelineLearningActionTips,
  buildTimelineLearningSectionSummary,
  buildTimelineWeightTrendRatios,
  formatTimelineWeightPercentPoint,
  toTimelineWeightsRows,
  type TimelineSignalWeightsHistoryPoint,
  type TimelineSignalsPayload,
} from "@sns/core";
import { fetchTimelineSignals } from "@/lib/socialDataClient";

type TimelineLearningView = {
  weights: TimelineSignalsPayload["weights"];
  weightsSamples: number;
  weightsHistory: TimelineSignalWeightsHistoryPoint[];
  learningInput: TimelineSignalsPayload["learningInput"];
  degraded?: Record<string, boolean>;
};

export default function TimelineLearningDashboardPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TimelineLearningView | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { res, json } = await fetchTimelineSignals();
      if (!res.ok || !json) throw new Error("おすすめ学習データの取得に失敗しました");
      setData({
        weights: json.weights ?? null,
        weightsSamples: Math.max(0, Math.floor(Number(json.weightsSamples ?? 0) || 0)),
        weightsHistory: Array.isArray(json.weightsHistory)
          ? (json.weightsHistory as TimelineSignalWeightsHistoryPoint[])
          : [],
        learningInput: json.learningInput ?? null,
        degraded: json.degraded,
      });
    } catch {
      setError("おすすめ学習データを読み込めませんでした。時間をおいて再度お試しください。");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const bars = useMemo(() => {
    return buildTimelineWeightTrendRatios(data?.weightsHistory ?? [], 24).map((v) =>
      Math.round(v * 100)
    );
  }, [data?.weightsHistory]);

  const recentPoints = useMemo(
    () => [...(data?.weightsHistory ?? [])].slice(-12).reverse(),
    [data?.weightsHistory]
  );

  const currentWeightRows = useMemo(() => {
    return toTimelineWeightsRows(data?.weights);
  }, [data?.weights]);

  const learningSummary = useMemo(
    () =>
      buildTimelineLearningSectionSummary({
        weightsSamples: data?.weightsSamples,
        learningInput: data?.learningInput,
        historyCount: data?.weightsHistory?.length ?? 0,
        weightsAvailable: !data?.degraded?.timelineWeightsMissing,
      }),
    [data?.degraded?.timelineWeightsMissing, data?.learningInput, data?.weightsHistory?.length, data?.weightsSamples]
  );
  const learningActionTips = useMemo(
    () =>
      buildTimelineLearningActionTips({
        weightsSamples: data?.weightsSamples,
        learningInput: data?.learningInput,
        weights: data?.weights ?? null,
        history: data?.weightsHistory ?? [],
      }),
    [data]
  );

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{learningSummary.title}</h1>
        <p className="text-sm opacity-70">
          {learningSummary.subtitle}
        </p>
      </header>

      <div className="rounded-xl border bg-white p-3 flex items-center gap-3">
        <button type="button" onClick={() => void load()} className="px-3 py-1 rounded border">
          {loading ? "更新中…" : "更新"}
        </button>
        <a href="/home" className="text-sm underline ml-auto">
          ホームTLへ戻る
        </a>
      </div>

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}
      {data?.degraded?.timelineWeightsMissing ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          おすすめ学習は準備中です。開いた投稿や保存した投稿は、利用できる範囲で反映されます。
        </div>
      ) : null}

      {data && (
        <>
          <section className="rounded-xl border bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{learningSummary.title}</div>
              <div className="text-xs opacity-70">{learningSummary.stageLabel}</div>
            </div>
            <div className="text-sm">{learningSummary.stageDescription}</div>
            {learningActionTips.length > 0 && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div className="text-xs font-semibold text-blue-900">おすすめを育てるコツ</div>
                <div className="mt-1 space-y-1">
                  {learningActionTips.map((tip) => (
                    <div key={`dashboard-learning-tip-${tip.key}`} className="text-xs text-blue-800">
                      ・{tip.label}: {tip.detail}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2 text-xs">
              {learningSummary.metrics.map((m) => (
                <span key={m.key} className="inline-flex items-center rounded-full border bg-slate-50 px-2 py-0.5">
                  {m.label} {m.value}
                </span>
              ))}
            </div>
            {bars.length > 1 ? (
              <div className="rounded-lg border bg-slate-50 px-3 py-3">
                <div className="flex items-end gap-1 h-24">
                  {bars.map((h, idx) => (
                    <div
                      key={`timeline-learning-bar-${idx}`}
                      className="flex-1 rounded-sm bg-gradient-to-t from-blue-600 to-cyan-300"
                      style={{ height: `${Math.max(8, h)}%` }}
                    />
                  ))}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {learningSummary.chartCaption}
                </div>
              </div>
            ) : (
              <div className="text-sm opacity-70">{learningSummary.historyEmptyHint}</div>
            )}
          </section>

          {currentWeightRows.length > 0 && (
            <section className="rounded-xl border bg-white p-4 space-y-2">
              <div className="font-semibold text-sm">{learningSummary.currentWeightsTitle}</div>
              <div className="grid gap-2 md:grid-cols-2">
                {currentWeightRows.map(({ label, value }) => (
                  <div key={label} className="rounded-lg border bg-slate-50 p-2 flex items-center justify-between">
                    <span className="text-sm">{label}</span>
                    <span className="text-xs rounded-full border bg-white px-2 py-0.5">
                      {formatTimelineWeightPercentPoint(value)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-xl border bg-white p-4 space-y-2">
            <div className="font-semibold text-sm">{learningSummary.recentUpdatesTitle}</div>
            {data.degraded?.timelineWeightsHistoryMissing ? (
              <div className="text-sm opacity-70">
                履歴表示は準備中です。おすすめ自体は現在の反応をもとに調整されます。
              </div>
            ) : recentPoints.length === 0 ? (
              <div className="text-sm opacity-70">{learningSummary.unavailableHint}</div>
            ) : (
              recentPoints.map((p) => (
                <div key={`${p.at}-${p.samples}`} className="rounded-lg border bg-slate-50 p-2">
                  <div className="flex items-center justify-between text-xs">
                    <span>{new Date(p.at).toLocaleString("ja-JP")}</span>
                    <span>反応 {p.samples}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-600">
                    開封 {p.openedCount ?? 0} / 保存 {p.savedCount ?? 0} / フォロー {p.followedCount ?? 0}
                  </div>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
