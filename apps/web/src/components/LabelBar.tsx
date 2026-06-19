// apps/web/src/components/LabelBar.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseClient } from "@/lib/supabase/client";

type LabelKey = "funny" | "insight" | "toxic" | "question" | "sarcasm";

const CATALOG: { key: LabelKey; emoji: string; text: string }[] = [
  { key: "funny",    emoji: "🤣", text: "おもしろい" },
  { key: "insight",  emoji: "🧠", text: "洞察" },
  { key: "toxic",    emoji: "☣️", text: "攻撃的" },
  { key: "question", emoji: "❓", text: "質問" },
  { key: "sarcasm",  emoji: "🙃", text: "皮肉" },
];

type Props = { postId: string };

export default function LabelBar({ postId }: Props) {
  const configured = isSupabaseConfigured();
  // ✅ 各レンダーで再生成しないようにメモ化
  const supabase = useMemo(() => (configured ? supabaseClient() : null), [configured]);
  const [userId, setUserId] = useState<string | null>(null);
  const [my, setMy] = useState<Set<LabelKey>>(new Set());
  const [counts, setCounts] = useState<Record<LabelKey, number>>({
    funny: 0, insight: 0, toxic: 0, question: 0, sarcasm: 0,
  });
  const [pending, setPending] = useState<LabelKey | null>(null);

  // 初期ロード
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) return;
      // 自分
      const { data: { user } } = await supabase.auth.getUser();
      if (alive) setUserId(user?.id ?? null);

      // 全ラベル -> 集計
      const { data: all } = await supabase
        .from("post_labels")
        .select("label")
        .eq("post_id", postId);
      if (alive && all) {
        const c: Record<LabelKey, number> = { funny:0, insight:0, toxic:0, question:0, sarcasm:0 };
        for (const r of all as any[]) {
          const k = r.label as LabelKey;
          if (k in c) c[k] += 1;
        }
        setCounts(c);
      }

      // 自分のラベル
      if (user?.id) {
        const { data: mine } = await supabase
          .from("post_labels")
          .select("label")
          .eq("post_id", postId)
          .eq("user_id", user.id);
        if (alive && mine) setMy(new Set((mine as any[]).map(r => r.label as LabelKey)));
      }
    })();
    return () => { alive = false; };
  }, [postId, supabase]);

  const onToggle = async (key: LabelKey) => {
    if (!supabase) return;
    if (!userId) { location.href = `/login?next=${encodeURIComponent(location.pathname)}`; return; }
    if (pending) return;
    setPending(key);

    try {
      const has = my.has(key);
      if (has) {
        // OFF
        setMy((s) => { const t = new Set(s); t.delete(key); return t; });
        setCounts((c) => ({ ...c, [key]: Math.max(0, c[key]-1) }));
        await supabase
          .from("post_labels")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", userId)
          .eq("label", key);
      } else {
        // ON
        setMy((s) => new Set([...s, key]));
        setCounts((c) => ({ ...c, [key]: c[key]+1 }));
        await supabase
          .from("post_labels")
          .insert({ post_id: postId, user_id: userId, label: key });
      }
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {CATALOG.map(({ key, emoji, text }) => {
        const active = my.has(key);
        return (
          <button
            key={key}
            onClick={() => onToggle(key)}
            disabled={!!pending}
            className={`px-2 py-1 rounded border text-sm ${active ? "bg-emerald-50 border-emerald-300" : ""} disabled:opacity-60`}
            title={text}
          >
            <span className="mr-1">{emoji}</span>
            {text} {counts[key] ?? 0}
          </button>
        );
      })}
    </div>
  );
}
