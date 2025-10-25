"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LABELS, type LabelKey } from "@/lib/labels";

type Post = {
  id: string;
  body?: string;
  text?: string;
  created_at: string;
  author?: string;
  score?: number | null;   // 嘘っぽさ 0..1
  likes?: number | null;   // 初期の概算（無くてもOK）
};

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const hue = 120 - Math.min(120, pct); // 0%→緑, 100%→赤寄り
  return (
    <span
      className="text-xs px-2 py-1 rounded-full border"
      style={{
        background: `hsl(${hue} 70% 95%)`,
        borderColor: `hsl(${hue} 50% 60%)`,
      }}
      title={`嘘っぽさ ${pct}%`}
    >
      嘘 {pct}%
    </span>
  );
}

export default function PostCard({ p }: { p: Post }) {
  const content = (p.text ?? p.body ?? "").toString();

  // いいね
  const [likes, setLikes] = useState<number>(Number(p.likes ?? 0));
  const [liked, setLiked] = useState(false);
  const [pendingLike, setPendingLike] = useState(false);

  // 真偽投票
  const [voteTrue, setVoteTrue] = useState(0);
  const [voteFalse, setVoteFalse] = useState(0);
  const [myVote, setMyVote] = useState<1 | -1 | 0>(0);
  const [pendingVote, setPendingVote] = useState(false);

  // ラベル投票
  const [labelCounts, setLabelCounts] = useState<Record<LabelKey, number>>({
    funny: 0, insight: 0, toxic: 0, question: 0, sarcasm: 0,
  });
  const [myLabels, setMyLabels] = useState<Set<LabelKey>>(new Set());
  const [pendingLabelKey, setPendingLabelKey] = useState<LabelKey | null>(null);

  const labelArray = useMemo(() => LABELS, []);

  // 初期読み込み（いいね＋投票＋ラベル）
  useEffect(() => {
    let alive = true;

    (async () => {
      // いいね総数
      const likesHead = await supabase
        .from("reactions")
        .select("user_id", { count: "exact", head: true })
        .eq("post_id", p.id)
        .eq("kind", "like");
      if (alive && typeof likesHead.count === "number") setLikes(likesHead.count);

      // 自分のいいね & 投票 & ラベル
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const meLike = await supabase
          .from("reactions")
          .select("user_id")
          .eq("post_id", p.id)
          .eq("kind", "like")
          .eq("user_id", user.id)
          .maybeSingle();
        if (alive) setLiked(!!meLike.data);

        const mv = await supabase
          .from("truth_votes")
          .select("value")
          .eq("post_id", p.id)
          .eq("voter", user.id)
          .maybeSingle();
        if (alive) setMyVote((mv.data?.value as 1 | -1 | undefined) ?? 0);

        const myLs = await supabase
          .from("post_labels")
          .select("label")
          .eq("post_id", p.id)
          .eq("user_id", user.id);
        if (alive) {
          const set = new Set<LabelKey>();
          (myLs.data ?? []).forEach((r: any) => {
            if (labelArray.some(l => l.key === r.label)) set.add(r.label as LabelKey);
          });
          setMyLabels(set);
        }
      }

      // 真偽カウント
      const [t1, t2] = await Promise.all([
        supabase
          .from("truth_votes")
          .select("id", { count: "exact", head: true })
          .eq("post_id", p.id)
          .eq("value", 1),
        supabase
          .from("truth_votes")
          .select("id", { count: "exact", head: true })
          .eq("post_id", p.id)
          .eq("value", -1),
      ]);
      if (alive) {
        if (typeof t1.count === "number") setVoteTrue(t1.count);
        if (typeof t2.count === "number") setVoteFalse(t2.count);
      }

      // ラベルカウント
      const allLabels = await supabase
        .from("post_labels")
        .select("label")
        .eq("post_id", p.id);
      if (alive) {
        const counts: Record<LabelKey, number> = { funny: 0, insight: 0, toxic: 0, question: 0, sarcasm: 0 };
        (allLabels.data ?? []).forEach((r: any) => {
          const k = r.label as LabelKey;
          if (k in counts) counts[k] += 1;
        });
        setLabelCounts(counts);
      }
    })();

    return () => { alive = false; };
  }, [p.id, labelArray]);

  // 認証チェック（未ログインは /login に誘導）
  async function ensureLogin(): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
      return null;
    }
    return user.id;
  }

  // いいねトグル
  async function onToggleLike() {
    if (pendingLike) return;
    const uid = await ensureLogin();
    if (!uid) return;

    setPendingLike(true);
    // 楽観更新
    setLiked(prev => !prev);
    setLikes(prev => prev + (liked ? -1 : 1));

    const { data, error } = await supabase.rpc("toggle_like", { p_post_id: p.id });
    if (error) {
      // 巻き戻し
      setLiked(prev => !prev);
      setLikes(prev => prev + (liked ? 1 : -1));
      console.error(error);
    } else if (typeof data === "boolean") {
      // サーバの結果で整合
      setLiked(data);
      // likes は概ね正しいはずだが、明示調整
      setLikes(prev => prev + (data ? (liked ? 0 : 0) : 0));
    }
    setPendingLike(false);
  }

  // 真偽投票（1 or -1）
  async function onVote(v: 1 | -1) {
    if (pendingVote) return;
    const uid = await ensureLogin();
    if (!uid) return;

    setPendingVote(true);
    // 楽観更新
    const prev = myVote;
    setMyVote(v);
    if (prev === 1) setVoteTrue(t => t - 1);
    if (prev === -1) setVoteFalse(f => f - 1);
    if (v === 1) setVoteTrue(t => t + 1);
    if (v === -1) setVoteFalse(f => f + 1);

    const { error } = await supabase.rpc("upsert_truth_vote", { p_post_id: p.id, p_value: v });
    if (error) {
      // 巻き戻し
      if (v === 1) setVoteTrue(t => t - 1);
      if (v === -1) setVoteFalse(f => f - 1);
      if (prev === 1) setVoteTrue(t => t + 1);
      if (prev === -1) setVoteFalse(f => f + 1);
      setMyVote(prev);
      console.error(error);
    }
    setPendingVote(false);
  }

  // 投票取り消し
  async function onUnvote() {
    if (pendingVote || myVote === 0) return;
    const uid = await ensureLogin();
    if (!uid) return;

    setPendingVote(true);
    const prev = myVote;
    setMyVote(0);
    if (prev === 1) setVoteTrue(t => t - 1);
    if (prev === -1) setVoteFalse(f => f - 1);

    const { error } = await supabase.rpc("upsert_truth_vote", { p_post_id: p.id, p_value: 0 });
    if (error) {
      // 巻き戻し
      if (prev === 1) setVoteTrue(t => t + 1);
      if (prev === -1) setVoteFalse(f => f + 1);
      setMyVote(prev);
      console.error(error);
    }
    setPendingVote(false);
  }

  // ラベルトグル
  async function onToggleLabel(k: LabelKey) {
    if (pendingLabelKey) return;
    const uid = await ensureLogin();
    if (!uid) return;

    setPendingLabelKey(k);
    const has = myLabels.has(k);
    // 楽観更新
    setMyLabels(prev => {
      const next = new Set(prev);
      if (has) next.delete(k); else next.add(k);
      return next;
    });
    setLabelCounts(prev => ({ ...prev, [k]: (prev[k] ?? 0) + (has ? -1 : 1) }));

    const { data, error } = await supabase.rpc("toggle_post_label", {
      p_post_id: p.id,
      p_label: k,
    });
    if (error) {
      // 巻き戻し
      setMyLabels(prev => {
        const next = new Set(prev);
        if (has) next.add(k); else next.delete(k);
        return next;
      });
      setLabelCounts(prev => ({ ...prev, [k]: (prev[k] ?? 0) + (has ? 1 : -1) }));
      console.error(error);
    } else if (typeof data === "boolean") {
      // サーバ結果に整合（基本一致する想定）
    }
    setPendingLabelKey(null);
  }

  return (
    <article className="rounded border p-4 bg-white space-y-3">
      <header className="flex items-center justify-between gap-2">
        <div className="font-semibold truncate">
          {p.author ?? "unknown"}
        </div>
        {typeof p.score === "number" && <ScoreBadge score={p.score} />}
      </header>

      <div className="whitespace-pre-wrap break-words">
        {content}
      </div>

      <footer className="flex items-center flex-wrap gap-3 text-sm">
        {/* いいね */}
        <button
          onClick={onToggleLike}
          disabled={pendingLike}
          className={`px-3 py-1 rounded border ${liked ? "bg-pink-50 border-pink-300" : "bg-gray-50"}`}
          title="いいね"
        >
          ❤️ {likes}
        </button>

        {/* 真偽投票 */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onVote(1)}
            disabled={pendingVote}
            className={`px-2 py-1 rounded border ${myVote === 1 ? "bg-green-50 border-green-300" : "bg-gray-50"}`}
            title="本当っぽい"
          >
            ✅ {voteTrue}
          </button>
          <button
            onClick={() => onVote(-1)}
            disabled={pendingVote}
            className={`px-2 py-1 rounded border ${myVote === -1 ? "bg-red-50 border-red-300" : "bg-gray-50"}`}
            title="嘘っぽい"
          >
            ❌ {voteFalse}
          </button>
          {myVote !== 0 && (
            <button
              onClick={onUnvote}
              disabled={pendingVote}
              className="ml-1 px-2 py-1 rounded border bg-gray-50"
              title="投票取り消し"
            >
              取消
            </button>
          )}
        </div>

        {/* ラベル投票 */}
        <div className="flex items-center gap-2 flex-wrap">
          {labelArray.map(({ key, emoji, text }) => {
            const active = myLabels.has(key);
            return (
              <button
                key={key}
                onClick={() => onToggleLabel(key)}
                disabled={pendingLabelKey === key}
                className={`px-2 py-1 rounded border ${active ? "bg-blue-50 border-blue-300" : "bg-gray-50"}`}
                title={text}
              >
                <span className="mr-1">{emoji}</span>
                <span className="tabular-nums">{labelCounts[key] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </footer>
    </article>
  );
}
