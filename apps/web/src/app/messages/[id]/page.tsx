// apps/web/src/app/messages/[id]/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseClient } from "@/lib/supabase/client";

const supabase = supabaseClient(); // ★ ここで“呼び出して”インスタンス化

type Message = {
  id: string;
  conversation_id: string;
  author: string | null;
  text: string | null;
  created_at: string;
};

export default function Chat({ params }: { params: { id: string } }) {
  const convId = params.id;
  const [rows, setRows] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);
      const r = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });

      if (!alive) return;
      if (r.error) {
        setErr(r.error.message);
        setRows([]);
      } else {
        setRows((r.data ?? []) as Message[]);
      }
      setLoading(false);
    })();

    const channel = supabase
      .channel(`chat-${convId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${convId}` },
        (payload) => setRows((prev) => [...prev, payload.new as Message]),
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [convId]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 1e9, behavior: "smooth" });
  }, [rows.length]);

  const send = useCallback(async () => {
    const t = text.trim();
    if (!t) return;

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      location.href = `/login?next=/messages/${encodeURIComponent(convId)}`;
      return;
    }

    const ins = await supabase
      .from("messages")
      .insert({ conversation_id: convId, author: auth.user.id, text: t });

    if (!ins.error) setText("");
    else setErr(ins.error.message);
  }, [text, convId]);

  return (
    <div className="p-4 space-y-3">
      <div ref={scroller} className="h-[60vh] overflow-auto border rounded p-3 space-y-2 bg-white">
        {loading ? (
          <div className="opacity-60 text-sm">読み込み中…</div>
        ) : err ? (
          <div className="text-sm text-red-600">{err}</div>
        ) : rows.length === 0 ? (
          <div className="opacity-60 text-sm">まだメッセージはありません。</div>
        ) : (
          rows.map((m) => (
            <div key={m.id} className="text-sm">
              <span className="opacity-60 mr-2">{new Date(m.created_at).toLocaleString()}</span>
              <span>{m.text}</span>
            </div>
          ))
        )}
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="メッセージを入力…"
        />
        <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={send} disabled={!text.trim()}>
          送信
        </button>
      </div>
    </div>
  );
}
