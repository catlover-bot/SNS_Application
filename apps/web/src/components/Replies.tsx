// apps/web/src/components/Replies.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseClient as supabase } from "@/lib/supabase/client";
import PostCard from "@/components/PostCard";

type Row = {
  id: string;
  created_at: string;
  text?: string | null;
  body?: string | null;
  author?: string | null;
  author_handle?: string | null;
  author_display?: string | null;
  author_avatar?: string | null;
  reply_count?: number | null;
  score?: number | null;
  parent_id?: string | null;
};

export default function Replies({ postId }: { postId: string }) {
  // ✅ クライアントは 1 回だけ生成
  const sb = useMemo(() => supabase(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchReplies() {
    const rs = await sb
      .from("v_posts_enriched")
      .select("*")
      .eq("parent_id", postId)
      .order("created_at", { ascending: true });

    setRows(((rs.data as unknown) as Row[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchReplies();

    // Realtime: 返信の追加を購読
    const channel = sb
      .channel(`replies-${postId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts", filter: `parent_id=eq.${postId}` },
        async (payload) => {
          if (!alive) return;
          const r = await sb
            .from("v_posts_enriched")
            .select("*")
            .eq("id", (payload.new as any).id)
            .maybeSingle();
          if (r.data) setRows((prev) => [...prev, r.data as Row]);
        }
      )
      .subscribe();

    return () => {
      alive = false;
      sb.removeChannel(channel);
    };
  }, [postId, sb]);

  if (loading) return <div className="pl-4 border-l text-sm opacity-70">返信を読み込み中…</div>;
  if (!rows.length) return <div className="pl-4 border-l text-sm opacity-70">まだ返信はありません。</div>;

  return (
    <div className="pl-4 border-l space-y-3">
      {rows.map((r) => (
        <PostCard key={r.id} p={r as any} />
      ))}
    </div>
  );
}
