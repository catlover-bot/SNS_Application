// apps/web/src/components/ProfileCharacterRadar.tsx
"use client";

import { useEffect, useState } from "react";

type Profile = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type SummaryRow = {
  user_id: string;
  analyzed_posts: number | null;
  truth_avg: number | null;
  exaggeration_avg: number | null;
  brag_avg: number | null;
  joke_avg: number | null;
};

type ApiResponse =
  | {
      profile: Profile;
      summary: SummaryRow | null;
    }
  | { error: string };

type Props = {
  handle: string;
};

function clampScore(v: unknown, def: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const x = Math.round(n);
  if (x < 0) return 0;
  if (x > 100) return 100;
  return x;
}

function detectProfileTone(summary: SummaryRow | null) {
  if (!summary) {
    return {
      label: "AI キャラ分析はまだです",
      description:
        "このユーザーの投稿はまだ十分に分析されていません。",
      colorClass: "bg-slate-50 text-slate-700 border-slate-300",
    };
  }

  const truth = clampScore(summary.truth_avg, 50);
  const exaggeration = clampScore(summary.exaggeration_avg, 50);
  const brag = clampScore(summary.brag_avg, 0);
  const joke = clampScore(summary.joke_avg, 0);

  // ネタ寄り
  if (joke >= 65 && truth <= 70) {
    return {
      label: "ネタ職人タイプ",
      description: "冗談やネタっぽい投稿が多く、場を盛り上げるタイプです。",
      colorClass: "bg-purple-50 text-purple-700 border-purple-300",
    };
  }

  // 盛りキャラ
  if (exaggeration >= 65 && truth <= 70) {
    return {
      label: "盛り上げストタイプ",
      description:
        "話を少し盛って面白くする傾向があり、ノリの良さが目立つタイプです。",
      colorClass: "bg-orange-50 text-orange-700 border-orange-300",
    };
  }

  // 自慢・マウント寄り
  if (brag >= 60) {
    return {
      label: "カリスマ自慢タイプ",
      description:
        "実績や成功体験をよく共有し、自己ブランディングが得意なタイプです。",
      colorClass: "bg-amber-50 text-amber-700 border-amber-300",
    };
  }

  // ガチ本音寄り
  if (truth >= 75 && exaggeration <= 40 && joke <= 40) {
    return {
      label: "ガチ本音タイプ",
      description:
        "比較的事実ベースで、正直な気持ちや日常をそのまま共有するタイプです。",
      colorClass: "bg-emerald-50 text-emerald-700 border-emerald-300",
    };
  }

  return {
    label: "ミックスバランスタイプ",
    description:
      "事実・冗談・盛り上げ・自己アピールがバランス良く混ざった投稿傾向です。",
    colorClass: "bg-sky-50 text-sky-700 border-sky-300",
  };
}

type DimensionRowProps = {
  label: string;
  value: number;
  accent: "truth" | "exaggeration" | "brag" | "joke";
};

function DimensionRow({ label, value, accent }: DimensionRowProps) {
  let barClass = "bg-slate-400";
  if (accent === "truth") barClass = "bg-emerald-500";
  if (accent === "exaggeration") barClass = "bg-orange-500";
  if (accent === "brag") barClass = "bg-amber-500";
  if (accent === "joke") barClass = "bg-purple-500";

  return (
    <div className="space-y-0.5">
      <div className="flex justify-between items-center">
        <span className="text-[11px] text-slate-700">{label}</span>
        <span className="text-[11px] tabular-nums text-slate-700">
          {value}%
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export function ProfileCharacterRadar({ handle }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [summary, setSummary] = useState<SummaryRow | null>(null);

  useEffect(() => {
    let canceled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/profiles/${encodeURIComponent(handle)}/ai-summary`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("プロフィールが見つかりませんでした。");
          } else {
            setError("キャラサマリを読み込めませんでした。時間をおいて再度お試しください。");
          }
          return;
        }

        const json = (await res.json()) as ApiResponse;

        if ("error" in json) {
          setError("キャラサマリを読み込めませんでした。時間をおいて再度お試しください。");
          return;
        }

        if (!canceled) {
          setProfile(json.profile);
          setSummary(json.summary);
        }
      } catch {
        if (!canceled) {
          setError("キャラサマリを読み込めませんでした。時間をおいて再度お試しください。");
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [handle]);

  if (loading) {
    return (
      <div className="mt-4 rounded-xl border bg-slate-50 px-4 py-3 text-xs text-slate-600">
        キャラレーダーを計算中です…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
        {error}
      </div>
    );
  }

  const tone = detectProfileTone(summary);
  const analyzed = summary?.analyzed_posts ?? 0;

  const truth = clampScore(summary?.truth_avg ?? null, 50);
  const exaggeration = clampScore(summary?.exaggeration_avg ?? null, 50);
  const brag = clampScore(summary?.brag_avg ?? null, 0);
  const joke = clampScore(summary?.joke_avg ?? null, 0);

  return (
    <div className="mt-4 rounded-lg border bg-white px-4 py-3 text-xs space-y-3">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${tone.colorClass}`}
        >
          <span>キャラ診断</span>
        </span>
        {analyzed > 0 && (
          <span className="text-[11px] text-slate-500">
            （分析済み投稿: {analyzed}件）
          </span>
        )}
      </div>

      <div className="text-[11px] text-slate-700 whitespace-pre-wrap">
        {tone.description}
      </div>

      {summary && (
        <div className="space-y-1">
          <DimensionRow label="事実っぽさ" value={truth} accent="truth" />
          <DimensionRow label="盛ってる度" value={exaggeration} accent="exaggeration" />
          <DimensionRow label="自慢・マウント感" value={brag} accent="brag" />
          <DimensionRow label="ネタ・ジョーク度" value={joke} accent="joke" />
        </div>
      )}
    </div>
  );
}

export default ProfileCharacterRadar;
