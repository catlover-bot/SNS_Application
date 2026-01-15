// apps/web/src/app/search/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import PostCard from "@/components/PostCard";
import { supabaseClient as supabase } from "@/lib/supabase/client";

type Row = {
  id: string;
  created_at: string;
  author: string;
  text: string;
  arche_key?: string | null;
};

export default function Search() {
  // ← ここで Supabase クライアントを1回だけ生成
  const sb = useMemo(() => supabase(), []);

  const [q, setQ] = useState("");
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;

    const run = async () => {
      const query = q.trim();
      if (query.length === 0) {
        setItems([]);
        setErr(null);
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
          setErr(error.message ?? "検索に失敗しました");
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
  }, [q, sb]);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold">検索</h1>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="投稿本文を検索…"
        className="w-full border rounded-lg px-3 py-2"
      />

      {err && <div className="text-sm text-red-600 border rounded p-3 bg-red-50">{err}</div>}
      {loading && <div className="opacity-60">検索中…</div>}
      {!loading && !err && q.trim() !== "" && items.length === 0 && (
        <div className="opacity-60 text-sm">該当する投稿は見つかりませんでした。</div>
      )}

      <div className="space-y-3">
        {items.map((p) => (
          <PostCard key={p.id ?? `${p.created_at}-${p.author ?? ""}`} p={p} />
        ))}
      </div>
    </div>
  );
}
