// apps/web/src/app/search/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import PostCard from "@/components/PostCard";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseClient as supabase } from "@/lib/supabase/client";

type Row = {
  id: string;
  created_at: string;
  author: string;
  text: string;
  arche_key?: string | null;
};

export default function Search() {
  const configured = isSupabaseConfigured();
  // ← ここで Supabase クライアントを1回だけ生成
  const sb = useMemo(() => (configured ? supabase() : null), [configured]);

  const [q, setQ] = useState("");
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const initial = new URLSearchParams(window.location.search).get("q");
    if (initial) setQ(initial);
  }, []);

  useEffect(() => {
    let stop = false;

    const run = async () => {
      const query = q.trim();
      if (query.length === 0) {
        setItems([]);
        setErr(null);
        return;
      }
      if (!sb) {
        setErr("データサービスの設定が完了していないため、検索を利用できません。");
        setItems([]);
        return;
      }
      setLoading(true);
      setErr(null);
      try {
        const { data, error } = await sb
          .from("posts")
          .select("id, created_at, author, text, arche_key")
          .ilike("text", `%${query}%`)
          .order("created_at", { ascending: false })
          .limit(50);

        if (stop) return;
        if (error) {
          setErr("検索に失敗しました。時間をおいてもう一度お試しください。");
          setItems([]);
        } else {
          setItems((data ?? []) as Row[]);
        }
      } finally {
        if (!stop) setLoading(false);
      }
    };

    const t = setTimeout(run, 300); // 簡易デバウンス
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [q, retryNonce, sb]);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <header className="rounded-xl border bg-white p-4">
        <h1 className="text-2xl font-bold">検索</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          気になる言葉、キャラの口ぐせ、話題の断片から投稿を探せます。
        </p>
      </header>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="投稿本文を検索…"
        className="w-full border rounded-lg px-3 py-2"
      />

      {err && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <div>{err}</div>
          <button type="button" className="mt-2 underline" onClick={() => setRetryNonce((n) => n + 1)}>
            再検索する
          </button>
        </div>
      )}
      {loading && <div className="rounded-lg border bg-white p-4 text-sm text-slate-500">検索中…</div>}
      {!loading && !err && q.trim() === "" && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
          キーワードを入力すると、投稿本文から一致するものを探します。
        </div>
      )}
      {!loading && !err && q.trim() !== "" && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
          該当する投稿は見つかりませんでした。言葉を短くするか、別の表現で試してみてください。
        </div>
      )}

      <div className="space-y-3">
        {items.map((p) => (
          <PostCard key={p.id ?? `${p.created_at}-${p.author ?? ""}`} p={p} />
        ))}
      </div>
    </div>
  );
}
