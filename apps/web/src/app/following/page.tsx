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
