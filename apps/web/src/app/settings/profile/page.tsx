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
    })();
  }, [sb]);

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

      {msg && <div className="text-sm opacity-80">{msg}</div>}
    </div>
  );
}
