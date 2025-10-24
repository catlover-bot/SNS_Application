"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PostCard from "@/components/PostCard";
import { computeLieScore } from "@sns/core";

export default function ThreadPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [post, setPost] = useState<any | null>(null);
  const [replies, setReplies] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [score, setScore] = useState(0);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase.from("posts").select("*").eq("id", id).single();
      setPost(p ?? null);
      const { data: rs } = await supabase
        .from("posts")
        .select("*")
        .eq("reply_to", id)
        .order("created_at", { ascending: true });
      setReplies(rs ?? []);
    })();

    const ch = supabase
      .channel("thread-"+id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts", filter: `reply_to=eq.${id}` },
        (payload) => setReplies((prev) => [...prev, payload.new as any])
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [id]);

  function onChange(v: string) {
    setText(v);
    setScore(computeLieScore({ text: v }));
  }

  async function reply() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { location.href = `/login?next=/p/${id}`; return; }
    if (!text.trim() || sending) return;
    setSending(true);
    const { error } = await supabase.from("posts").insert({ text, score, reply_to: id });
    if (!error) setText("");
    setSending(false);
  }

  if (!post) return <div>読み込み中…</div>;

  return (
    <div className="space-y-4">
      <PostCard p={post} />
      <h2 className="text-lg font-semibold">返信</h2>
      <div className="space-y-3">
        {replies.map((r) => <PostCard key={r.id} p={r} />)}
        {replies.length === 0 && <div className="opacity-70">まだ返信はありません。</div>}
      </div>

      <div className="rounded border p-3 bg-white">
        <textarea
          className="w-full h-28 border rounded p-2"
          placeholder="返信を書く…"
          value={text}
          onChange={(e)=>onChange(e.target.value)}
        />
        <div className="flex items-center justify-between text-sm opacity-70 mt-1">
          <div>嘘っぽさ {(score*100).toFixed(1)}%</div>
          <button onClick={reply} disabled={sending || !text.trim()} className="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50">
            返信する
          </button>
        </div>
      </div>
    </div>
  );
}
