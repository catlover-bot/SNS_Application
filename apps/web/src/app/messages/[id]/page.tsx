// apps/web/src/app/messages/[id]/page.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Chat({ params }: { params: { id: string } }) {
  const convId = params.id;
  const [items, setItems] = useState<any[]>([]);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });
      setItems(data || []);
    })();

    const ch = supabase
      .channel(`messages:${convId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${convId}` },
        payload => setItems(prev => [...prev, payload.new as any])
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [convId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [items.length]);

  async function send() {
    if (!text.trim()) return;
    await supabase.from("messages").insert({ conversation_id: convId, body: text });
    setText("");
  }

  return (
    <div className="flex flex-col h-[70vh] border rounded">
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {items.map(m=>(
          <div key={m.id} className="p-2 border rounded max-w-[70%]">{m.body}</div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="p-2 flex gap-2 border-t">
        <input className="flex-1 border p-2 rounded" value={text} onChange={e=>setText(e.target.value)} placeholder="メッセージを入力" />
        <button className="px-3 py-2 border rounded" onClick={send}>送信</button>
      </div>
    </div>
  );
}
