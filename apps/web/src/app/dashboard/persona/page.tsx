// apps/web/src/app/dashboard/persona/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PersonaRadar from "@/components/PersonaRadar";
import PromptBar from "@/components/PromptBar";
import PersonaBadge from "@/components/PersonaBadge";
import AiTimelineSummaryPanel from "@/components/AiTimelineSummaryPanel";
import PersonaEvolutionChart from "@/components/PersonaEvolutionChart";
import SignedInDemoGuide from "@/components/SignedInDemoGuide";

type Soulmate = {
  user_id: string;
  persona_key: string;
  persona_title: string;
  romance_score: number;
  percent: number;
  relation_label: string | null;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type PersonaInsight = {
  dominant_key: string | null;
  dominant_title: string | null;
  streak_days: number;
  count_total: number;
  count_7d: number;
  count_prev_7d: number;
  momentum_delta: number;
  trend: "up" | "down" | "stable";
  top_personas: Array<{
    key: string;
    title: string;
    count: number;
    share: number;
  }>;
};

type PersonaQuest = {
  id: string;
  kind: "focus" | "contrast" | "duet";
  title: string;
  description: string;
  xp: number;
  completed: boolean;
  seed: string;
  target_persona_key: string | null;
  target_persona_title: string | null;
};

export default function PersonaDashboardPage() {
  const [soulmates, setSoulmates] = useState<Soulmate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insight, setInsight] = useState<PersonaInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(true);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [quests, setQuests] = useState<PersonaQuest[]>([]);
  const [questXp, setQuestXp] = useState(0);
  const [questLoading, setQuestLoading] = useState(true);
  const [questError, setQuestError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/me/soulmates");
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || res.statusText);
        }
        const json = await res.json();
        if (!alive) return;
        setSoulmates(json.soulmates ?? []);
      } catch {
        if (!alive) return;
        setError("相性候補を読み込めませんでした。時間をおいてもう一度お試しください。");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setQuestLoading(true);
      setQuestError(null);
      try {
        const res = await fetch("/api/me/persona-quests", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json) {
          throw new Error("キャラクエスト取得に失敗しました");
        }
        if (!alive) return;
        setQuests((json.quests ?? []) as PersonaQuest[]);
        setQuestXp(Number(json.total_xp ?? 0) || 0);
      } catch {
        if (!alive) return;
        setQuestError("キャラクエストを読み込めませんでした。時間をおいて再度お試しください。");
        setQuests([]);
      } finally {
        if (alive) setQuestLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setInsightLoading(true);
      setInsightError(null);
      try {
        const res = await fetch("/api/me/persona-insights", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json) {
          throw new Error("キャラインサイト取得に失敗しました");
        }
        if (!alive) return;
        setInsight(json as PersonaInsight);
      } catch {
        if (!alive) return;
        setInsightError("キャラインサイトを読み込めませんでした。時間をおいて再度お試しください。");
        setInsight(null);
      } finally {
        if (alive) setInsightLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* ヘッダ */}
      <div className="rounded-xl border bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
          Persona Insights
        </div>
        <h1 className="mt-1 text-2xl font-bold">キャラ分析</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          投稿から見えてきたキャラのバランス、最近の勢い、今日試せるクエストをまとめて確認できます。
          あなたの言葉がどんな社会的な個性として届いているかを眺める場所です。
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          <Link href="/persona-feed" className="underline">
            キャラ別タイムラインへ
          </Link>
          <Link href="/persona-lab" className="underline">
            キャラ相性ラボへ
          </Link>
        </div>
      </div>

      {!insightLoading && !insight?.dominant_key ? <SignedInDemoGuide compact /> : null}

      {/* 上段：レーダー + プロンプトバー + タイムラインAIサマリー */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="border rounded-xl p-4 bg-white shadow-sm">
          <h2 className="text-sm font-semibold mb-2">
            あなたのキャラレーダー
          </h2>
          <PersonaRadar />
        </div>

        <div className="space-y-4">
          <div className="border rounded-xl p-4 bg-white shadow-sm">
            <h2 className="text-sm font-semibold mb-2">投稿の相談をしてみる</h2>
            <PromptBar />
          </div>

          {/* Premium想定：タイムライン一括AI分析 */}
          <AiTimelineSummaryPanel />
        </div>
      </div>

      <PersonaEvolutionChart />

      <div className="border rounded-xl p-4 bg-white shadow-sm space-y-3">
        <div>
          <h2 className="text-sm font-semibold">キャラインサイト</h2>
          <p className="text-xs text-gray-500">
            投稿履歴から、現在の主キャラの勢いと継続性を算出しています。
          </p>
        </div>
        {insightLoading ? (
          <p className="text-sm text-gray-500">キャラインサイトを分析中です…</p>
        ) : insightError ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{insightError}</p>
        ) : !insight?.dominant_key ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
            <div className="font-medium text-slate-900">インサイトはこれから育ちます</div>
            <p className="mt-1">投稿が増えると、主キャラの勢いや投稿内訳が見えるようになります。</p>
            <Link href="/compose" className="mt-3 inline-flex rounded-full bg-blue-600 px-4 py-2 text-white">
              投稿する
            </Link>
          </div>
        ) : (
          <>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="rounded-lg border p-3 bg-gray-50">
                <div className="text-xs text-gray-500">主キャラ連続日数</div>
                <div className="text-2xl font-bold">{insight.streak_days}</div>
                <div className="text-xs text-gray-500">日</div>
              </div>
              <div className="rounded-lg border p-3 bg-gray-50">
                <div className="text-xs text-gray-500">直近7日投稿数</div>
                <div className="text-2xl font-bold">{insight.count_7d}</div>
                <div className="text-xs text-gray-500">
                  前週 {insight.count_prev_7d}
                </div>
              </div>
              <div className="rounded-lg border p-3 bg-gray-50">
                <div className="text-xs text-gray-500">モメンタム</div>
                <div
                  className={`text-2xl font-bold ${
                    insight.trend === "up"
                      ? "text-green-600"
                      : insight.trend === "down"
                      ? "text-red-600"
                      : "text-gray-800"
                  }`}
                >
                  {insight.momentum_delta > 0 ? "+" : ""}
                  {insight.momentum_delta}
                </div>
                <div className="text-xs text-gray-500">
                  {insight.trend === "up"
                    ? "上昇"
                    : insight.trend === "down"
                    ? "下降"
                    : "横ばい"}
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-xs text-gray-500 mb-1">投稿内訳 TOP</div>
              <div className="flex flex-wrap gap-2">
                {insight.top_personas.slice(0, 6).map((x) => (
                  <span
                    key={x.key}
                    className="text-xs px-2 py-1 rounded-full border bg-white"
                  >
                    {x.title} {(x.share * 100).toFixed(0)}%
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="border rounded-xl p-4 bg-white shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">キャラクエスト</h2>
            <p className="text-xs text-gray-500">
              キャラ行動をゲーム化して、継続投稿と会話を促進します。
            </p>
          </div>
          <div className="text-sm font-semibold">本日XP {questXp}</div>
        </div>
        {questLoading ? (
          <p className="text-sm text-gray-500">クエストを生成中です…</p>
        ) : questError ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{questError}</p>
        ) : quests.length === 0 ? (
          <p className="text-sm text-gray-500">クエストはまだありません。投稿が増えると、キャラに合わせたお題が表示されます。</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {quests.map((q) => (
              <article
                key={q.id}
                className={`rounded-lg border p-3 space-y-2 ${
                  q.completed ? "bg-green-50 border-green-300" : "bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">{q.title}</div>
                  <div className="text-xs px-2 py-0.5 rounded-full border">
                    {q.xp} XP
                  </div>
                </div>
                <p className="text-xs text-gray-600">{q.description}</p>
                <div className="flex items-center justify-between">
                  <a
                    href={`/compose?seed=${encodeURIComponent(q.seed)}`}
                    className="text-xs underline"
                  >
                    このクエストで投稿
                  </a>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border ${
                      q.completed ? "bg-green-100 border-green-300" : "bg-gray-50"
                    }`}
                  >
                    {q.completed ? "達成済み" : "未達成"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* 下段：恋愛モード・ソウルメイト候補 */}
      <div className="border rounded-xl p-4 bg-white shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <div>
            <h2 className="text-sm font-semibold">
              相性候補
            </h2>
            <p className="text-xs text-gray-500">
              あなたのメインキャラと相性の良い相手をピックアップしています。
            </p>
          </div>
        </div>

        {loading && (
          <p className="text-sm text-gray-500">
            ソウルメイト候補を計算中です…
          </p>
        )}

        {!loading && error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>
        )}

        {!loading && !error && soulmates.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
            まだ相性候補が見つかっていません。もう少し投稿したり、キャラ相性ラボで気になるタイプを試してみてください。
          </div>
        )}

        {!loading && !error && soulmates.length > 0 && (
          <ul className="mt-3 space-y-3">
            {soulmates.map((s) => {
              const href = s.handle
                ? `/u/${encodeURIComponent(s.handle)}`
                : "#";
              const name =
                s.display_name || s.handle || "ユーザー";

              return (
                <li
                  key={s.user_id + ":" + s.persona_key}
                  className="flex items-center gap-3 border rounded-lg p-3 hover:bg-pink-50/40 transition"
                >
                  {/* アイコン */}
                  <Link href={href} className="flex-shrink-0" aria-disabled={!s.handle}>
                    <img
                      src={
                        s.avatar_url ??
                        "https://placehold.co/48x48?text=USER"
                      }
                      alt={name}
                      className="w-10 h-10 rounded-full object-cover border"
                    />
                  </Link>

                  {/* 中央：名前 + キャラ */}
                  <div className="flex-1 min-w-0">
                    <Link
                      href={href}
                      className="font-medium text-sm truncate hover:underline"
                    >
                      {name}
                    </Link>
                    {s.handle && (
                      <div className="text-xs text-gray-500">
                        @{s.handle}
                      </div>
                    )}

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <PersonaBadge personaKey={s.persona_key} />
                      <span className="text-gray-600">
                        {s.persona_title}
                      </span>
                      {s.relation_label && (
                        <span className="px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 text-[11px]">
                          {s.relation_label}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 右側：相性％ */}
                  <div className="flex flex-col items-end text-right">
                    <div className="text-xs text-gray-500 mb-0.5">
                      恋愛相性
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-bold text-pink-600">
                        {s.percent}
                      </span>
                      <span className="text-xs text-gray-500">%</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
