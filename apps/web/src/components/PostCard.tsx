"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type Post = {
  id: string;
  // 本文は text（なければ互換用 body）
  text?: string | null;
  body?: string | null;

  created_at: string;
  author?: string | null;            // auth.users.id
  username?: string | null;          // profiles.username
  display_name?: string | null;      // profiles.display_name
  avatar_url?: string | null;        // profiles.avatar_url

  score?: number | null;             // 嘘スコア(0-1)
  likes?: number | null;             // 集計済みが入る場合あり
  media_urls?: string[] | null;      // 1枚だけ表示
  analysis?: any | null;             // 画像診断結果(JSON)
};

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const hue = 120 - Math.min(120, pct); // 緑→赤
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

  // 自分=著者？
  const [meId, setMeId] = useState<string | null>(null);
  const isOwner = meId && p.author && meId === p.author;

  // 初期読み込み（いいね／投票／自分ID）
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (alive) setMeId(auth.user?.id ?? null);

      // いいね総数
      const likesHead = await supabase
        .from("reactions")
        .select("user_id", { count: "exact", head: true })
        .eq("post_id", p.id)
        .eq("kind", "like");
      if (alive && typeof likesHead.count === "number") setLikes(likesHead.count);

      // 自分のいいね
      if (auth.user) {
        const me = await supabase
          .from("reactions")
          .select("user_id")
          .eq("post_id", p.id)
          .eq("kind", "like")
          .eq("user_id", auth.user.id)
          .maybeSingle();
        if (alive) setLiked(!!me.data);
      }

      // 投票カウント
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

      // 自分の投票
      if (auth.user) {
        const mv = await supabase
          .from("truth_votes")
          .select("value")
          .eq("post_id", p.id)
          .eq("voter", auth.user.id)
          .maybeSingle();
        if (alive) setMyVote((mv.data?.value as 1 | -1 | undefined) ?? 0);
      }
    })();
    return () => { alive = false; };
  }, [p.id]);

  // いいね
  const onLike = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return (location.href = "/login?next=/");
    if (pendingLike) return;
    setPendingLike(true);
    try {
      if (liked) {
        setLiked(false);
        setLikes((v) => Math.max(0, v - 1));
        await supabase
          .from("reactions")
          .delete()
          .eq("post_id", p.id)
          .eq("user_id", user.id)
          .eq("kind", "like");
      } else {
        setLiked(true);
        setLikes((v) => v + 1);
        await supabase.from("reactions").insert({ user_id: user.id, post_id: p.id, kind: "like" });
      }
    } finally {
      setPendingLike(false);
    }
  };

  // 真偽投票
  const castVote = async (v: 1 | -1) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return (location.href = "/login?next=/");
    if (pendingVote) return;
    setPendingVote(true);
    try {
      if (myVote === v) {
        // 取り消し
        setMyVote(0);
        if (v === 1) setVoteTrue((x) => Math.max(0, x - 1));
        else setVoteFalse((x) => Math.max(0, x - 1));
        await supabase.from("truth_votes").delete().eq("post_id", p.id).eq("voter", user.id);
      } else if (myVote === 0) {
        // 新規
        setMyVote(v);
        if (v === 1) setVoteTrue((x) => x + 1); else setVoteFalse((x) => x + 1);
        await supabase.from("truth_votes").insert({ post_id: p.id, voter: user.id, value: v });
      } else {
        // 反対側にスイッチ
        if (myVote === 1) setVoteTrue((x) => Math.max(0, x - 1)); else setVoteFalse((x) => Math.max(0, x - 1));
        setMyVote(v);
        if (v === 1) setVoteTrue((x) => x + 1); else setVoteFalse((x) => x + 1);
        await supabase.from("truth_votes").update({ value: v }).eq("post_id", p.id).eq("voter", user.id);
      }
    } finally {
      setPendingVote(false);
    }
  };

  // 編集/削除（本人のみ）
  const onEdit = async () => {
    if (!isOwner) return;
    const body = prompt("本文を編集", content);
    if (body == null) return;
    const { error } = await supabase.from("posts").update({ text: body }).eq("id", p.id);
    if (error) alert(error.message); else location.reload();
  };

  const onDelete = async () => {
    if (!isOwner) return;
    if (!confirm("本当に削除しますか？")) return;
    const { error } = await supabase.from("posts").delete().eq("id", p.id);
    if (error) alert(error.message); else location.reload();
  };

  return (
    <article className="p-4 border rounded-xl bg-white">
      {/* ヘッダー：著者 */}
      <div className="flex items-center gap-2 text-xs opacity-80">
        <img
          src={p.avatar_url || "/default-avatar.svg"}
          alt=""
          className="w-6 h-6 rounded-full border"
        />
        <a className="font-medium hover:underline" href={`/user/${p.username || p.author}`}>
          {p.display_name || p.username || "無名"}
        </a>
        <span className="opacity-60">@{p.username || (p.author ?? "").slice(0, 8)}</span>
        <time className="ml-auto opacity-60">
          {new Date(p.created_at).toLocaleString()}
        </time>
        {isOwner ? (
          <div className="ml-2 flex gap-2">
            <button onClick={onEdit} className="opacity-60 hover:opacity-100 underline">編集</button>
            <button onClick={onDelete} className="opacity-60 hover:opacity-100 underline">削除</button>
          </div>
        ) : null}
      </div>

      {/* 本文 */}
      <div className="whitespace-pre-wrap my-3">{content}</div>

      {/* 画像 + 解析ラベル（任意） */}
      {Array.isArray(p.media_urls) && p.media_urls.length > 0 && (
        <img
          src={p.media_urls[0]!}
          className="mt-1 rounded border max-h-80 object-cover"
          alt=""
        />
      )}
      {p.analysis ? (
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className={`px-2 py-0.5 rounded ${p.analysis?.flags?.heavyEditing ? "bg-red-100" : "bg-green-100"}`}>
            画像加工: {p.analysis?.flags?.heavyEditing ? "強め" : "弱め/不明"}
          </span>
          <span className={`px-2 py-0.5 rounded ${p.analysis?.flags?.possibleAIGenerated ? "bg-orange-100" : "bg-gray-100"}`}>
            AI生成の手がかり{p.analysis?.flags?.possibleAIGenerated ? "あり" : "なし"}
          </span>
          <span className="px-2 py-0.5 rounded bg-gray-100">
            EXIF: {p.analysis?.flags?.noExif ? "なし" : "あり"}
          </span>
        </div>
      ) : null}

      {/* アクション行 */}
      <div className="mt-3 flex items-center gap-3 text-sm">
        {typeof p.score === "number" && <ScoreBadge score={p.score} />}

        {/* いいね */}
        <button
          onClick={onLike}
          disabled={pendingLike}
          className={`px-2 py-1 border rounded ${liked ? "bg-blue-50 border-blue-300" : ""}`}
          aria-label="いいね"
        >
          ❤ {likes}
        </button>

        {/* 真偽投票 */}
        <div className="ml-2 flex items-center gap-2">
          <button
            onClick={() => castVote(1)}
            disabled={pendingVote}
            className={`px-2 py-1 border rounded ${myVote === 1 ? "bg-emerald-50 border-emerald-300" : ""}`}
            title="本当っぽい"
          >
            👍 本当 {voteTrue}
          </button>
          <button
            onClick={() => castVote(-1)}
            disabled={pendingVote}
            className={`px-2 py-1 border rounded ${myVote === -1 ? "bg-rose-50 border-rose-300" : ""}`}
            title="嘘っぽい"
          >
            🤨 嘘 {voteFalse}
          </button>
        </div>
      </div>
    </article>
  );
}
