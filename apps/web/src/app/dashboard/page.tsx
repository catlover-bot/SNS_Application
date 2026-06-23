// apps/web/src/app/dashboard/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import PostCard from "@/components/PostCard";
// 関数を supabase という名前で受ける（※関数なので呼び出しは supabase()）
import { supabaseClient as supabase } from "@/lib/supabase/client";
import { getPersonaProfile, personaDisplayName } from "@/lib/personaCatalog";

type Persona = {
  user_id: string;
  persona_key: string;
  title: string | null;
  icon: string | null;
  score: number;        // 0..1
  confidence: number;   // 0..1
  updated_at: string;
};

type PostRow = {
  id: string;
  created_at: string;
  [k: string]: any;
};

// モジュール読み込み時に 1 回だけ生成して共有（レンダー毎に増えない）
const sb = supabase();

export default function DashboardPage() {
  const [p, setP]   = useState<Persona | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);

  const fetchPersona = useCallback(async (): Promise<string | null> => {
    setErr(null);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { location.href = "/login?next=/dashboard"; return null; }
    const { data, error } = await sb
      .from("v_user_persona")
      .select("user_id,persona_key,title,icon,score,confidence,updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) setErr("キャラ情報を読み込めませんでした。時間をおいて再度お試しください。");
    setP((data as Persona) ?? null);
    return user.id;
  }, []);

  const fetchMyPosts = useCallback(async (userId: string) => {
    setLoadingPosts(true);

    // 優先: 表示情報を持つ view
    const enriched = await sb
      .from("v_posts_enriched")
      .select("*")
      .eq("author", userId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (!enriched.error && enriched.data) {
      setPosts(enriched.data as PostRow[]);
      setLoadingPosts(false);
      return;
    }

    // フォールバック: posts テーブル
    const raw = await sb
      .from("posts")
      .select("*")
      .eq("author", userId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (!raw.error && raw.data) {
      setPosts(raw.data as PostRow[]);
    } else {
      setPosts([]);
    }
    setLoadingPosts(false);
  }, []);

  // 初期ロード
  useEffect(() => {
    (async () => {
      const userId = await fetchPersona();
      if (userId) await fetchMyPosts(userId);
    })();
  }, [fetchPersona, fetchMyPosts]);

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
  }, [fetchPersona]);

  async function recompute() {
    setBusy(true);
    try {
      const res = await fetch("/api/personas/recompute", { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? "再評価に失敗しました");
      }
      if (!json?.ok) {
        throw new Error(json?.error ?? "再評価に失敗しました");
      }
      const userId = await fetchPersona();
      if (userId) await fetchMyPosts(userId);
      if (Array.isArray(json?.personas) && json.personas.length > 0 && json.persisted === false) {
        const top = json.personas[0] as {
          persona_key: string;
          score: number;
          confidence: number;
        };
        setP({
          user_id: userId ?? "me",
          persona_key: top.persona_key,
          title: personaDisplayName(top.persona_key),
          icon: null,
          score: Math.max(0, Math.min(1, Number(top.score ?? 0))),
          confidence: Math.max(0, Math.min(1, Number(top.confidence ?? 0))),
          updated_at: new Date().toISOString(),
        });
        setErr("保存済みのキャラ情報を更新できなかったため、投稿履歴から推定したキャラを表示しています。");
      } else {
        setErr(null);
      }
    } catch {
      setErr("キャラの再評価に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">My Persona</div>
            <h1 className="mt-1 text-2xl font-bold">ダッシュボード</h1>
            <p className="mt-2 text-sm text-slate-600">
              自分の投稿と現在のキャラ傾向をまとめて確認できます。
            </p>
          </div>
        <button
          onClick={recompute}
          disabled={busy}
          className="px-3 py-1 rounded border bg-gray-50 disabled:opacity-50"
        >
          {busy ? "再評価中…" : "キャラを再評価"}
        </button>
        </div>
      </div>

      <section className="rounded border bg-white p-4">
        <h2 className="font-medium mb-3">あなたのキャラ</h2>
        {err && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{err}</div>}

        {!p ? (
          <div className="text-sm opacity-70">
            まだキャラがありません。<button onClick={recompute} className="underline">再評価する</button>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full border bg-white flex items-center justify-center text-xl">
              {p.icon ?? "P"}
            </div>
            <div>
              <div className="text-lg font-semibold">{personaDisplayName(p.persona_key)}</div>
              <div className="text-xs text-blue-700">{getPersonaProfile(p.persona_key).title}</div>
              <div className="text-sm opacity-70">
                スコア {(p.score * 100).toFixed(0)}% / 信頼度 {(p.confidence * 100).toFixed(0)}%・更新 {new Date(p.updated_at).toLocaleString()}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded border bg-white p-4">
        <h2 className="font-medium mb-3">自分の投稿</h2>
        {loadingPosts ? (
          <div className="text-sm opacity-70">投稿を読み込み中…</div>
        ) : posts.length === 0 ? (
          <div className="text-sm opacity-70">
            まだ投稿がありません。<a href="/compose" className="underline">投稿する</a>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <PostCard key={post.id} p={post} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
