"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { applyAsyncListPageMerge } from "@sns/core";
import PostCard from "@/components/PostCard";
import { fetchSavedPostsPage } from "@/lib/socialDataClient";
import { useSavedState } from "@/lib/useSocialListState";

type SavedItem = {
  id: string;
  created_at: string;
  text?: string | null;
  body?: string | null;
  author?: string | null;
  author_handle?: string | null;
  author_display?: string | null;
  author_avatar?: string | null;
  score?: number | null;
  reply_count?: number | null;
  analysis?: any;
  save_meta?: {
    collection_key: string;
    collection_label: string;
    saved_at: string;
  };
};

type CollectionSummary = {
  key: string;
  label: string;
  count: number;
  lastSavedAt?: string | null;
};

const PAGE = 24;

export default function SavedPostsPage() {
  const [savedState, savedActions] = useSavedState<SavedItem>({ hasMore: true, items: [] });
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string>("all");
  const [available, setAvailable] = useState(true);
  const items = savedState.items;
  const offset = savedState.offset;
  const hasMore = savedState.hasMore;
  const loading = savedState.loading;
  const error = savedState.error;

  const selectedCollectionLabel = useMemo(() => {
    if (selectedCollection === "all") return "すべて";
    return collections.find((c) => c.key === selectedCollection)?.label ?? selectedCollection;
  }, [collections, selectedCollection]);

  const loadSaved = useCallback(
    async (args?: { reset?: boolean; collection?: string; offsetOverride?: number }) => {
      if (loading) return;
      const reset = Boolean(args?.reset);
      const collection = args?.collection ?? selectedCollection;
      const nextOffset =
        typeof args?.offsetOverride === "number" ? Math.max(0, args.offsetOverride) : reset ? 0 : offset;
      savedActions.start(reset);
      try {
        const { res, json } = await fetchSavedPostsPage({
          limit: PAGE,
          offset: nextOffset,
          collection,
        });
        if (!res.ok) throw new Error(json?.error ?? "保存一覧の取得に失敗しました");
        setAvailable(json?.available !== false);
        setCollections(Array.isArray(json?.collections) ? json.collections : []);
        const rows = Array.isArray(json?.items) ? (json.items as SavedItem[]) : [];
        const merged = applyAsyncListPageMerge(
          reset ? [] : items,
          rows,
          (x) => String(x?.id ?? ""),
          reset
        );
        const hasMoreNext = Boolean(json?.page?.hasMore) && rows.length > 0;
        savedActions.replace(merged, {
          hasMore: hasMoreNext,
          offset: nextOffset + rows.length,
        });
      } catch (e: any) {
        savedActions.fail(e?.message ?? "保存一覧の取得に失敗しました");
      }
    },
    [items, loading, offset, savedActions, selectedCollection]
  );

  useEffect(() => {
    void loadSaved({ reset: true, collection: selectedCollection, offsetOverride: 0 });
    // collection切替時のみリロード
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCollection]);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">保存 / コレクション</h1>
        <p className="text-sm opacity-70">
          後で読む・ネタ帳・研究などで整理して、再訪しやすくします。
        </p>
      </header>

      {!available && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          コレクションDBが未適用です。`docs/sql/saved_post_collections.sql` を適用すると保存先の管理が有効になります。
        </div>
      )}

      <section className="rounded-xl border bg-white p-3 space-y-2">
        <div className="text-sm font-semibold">コレクション</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`px-3 py-1 rounded-full border text-sm ${
              selectedCollection === "all" ? "bg-slate-900 text-white border-slate-900" : "bg-white"
            }`}
            onClick={() => {
              setSelectedCollection("all");
              savedActions.reset();
            }}
          >
            すべて
          </button>
          {collections.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`px-3 py-1 rounded-full border text-sm ${
                selectedCollection === c.key ? "bg-blue-600 text-white border-blue-600" : "bg-white"
              }`}
              onClick={() => {
                setSelectedCollection(c.key);
                savedActions.reset();
              }}
            >
              {c.label} ({c.count})
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">{selectedCollectionLabel}</div>
          <button
            type="button"
            className="text-sm underline"
            onClick={() => {
              savedActions.reset();
              void loadSaved({ reset: true, collection: selectedCollection, offsetOverride: 0 });
            }}
            disabled={loading}
          >
            {loading ? "更新中…" : "更新"}
          </button>
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}
        {!loading && items.length === 0 && !error && (
          <div className="rounded-xl border bg-white p-4 text-sm opacity-70">
            保存した投稿はまだありません。
          </div>
        )}

        {items.map((p) => (
          <div key={`saved-${p.id}`} className="space-y-1">
            {p.save_meta?.saved_at ? (
              <div className="text-xs opacity-60 px-1">
                保存: {new Date(p.save_meta.saved_at).toLocaleString("ja-JP")}
                {p.save_meta?.collection_label ? ` / ${p.save_meta.collection_label}` : ""}
              </div>
            ) : null}
            <PostCard p={p} />
          </div>
        ))}

        <div className="py-2 flex justify-center">
          <button
            type="button"
            onClick={() =>
              void loadSaved({ reset: false, collection: selectedCollection, offsetOverride: offset })
            }
            disabled={loading || !hasMore}
            className="px-4 py-2 rounded-lg border bg-white disabled:opacity-50"
          >
            {loading ? "読み込み中…" : hasMore ? "もっと読む" : "これ以上ありません"}
          </button>
        </div>
      </section>
    </div>
  );
}
