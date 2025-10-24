"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import PostCard from "@/components/PostCard";

export default function Following() {
  const [items, setItems] = useState<any[]>([]);
  const [needLogin, setNeedLogin] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setNeedLogin(true);
        return;
      }
      const { data, error } = await supabase
        .from("feed_following")
        .select("*")
        .limit(50);
      if (error) console.error(error);
      setItems(data ?? []);
    })();
  }, []);

  if (needLogin) {
    return (
      <div className="space-y-3">
        <p>フォロー中のタイムラインを表示するにはログインしてください。</p>
        <a href="/login?next=/following" className="border rounded px-4 py-2 inline-block">
          ログイン
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((p) => (
        <PostCard key={p.id} p={p} />
      ))}
    </div>
  );
}
