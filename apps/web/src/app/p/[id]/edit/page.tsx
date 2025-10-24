"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { computeLieScore } from "@sns/core";

export default function EditPost() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [score, setScore] = useState(0);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("posts")
        .select("text, author").eq("id", id).maybeSingle();
      if (error || !data) { alert("投稿が見つかりません"); router.push("/"); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.id !== data.author) { alert("権限がありません"); router.push("/"); return; }
      setText(data.text ?? "");
      setScore(computeLieScore({ text: data.text ?? "" }));
      setLoading(false);
    })();
  }, [id, router]);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("posts")
      .update({ text, score: computeLieScore({ text }) })
      .eq("id", id);
    setSaving(false);
    if (error) { alert(error.message); return; }
    router.push("/");
  }

  if (loading) return <div className="opacity-60">読み込み中…</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">投稿を編集</h1>
      <textarea
        className="w-full h-52 p-3 rounded border"
        value={text}
        onChange={(e) => { setText(e.target.value); setScore(computeLieScore({ text: e.target.value })); }}
      />
      <div className="opacity-70">嘘っぽさ {(score * 100).toFixed(1)}%</div>
      <div className="flex gap-2">
        <button onClick={() => router.back()} className="px-4 py-2 border rounded">キャンセル</button>
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded bg-blue-600 text-white">
          保存
        </button>
      </div>
    </div>
  );
}
