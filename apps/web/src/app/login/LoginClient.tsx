// apps/web/src/app/login/LoginClient.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, SUPABASE_UNAVAILABLE_MESSAGE } from "@/lib/supabase/config";
import { supabaseClient as supabase } from "@/lib/supabase/client";

function passwordChecks(password: string) {
  const p = password ?? "";
  return {
    length: p.length >= 8,
    upper: /[A-Z]/.test(p),
    lower: /[a-z]/.test(p),
    number: /[0-9]/.test(p),
    symbol: /[^A-Za-z0-9]/.test(p),
  };
}

function passwordStrength(password: string) {
  const checks = passwordChecks(password);
  const score = Object.values(checks).filter(Boolean).length;
  if (!password) return { score: 0, label: "未入力" };
  if (score <= 2) return { score, label: "弱い" };
  if (score <= 4) return { score, label: "普通" };
  return { score, label: "強い" };
}

function friendlyAuthMessage(mode: "signin" | "signup") {
  return mode === "signin"
    ? "ログインできませんでした。メールアドレスとパスワードを確認してください。"
    : "登録できませんでした。入力内容を確認して、時間をおいてもう一度お試しください。";
}

function safeNextPath(raw: string | null) {
  const next = String(raw ?? "").trim();
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

function signInPromptFor(next: string) {
  if (next.startsWith("/compose")) return "Create an account to post and evolve your persona.";
  if (next.startsWith("/home") || next.startsWith("/persona-feed")) {
    return "Sign in to use your personalized timeline.";
  }
  if (next.startsWith("/messages")) return "ログインするとDMを確認できます。";
  if (next.startsWith("/notifications")) return "ログインすると通知を確認できます。";
  if (next.startsWith("/saved")) return "ログインすると保存した投稿を確認できます。";
  if (next !== "/") return "ログインするとこのページを利用できます。";
  return null;
}

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const reason = searchParams.get("reason");
  const configured = isSupabaseConfigured();
  const sb = useMemo(() => (configured ? supabase() : null), [configured]);

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [failedCount, setFailedCount] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [cooldownTick, setCooldownTick] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const now = useMemo(() => Date.now(), [cooldownTick]);
  const cooldownSeconds = cooldownUntil && cooldownUntil > now ? Math.ceil((cooldownUntil - now) / 1000) : 0;
  const strength = passwordStrength(password);
  const routePrompt = signInPromptFor(next);

  useEffect(() => {
    if (!cooldownUntil) return;
    if (cooldownUntil <= Date.now()) {
      setCooldownUntil(null);
      return;
    }
    const timer = setInterval(() => {
      if (cooldownUntil <= Date.now()) {
        setCooldownUntil(null);
      } else {
        setCooldownTick((prev) => prev + 1);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  const onSubmit = async () => {
    if (loading) return;
    if (cooldownSeconds > 0) {
      setMsg(`試行回数が多いため、${cooldownSeconds}秒後に再度お試しください。`);
      return;
    }
    setLoading(true);
    setMsg(null);
    const e = email.trim();

    try {
      if (!sb) {
        setMsg("ログインを利用できません。時間をおいて再度お試しください。");
        return;
      }
      if (!e || !password) {
        setMsg("メールアドレスとパスワードを入力してください。");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        setMsg("メールアドレスの形式を確認してください。");
        return;
      }

      if (mode === "signup") {
        if (password.length < 8) {
          setMsg("パスワードは8文字以上にしてください。");
          return;
        }
        if (password !== confirmPassword) {
          setMsg("確認用パスワードが一致しません。");
          return;
        }
        const { data, error } = await sb.auth.signUp({ email: e, password });
        if (error) throw error;
        setFailedCount(0);
        setCooldownUntil(null);

        if (data.session) {
          router.push(next);
        } else {
          setMsg("確認メールを送信しました。受信トレイをご確認のうえ、確認後にログインしてください。");
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: e, password });
        if (error) throw error;
        setFailedCount(0);
        setCooldownUntil(null);
        router.push(next);
      }
    } catch {
      const nextFailed = failedCount + 1;
      setFailedCount(nextFailed);
      if (nextFailed >= 5) {
        setCooldownUntil(Date.now() + 30_000);
      }
      setMsg(friendlyAuthMessage(mode));
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
    if (!sb) {
      setMsg("パスワードリセットを利用できません。時間をおいて再度お試しください。");
      return;
    }
    const { error } = await sb.auth.resetPasswordForEmail(e, {
      redirectTo: `${location.origin}/auth/reset`,
    });
    if (error) setMsg("パスワードリセット用メールを送信できませんでした。メールアドレスを確認してください。");
    else setMsg("パスワードリセット用のメールを送信しました。受信トレイをご確認ください。");
  };

  if (!configured) {
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-xl border bg-white p-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">PersonaLens</div>
          <h1 className="mt-1 text-2xl font-bold">ログインを利用できません</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {SUPABASE_UNAVAILABLE_MESSAGE} ローカルで利用する場合は Web 用の環境変数を設定してください。
          </p>
        </div>
        <a
          href="/"
          className="inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-50"
        >
          ホームへ戻る
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 rounded-xl border bg-white p-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">PersonaLens</div>
        <h1 className="mt-1 text-2xl font-bold">{mode === "signin" ? "ログイン" : "新規登録"}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          投稿を分析してキャラを育て、相性の良いタイムラインと会話のきっかけを見つけるSNSです。
        </p>
      </div>

      {(routePrompt || reason === "not_configured") && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          {reason === "not_configured"
            ? "データサービスの設定が完了していないため、この機能はまだ利用できません。"
            : routePrompt}
        </div>
      )}

      <div className="flex gap-2 text-sm">
        <button
          className={`rounded-full border px-3 py-1 ${mode === "signin" ? "bg-slate-950 text-white border-slate-950" : "bg-white"}`}
          onClick={() => setMode("signin")}
          type="button"
        >
          ログイン
        </button>
        <button
          className={`rounded-full border px-3 py-1 ${mode === "signup" ? "bg-slate-950 text-white border-slate-950" : "bg-white"}`}
          onClick={() => setMode("signup")}
          type="button"
        >
          新規登録
        </button>
      </div>

      <input
        className="w-full rounded-lg border border-slate-200 p-2 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        placeholder="you@example.com"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />
      <input
        className="w-full rounded-lg border border-slate-200 p-2 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        placeholder="パスワード"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete={mode === "signin" ? "current-password" : "new-password"}
      />
      {mode === "signup" && (
        <>
          <input
            className="w-full rounded-lg border border-slate-200 p-2 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            placeholder="パスワード（確認）"
            type={showPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
          <div className="space-y-1">
            <div className="text-xs opacity-70">強度: {strength.label}</div>
            <div className="h-2 rounded bg-gray-100 overflow-hidden">
              <div
                className={`h-full ${
                  strength.score <= 2
                    ? "bg-red-500"
                    : strength.score <= 4
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
                style={{ width: `${Math.max(6, (strength.score / 5) * 100)}%` }}
              />
            </div>
            <div className="text-xs opacity-70">
              8文字以上、英大文字・英小文字・数字・記号の組み合わせを推奨
            </div>
          </div>
        </>
      )}
      <label className="flex items-center gap-2 text-xs opacity-80">
        <input
          type="checkbox"
          checked={showPassword}
          onChange={(e) => setShowPassword(e.target.checked)}
        />
        パスワードを表示
      </label>

      <button
        className="w-full rounded-full bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        onClick={onSubmit}
        disabled={loading || cooldownSeconds > 0}
        type="button"
      >
        {loading
          ? "処理中…"
          : cooldownSeconds > 0
          ? `再試行まで ${cooldownSeconds}秒`
          : mode === "signin"
          ? "ログイン"
          : "登録する"}
      </button>

      <div className="text-right">
        <button className="text-sm underline" onClick={resetPassword} type="button">
          パスワードをお忘れの方
        </button>
      </div>

      <p className="text-xs opacity-70">
        セキュリティ向上のため、ログイン失敗が続くと短時間クールダウンされます。
      </p>
      {msg && (
        <p className={`text-sm ${msg.includes("送信") ? "text-emerald-700" : "text-red-600"}`}>
          {msg}
        </p>
      )}
    </div>
  );
}
