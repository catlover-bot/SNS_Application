"use client";

import { useEffect, useMemo, useState } from "react";
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

function passwordStrengthLabel(password: string) {
  const checks = passwordChecks(password);
  const score = Object.values(checks).filter(Boolean).length;
  if (!password) return { score: 0, label: "未入力" };
  if (score <= 2) return { score, label: "弱い" };
  if (score <= 4) return { score, label: "普通" };
  return { score, label: "強い" };
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "未取得";
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return "未取得";
  return new Date(t).toLocaleString("ja-JP");
}

export default function SecuritySettingsPage() {
  const sb = useMemo(() => supabase(), []);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [emailConfirmedAt, setEmailConfirmedAt] = useState<string | null>(null);
  const [lastSignInAt, setLastSignInAt] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pushOps, setPushOps] = useState<{
    available: boolean;
    queuePending: number;
    queueProcessing: number;
    oldestPendingMinutes: number | null;
    enabledDevices: number;
    totalDevices: number;
    deliveryRate: number;
    openRate: number;
  } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busyKey, setBusyKey] = useState<null | "password" | "reset" | "others" | "global">(null);

  const strength = passwordStrengthLabel(newPassword);

  const refreshUser = async () => {
    const {
      data: { user },
      error,
    } = await sb.auth.getUser();
    if (error) throw error;
    if (!user) {
      location.href = "/login?next=/settings/security";
      return;
    }
    setEmail(user.email ?? "");
    setEmailConfirmedAt((user as any).email_confirmed_at ?? null);
    setLastSignInAt((user as any).last_sign_in_at ?? null);
    setCreatedAt((user as any).created_at ?? null);
  };

  useEffect(() => {
    let stop = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        await refreshUser();
        const pushRes = await fetch("/api/me/push-delivery/dashboard?days=14", { cache: "no-store" });
        const pushJson = await pushRes.json().catch(() => null);
        if (!stop && pushRes.ok && pushJson) {
          setPushOps({
            available: !!pushJson.available,
            queuePending: Number(pushJson.queue?.pending ?? 0) || 0,
            queueProcessing: Number(pushJson.queue?.processing ?? 0) || 0,
            oldestPendingMinutes:
              pushJson.queue?.oldestPendingMinutes == null
                ? null
                : Number(pushJson.queue.oldestPendingMinutes) || 0,
            enabledDevices: Array.isArray(pushJson.devices)
              ? pushJson.devices.filter((d: any) => d?.enabled !== false).length
              : 0,
            totalDevices: Array.isArray(pushJson.devices) ? pushJson.devices.length : 0,
            deliveryRate: Number(pushJson.summary?.deliveryRate ?? 0) || 0,
            openRate: Number(pushJson.summary?.openRate ?? 0) || 0,
          });
        }
      } catch (e: any) {
        if (!stop) setErr(e?.message ?? "アカウント情報の取得に失敗しました。");
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, [sb]);

  const clearMessages = () => {
    setMsg(null);
    setErr(null);
  };

  const changePassword = async () => {
    clearMessages();
    const password = newPassword.trim();
    if (password.length < 8) {
      setErr("新しいパスワードは8文字以上にしてください。");
      return;
    }
    if (password !== confirmPassword) {
      setErr("確認用パスワードが一致しません。");
      return;
    }
    setBusyKey("password");
    try {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      setMsg("パスワードを更新しました。");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      setErr(e?.message ?? "パスワード更新に失敗しました。");
    } finally {
      setBusyKey(null);
    }
  };

  const sendResetMail = async () => {
    clearMessages();
    if (!email) {
      setErr("メールアドレスが取得できません。");
      return;
    }
    setBusyKey("reset");
    try {
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/auth/reset`,
      });
      if (error) throw error;
      setMsg("パスワード再設定メールを送信しました。");
    } catch (e: any) {
      setErr(e?.message ?? "メール送信に失敗しました。");
    } finally {
      setBusyKey(null);
    }
  };

  const signOutOtherDevices = async () => {
    clearMessages();
    setBusyKey("others");
    try {
      const { error } = await (sb.auth as any).signOut({ scope: "others" });
      if (error) throw error;
      setMsg("他の端末からログアウトしました。");
    } catch (e: any) {
      setErr(e?.message ?? "他端末ログアウトに失敗しました。");
    } finally {
      setBusyKey(null);
    }
  };

  const signOutAllDevices = async () => {
    clearMessages();
    const yes = window.confirm(
      "この端末を含む全端末からログアウトします。再ログインが必要になります。"
    );
    if (!yes) return;
    setBusyKey("global");
    try {
      const { error } = await (sb.auth as any).signOut({ scope: "global" });
      if (error) throw error;
      location.href = "/login?next=/settings/security";
    } catch (e: any) {
      setErr(e?.message ?? "全端末ログアウトに失敗しました。");
      setBusyKey(null);
    }
  };

  if (loading) {
    return <div className="max-w-2xl mx-auto p-6 text-sm opacity-70">読み込み中…</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">セキュリティ設定</h1>
        <p className="text-sm opacity-70">
          ログイン・パスワード・セッション管理をここで行えます。
        </p>
      </div>

      <div className="rounded-xl border bg-white p-4 space-y-2">
        <div className="font-semibold">アカウント状態</div>
        <div className="text-sm">メール: {email || "未取得"}</div>
        <div className="text-sm">
          メール確認:{" "}
          <span className={emailConfirmedAt ? "text-emerald-700" : "text-amber-700"}>
            {emailConfirmedAt ? `確認済み (${formatDateTime(emailConfirmedAt)})` : "未確認"}
          </span>
        </div>
        <div className="text-sm">最終ログイン: {formatDateTime(lastSignInAt)}</div>
        <div className="text-sm">登録日時: {formatDateTime(createdAt)}</div>
        <div className="text-xs opacity-70">
          未確認の場合は確認メールのリンクを開いてからログインしてください。
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 space-y-3">
        <div className="font-semibold">パスワード管理</div>
        <div className="grid gap-2">
          <input
            className="border rounded p-2"
            type="password"
            placeholder="新しいパスワード"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <input
            className="border rounded p-2"
            type="password"
            placeholder="新しいパスワード（確認）"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <div className="text-xs opacity-70">強度: {strength.label}</div>
          <div className="h-2 rounded bg-slate-100 overflow-hidden">
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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={changePassword}
            disabled={busyKey !== null}
            className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
          >
            {busyKey === "password" ? "更新中…" : "パスワードを変更"}
          </button>
          <button
            type="button"
            onClick={sendResetMail}
            disabled={busyKey !== null}
            className="px-3 py-2 rounded border disabled:opacity-50"
          >
            {busyKey === "reset" ? "送信中…" : "再設定メールを送る"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 space-y-3">
        <div className="font-semibold">ログイン端末管理</div>
        <p className="text-sm opacity-70">
          不審なログインが疑われる場合は、他端末または全端末からログアウトしてください。
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={signOutOtherDevices}
            disabled={busyKey !== null}
            className="px-3 py-2 rounded border disabled:opacity-50"
          >
            {busyKey === "others" ? "処理中…" : "他端末をログアウト"}
          </button>
          <button
            type="button"
            onClick={signOutAllDevices}
            disabled={busyKey !== null}
            className="px-3 py-2 rounded border border-red-300 text-red-700 disabled:opacity-50"
          >
            {busyKey === "global" ? "処理中…" : "全端末をログアウト"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 space-y-3">
        <div className="font-semibold">通知配信 / Push運用</div>
        {!pushOps ? (
          <p className="text-sm opacity-70">配信状態を読み込み中…</p>
        ) : !pushOps.available ? (
          <p className="text-sm text-amber-700">
            Push配信 queue / metrics テーブルが未適用です。migration 適用後に配信監視が有効になります。
          </p>
        ) : (
          <>
            <div className="text-sm">
              Push端末: {pushOps.enabledDevices}/{pushOps.totalDevices} 有効
            </div>
            <div className="text-sm">
              配信率 {Math.round(pushOps.deliveryRate * 100)}% / 開封率 {Math.round(pushOps.openRate * 100)}%
            </div>
            <div className="text-sm">
              queue pending {pushOps.queuePending} / processing {pushOps.queueProcessing}
              {pushOps.oldestPendingMinutes != null ? ` / 最古 ${pushOps.oldestPendingMinutes}分` : ""}
            </div>
          </>
        )}
        <div className="flex flex-wrap gap-3 text-sm">
          <a href="/dashboard/push-delivery" className="underline">
            Push配信ダッシュボード
          </a>
          <a href="/notifications" className="underline">
            通知画面
          </a>
          <a href="/settings/profile" className="underline">
            プロフィール設定
          </a>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 text-sm">
        <div className="font-semibold mb-2">ユーザー管理</div>
        <div className="flex flex-wrap gap-3">
          <a href="/settings/profile" className="underline">
            プロフィール編集
          </a>
          <a href="/notifications" className="underline">
            通知
          </a>
          <a href="/support" className="underline">
            サポート
          </a>
        </div>
      </div>

      {msg ? <div className="text-sm text-emerald-700">{msg}</div> : null}
      {err ? <div className="text-sm text-red-600">{err}</div> : null}
    </div>
  );
}
