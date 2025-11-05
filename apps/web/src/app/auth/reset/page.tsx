"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabase/client";

export default function Reset() {
  const supabase = supabaseClient(); // ← 関数を呼んで実体化
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        setMsg("パスワード再設定リンクが無効か期限切れです。もう一度メールからアクセスしてください。");
      }
    });
  }, [supabase]);

  const onSave = async () => {
    const p = password.trim();
    if (p.length < 6) {
      setMsg("パスワードは6文字以上にしてください。");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: p });
    if (error) setMsg(error.message);
    else setMsg("パスワードを更新しました。ログインし直してください。");
  };

  return (
    <div className="max-w-md mx-auto p-6 space-y-3">
      <h1 className="text-2xl font-bold">パスワード再設定</h1>
      <input
        className="border rounded p-2 w-full"
        placeholder="新しいパスワード"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button className="border rounded px-4 py-2" onClick={onSave} type="button">
        保存
      </button>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
