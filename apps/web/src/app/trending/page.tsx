"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import PostCard from "@/components/PostCard";

export default function Trending() {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from("feed_trending")
      .select("*")
      .limit(50)
      .then(({ data, error }) => {
        if (error) console.error(error);
        setItems(data ?? []);
      });
  }, []);

  return (
    <div className="space-y-3">
      <div className="text-xl font-bold mb-2">🔥 トレンド（炎上モード）</div>
      {items.map((p) => (
        <PostCard key={p.id} p={p} />
      ))}
    </div>
  );
}
