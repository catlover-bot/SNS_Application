"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ProfileSettings() {
  const [uid, setUid] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { location.href = "/login?next=/settings/profile"; return; }
      setUid(user.id);
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (prof) {
        setUsername(prof.username ?? "");
        setDisplayName(prof.display_name ?? "");
        setBio(prof.bio ?? "");
        setAvatar(prof.avatar_url ?? null);
      }
    })();
  }, []);

  async function save() {
    if (!uid) return;
    setSaving(true);

    let avatar_url = avatar;
    if (file) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${uid}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file);
      if (error) { alert("アイコンのアップロードに失敗: " + error.message); setSaving(false); return; }
      avatar_url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    }

    const { error: upErr } = await supabase.from("profiles").upsert({
      id: uid,
      username: username || null,
      display_name: displayName || null,
      bio: bio || null,
      avatar_url,
    });
    if (upErr) alert(upErr.message);
    else alert("保存しました");
    setSaving(false);
  }

  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="text-xl font-bold">プロフィール編集</h1>
      <div className="flex items-center gap-3">
        <img src={avatar ?? "https://placehold.co/80x80"} className="w-16 h-16 rounded-full object-cover border" />
        <input type="file" accept="image/*" onChange={(e)=> setFile(e.target.files?.[0] ?? null)} />
      </div>

      <label className="block">
        <div className="text-sm opacity-60">ユーザー名（英数と _ 3-15 文字）</div>
        <input className="w-full border rounded p-2" value={username} onChange={(e)=>setUsername(e.target.value)} />
      </label>

      <label className="block">
        <div className="text-sm opacity-60">表示名</div>
        <input className="w-full border rounded p-2" value={displayName} onChange={(e)=>setDisplayName(e.target.value)} />
      </label>

      <label className="block">
        <div className="text-sm opacity-60">自己紹介</div>
        <textarea className="w-full border rounded p-2 h-28" value={bio} onChange={(e)=>setBio(e.target.value)} />
      </label>

      <button
        onClick={save}
        disabled={saving}
        className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
      >
        保存
      </button>
    </div>
  );
}
