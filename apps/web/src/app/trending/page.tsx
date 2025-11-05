"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import PostCard from "@/components/PostCard";

type Post = {
  id: string;
  created_at: string;
  author: string;
  text: string;
  arche_key?: string | null;
  score?: number | null;
};

const PAGE = 20;

export default function TrendingPage() {
  const [items, setItems] = useState<Post[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);
  // 追加済みキーを保持して重複挿入を防止
  const seenRef = useRef<Set<string>>(new Set());

  // 一意キー（将来 id が欠けても衝突しにくいようにフォールバック）
  const keyOf = (p: Post) => p.id ?? `${p.created_at}-${p.author ?? ""}`;

  // 重複を足さない append
  const appendUnique = useCallback((arr: Post[]) => {
    if (!arr?.length) return;
    setItems((prev) => {
      const out = [...prev];
      for (const p of arr) {
        const k = keyOf(p);
        if (!seenRef.current.has(k)) {
          seenRef.current.add(k);
          out.push(p);
        }
      }
      return out;
    });
  }, []);

  const fetchPage = useCallback(
    async (nextPage: number) => {
      if (loading || !hasMore) return;
      setLoading(true);
      setErrorMsg(null);

      const limit = PAGE;
      const offset = nextPage * PAGE;

      try {
        // BFF を叩く（フロントは軽く）
        const res = await fetch(`/api/trending?limit=${limit}&offset=${offset}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(t || `failed: ${res.status}`);
        }
        const data = (await res.json()) as Post[];
        appendUnique(data);
        setHasMore(data.length === PAGE);
      } catch (e: any) {
        setErrorMsg(String(e?.message ?? e));
      } finally {
        setLoading(false);
      }
    },
    [appendUnique, loading, hasMore]
  );

  // 初回ロード
  useEffect(() => {
    // 念のため初期化（再訪時の重複を避けたい場合）
    seenRef.current.clear();
    setItems([]);
    setPage(0);
    setHasMore(true);
    fetchPage(0);
  }, [fetchPage]);

  // 無限スクロール
  useEffect(() => {
    if (!sentinelRef.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          const n = page + 1;
          setPage(n);
          fetchPage(n);
        }
      },
      { rootMargin: "300px 0px" }
    );
    io.observe(sentinelRef.current);
    return () => io.disconnect();
  }, [page, hasMore, loading, fetchPage]);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold mb-2">トレンド</h1>

      {errorMsg && (
        <div className="text-red-600 text-sm border rounded p-3 bg-red-50">
          {errorMsg}
        </div>
      )}

      {items.length === 0 && !loading && !errorMsg && (
        <div className="opacity-70 text-sm">まだトレンド投稿がありません。</div>
      )}

      {items.map((p) => (
        <PostCard key={keyOf(p)} p={p} />
      ))}

      <div ref={sentinelRef} className="h-12" />
      {loading && <div className="text-center py-6 opacity-60">読み込み中…</div>}
      {!hasMore && items.length > 0 && (
        <div className="text-center py-6 opacity-60">すべて読み込みました</div>
      )}
    </div>
  );
}
