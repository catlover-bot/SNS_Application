// apps/web/src/app/login/LoginClient.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginClient() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setLoading(true);
    setMsg(null);
    const e = email.trim();
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: e, password });
        if (error) throw error;

        // Confirm email OFF なら即セッションあり
        if (data.session) {
          router.push(next);
        } else {
          // 念のためフォールバック
          const { error: e2 } = await supabase.auth.signInWithPassword({ email: e, password });
          if (!e2) router.push(next);
          else setMsg("確認メールを送信しました。メール内のリンクを開いてください。");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: e, password });
        if (error) throw error;
        router.push(next);
      }
    } catch (err: any) {
      setMsg(err?.message ?? "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    const e = email.trim();
    if (!e) {
      setMsg("メールアドレスを入力してください");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(e, {
      redirectTo: `${location.origin}/auth/reset`,
    });
    if (error) setMsg(error.message);
    else setMsg("リセットメールを送信しました。メールをご確認ください。");
  };

  return (
    <div className="max-w-md mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">ログイン</h1>

      <div className="flex gap-2 text-sm">
        <button
          className={`border rounded px-3 py-1 ${mode === "signin" ? "bg-gray-100" : ""}`}
          onClick={() => setMode("signin")}
        >
          サインイン
        </button>
        <button
          className={`border rounded px-3 py-1 ${mode === "signup" ? "bg-gray-100" : ""}`}
          onClick={() => setMode("signup")}
        >
          新規登録
        </button>
      </div>

      <input
        className="border rounded p-2 w-full"
        placeholder="you@example.com"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="border rounded p-2 w-full"
        placeholder="パスワード"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <button
        className="border rounded px-4 py-2 w-full"
        onClick={onSubmit}
        disabled={loading}
      >
        {mode === "signin" ? "ログイン" : "登録する"}
      </button>

      <div className="text-right">
        <button className="text-sm underline" onClick={resetPassword}>
          パスワードを忘れた
        </button>
      </div>

      {msg && <p className="text-sm text-red-600">{msg}</p>}
    </div>
  );
}
