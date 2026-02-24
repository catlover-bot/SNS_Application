"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ModeKey = "adaptive" | "stable";
type SeriesPoint = {
  day: string;
  mode: ModeKey;
  impressions: number;
  opens: number;
  likes: number;
  replies: number;
  boosts: number;
  feedLoads: number;
  revisitCount: number;
  openRate: number;
  revisitRate: number;
  engageRate: number;
  score: number;
};

type ModeSummary = {
  mode: ModeKey;
  impressions: number;
  opens: number;
  likes: number;
  replies: number;
  boosts: number;
  feedLoads: number;
  openRate: number;
  engageRate: number;
  score: number;
};

type AbTimeSeriesResponse = {
  ok: boolean;
  available: boolean;
  days: number;
  recommendedMode: ModeKey | null;
  points: SeriesPoint[];
  modes: ModeSummary[];
};

function clamp01(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export default function PersonaFeedAbTimeseriesPage() {
  const [days, setDays] = useState(28);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AbTimeSeriesResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/me/persona-feed/ab-timeseries?days=${days}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "A/B時系列の取得に失敗しました");
      setData(json as AbTimeSeriesResponse);
    } catch (e: any) {
      setError(e?.message ?? "A/B時系列の取得に失敗しました");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<
      string,
      {
        day: string;
        adaptive?: SeriesPoint;
        stable?: SeriesPoint;
      }
    >();
    (data?.points ?? []).forEach((p) => {
      const cur = map.get(p.day) ?? { day: p.day };
      if (p.mode === "adaptive") cur.adaptive = p;
      if (p.mode === "stable") cur.stable = p;
      map.set(p.day, cur);
    });
    return Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day));
  }, [data?.points]);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">A/B 時系列ダッシュボード</h1>
        <p className="text-sm opacity-70">
          キャラ別TLの `adaptive / stable` を日次で比較し、既定 mode を実績ベースで最適化します。
        </p>
      </header>

      <div className="rounded-xl border bg-white p-3 flex flex-wrap items-center gap-3">
        <label className="text-sm flex items-center gap-2">
          期間
          <select
            className="border rounded px-2 py-1"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[14, 28, 42, 56].map((d) => (
              <option key={d} value={d}>
                直近{d}日
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void load()} className="px-3 py-1 rounded border">
          {loading ? "更新中…" : "更新"}
        </button>
        {data?.available && (
          <div className="text-xs rounded-full border px-2 py-1 bg-slate-50">
            推奨: {data.recommendedMode ?? "未確定"}
          </div>
        )}
        <a href="/persona-feed" className="text-sm underline ml-auto">
          キャラ別TLへ戻る
        </a>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}
      {data && !data.available && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          `persona_feed_mode_ab_events` が未適用、またはイベントがまだ不足しています。
        </div>
      )}

      {data?.available && (
        <>
          <section className="grid gap-3 md:grid-cols-2">
            {(data.modes ?? []).map((m) => (
              <div key={m.mode} className="rounded-xl border bg-white p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{m.mode}</div>
                  <div className="text-xs opacity-70">score {m.score.toFixed(3)}</div>
                </div>
                <div className="text-sm">
                  開封率 {Math.round(clamp01(m.openRate) * 100)}% / 反応率{" "}
                  {Math.round(clamp01(m.engageRate) * 100)}%
                </div>
                <div className="text-xs opacity-70">
                  impression {m.impressions} / open {m.opens} / feed_load {m.feedLoads}
                </div>
              </div>
            ))}
          </section>

          <section className="rounded-xl border bg-white p-4 space-y-3">
            <div className="font-semibold text-sm">日次推移（開封率）</div>
            <div className="space-y-2">
              {byDay.length === 0 ? (
                <div className="text-sm opacity-70">データがまだありません。</div>
              ) : (
                byDay.map((row) => {
                  const a = row.adaptive;
                  const s = row.stable;
                  const aOpenRate = clamp01(Number(a?.openRate ?? 0));
                  const sOpenRate = clamp01(Number(s?.openRate ?? 0));
                  const aScore = clamp01(Number(a?.score ?? 0) / 1.0);
                  const sScore = clamp01(Number(s?.score ?? 0) / 1.0);
                  return (
                    <div key={row.day} className="rounded-lg border bg-slate-50 p-2">
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span>{row.day}</span>
                        <span className="opacity-70">
                          A {Math.round(aOpenRate * 100)}% / S {Math.round(sOpenRate * 100)}%
                        </span>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="space-y-1">
                          <div className="text-[11px] opacity-70">adaptive 開封率 / score</div>
                          <div className="h-2 rounded bg-slate-200 overflow-hidden">
                            <div
                              className="h-full bg-emerald-500"
                              style={{ width: `${Math.round(aOpenRate * 100)}%` }}
                            />
                          </div>
                          <div className="h-2 rounded bg-slate-200 overflow-hidden">
                            <div
                              className="h-full bg-cyan-500"
                              style={{ width: `${Math.round(aScore * 100)}%` }}
                            />
                          </div>
                          <div className="text-[10px] opacity-70">
                            imp {a?.impressions ?? 0} / open {a?.opens ?? 0} / reply {a?.replies ?? 0}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-[11px] opacity-70">stable 開封率 / score</div>
                          <div className="h-2 rounded bg-slate-200 overflow-hidden">
                            <div
                              className="h-full bg-violet-500"
                              style={{ width: `${Math.round(sOpenRate * 100)}%` }}
                            />
                          </div>
                          <div className="h-2 rounded bg-slate-200 overflow-hidden">
                            <div
                              className="h-full bg-indigo-500"
                              style={{ width: `${Math.round(sScore * 100)}%` }}
                            />
                          </div>
                          <div className="text-[10px] opacity-70">
                            imp {s?.impressions ?? 0} / open {s?.opens ?? 0} / reply {s?.replies ?? 0}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

