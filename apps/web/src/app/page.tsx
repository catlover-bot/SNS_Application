"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import PostCard from "@/components/PostCard";

type Post = {
  id: string;
  created_at: string;
  author?: string | null;
  text?: string | null;
  score?: number | null;
};

const PAGE = 20;

export default function Home() {
  const [items, setItems] = useState<Post[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const idsRef = useRef<Set<string>>(new Set());
  const sentinel = useRef<HTMLDivElement>(null);

  const appendUnique = useCallback((incoming: Post[]) => {
    setItems((prev) => {
      const out = [...prev];
      for (const p of incoming) {
        const key = p.id ?? `${p.created_at}-${p.author ?? ""}`;
        if (!idsRef.current.has(key)) {
          idsRef.current.add(key);
          out.push(p);
        }
      }
      return out;
    });
  }, []);

  const fetchPage = useCallback(
    async (nextPage: number) => {
      if (isLoading || !hasMore) return;
      setIsLoading(true);
      setErrorMsg(null);

      const from = nextPage * PAGE;
      const to = from + PAGE - 1;

      // 1st: 推奨ビュー
      const res = await supabase.from("feed_latest").select("*").range(from, to);

      if (res.error) {
        // 2nd: フォールバック（posts を時系列で）
        const fb = await supabase
          .from("posts")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, to);

        if (fb.error) {
          setErrorMsg(fb.error.message ?? "フィードの取得に失敗しました");
          setIsLoading(false);
          return;
        }

        const got = (fb.data ?? []) as Post[];
        appendUnique(got);
        setHasMore(got.length === PAGE);
        setIsLoading(false);
        return;
      }

      const got = (res.data ?? []) as Post[];
      appendUnique(got);
      setHasMore(got.length === PAGE);
      setIsLoading(false);
    },
    [appendUnique, hasMore, isLoading]
  );

  // 初回ロード
  useEffect(() => {
    fetchPage(0);
  }, [fetchPage]);

  // 無限スクロール
  useEffect(() => {
    if (!sentinel.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          const n = page + 1;
          setPage(n);
          fetchPage(n);
        }
      },
      { rootMargin: "300px 0px" } // 余裕を持って読み込む & 発火の暴走を軽減
    );
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [page, hasMore, isLoading, fetchPage]);

  if (errorMsg) {
    return (
      <div className="space-y-3">
        <p className="text-red-600">{errorMsg}</p>
        <a href="/compose" className="underline">
          まずは最初の投稿を作ってみる
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <div className="opacity-70">
          まだ投稿がありません。<a className="underline" href="/compose">最初の投稿を作る</a>
        </div>
      )}

      {/* key 重複の保険：id が無ければ created_at+author */}
      {items.map((p) => (
        <PostCard key={p.id ?? `${p.created_at}-${p.author ?? ""}`} p={p} />
      ))}

      <div ref={sentinel} className="h-12" />
      {isLoading && <div className="text-center py-6 opacity-60">読み込み中…</div>}
      {!hasMore && items.length > 0 && (
        <div className="text-center py-6 opacity-60">すべて読み込みました</div>
      )}
    </div>
  );
}
