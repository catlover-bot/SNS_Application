// apps/web/src/components/PersonaRadar.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
} from "recharts";

type PersonaRow = {
  persona_key: string;
  score: number | null;
  confidence: number | null;
};

type PersonaDef = {
  key: string;
  title: string;
  theme: string | null;
};

type ApiResponse = {
  personas: PersonaRow[];
  defs: PersonaDef[];
  error?: string;
};

type RadarPoint = {
  key: string;
  label: string;
  score: number; // 0..100
};

export default function PersonaRadar() {
  const [data, setData] = useState<RadarPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);

      try {
        const res = await fetch("/api/me/persona_profile", { cache: "no-store" });
        if (!res.ok) {
          throw new Error("persona_profile_unavailable");
        }
        const json = (await res.json()) as ApiResponse;

        if (!alive) return;
        if (json.error) {
          throw new Error("persona_profile_unavailable");
        }

        const defsByKey = new Map<string, PersonaDef>();
        (json.defs ?? []).forEach((d) => defsByKey.set(d.key, d));

        const points: RadarPoint[] = (json.personas ?? []).map((p) => {
          const def = defsByKey.get(p.persona_key);
          const raw = typeof p.score === "number" ? p.score : 0;
          const clamped = Math.max(0, Math.min(1, raw));
          return {
            key: p.persona_key,
            label: def?.title ?? p.persona_key,
            score: Math.round(clamped * 100),
          };
        });

        setData(points);
      } catch {
        console.warn("[PersonaRadar] profile request could not complete");
        if (!alive) return;
        setErr("キャラ情報を読み込めませんでした。時間をおいてもう一度お試しください。");
        setData([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const top = useMemo(
    () => (data.length ? [...data].sort((a, b) => b.score - a.score)[0] : null),
    [data]
  );

  if (loading) {
    return <div className="opacity-70 text-sm">キャラ情報を読み込み中…</div>;
  }

  if (err) {
    return (
      <div className="rounded border bg-red-50 text-red-700 p-4 text-sm">
        {err}
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="rounded border bg-yellow-50 text-yellow-800 p-4 text-sm">
        <div className="font-medium">まだキャラスコアがありません</div>
        <p className="mt-1">まず1件投稿すると、投稿キャラと成長の内訳が表示されます。</p>
        <a href="/compose" className="mt-3 inline-flex rounded-full bg-yellow-700 px-3 py-1.5 text-white">
          投稿してキャラを育てる
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {top && (
        <div className="rounded border p-4 bg-white">
          <div className="text-xs uppercase opacity-60">いまの主キャラ</div>
          <div className="text-lg font-semibold">
            {top.label}{" "}
            <span className="text-sm opacity-70">（スコア {top.score}）</span>
          </div>
          <div className="text-xs opacity-70 mt-1">
            投稿内容や他ユーザーからの評価に応じて、ここが少しずつ変化していきます。
          </div>
        </div>
      )}

      <div className="w-full h-72 bg-white rounded-2xl border p-2">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data}>
            <PolarGrid />
            <PolarAngleAxis dataKey="label" />
            <PolarRadiusAxis angle={30} domain={[0, 100]} />
            <Tooltip formatter={(value: any) => [`${value} / 100`, "スコア"]} />
            <Radar
              name="キャラスコア"
              dataKey="score"
              stroke="#8884d8"
              fill="#8884d8"
              fillOpacity={0.4}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded border bg-white p-4">
        <h2 className="font-semibold mb-2 text-sm">キャラ内訳（一覧）</h2>
        <div className="space-y-1 text-sm">
          {data.map((p) => (
            <div key={p.key} className="flex items-center gap-2">
              <div className="w-40 truncate">{p.label}</div>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500"
                  style={{ width: `${p.score}%` }}
                />
              </div>
              <div className="w-12 text-right text-xs opacity-70">
                {p.score}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
