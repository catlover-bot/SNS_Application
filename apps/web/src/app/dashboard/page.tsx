"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import PersonaBadge from "@/components/PersonaBadge";

type Stat = { posts_count: number; avg_score: number | null; likes_received: number };

export default function DashboardPage() {
  const [stat, setStat] = useState<Stat | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        location.href = "/login?next=/dashboard";
        return;
      }
      // posts と reactions からざっくり集計（必要に応じてSQLをView化して高速化可能）
      const posts = await supabase
        .from("posts")
        .select("id, score", { count: "exact" })
        .eq("author", user.id);
      const likes = await supabase
        .from("reactions")
        .select("id", { count: "exact", head: true })
        .eq("kind", "like")
        .in("post_id", (posts.data ?? []).map((p: any) => p.id));

      const avg =
        (posts.data ?? []).reduce((s: number, it: any) => s + (Number(it.score ?? 0)), 0) /
        Math.max(1, posts.count ?? 1);

      setStat({
        posts_count: posts.count ?? 0,
        likes_received: likes.count ?? 0,
        avg_score: isFinite(avg) ? avg : 0,
      });
    })();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ダッシュボード</h1>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 border rounded">
          <div className="opacity-60 text-sm">投稿数</div>
          <div className="text-3xl font-semibold">{stat?.posts_count ?? "-"}</div>
        </div>
        <div className="p-4 border rounded">
          <div className="opacity-60 text-sm">受け取ったいいね</div>
          <div className="text-3xl font-semibold">{stat?.likes_received ?? "-"}</div>
        </div>
        <div className="p-4 border rounded sm:col-span-2">
          <div className="opacity-60 text-sm mb-2">あなたのキャラ</div>
          <div>{<PersonaBadge avg={stat?.avg_score ?? 0} />}</div>
        </div>
      </div>
    </div>
  );
}
