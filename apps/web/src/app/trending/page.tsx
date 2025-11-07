// apps/web/src/app/trending/page.tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import PostCard from "@/components/PostCard";

type Post = {
  id: string;
  created_at: string;
  author?: string | null;
  text?: string | null;
  body?: string | null;
  score?: number | null;

  author_handle?: string | null;
  author_display?: string | null;
  author_avatar?: string | null;
  reply_count?: number | null;
  arche_key?: string | null;
};

type ApiResp = { persona_key?: string | null; items: Post[] };

const PAGE = 20;

export default function Trending() {
  const [items, setItems] = useState<Post[]>([]);
  const [personaKey, setPersonaKey] = useState<string | null | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errmsg, setErrmsg] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(
    async (append: boolean) => {
      if (isLoading || (!append && items.length > 0)) return;

      setIsLoading(true);
      setErrmsg(null);

      const lastISO = append && items.length > 0 ? items[items.length - 1].created_at : undefined;
      const qs = new URLSearchParams({ limit: String(PAGE) });
      if (lastISO) qs.set("since", lastISO);

      try {
        const res = await fetch(`/api/trending?${qs.toString()}`, { cache: "no-store" });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`failed: ${res.status} ${body}`);
        }
        const json = (await res.json()) as ApiResp;
        if (personaKey === undefined) setPersonaKey(json.persona_key ?? null); // 初回だけセット

        const got = json.items ?? [];
        setItems((prev) => (append ? [...prev, ...got] : got));
        setHasMore(got.length === PAGE);
      } catch (e: any) {
        setErrmsg(e?.message ?? "トレンドの取得に失敗しました。");
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, items, personaKey]
  );

  // 初回
  useEffect(() => {
    fetchPage(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 無限スクロール
  useEffect(() => {
    if (!sentinel.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) fetchPage(true);
      },
      { rootMargin: "300px 0px" }
    );
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [fetchPage, hasMore, isLoading]);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">トレンド（あなた向け）</h1>
        {personaKey !== undefined && (
          <span className="text-xs px-2 py-1 rounded-full border bg-white">
            {personaKey ? `キャラ一致: @${personaKey}` : "汎用トレンド"}
          </span>
        )}
      </div>

      {errmsg && <div className="text-sm text-red-600 border bg-red-50 rounded p-3">{errmsg}</div>}

      {items.length === 0 && !isLoading && !errmsg && (
        <div className="opacity-70 text-sm">おすすめ投稿がまだありません。</div>
      )}

      <div className="space-y-3">
        {items.map((p) => (
          <PostCard key={p.id ?? `${p.created_at}-${p.author ?? ""}`} p={p} />
        ))}
      </div>

      <div ref={sentinel} className="h-10" />
      {isLoading && <div className="opacity-60 text-center py-6">読み込み中…</div>}
      {!hasMore && items.length > 0 && (
        <div className="opacity-60 text-center py-6">すべて読み込みました</div>
      )}
    </div>
  );
}
