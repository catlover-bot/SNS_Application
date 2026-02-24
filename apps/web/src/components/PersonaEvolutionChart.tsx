"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Snapshot = {
  at: string;
  top_key: string;
  top_score: number;
  confidence: number;
  posts: number;
};

type EvolutionResponse = {
  snapshots: Snapshot[];
  titles: Record<string, string>;
  source: string;
  warning?: string;
};

type ChartPoint = {
  at: string;
  label: string;
  score: number;
  confidence: number;
  posts: number;
  key: string;
  title: string;
};

const PALETTE = [
  "#2563EB",
  "#D97706",
  "#16A34A",
  "#BE185D",
  "#7C3AED",
  "#0F766E",
  "#EA580C",
];

function clampPct(v: number | null | undefined) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  if (n <= 1) return Math.max(0, Math.min(100, Math.round(n * 100)));
  return Math.max(0, Math.min(100, Math.round(n)));
}

function formatDate(value: string) {
  const raw = value?.trim() ?? "";
  if (!raw) return "-";
  const d = raw.length <= 10 ? new Date(`${raw}T00:00:00`) : new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function personaColor(key: string) {
  let sum = 0;
  for (let i = 0; i < key.length; i += 1) sum += key.charCodeAt(i);
  return PALETTE[sum % PALETTE.length];
}

export default function PersonaEvolutionChart({
  limit = 48,
  compact = false,
  className,
}: {
  limit?: number;
  compact?: boolean;
  className?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<EvolutionResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      const r = await fetch(`/api/me/persona-evolution?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await r.json().catch(() => null)) as EvolutionResponse | null;

      if (r.status === 401) {
        setNeedLogin(true);
        setRes(null);
        return;
      }
      if (!r.ok || !json) {
        throw new Error((json as any)?.error ?? "キャラ進化の取得に失敗しました");
      }
      setNeedLogin(false);
      setRes(json);
    } catch (e: any) {
      setError(e?.message ?? "キャラ進化の取得に失敗しました");
      setRes(null);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const points = useMemo<ChartPoint[]>(() => {
    if (!res?.snapshots?.length) return [];
    return res.snapshots.map((s) => {
      const title = res.titles?.[s.top_key] ?? s.top_key;
      return {
        at: s.at,
        label: formatDate(s.at),
        score: clampPct(s.top_score),
        confidence: clampPct(s.confidence),
        posts: Number(s.posts ?? 0) || 0,
        key: s.top_key,
        title,
      };
    });
  }, [res]);

  const transitions = useMemo(() => {
    const rows: ChartPoint[] = [];
    points.forEach((p, i) => {
      if (i === 0 || points[i - 1]?.key !== p.key) rows.push(p);
    });
    return rows;
  }, [points]);

  if (needLogin) {
    return (
      <section className={className}>
        <div className="rounded-xl border bg-white p-4 space-y-2">
          <h2 className="text-sm font-semibold">キャラ進化トレース</h2>
          <p className="text-sm opacity-70">ログイン後に利用できます。</p>
          <Link href="/login?next=/dashboard/persona" className="text-sm underline">
            ログインする
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className={className}>
      <div className="rounded-xl border bg-white p-4 space-y-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">キャラ進化トレース</h2>
            <p className="text-xs text-gray-500">
              投稿履歴から日ごとの主キャラ変遷を可視化します。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="px-3 py-1.5 rounded border text-xs bg-white disabled:opacity-60"
          >
            {loading ? "更新中…" : "更新"}
          </button>
        </div>

        {error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : loading ? (
          <div className="text-sm opacity-70">読み込み中…</div>
        ) : points.length === 0 ? (
          <div className="text-sm opacity-70">
            まだ十分な投稿履歴がありません。投稿後に再評価すると表示されます。
          </div>
        ) : (
          <>
            <div style={{ width: "100%", height: compact ? 210 : 260 }}>
              <ResponsiveContainer>
                <LineChart data={points} margin={{ top: 8, right: 10, left: -16, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={32} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      `${value}%`,
                      name === "score" ? "主キャラスコア" : "信頼度",
                    ]}
                    labelFormatter={(_, payload: any[]) => {
                      const row = payload?.[0]?.payload as ChartPoint | undefined;
                      if (!row) return "";
                      return `${row.label} / ${row.title}`;
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#2563EB"
                    strokeWidth={2.5}
                    dot={{ r: 2.5 }}
                    name="score"
                  />
                  <Line
                    type="monotone"
                    dataKey="confidence"
                    stroke="#F97316"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    strokeDasharray="4 3"
                    name="confidence"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-gray-500">
                遷移ポイント {transitions.length} 回
                {res?.source ? <span className="ml-2">source: {res.source}</span> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {transitions.map((t) => (
                  <span
                    key={`${t.at}:${t.key}`}
                    className="text-xs px-2 py-1 rounded-full border"
                    style={{
                      borderColor: personaColor(t.key),
                      backgroundColor: `${personaColor(t.key)}1A`,
                    }}
                    title={`${t.posts} posts`}
                  >
                    {t.label} {t.title}
                  </span>
                ))}
              </div>
              {res?.warning ? (
                <div className="text-xs text-amber-700">fallback: {res.warning}</div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
