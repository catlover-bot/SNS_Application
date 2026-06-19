// apps/web/src/components/Nav.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseClient as supabase } from "@/lib/supabase/client";

export default function Nav() {
  const router = useRouter();
  const configured = isSupabaseConfigured();

  // Supabase クライアントは1回だけ生成
  const sb = useMemo(() => (configured ? supabase() : null), [configured]);

  const [loggedIn, setLoggedIn] = useState(false);
  const [unread, setUnread] = useState(0);

  // 認証状態の監視
  useEffect(() => {
    if (!sb) return;
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
    if (!loggedIn) return;
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
    if (sb) await sb.auth.signOut();
    router.replace("/");
  };

  const publicLinks = [
    { href: "/", label: "ホーム" },
    { href: "/search", label: "検索" },
    { href: "/trending", label: "トレンド" },
    { href: "/personas", label: "図鑑" },
    { href: "/support", label: "ヘルプ" },
  ];
  const privateLinks = [
    { href: "/home", label: "タイムライン" },
    { href: "/persona-feed", label: "キャラTL" },
    { href: "/compose", label: "投稿" },
    { href: "/following", label: "フォロー中" },
    { href: "/saved", label: "保存" },
    { href: "/persona-evolution", label: "進化" },
    { href: "/persona-lab", label: "相性ラボ" },
    { href: "/messages", label: "DM" },
    { href: "/notifications", label: "通知" },
  ];
  const appLinks = loggedIn ? [...publicLinks, ...privateLinks] : publicLinks;

  return (
    <header className="sticky top-0 bg-white/85 backdrop-blur z-40 border-b border-slate-200">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <Link href="/" className="min-w-36">
          <div className="font-semibold leading-tight">PersonaLens</div>
          <div className="text-[11px] text-slate-500">投稿からキャラが育つSNS</div>
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm">
          {appLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="whitespace-nowrap rounded-full px-3 py-1.5 text-slate-700 hover:bg-slate-100 hover:text-slate-950"
            >
              {link.label}
            </Link>
          ))}
          {loggedIn && unread > 0 && (
            <span
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-xs text-white"
              aria-label={`未読 ${unread} 件`}
            >
              {unread}
            </span>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {loggedIn && (
            <Link
              href="/settings/profile"
              className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              プロフィール
            </Link>
          )}
          {loggedIn ? (
            <button
              className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
              onClick={signOut}
              type="button"
            >
              ログアウト
            </button>
          ) : (
            <Link
              href="/login"
              className="whitespace-nowrap rounded-full bg-slate-950 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
            >
              ログイン
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
