"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient as supabase } from "@/lib/supabase/client";

export default function Nav() {
  const router = useRouter();

  // ← ここで“1回だけ”インスタンス化
  const sb = useMemo(() => supabase(), []);

  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    let alive = true;

    // 1) 初期ユーザー取得
    sb.auth.getUser().then(({ data }) => {
      if (alive) setLoggedIn(!!data.user);
    });

    // 2) 認証状態の購読
    const { data: listener } = sb.auth.onAuthStateChange((_e, session) => {
      if (alive) setLoggedIn(!!session?.user);
    });

    // 3) クリーンアップ
    return () => {
      alive = false;
      listener?.subscription?.unsubscribe();
    };
  }, [sb]);

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
          <Link href="/notifications">通知</Link>
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
