// apps/web/src/app/following/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const [openedIds, setOpenedIds] = useState<Record<string, true>>({});
  const openStateRequestedIds = useRef<Set<string>>(new Set());
  const persistedOpenedIds = useRef<Set<string>>(new Set());

  const freshItems = useMemo(() => items.filter((x) => !openedIds[x.id]), [items, openedIds]);
  const pastItems = useMemo(() => items.filter((x) => !!openedIds[x.id]), [items, openedIds]);

  const hydrateOpenedState = useCallback(async (postIds: string[]) => {
    const unique = Array.from(new Set(postIds.map((x) => String(x ?? "").trim()).filter(Boolean)));
    if (unique.length === 0) return;
    const missing = unique.filter((x) => !openStateRequestedIds.current.has(x));
    if (missing.length === 0) return;
    missing.forEach((x) => openStateRequestedIds.current.add(x));

    try {
      const params = new URLSearchParams();
      params.set("postIds", missing.join(","));
      const res = await fetch(`/api/me/post-open-state?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = await res.json().catch(() => null);
      const opened = Array.isArray(json?.openedIds)
        ? json.openedIds.map((x: any) => String(x ?? "").trim()).filter(Boolean)
        : [];
      if (opened.length === 0) return;
      opened.forEach((x) => persistedOpenedIds.current.add(x));
      setOpenedIds((prev) => {
        const next = { ...prev };
        opened.forEach((x) => {
          next[x] = true;
        });
        return next;
      });
    } catch {
      // ignore
    }
  }, []);

  const persistOpenedState = useCallback(async (postId: string) => {
    try {
      const res = await fetch("/api/me/post-open-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId,
          source: "following_feed",
        }),
      });
      if (!res.ok) {
        persistedOpenedIds.current.delete(postId);
      }
    } catch {
      persistedOpenedIds.current.delete(postId);
    }
  }, []);

  const markOpened = useCallback(
    (postId: string) => {
      const id = String(postId ?? "").trim();
      if (!id) return;
      setOpenedIds((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
      if (persistedOpenedIds.current.has(id)) return;
      persistedOpenedIds.current.add(id);
      void persistOpenedState(id);
    },
    [persistOpenedState]
  );

  useEffect(() => {
    let alive = true;

    (async () => {
      setError(null);
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
        setItems([]);
        setError("フォロー中フィードを読み込めませんでした。時間をおいてもう一度お試しください。");
      } else {
        const rows = (data ?? []) as Row[];
        setItems(rows);
        void hydrateOpenedState(rows.map((x) => x.id));
      }
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [hydrateOpenedState, sb]);

  if (needLogin) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 rounded-xl border bg-white p-6">
        <h1 className="text-2xl font-bold">フォロー中</h1>
        <p className="text-sm text-slate-600">フォローした人の投稿をまとめて見るにはログインが必要です。</p>
        <Link href="/login?next=/following" className="inline-block rounded-full bg-slate-950 px-4 py-2 text-sm text-white">
          ログイン
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <header className="rounded-xl border bg-white p-4">
        <h1 className="text-2xl font-bold">フォロー中</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          気になる人をフォローすると、その人の投稿がここに集まります。
        </p>
      </header>
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      {loading && <div className="rounded-lg border bg-white p-4 text-sm text-slate-500">読み込み中…</div>}
      {!loading && !error && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
          <div className="font-semibold text-slate-900">フォロー中の投稿はまだありません</div>
          <p className="mt-1">検索やキャラ別タイムラインから気になる人を見つけてみましょう。</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/search" className="rounded-full border border-slate-200 bg-white px-4 py-2 hover:bg-slate-50">
              検索する
            </Link>
            <Link href="/persona-feed" className="rounded-full bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
              キャラ別TLへ
            </Link>
          </div>
        </div>
      )}
      {freshItems.length > 0 && (
        <section className="space-y-2 rounded-xl border bg-white p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">新着</h2>
            <span className="text-xs rounded-full border bg-amber-50 border-amber-200 px-2 py-0.5">
              {freshItems.length}
            </span>
          </div>
          {freshItems.map((p) => (
            <div key={p.id} className="space-y-1">
              <div className="text-xs">
                <a
                  href={`/p/${encodeURIComponent(p.id)}`}
                  onClick={() => markOpened(p.id)}
                  className="underline"
                >
                  投稿を開く
                </a>
              </div>
              <PostCard p={p} />
            </div>
          ))}
        </section>
      )}
      {pastItems.length > 0 && (
        <section className="space-y-2 rounded-xl border bg-white p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">過去</h2>
            <span className="text-xs rounded-full border bg-gray-50 px-2 py-0.5">
              {pastItems.length}
            </span>
          </div>
          {pastItems.map((p) => (
            <div key={p.id} className="space-y-1">
              <div className="text-xs">
                <a
                  href={`/p/${encodeURIComponent(p.id)}`}
                  onClick={() => markOpened(p.id)}
                  className="underline"
                >
                  投稿を開く
                </a>
              </div>
              <PostCard p={p} />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
