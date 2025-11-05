// apps/web/src/app/dashboard/page.tsx
"use client";

import { useEffect, useState } from "react";
// 関数を supabase という名前で受ける（※関数なので呼び出しは supabase()）
import { supabaseClient as supabase } from "@/lib/supabase/client";

type Persona = {
  user_id: string;
  persona_key: string;
  title: string | null;
  icon: string | null;
  score: number;        // 0..1
  confidence: number;   // 0..1
  updated_at: string;
};

// モジュール読み込み時に 1 回だけ生成して共有（レンダー毎に増えない）
const sb = supabase();

export default function DashboardPage() {
  const [p, setP]   = useState<Persona | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);

  async function fetchPersona() {
    setErr(null);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { location.href = "/login?next=/dashboard"; return; }
    const { data, error } = await sb
      .from("v_user_persona")
      .select("user_id,persona_key,title,icon,score,confidence,updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) setErr(error.message);
    setP((data as Persona) ?? null);
  }

  // 初期ロード
  useEffect(() => { void fetchPersona(); }, []);

  // Realtime: 自分の user_personas 行の更新を購読して即時反映
  useEffect(() => {
    let ch: ReturnType<typeof sb.channel> | null = null;
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      ch = sb
        .channel(`persona-${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "user_personas", filter: `user_id=eq.${user.id}` },
          () => { void fetchPersona(); }
        )
        .subscribe();
    })();
    return () => { if (ch) sb.removeChannel(ch); };
  }, []);

  async function recompute() {
    setBusy(true);
    try {
      await fetch("/api/persona/recompute", { method: "POST" });
      await fetchPersona();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">ダッシュボード</h1>
        <button
          onClick={recompute}
          disabled={busy}
          className="px-3 py-1 rounded border bg-gray-50 disabled:opacity-50"
        >
          {busy ? "再評価中…" : "キャラを再評価"}
        </button>
      </div>

      <section className="rounded border bg-white p-4">
        <h2 className="font-medium mb-3">あなたのキャラ</h2>
        {err && <div className="text-sm text-red-600">{err}</div>}

        {!p ? (
          <div className="text-sm opacity-70">
            まだキャラがありません。<button onClick={recompute} className="underline">再評価する</button>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full border bg-white flex items-center justify-center text-xl">
              {p.icon ?? "🧩"}
            </div>
            <div>
              <div className="text-lg font-semibold">{p.title ?? p.persona_key}</div>
              <div className="text-sm opacity-70">
                スコア {(p.score * 100).toFixed(0)}% / 信頼度 {(p.confidence * 100).toFixed(0)}%・更新 {new Date(p.updated_at).toLocaleString()}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* TODO: 自分の投稿一覧をここに配置（既存の PostCard リストを流用） */}
    </div>
  );
}
