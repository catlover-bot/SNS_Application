"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import FollowButton from "@/components/FollowButton";
import PostCard from "@/components/PostCard";

export default function UserPage() {
  const { handle } = useParams<{ handle: string }>();
  const [prof, setProf] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const p = await supabase.from("profiles")
        .select("id,handle,display_name,bio,avatar_url")
        .eq("handle", handle).maybeSingle();
      if (!p.data) return;
      setProf(p.data);

      const ps = await supabase.from("v_posts_enriched")
        .select("*")
        .eq("author", p.data.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setPosts(ps.data ?? []);
    })();
  }, [handle]);

  if (!prof) return <div className="p-6">読み込み中…</div>;
  const name = prof.display_name || prof.handle;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <img src={prof.avatar_url ?? "https://placehold.co/96x96"}
             className="w-20 h-20 rounded-full border object-cover" alt={name}/>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{name}</h1>
          <div className="text-xs opacity-70">@{prof.handle}</div>
          {prof.bio && <p className="mt-2 opacity-80">{prof.bio}</p>}
        </div>
        <div className="ml-auto"><FollowButton targetId={prof.id}/></div>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">投稿</h2>
        {posts.map(p => <PostCard key={p.id} p={p} />)}
        {!posts.length && <div className="opacity-70 text-sm">まだ投稿がありません。</div>}
      </section>
    </div>
  );
}
