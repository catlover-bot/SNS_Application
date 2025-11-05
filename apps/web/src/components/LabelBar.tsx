"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

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
      // 自分
      const { data: { user } } = await supabase.auth.getUser();
      if (alive) setUserId(user?.id ?? null);

      // 全ラベル -> 集計
      const { data: all } = await supabase
        .from("post_labels")
        .select("label")
        .eq("post_id", postId);
      if (alive && all) {
        const c: any = { funny:0, insight:0, toxic:0, question:0, sarcasm:0 };
        for (const r of all) { if (c[r.label] != null) c[r.label]++; }
        setCounts(c);
      }

      // 自分のラベル
      if (user?.id) {
        const { data: mine } = await supabase
          .from("post_labels")
          .select("label")
          .eq("post_id", postId)
          .eq("user_id", user.id);
        if (alive && mine) setMy(new Set(mine.map((r: any) => r.label as LabelKey)));
      }
    })();
    return () => { alive = false; };
  }, [postId]);

  const onToggle = async (key: LabelKey) => {
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

  const disabled = useMemo(() => !!pending, [pending]);

  return (
    <div className="flex flex-wrap gap-2">
      {CATALOG.map(({ key, emoji, text }) => {
        const active = my.has(key);
        return (
          <button
            key={key}
            onClick={() => onToggle(key)}
            disabled={disabled}
            className={`px-2 py-1 rounded border text-sm ${
              active ? "bg-emerald-50 border-emerald-300" : ""
            }`}
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
