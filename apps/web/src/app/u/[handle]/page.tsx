"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabaseClient as supabase } from "@/lib/supabase/client";
import FollowButton from "@/components/FollowButton";
import PostCard from "@/components/PostCard";

export default function UserPage() {
  const { handle } = useParams<{ handle: string }>();
  const [userId, setUserId] = useState<string | null>(null);
  const [posts, setPosts] = useState<any[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const p = await supabase.from("profiles").select("id").eq("handle", handle).maybeSingle();
      if (!p.data || !alive) return;
      setUserId(p.data.id);
      const r = await supabase.from("posts").select("*").eq("author", p.data.id).order("created_at", { ascending: false }).limit(50);
      if (alive) setPosts(r.data ?? []);
    })();
    return () => { alive = false; };
  }, [handle]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">@{handle}</h1>
        {userId && <FollowButton targetId={userId} />}
      </div>
      <div className="space-y-3">
        {posts.map(p => <PostCard key={p.id} p={p} />)}
      </div>
    </div>
  );
}
