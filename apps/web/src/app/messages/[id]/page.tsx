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
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const r = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", convId)
          .order("created_at", { ascending: true });

        if (!alive) return;
        if (r.error) throw r.error;
        setRows((r.data ?? []) as Message[]);
      } catch {
        if (!alive) return;
        setErr("メッセージを読み込めませんでした。時間をおいてもう一度お試しください。");
        setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    const channel = supabase
      .channel(`chat-${convId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${convId}` },
        (payload) =>
          setRows((prev) =>
            prev.some((x) => x.id === (payload.new as Message).id)
              ? prev
              : [...prev, payload.new as Message]
          ),
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
    if (!t || sending) return;
    setSending(true);
    setErr(null);
    setNotice(null);

    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        location.href = `/login?next=/messages/${encodeURIComponent(convId)}`;
        return;
      }

      const ins = await supabase
        .from("messages")
        .insert({ conversation_id: convId, author: auth.user.id, text: t });

      if (ins.error) throw ins.error;
      setText("");
      setNotice("送信しました。");
    } catch {
      setErr("メッセージを送信できませんでした。もう一度お試しください。");
    } finally {
      setSending(false);
    }
  }, [convId, sending, text]);

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-3">
      <header className="rounded-xl border bg-white p-4">
        <h1 className="text-2xl font-bold">DM</h1>
        <p className="mt-2 text-sm text-slate-600">相手との会話をここで続けられます。</p>
      </header>
      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}
      <div ref={scroller} className="h-[60vh] overflow-auto border rounded p-3 space-y-2 bg-white">
        {loading ? (
          <div className="opacity-60 text-sm">読み込み中…</div>
        ) : err ? (
          <div className="space-y-2 text-sm">
            <div className="text-rose-700">{err}</div>
            <button type="button" className="underline" onClick={() => location.reload()}>
              再読み込み
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="opacity-60 text-sm">まだメッセージはありません。最初の一言を送ってみましょう。</div>
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
        <button
          className="rounded-full bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          onClick={send}
          disabled={!text.trim() || sending}
          type="button"
        >
          {sending ? "送信中…" : "送信"}
        </button>
      </div>
    </div>
  );
}
