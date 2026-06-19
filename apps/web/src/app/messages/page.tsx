// apps/web/src/app/messages/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseClient as supabase } from "@/lib/supabase/client";

type ConversationMember = {
  conversation_id: string;
};

export default function Messages() {
  // ✅ クライアントを1度だけ生成
  const sb = useMemo(() => supabase(), []);

  const [convs, setConvs] = useState<ConversationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);

      const { data: me, error: meErr } = await sb.auth.getUser();
      if (meErr || !me?.user) {
        if (alive) {
          setNeedLogin(true);
          setConvs([]);
          setLoading(false);
        }
        return;
      }

      const { data, error } = await sb
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", me.user.id)
        .limit(100);

      if (alive) {
        if (error) {
          setError("DM一覧を読み込めませんでした。時間をおいてもう一度お試しください。");
          setConvs([]);
        } else if (data) {
          setConvs(data as ConversationMember[]);
        }
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [sb]);

  if (needLogin) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 rounded-xl border bg-white p-6">
        <h1 className="text-2xl font-bold">DM</h1>
        <p className="text-sm text-slate-600">ダイレクトメッセージを使うにはログインが必要です。</p>
        <a href="/login?next=/messages" className="inline-flex rounded-full bg-slate-950 px-4 py-2 text-sm text-white">
          ログイン
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <header className="rounded-xl border bg-white p-4">
        <h1 className="text-2xl font-bold">DM</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          キャラ相性で見つけた相手や、気になる投稿者と個別に会話できます。
        </p>
        <a className="mt-3 inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-50" href="/search">
          相手を探す
        </a>
      </header>

      {loading ? (
        <div className="rounded-lg border bg-white p-4 text-sm text-slate-500">読み込み中…</div>
      ) : error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
      ) : convs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
          <div className="font-semibold text-slate-900">まだ会話はありません</div>
          <p className="mt-1">検索やキャラ相性ラボから相手を見つけて、会話を始めましょう。</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="/search" className="rounded-full bg-blue-600 px-4 py-2 text-white">
              相手を探す
            </a>
            <a href="/persona-lab" className="rounded-full border border-slate-200 bg-white px-4 py-2">
              相性ラボへ
            </a>
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {convs.map((c, idx) => (
            <li key={c.conversation_id} className="p-3 border rounded">
              <a className="hover:underline" href={`/messages/${c.conversation_id}`}>
                会話 {idx + 1}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
