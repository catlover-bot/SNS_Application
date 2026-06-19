"use client";

import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, SUPABASE_UNAVAILABLE_MESSAGE } from "@/lib/supabase/config";
import { supabaseClient } from "@/lib/supabase/client";

export default function Reset() {
  const configured = isSupabaseConfigured();
  const supabase = useMemo(() => (configured ? supabaseClient() : null), [configured]);
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        setMsg("パスワード再設定リンクが無効か期限切れです。もう一度メールからアクセスしてください。");
      }
    });
  }, [supabase]);

  const onSave = async () => {
    if (!supabase) {
      setMsg("パスワード再設定を利用できません。時間をおいて再度お試しください。");
      return;
    }
    const p = password.trim();
    if (p.length < 8) {
      setMsg("パスワードは8文字以上にしてください。");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: p });
    if (error) setMsg("パスワードを更新できませんでした。リンクを開き直すか、再度リセットメールを送信してください。");
    else setMsg("パスワードを更新しました。ログインし直してください。");
  };

  return (
    <div className="mx-auto max-w-md space-y-4 rounded-xl border bg-white p-6">
      <div>
        <h1 className="text-2xl font-bold">パスワード再設定</h1>
        <p className="mt-2 text-sm text-slate-600">新しいパスワードを設定して、PersonaLens に戻りましょう。</p>
      </div>
      {!configured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {SUPABASE_UNAVAILABLE_MESSAGE} ローカル環境を設定してから再度お試しください。
        </div>
      )}
      <input
        className="w-full rounded-lg border border-slate-200 p-2 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        placeholder="新しいパスワード"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button
        className="rounded-full bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        onClick={onSave}
        disabled={!configured}
        type="button"
      >
        保存
      </button>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
