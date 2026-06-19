"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseClient as supabase } from "@/lib/supabase/client";
import PostCard from "@/components/PostCard";
import Replies from "@/components/Replies";

type PostRow = {
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
};

const POST_DETAIL_ERROR =
  "投稿を読み込めませんでした。投稿が削除されたか、通信が一時的に不安定な可能性があります。";

export default function PostDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const configured = isSupabaseConfigured();
  const sb = useMemo(() => (configured ? supabase() : null), [configured]);

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<PostRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prevId, setPrevId] = useState<string | null>(null);
  const [nextId, setNextId] = useState<string | null>(null);
  const [neighborsLoading, setNeighborsLoading] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const fetchPost = useCallback(async () => {
    if (!id) return;
    if (!sb) {
      setLoading(false);
      setError("データサービスの設定が完了していないため、投稿を読み込めません。");
      return;
    }
    setLoading(true);
    setError(null);
    setPrevId(null);
    setNextId(null);

    try {
      const enriched = await sb
        .from("v_posts_enriched")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (enriched.data) {
        setItem(enriched.data as PostRow);
        return;
      }

      const raw = await sb
        .from("posts")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (raw.error) {
        throw raw.error;
      }

      setItem((raw.data as PostRow | null) ?? null);
    } catch {
      setError(POST_DETAIL_ERROR);
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, [id, sb]);

  const fetchNeighbors = useCallback(
    async (row: PostRow | null) => {
      if (!row?.created_at) {
        setPrevId(null);
        setNextId(null);
        return;
      }
      setNeighborsLoading(true);
      try {
        const [newer, older] = await Promise.all([
          sb
            .from("posts")
            .select("id,created_at")
            .gt("created_at", row.created_at)
            .order("created_at", { ascending: true })
            .limit(1),
          sb
            .from("posts")
            .select("id,created_at")
            .lt("created_at", row.created_at)
            .order("created_at", { ascending: false })
            .limit(1),
        ]);

        const newerId = (newer.data?.[0]?.id as string | undefined) ?? null;
        const olderId = (older.data?.[0]?.id as string | undefined) ?? null;
        setPrevId(newerId);
        setNextId(olderId);
      } catch {
        setPrevId(null);
        setNextId(null);
      } finally {
        setNeighborsLoading(false);
      }
    },
    [sb]
  );

  useEffect(() => {
    void fetchPost();
  }, [fetchPost]);

  useEffect(() => {
    void fetchNeighbors(item);
  }, [fetchNeighbors, item]);

  const moveToPost = useCallback(
    (postId: string | null) => {
      if (!postId || postId === id) return;
      router.push(`/p/${encodeURIComponent(postId)}`);
    },
    [id, router]
  );

  const movePrev = useCallback(() => {
    moveToPost(prevId);
  }, [moveToPost, prevId]);

  const moveNext = useCallback(() => {
    moveToPost(nextId);
  }, [moveToPost, nextId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        movePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        moveNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [moveNext, movePrev]);

  const onTouchStart = useCallback((e: any) => {
    const x = Number(e?.changedTouches?.[0]?.clientX ?? NaN);
    touchStartX.current = Number.isFinite(x) ? x : null;
  }, []);

  const onTouchEnd = useCallback(
    (e: any) => {
      const start = touchStartX.current;
      touchStartX.current = null;
      if (!Number.isFinite(start ?? NaN)) return;
      const end = Number(e?.changedTouches?.[0]?.clientX ?? NaN);
      if (!Number.isFinite(end)) return;
      const dx = end - (start as number);
      if (Math.abs(dx) < 70) return;
      if (dx < 0) {
        moveNext();
      } else {
        movePrev();
      }
    },
    [moveNext, movePrev]
  );

  if (!id) {
    return <div className="rounded-xl border bg-white p-6 text-sm text-slate-600">投稿を開けませんでした。</div>;
  }

  if (loading) {
    return <div className="rounded-xl border bg-white p-6 text-sm text-slate-600">投稿を読み込み中…</div>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        <div className="font-medium">投稿を表示できませんでした</div>
        <p className="mt-1">{error}</p>
        <button
          type="button"
          onClick={() => void fetchPost()}
          className="mt-3 rounded-full border border-rose-200 bg-white px-3 py-1.5 hover:bg-rose-100"
        >
          もう一度読み込む
        </button>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="rounded-xl border bg-white p-6 space-y-2">
        <div className="text-sm text-slate-600">この投稿は見つかりませんでした。</div>
        <a href="/" className="underline text-sm text-blue-700">
          タイムラインへ戻る
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <a href="/" className="underline text-sm">
        ← タイムラインへ戻る
      </a>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          onClick={movePrev}
          disabled={!prevId}
          className="px-2 py-1 rounded border bg-white disabled:opacity-40"
        >
          ← 前の投稿
        </button>
        <button
          type="button"
          onClick={moveNext}
          disabled={!nextId}
          className="px-2 py-1 rounded border bg-white disabled:opacity-40"
        >
          次の投稿 →
        </button>
        <span className="opacity-60">{neighborsLoading ? "前後投稿を探索中…" : "左右スワイプ/←→キーで移動"}</span>
      </div>
      <PostCard p={item} />
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">返信スレッド</h2>
        <Replies postId={item.id} />
      </section>
    </div>
  );
}
