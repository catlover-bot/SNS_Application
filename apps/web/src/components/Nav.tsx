// apps/web/src/components/Nav.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient as supabase } from "@/lib/supabase/client";

export default function Nav() {
  const router = useRouter();

  // Supabase クライアントは1回だけ生成
  const sb = useMemo(() => supabase(), []);

  const [loggedIn, setLoggedIn] = useState(false);
  const [unread, setUnread] = useState(0);

  // 認証状態の監視
  useEffect(() => {
    let alive = true;

    // 1) 初期ユーザー取得
    sb.auth.getUser().then(({ data }) => {
      if (alive) setLoggedIn(!!data.user);
    });

    // 2) 認証状態の購読
    const { data: listener } = sb.auth.onAuthStateChange((_e, session) => {
      if (!alive) return;
      const isIn = !!session?.user;
      setLoggedIn(isIn);
      if (!isIn) setUnread(0); // サインアウト時は未読をクリア
    });

    return () => {
      alive = false;
      listener?.subscription?.unsubscribe();
    };
  }, [sb]);

  // 未読通知数のポーリング
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const fetchUnread = async () => {
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        if (!json?.items || stopped) return;
        const n = json.items.filter((x: any) => !x.read_at).length;
        setUnread(n);
      } catch {
        /* ネットワーク失敗時は無視（次のポーリングで回復） */
      }
    };

    // 即時 + 30秒ごと
    fetchUnread();
    timer = setInterval(fetchUnread, 30_000);

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, [loggedIn]); // ログイン状態が変わったら取り直し

  const signOut = async () => {
    await sb.auth.signOut();
    router.replace("/");
  };

  return (
    <header className="sticky top-0 bg-white/70 backdrop-blur z-40 border-b">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-4">
        <Link href="/" className="font-semibold">PersonaLens</Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/trending">トレンド</Link>
          <Link href="/search">検索</Link>
          <Link href="/messages">DM</Link>
          <Link href="/following">フォロー中</Link>
          <Link href="/compose">投稿</Link>

          {/* 通知（未読バッジ） */}
          <Link href="/notifications" className="relative inline-flex items-center">
            通知
            {unread > 0 && (
              <span
                className="ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5
                           text-xs rounded-full bg-red-600 text-white"
                aria-label={`未読 ${unread} 件`}
              >
                {unread}
              </span>
            )}
          </Link>

          <Link href="/dashboard">ダッシュボード</Link>
          <Link href="/settings/profile">プロフィール</Link>
          <Link href="/personas" className="font-medium underline">キャラ図鑑</Link>
        </nav>
        <div className="ml-auto">
          {loggedIn ? (
            <button className="px-3 py-1 border rounded" onClick={signOut}>
              ログアウト
            </button>
          ) : (
            <Link href="/login" className="px-3 py-1 border rounded">
              ログイン
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
