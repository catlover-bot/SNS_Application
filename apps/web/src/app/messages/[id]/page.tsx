"use client";
import { useEffect, useRef, useState } from "react";
import { supabaseClient as supabase } from "@/lib/supabase/client";

export default function Chat({ params }: { params: { id: string } }) {
  const convId = params.id;
  const [rows, setRows] = useState<any[]>([]);
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });
      if (alive) setRows(r.data ?? []);
    })();

    const ch = supabase
      .channel(`chat-${convId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${convId}` },
        (payload) => setRows((prev) => [...prev, payload.new as any])
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [convId]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 1e9, behavior: "smooth" });
  }, [rows.length]);

  async function send() {
    const t = text.trim();
    if (!t) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { location.href = `/login?next=/messages/${convId}`; return; }
    const { error } = await supabase.from("messages").insert({ conversation_id: convId, author: user.id, text: t });
    if (!error) setText("");
  }

  return (
    <div className="p-4 space-y-3">
      <div ref={scroller} className="h-[60vh] overflow-auto border rounded p-3 space-y-2 bg-white">
        {rows.map((m) => (
          <div key={m.id} className="text-sm">
            <span className="opacity-60 mr-2">{new Date(m.created_at).toLocaleString()}</span>
            <span>{m.text}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="flex-1 border rounded px-3 py-2" value={text} onChange={(e)=>setText(e.target.value)} />
        <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={send}>送信</button>
      </div>
    </div>
  );
}
