// apps/web/src/components/PostCard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseClient as supabase } from "@/lib/supabase/client";
import FollowButton from "@/components/FollowButton";
import Replies from "@/components/Replies";
import { LABELS, type LabelKey } from "@/lib/labels";

type Post = {
  id: string;
  created_at: string;
  text?: string | null;
  body?: string | null;

  author?: string | null;
  author_handle?: string | null;
  author_display?: string | null;
  author_avatar?: string | null;

  reply_count?: number | null;
  score?: number | null;
};

function ScoreBadge({ score }: { score: number | null | undefined }) {
  const s = Math.max(0, Math.min(1, Number(score ?? 0) || 0));
  const pct = Math.round(s * 100);
  const hue = 120 - Math.min(120, pct);
  return (
    <span
      className="text-xs px-2 py-1 rounded-full border"
      style={{ background: `hsl(${hue} 70% 95%)`, borderColor: `hsl(${hue} 50% 60%)` }}
      title={`嘘っぽさ ${pct}%`}
    >
      嘘 {pct}%
    </span>
  );
}

export default function PostCard({ p }: { p: Post }) {
  // ✅ Supabase クライアントを1回だけ生成
  const sb = useMemo(() => supabase(), []);

  const content = (p.text ?? p.body ?? "").toString();

  // 作者
  const [author, setAuthor] = useState<{
    id?: string | null;
    handle?: string | null;
    name?: string | null;
    avatar?: string | null;
  }>({
    id: p.author ?? null,
    handle: p.author_handle ?? null,
    name: p.author_display ?? null,
    avatar: p.author_avatar ?? null,
  });

  useEffect(() => {
    if (!author.id || author.handle) return;
    (async () => {
      const r = await sb
        .from("profiles")
        .select("handle,display_name,avatar_url")
        .eq("id", author.id)
        .maybeSingle();
      if (r.data) {
        setAuthor((a) => ({
          ...a,
          handle: r.data!.handle,
          name: r.data!.display_name ?? r.data!.handle,
          avatar: r.data!.avatar_url ?? a.avatar,
        }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [author.id, sb]);

  // いいね
  const [likes, setLikes] = useState<number>(0);
  const [liked, setLiked] = useState(false);
  const [pendingLike, setPendingLike] = useState(false);

  // 🚀 拡散（Boost）
  const [boosts, setBoosts] = useState<number>(0);
  const [boosted, setBoosted] = useState(false);
  const [pendingBoost, setPendingBoost] = useState(false);

  // 真偽
  const [voteTrue, setVoteTrue] = useState(0);
  const [voteFalse, setVoteFalse] = useState(0);
  const [myVote, setMyVote] = useState<1 | 0 | -1>(0);
  const [pendingVote, setPendingVote] = useState(false);

  // ラベル
  const labelKeys = useMemo(() => LABELS.map((l) => l.key) as readonly LabelKey[], []);
  const [labelCounts, setLabelCounts] = useState<Record<LabelKey, number>>(
    Object.fromEntries(labelKeys.map((k) => [k, 0])) as Record<LabelKey, number>
  );
  const [myLabels, setMyLabels] = useState<Set<LabelKey>>(new Set());
  const [pendingLabelKey, setPendingLabelKey] = useState<LabelKey | null>(null);

  // スレッド/返信
  const [showThread, setShowThread] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyCount, setReplyCount] = useState<number>(p.reply_count ?? 0);

  // 初期ロード
  useEffect(() => {
    let alive = true;
    (async () => {
      // いいね件数
      const l = await sb
        .from("reactions")
        .select("id", { count: "exact", head: true })
        .eq("post_id", p.id)
        .eq("kind", "like");
      if (alive && typeof l.count === "number") setLikes(l.count);

      // 🚀 ブースト件数
      const b = await sb
        .from("reactions")
        .select("id", { count: "exact", head: true })
        .eq("post_id", p.id)
        .eq("kind", "boost");
      if (alive && typeof b.count === "number") setBoosts(b.count);

      // 自分の状態
      const {
        data: { user },
      } = await sb.auth.getUser();

      if (user) {
        // 自分の「いいね」
        const meLike = await sb
          .from("reactions")
          .select("user_id")
          .eq("post_id", p.id)
          .eq("kind", "like")
          .eq("user_id", user.id)
          .maybeSingle();
        if (alive) setLiked(!!meLike.data);

        // 自分の「Boost」
        const meBoost = await sb
          .from("reactions")
          .select("user_id")
          .eq("post_id", p.id)
          .eq("kind", "boost")
          .eq("user_id", user.id)
          .maybeSingle();
        if (alive) setBoosted(!!meBoost.data);

        // 真偽投票
        const mv = await sb
          .from("truth_votes")
          .select("value")
          .eq("post_id", p.id)
          .eq("voter", user.id)
          .maybeSingle();
        if (alive) setMyVote((mv.data?.value as 1 | -1 | undefined) ?? 0);

        // 自分のラベル
        const myLs = await sb
          .from("post_labels")
          .select("label")
          .eq("post_id", p.id)
          .eq("user_id", user.id);
        if (alive) {
          const set = new Set<LabelKey>();
          (myLs.data ?? []).forEach((r: any) => {
            if (labelKeys.includes(r.label as LabelKey)) set.add(r.label as LabelKey);
          });
          setMyLabels(set);
        }
      }

      // 真偽件数
      const [t1, t2] = await Promise.all([
        sb.from("truth_votes").select("id", { count: "exact", head: true }).eq("post_id", p.id).eq("value", 1),
        sb.from("truth_votes").select("id", { count: "exact", head: true }).eq("post_id", p.id).eq("value", -1),
      ]);
      if (alive) {
        if (typeof t1.count === "number") setVoteTrue(t1.count);
        if (typeof t2.count === "number") setVoteFalse(t2.count);
      }

      // ラベル件数
      const allLabels = await sb.from("post_labels").select("label").eq("post_id", p.id);
      if (alive) {
        const counts = Object.fromEntries(labelKeys.map((k) => [k, 0])) as Record<LabelKey, number>;
        (allLabels.data ?? []).forEach((r: any) => {
          const k = r.label as LabelKey;
          if (k in counts) counts[k] += 1;
        });
        setLabelCounts(counts);
      }
    })();
    return () => {
      alive = false;
    };
  }, [p.id, labelKeys, sb]);

  async function ensureLoginOrRedirect() {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
      return null;
    }
    return user;
  }

  // いいね
  async function toggleLike() {
    if (pendingLike) return;
    const user = await ensureLoginOrRedirect();
    if (!user) return;
    setPendingLike(true);

    const prevLiked = liked,
      prevLikes = likes;
    const nextLiked = !prevLiked;
    setLiked(nextLiked);
    setLikes(prevLikes + (nextLiked ? 1 : -1));

    try {
      if (nextLiked) {
        const { error } = await sb.from("reactions").insert({ post_id: p.id, user_id: user.id, kind: "like" });
        if (error) throw error;
      } else {
        const { error } = await sb
          .from("reactions")
          .delete()
          .eq("post_id", p.id)
          .eq("user_id", user.id)
          .eq("kind", "like");
        if (error) throw error;
      }
    } catch {
      setLiked(prevLiked);
      setLikes(prevLikes);
    } finally {
      setPendingLike(false);
    }
  }

  // 🚀 Boost
  async function toggleBoost() {
    if (pendingBoost) return;
    const user = await ensureLoginOrRedirect();
    if (!user) return;
    setPendingBoost(true);

    const prevBoosted = boosted,
      prevBoosts = boosts;
    const nextBoosted = !prevBoosted;
    setBoosted(nextBoosted);
    setBoosts(prevBoosts + (nextBoosted ? 1 : -1));

    try {
      if (nextBoosted) {
        const { error } = await sb.from("reactions").insert({ post_id: p.id, user_id: user.id, kind: "boost" });
        if (error) throw error;
      } else {
        const { error } = await sb
          .from("reactions")
          .delete()
          .eq("post_id", p.id)
          .eq("user_id", user.id)
          .eq("kind", "boost");
        if (error) throw error;
      }
    } catch {
      setBoosted(prevBoosted);
      setBoosts(prevBoosts);
    } finally {
      setPendingBoost(false);
    }
  }

  // 真偽
  async function castVote(v: 1 | -1) {
    if (pendingVote) return;
    const user = await ensureLoginOrRedirect();
    if (!user) return;
    setPendingVote(true);

    const prev = myVote;
    const prevTrue = voteTrue,
      prevFalse = voteFalse;

    let next: 1 | 0 | -1 = prev === v ? 0 : v;
    let nt = prevTrue,
      nf = prevFalse;
    if (prev === 1) nt -= 1;
    if (prev === -1) nf -= 1;
    if (next === 1) nt += 1;
    if (next === -1) nf += 1;

    setMyVote(next);
    setVoteTrue(nt);
    setVoteFalse(nf);

    try {
      const { data, error } = await sb.rpc("upsert_truth_vote", { post_id: p.id, value: next });
      if (error) throw error;
      if (data) {
        const t = Number((data as any).true ?? nt);
        const f = Number((data as any).false ?? nf);
        const m = Number((data as any).my_vote ?? next) as 1 | 0 | -1;
        setVoteTrue(t);
        setVoteFalse(f);
        setMyVote(m);
      }
    } catch {
      setMyVote(prev);
      setVoteTrue(prevTrue);
      setVoteFalse(prevFalse);
    } finally {
      setPendingVote(false);
    }
  }

  // ラベル
  async function toggleLabel(label: LabelKey) {
    if (pendingLabelKey) return;
    const user = await ensureLoginOrRedirect();
    if (!user) return;

    setPendingLabelKey(label);
    const had = myLabels.has(label);
    const prevSet = new Set(myLabels);
    const prevCounts = { ...labelCounts };

    const nextSet = new Set(prevSet);
    if (had) nextSet.delete(label);
    else nextSet.add(label);
    setMyLabels(nextSet);
    setLabelCounts((c) => ({ ...c, [label]: Math.max(0, (c[label] ?? 0) + (had ? -1 : 1)) }));

    try {
      if (!had) {
        const { error } = await sb.from("post_labels").insert({ post_id: p.id, user_id: user.id, label });
        if (error) throw error;
      } else {
        const { error } = await sb
          .from("post_labels")
          .delete()
          .eq("post_id", p.id)
          .eq("user_id", user.id)
          .eq("label", label);
        if (error) throw error;
      }
    } catch {
      setMyLabels(prevSet);
      setLabelCounts(prevCounts);
    } finally {
      setPendingLabelKey(null);
    }
  }

  // 返信
  async function submitReply() {
    if (!replyText.trim() || replying) return;
    const user = await ensureLoginOrRedirect();
    if (!user) return;
    setReplying(true);
    const r = await sb.rpc("create_reply", { parent: p.id, body: replyText.trim() });
    if (!r.error) {
      setReplyText("");
      setShowReply(false);
      setShowThread(true); // 送ったらスレッドを開く
      setReplyCount((c) => (c ?? 0) + 1); // カウント楽観更新
    }
    setReplying(false);
  }

  return (
    <div className="rounded border p-4 bg-white space-y-3">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 text-sm">
        <Link href={author.handle ? `/u/${encodeURIComponent(author.handle)}` : "#"} className="flex items-center gap-2 min-w-0">
          <img
            src={author.avatar ?? "https://placehold.co/32x32"}
            className="w-7 h-7 rounded-full border object-cover"
            alt={author.name ?? author.handle ?? "user"}
          />
          <span className="font-medium truncate max-w-[12rem]">
            {author.name ?? author.handle ?? (author.id ?? "").slice(0, 8)}
          </span>
          {author.handle && <span className="opacity-60">@{author.handle}</span>}
        </Link>
        <span className="opacity-60">·</span>
        <time dateTime={p.created_at} className="opacity-60">
          {new Date(p.created_at).toLocaleString()}
        </time>
        <div className="ml-auto flex items-center gap-2">
          {author.id && <FollowButton targetId={author.id as string} />}
          <ScoreBadge score={p.score} />
        </div>
      </div>

      {/* 本文 */}
      <div className="whitespace-pre-wrap break-words text-[15px] leading-6">{content}</div>

      {/* アクション */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {/* いいね */}
        <button
          onClick={toggleLike}
          disabled={pendingLike}
          className={`px-2 py-1 rounded border ${liked ? "bg-pink-50 border-pink-300" : "bg-gray-50"} disabled:opacity-60`}
          title="いいね"
        >
          ♥ {likes}
        </button>

        {/* 🚀 拡散（Boost） */}
        <button
          onClick={toggleBoost}
          disabled={pendingBoost}
          className={`px-2 py-1 rounded border ${boosted ? "bg-purple-50 border-purple-300" : "bg-gray-50"} disabled:opacity-60`}
          title="拡散（フォロワーに広める）"
        >
          🚀 {boosts}
        </button>

        {/* 真偽 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => castVote(1)}
            disabled={pendingVote}
            className={`px-2 py-1 rounded border ${myVote === 1 ? "bg-green-50 border-green-300" : "bg-gray-50"} disabled:opacity-60`}
            title="本当だと思う"
          >
            ✅ {voteTrue}
          </button>
          <button
            onClick={() => castVote(-1)}
            disabled={pendingVote}
            className={`px-2 py-1 rounded border ${myVote === -1 ? "bg-red-50 border-red-300" : "bg-gray-50"} disabled:opacity-60`}
            title="嘘だと思う"
          >
            ❌ {voteFalse}
          </button>
        </div>

        {/* ラベル */}
        <div className="flex flex-wrap items-center gap-2">
          {LABELS.map((l) => {
            const key = l.key as LabelKey;
            const mine = myLabels.has(key);
            const cnt = labelCounts[key] ?? 0;
            return (
              <button
                key={key}
                onClick={() => toggleLabel(key)}
                disabled={pendingLabelKey === key}
                className={`px-2 py-1 rounded border text-xs ${mine ? "bg-blue-50 border-blue-300" : "bg-gray-50"} disabled:opacity-60`}
                title={l.text}
              >
                <span className="mr-1">{l.emoji}</span>
                {l.text} {cnt > 0 ? `(${cnt})` : ""}
              </button>
            );
          })}
        </div>

        {/* 返信/スレッド */}
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={() => setShowThread((v) => !v)} className="px-2 py-1 rounded border bg-gray-50" title="この投稿の返信を表示/非表示">
            💬 {replyCount}
          </button>
          <Link href={`/p/${p.id}`} className="px-2 py-1 rounded border bg-gray-50" title="スレッドページへ">
            ↗ スレッド
          </Link>
          <button onClick={() => setShowReply((v) => !v)} className="px-2 py-1 rounded border bg-gray-50">
            返信する
          </button>
        </div>
      </div>

      {/* 返信フォーム */}
      {showReply && (
        <div className="space-y-2">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            className="w-full border rounded p-2 h-20"
            placeholder="返信を入力…"
          />
          <div className="flex gap-2">
            <button onClick={submitReply} disabled={replying || !replyText.trim()} className="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50">
              返信を送信
            </button>
            <button onClick={() => setShowReply(false)} className="px-3 py-1 rounded border">
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* インライン返信一覧 */}
      {showThread && <Replies postId={p.id} />}
    </div>
  );
}
