"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Reset() {
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) setMsg("リンクの有効期限が切れている可能性があります。");
    });
  }, []);

  const onSave = async () => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setMsg(error.message);
    else setMsg("パスワードを更新しました。/login からサインインしてください。");
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
      <button className="border rounded px-4 py-2" onClick={onSave}>
        保存
      </button>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
