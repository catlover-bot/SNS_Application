// apps/web/src/app/login/LoginClient.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { supabaseClient as supabase } from "@/lib/supabase/client";

export default function LoginClient() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/";

  // ✅ Supabase クライアントを1度だけ生成
  const sb = useMemo(() => supabase(), []);

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
      if (!e || !password) {
        setMsg("メールアドレスとパスワードを入力してください。");
        return;
      }

      if (mode === "signup") {
        // 新規登録
        const { data, error } = await sb.auth.signUp({ email: e, password });
        if (error) throw error;

        if (data.session) {
          router.push(next);
        } else {
          setMsg("確認メールを送信しました。受信トレイをご確認のうえ、確認後にログインしてください。");
        }
      } else {
        // サインイン
        const { error } = await sb.auth.signInWithPassword({ email: e, password });
        if (error) throw error;
        router.push(next);
      }
    } catch (err: any) {
      setMsg(err?.message ?? "処理に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    const e = email.trim();
    if (!e) {
      setMsg("パスワードリセット用にメールアドレスを入力してください。");
      return;
    }
    const { error } = await sb.auth.resetPasswordForEmail(e, {
      redirectTo: `${location.origin}/auth/reset`,
    });
    if (error) setMsg(error.message);
    else setMsg("パスワードリセット用のメールを送信しました。受信トレイをご確認ください。");
  };

  return (
    <div className="max-w-md mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">{mode === "signin" ? "ログイン" : "新規登録"}</h1>

      <div className="flex gap-2 text-sm">
        <button
          className={`border rounded px-3 py-1 ${mode === "signin" ? "bg-gray-100" : ""}`}
          onClick={() => setMode("signin")}
          type="button"
        >
          ログイン
        </button>
        <button
          className={`border rounded px-3 py-1 ${mode === "signup" ? "bg-gray-100" : ""}`}
          onClick={() => setMode("signup")}
          type="button"
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
        autoComplete="email"
      />
      <input
        className="border rounded p-2 w-full"
        placeholder="パスワード"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete={mode === "signin" ? "current-password" : "new-password"}
      />

      <button
        className="border rounded px-4 py-2 w-full"
        onClick={onSubmit}
        disabled={loading}
        type="button"
      >
        {loading ? "処理中…" : mode === "signin" ? "ログイン" : "登録する"}
      </button>

      <div className="text-right">
        <button className="text-sm underline" onClick={resetPassword} type="button">
          パスワードをお忘れの方
        </button>
      </div>

      {msg && <p className="text-sm text-red-600">{msg}</p>}
    </div>
  );
}
