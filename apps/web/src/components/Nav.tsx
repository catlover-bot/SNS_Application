"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Nav() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setLoggedIn(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setLoggedIn(!!s?.user)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <header className="sticky top-0 bg-white/70 backdrop-blur z-40 border-b">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-4">
        <Link href="/" className="font-semibold">嘘スコアSNS</Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/trending">トレンド</Link>
          <Link href="/search">検索</Link>
          <Link href="/messages">DM</Link>
          <Link href="/following">フォロー中</Link>
          <Link href="/compose">投稿</Link>
          <Link href="/notifications">通知</Link>
          <Link href="/dashboard">ダッシュボード</Link>
          <Link href="/settings/profile">プロフィール</Link>
          <Link href="/personas" className="font-medium underline">キャラ図鑑</Link>
        </nav>
        <div className="ml-auto">
          {loggedIn ? (
            <button
              className="px-3 py-1 border rounded"
              onClick={async () => {
                await supabase.auth.signOut();
                location.href = "/";
              }}
            >
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
