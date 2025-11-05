// apps/web/src/app/messages/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseClient as supabase } from "@/lib/supabase/client";

type ConversationMember = {
  conversation_id: string;
};

export default function Messages() {
  // ✅ クライアントを1度だけ生成
  const sb = useMemo(() => supabase(), []);

  const [convs, setConvs] = useState<ConversationMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);

      const { data: me, error: meErr } = await sb.auth.getUser();
      if (meErr || !me?.user) {
        if (alive) {
          setConvs([]);
          setLoading(false);
        }
        return;
      }

      const { data, error } = await sb
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", me.user.id)
        .limit(100);

      if (alive) {
        if (!error && data) setConvs(data as ConversationMember[]);
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [sb]);

  return (
    <div className="space-y-3 p-4">
      <a className="underline" href="/search">
        ユーザー検索→DM開始
      </a>

      {loading ? (
        <div>読み込み中…</div>
      ) : convs.length === 0 ? (
        <div className="text-sm text-gray-500">会話はまだありません。</div>
      ) : (
        <ul className="space-y-2">
          {convs.map((c) => (
            <li key={c.conversation_id} className="p-3 border rounded">
              <a className="hover:underline" href={`/messages/${c.conversation_id}`}>
                会話 {c.conversation_id.slice(0, 8)}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
