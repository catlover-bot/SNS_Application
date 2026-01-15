// apps/web/src/app/following/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseClient as supabase } from "@/lib/supabase/client";
import PostCard from "@/components/PostCard";

type Row = {
  id: string;
  created_at: string;
  [k: string]: any; // 必要に応じて拡張
};

export default function Following() {
  // ✅ Supabase クライアントを1度だけ生成
  const sb = useMemo(() => supabase(), []);

  const [items, setItems] = useState<Row[]>([]);
  const [needLogin, setNeedLogin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data: { user } } = await sb.auth.getUser();

      if (!user) {
        if (alive) {
          setNeedLogin(true);
          setItems([]);
          setLoading(false);
        }
        return;
      }

      const { data, error } = await sb
        .from("feed_following")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (!alive) return;

      if (error) {
        console.error(error);
        setItems([]);
      } else {
        setItems((data ?? []) as Row[]);
      }
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [sb]);

  if (needLogin) {
    return (
      <div className="space-y-3 p-6">
        <p>フォロー中のフィードを見るにはログインが必要です。</p>
        <Link href="/login?next=/following" className="border rounded px-4 py-2 inline-block">
          ログイン
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-6">
      {loading && <div className="opacity-60 text-sm">読み込み中…</div>}
      {!loading && items.length === 0 && (
        <div className="opacity-60 text-sm">フォロー中の投稿はまだありません。</div>
      )}
      {items.map((p) => (
        <PostCard key={p.id} p={p} />
      ))}
    </div>
  );
}
