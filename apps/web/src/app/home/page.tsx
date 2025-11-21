"use client";

import { useEffect, useState } from "react";

type FeedItem = {
  id: string;
  created_at: string;
  text?: string | null;
  arche_key?: string | null;
};

const PAGE = 20;

export default function HomeFeed() {
  const [pages, setPages] = useState<FeedItem[][]>([]);
  const [loading, setLoading] = useState(false);
  const [ended, setEnded] = useState(false);
  const items = pages.flat();

  async function loadMore() {
    if (loading || ended) return;
    setLoading(true);

    const lastISO = items.length ? items[items.length - 1].created_at : undefined;
    const qs = new URLSearchParams({ limit: String(PAGE) });
    if (lastISO) qs.set("since", lastISO);

    try {
      const res = await fetch(`/api/feed?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json();
      const got: FeedItem[] = json?.items ?? [];

      setPages((prev) => [...prev, got]);
      if (got.length < PAGE) setEnded(true);
    } catch {
      // 失敗しても落とさない
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // 初回ロード
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-3">
      {items.map((p) => (
        <article key={p.id} className="rounded-xl border p-3 bg-white">
          <div className="text-xs opacity-60">{new Date(p.created_at).toLocaleString()}</div>
          <p className="whitespace-pre-wrap">{p.text}</p>

          {p.arche_key && (
            <a
              href={`/personas/${encodeURIComponent(p.arche_key)}`}
              className="inline-flex items-center gap-1 text-xs mt-2 px-2 py-0.5 rounded-full border bg-gray-50 hover:bg-gray-100"
              title={`@${p.arche_key}`}
            >
              <span>キャラ</span>
              <span className="opacity-70">@{p.arche_key}</span>
            </a>
          )}
        </article>
      ))}

      <div className="py-4 flex justify-center">
        <button
          onClick={loadMore}
          className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-50"
          disabled={loading || ended}
          type="button"
        >
          {loading ? "読み込み中…" : ended ? "これ以上はありません" : "もっと読む"}
        </button>
      </div>
    </div>
  );
}
