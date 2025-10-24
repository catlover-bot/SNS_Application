// apps/web/src/app/messages/page.tsx
"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Messages() {
  const [convs, setConvs] = useState<any[]>([]);

  useEffect(() => {
    (async()=>{
      const { data: me } = await supabase.auth.getUser();
      if (!me?.user) return;
      const { data, error } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", me.user.id);
      if (!error) setConvs(data || []);
    })();
  }, []);

  return (
    <div className="space-y-3">
      <a className="underline" href="/search">ユーザー検索→DM開始</a>
      <ul className="space-y-2">
        {convs.map(c => (
          <li key={c.conversation_id} className="p-3 border rounded">
            <a className="hover:underline" href={`/messages/${c.conversation_id}`}>会話 {c.conversation_id.slice(0,8)}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
