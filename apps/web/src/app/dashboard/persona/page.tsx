// apps/web/src/app/dashboard/persona/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PersonaRadar from "@/components/PersonaRadar";
import PromptBar from "@/components/PromptBar";
import PersonaBadge from "@/components/PersonaBadge";

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

export default function PersonaDashboardPage() {
  const [soulmates, setSoulmates] = useState<Soulmate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      } catch (e) {
        if (!alive) return;
        console.error("soulmates fetch error", e);
        setError("ソウルメイト候補の取得に失敗しました");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* ヘッダ */}
      <div>
        <h1 className="text-xl font-bold mb-1">キャラ分析ダッシュボード</h1>
        <p className="text-sm text-gray-600">
          あなたのキャラのバランスと、相性の良い「ソウルメイト候補」をまとめて確認できます。
        </p>
      </div>

      {/* 上段：レーダー + プロンプトバー */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="border rounded-xl p-4 bg-white shadow-sm">
          <h2 className="text-sm font-semibold mb-2">あなたのキャラレーダー</h2>
          <PersonaRadar />
        </div>
        <div className="border rounded-xl p-4 bg-white shadow-sm">
          <h2 className="text-sm font-semibold mb-2">AI に相談してみる</h2>
          <PromptBar />
        </div>
      </div>

      {/* 下段：恋愛モード・ソウルメイト候補 */}
      <div className="border rounded-xl p-4 bg-white shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-pink-500 text-lg">💘</span>
          <div>
            <h2 className="text-sm font-semibold">恋愛モード：ソウルメイト候補</h2>
            <p className="text-xs text-gray-500">
              あなたのメインキャラ × 恋愛相性スコアで、「カップルになると良さそうな相手」をピックアップしています。
            </p>
          </div>
        </div>

        {loading && (
          <p className="text-sm text-gray-500">ソウルメイト候補を計算中です…</p>
        )}

        {!loading && error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        {!loading && !error && soulmates.length === 0 && (
          <p className="text-sm text-gray-500">
            まだソウルメイト候補が見つかっていません。
            もう少しポストしたり、キャラ診断を進めてみてください。
          </p>
        )}

        {!loading && !error && soulmates.length > 0 && (
          <ul className="mt-3 space-y-3">
            {soulmates.map((s) => {
              const href = s.handle
                ? `/u/${encodeURIComponent(s.handle)}`
                : `/u/${s.user_id}`;
              const name =
                s.display_name || s.handle || s.user_id.slice(0, 8);

              return (
                <li
                  key={s.user_id + ":" + s.persona_key}
                  className="flex items-center gap-3 border rounded-lg p-3 hover:bg-pink-50/40 transition"
                >
                  {/* アイコン */}
                  <Link href={href} className="flex-shrink-0">
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
                      <div className="text-xs text-gray-500">@{s.handle}</div>
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
