// apps/web/src/app/page.tsx
"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseClient as supabase } from "@/lib/supabase/client";
import PostCard from "@/components/PostCard";

type Post = {
  id: string;
  created_at: string;
  author?: string | null;
  text?: string | null;
  score?: number | null;
};

const PAGE = 20;
const TIMELINE_ERROR =
  "タイムラインを読み込めませんでした。通信状態を確認して、もう一度お試しください。";

export default function Home() {
  const configured = isSupabaseConfigured();
  // ✅ Supabase クライアントを1度だけ生成
  const sb = useMemo(() => (configured ? supabase() : null), [configured]);

  const [items, setItems] = useState<Post[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [authLinkExpired, setAuthLinkExpired] = useState(false);
  const idsRef = useRef<Set<string>>(new Set());
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setAuthLinkExpired(params.get("error_code") === "otp_expired");
  }, []);

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
      if (!sb) {
        setErrorMsg("データサービスの設定が完了していないため、タイムラインを読み込めません。");
        return;
      }
      setIsLoading(true);
      setErrorMsg(null);

      const from = nextPage * PAGE;
      const to = from + PAGE - 1;

      // 1st: materialized/feed view
      const res = await sb.from("feed_latest").select("*").range(from, to);

      if (res.error) {
        // Fallback: posts の新着
        const fb = await sb
          .from("posts")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, to);

        if (fb.error) {
          setErrorMsg(TIMELINE_ERROR);
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
    [appendUnique, hasMore, isLoading, sb]
  );

  useEffect(() => {
    fetchPage(0);
  }, [fetchPage]);

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
      { rootMargin: "300px 0px" }
    );
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [page, hasMore, isLoading, fetchPage]);

  const retry = () => {
    setPage(0);
    setHasMore(true);
    setItems([]);
    idsRef.current.clear();
    void fetchPage(0);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {authLinkExpired && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          メールの確認リンクは期限が切れているか、すでに使用されています。
          <a href="/login" className="ml-1 underline">
            ログイン画面からもう一度お試しください。
          </a>
        </div>
      )}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid gap-4 p-5 md:grid-cols-[1.4fr_0.8fr] md:p-6">
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              Persona-based SNS
            </div>
            <h1 className="text-3xl font-bold leading-tight text-slate-950">
              投稿するほど、あなたの恐竜キャラが育つ。
            </h1>
            <p className="text-sm leading-6 text-slate-600">
              PersonaLens は、投稿のクセをAIが読み取り、そのシグナルの積み重ねからあなた自身の恐竜キャラが育つSNSです。
              まじめな事実確認ではなく、言葉のクセを遊びながら楽しめます。
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href="/login?next=%2Fcompose"
                className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                ログインして投稿する
              </a>
              <a
                href="/personas"
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
              >
                恐竜図鑑を見る
              </a>
              <a
                href="/trending"
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
              >
                トレンドを見る
              </a>
            </div>
          </div>
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
            <div className="text-sm font-semibold text-blue-950">3ステップでキャラが育つ</div>
            <div className="mt-3 space-y-3 text-sm text-blue-950">
              {[
                ["1", "投稿する", "近況や気づきを、いつもの言葉で書くだけ。"],
                ["2", "AIが投稿のクセを判定", "4つのスコアと理由・タグで雰囲気を見える化。"],
                ["3", "あなたの恐竜キャラが育つ", "投稿ごとのシグナルと反応が積み重なり、キャラスコアが少しずつ変化。"],
              ].map(([number, title, body]) => (
                <div key={number} className="flex gap-3 rounded-lg border border-blue-100 bg-white/80 p-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 font-bold text-white">
                    {number}
                  </span>
                  <div>
                    <div className="font-semibold">{title}</div>
                    <p className="mt-0.5 text-xs leading-5 text-blue-800">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {errorMsg && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <div className="font-medium">タイムラインを表示できませんでした</div>
          <p className="mt-1">{errorMsg}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-3 rounded-full border border-rose-200 bg-white px-3 py-1.5 text-sm text-rose-800 hover:bg-rose-100"
          >
            もう一度読み込む
          </button>
        </div>
      )}

      {!errorMsg && items.length === 0 && !isLoading && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
          <div className="font-semibold text-slate-900">まだ投稿がありません</div>
          <p className="mt-1">
            最初の投稿の文体やムードが、あなたのキャラ成長を始めるシグナルになります。
          </p>
          <a className="mt-3 inline-flex rounded-full bg-blue-600 px-4 py-2 text-white hover:bg-blue-700" href="/compose">
            最初の投稿を作る
          </a>
        </div>
      )}

      {items.map((p) => (
        <PostCard key={p.id ?? `${p.created_at}-${p.author ?? ""}`} p={p} />
      ))}
      <div ref={sentinel} className="h-12" />
      {isLoading && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-center text-sm text-slate-500">
          タイムラインを読み込み中…
        </div>
      )}
      {!hasMore && items.length > 0 && (
        <div className="py-6 text-center text-sm text-slate-500">すべて読み込みました</div>
      )}
    </div>
  );
}
