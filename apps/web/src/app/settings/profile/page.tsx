// apps/web/src/app/settings/profile/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseClient as supabase } from "@/lib/supabase/client";

export default function ProfileSettings() {
  const sb = useMemo(() => supabase(), []); // ← ここでインスタンス化

  const [uid, setUid] = useState<string | null>(null);
  const [handle, setHandle] = useState(""); // @ユーザー名（=handle）
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pushSummary, setPushSummary] = useState<{
    available: boolean;
    queuePending: number;
    deliveryRate: number;
    openRate: number;
    enabledDevices: number;
    totalDevices: number;
  } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { location.href = "/login?next=/settings/profile"; return; }
      setUid(user.id);

      const { data: prof } = await sb
        .from("profiles")
        .select("handle, display_name, bio, avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      if (prof) {
        setHandle(prof.handle ?? "");
        setDisplayName(prof.display_name ?? "");
        setBio(prof.bio ?? "");
        setAvatar(prof.avatar_url ?? null);
      }

      const pushRes = await fetch("/api/me/push-delivery/dashboard?days=14", { cache: "no-store" });
      const pushJson = await pushRes.json().catch(() => null);
      if (pushRes.ok && pushJson) {
        setPushSummary({
          available: !!pushJson.available,
          queuePending: Number(pushJson.queue?.pending ?? 0) || 0,
          deliveryRate: Number(pushJson.summary?.deliveryRate ?? 0) || 0,
          openRate: Number(pushJson.summary?.openRate ?? 0) || 0,
          enabledDevices: Array.isArray(pushJson.devices)
            ? pushJson.devices.filter((d: any) => d?.enabled !== false).length
            : 0,
          totalDevices: Array.isArray(pushJson.devices) ? pushJson.devices.length : 0,
        });
      }
    })();
  }, [sb]);

  const profileCompleteness = useMemo(() => {
    const checks = [
      handle.trim().length >= 3,
      displayName.trim().length > 0,
      bio.trim().length >= 20,
      !!avatar,
    ];
    const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
    return { score, checks };
  }, [avatar, bio, displayName, handle]);

  async function save() {
    if (!uid) return;
    setSaving(true);
    setMsg(null);

    // 形式チェック（DB 側制約に合わせる）
    if (!/^[A-Za-z0-9_]{3,20}$/.test(handle)) {
      setMsg("ユーザー名は3〜20文字の英数字と _ のみです。");
      setSaving(false);
      return;
    }

    let avatar_url = avatar;
    if (file) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${uid}/${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage.from("avatars").upload(path, file);
      if (error) {
        setMsg("アイコンのアップロードに失敗しました: " + error.message);
        setSaving(false);
        return;
      }
      avatar_url = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    }

    const { error: upErr } = await sb
      .from("profiles")
      .update({
        handle,
        display_name: displayName || null,
        bio: bio || null,
        avatar_url,
      })
      .eq("id", uid);

    if (upErr) {
      setMsg(
        upErr.code === "23505"
          ? "そのユーザー名は既に使われています。"
          : upErr.code === "23514"
          ? "ユーザー名の形式が不正です。"
          : upErr.message
      );
    } else {
      setMsg("保存しました。");
    }
    setSaving(false);
  }

  async function deleteAccount() {
    if (deleting) return;
    const yes = window.confirm(
      "アカウントを完全削除します。投稿・プロフィール等のデータは復元できません。実行しますか？"
    );
    if (!yes) return;

    setDeleting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/me/delete-account", {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? "アカウント削除に失敗しました");
      }
      await sb.auth.signOut();
      location.href = "/";
    } catch (e: any) {
      setMsg(e?.message ?? "アカウント削除に失敗しました");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="text-xl font-bold">プロフィール編集</h1>

      <div className="flex items-center gap-3">
        <img
          src={avatar ?? "https://placehold.co/80x80"}
          className="w-16 h-16 rounded-full object-cover border"
          alt="avatar"
        />
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>

      <label className="block">
        <div className="text-sm opacity-60">@ユーザー名（英数と _ ・3〜20 文字）</div>
        <input
          className="w-full border rounded p-2"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="your_id"
        />
      </label>

      <label className="block">
        <div className="text-sm opacity-60">表示名</div>
        <input
          className="w-full border rounded p-2"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </label>

      <label className="block">
        <div className="text-sm opacity-60">自己紹介</div>
        <textarea
          className="w-full border rounded p-2 h-28"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
      </label>

      <button
        onClick={save}
        disabled={saving}
        className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
      >
        保存
      </button>

      <div className="border rounded-lg p-4 space-y-3 bg-white">
        <div className="flex items-center justify-between">
          <div className="font-semibold">プロフィール完成度</div>
          <div className="text-sm opacity-80">{profileCompleteness.score}%</div>
        </div>
        <div className="h-2 rounded bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-blue-500"
            style={{ width: `${Math.max(6, profileCompleteness.score)}%` }}
          />
        </div>
        <div className="grid gap-1 text-sm">
          <div className={profileCompleteness.checks[0] ? "text-emerald-700" : "text-amber-700"}>
            {profileCompleteness.checks[0] ? "✓" : "•"} ユーザー名
          </div>
          <div className={profileCompleteness.checks[1] ? "text-emerald-700" : "text-amber-700"}>
            {profileCompleteness.checks[1] ? "✓" : "•"} 表示名
          </div>
          <div className={profileCompleteness.checks[2] ? "text-emerald-700" : "text-amber-700"}>
            {profileCompleteness.checks[2] ? "✓" : "•"} 自己紹介（20文字以上）
          </div>
          <div className={profileCompleteness.checks[3] ? "text-emerald-700" : "text-amber-700"}>
            {profileCompleteness.checks[3] ? "✓" : "•"} アイコン画像
          </div>
        </div>
      </div>

      <div className="border rounded-lg p-4 space-y-2 bg-white">
        <div className="font-semibold">成績通知 / 配信運用</div>
        {!pushSummary ? (
          <div className="text-sm opacity-70">配信状態を読み込み中…</div>
        ) : !pushSummary.available ? (
          <div className="text-sm text-amber-700">
            Push配信の queue/metrics テーブルが未適用です。migration 適用後に配信率/開封率を確認できます。
          </div>
        ) : (
          <div className="grid gap-1 text-sm">
            <div>
              配信率 {Math.round(pushSummary.deliveryRate * 100)}% / 開封率 {Math.round(pushSummary.openRate * 100)}%
            </div>
            <div>
              端末 {pushSummary.enabledDevices}/{pushSummary.totalDevices} 有効 / queue pending {pushSummary.queuePending}
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-3 text-sm">
          <a href="/dashboard/push-delivery" className="underline">
            Push配信ダッシュボード
          </a>
          <a href="/dashboard/ab-timeseries" className="underline">
            A/B時系列
          </a>
          <a href="/saved" className="underline">
            保存コレクション
          </a>
        </div>
      </div>

      <div className="border rounded-lg p-4 space-y-2">
        <div className="font-semibold">法務とサポート</div>
        <div className="flex flex-wrap gap-3 text-sm">
          <a href="/settings/security" className="underline">
            セキュリティ設定
          </a>
          <a href="/legal/terms" className="underline">
            利用規約
          </a>
          <a href="/legal/privacy" className="underline">
            プライバシー
          </a>
          <a href="/legal/guidelines" className="underline">
            ガイドライン
          </a>
          <a href="/support" className="underline">
            サポート
          </a>
        </div>
      </div>

      <div className="border border-red-200 bg-red-50 rounded-lg p-4 space-y-2">
        <div className="font-semibold text-red-800">アカウント管理</div>
        <p className="text-sm text-red-700">
          App Store審査対応として、アプリ内からアカウントを完全削除できます。
        </p>
        <button
          onClick={deleteAccount}
          disabled={deleting}
          className="px-4 py-2 rounded bg-red-600 text-white disabled:opacity-50"
        >
          {deleting ? "削除中..." : "アカウントを削除"}
        </button>
      </div>

      {msg && <div className="text-sm opacity-80">{msg}</div>}
    </div>
  );
}
