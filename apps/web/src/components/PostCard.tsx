// apps/web/src/components/PostCard.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  analyzeLieScore,
  buildLieScoreLearnedContextTrendRatios,
  buildLieScoreLearnedContextKey,
  calibrateLieScoreWithFeedback,
  deriveLieScoreLearnedContextObservation,
  evolveLieScoreLearnedContextCoefficient,
  inferLieScoreAgeHours,
  inferLieScoreTextLengthBucket,
  inferLieScoreTimeBucket,
  inferLieScoreWeekdayBucket,
  type LieScoreAttachmentKind,
  type LieScoreLearnedContextCoefficient,
  type LieScoreLearnedContextHistoryPoint,
  normalizeLieScorePostFormat,
  resolveSocialIdentity,
  resolveSocialIdentityLabels,
} from "@sns/core";
import { supabaseClient as supabase } from "@/lib/supabase/client";
import FollowButton from "@/components/FollowButton";
import Replies from "@/components/Replies";
import { LABELS, type LabelKey } from "@/lib/labels";
import { AiPostVerdictBadge } from "@/components/AiPostVerdictBadge";
import { personaDisplayName } from "@/lib/personaCatalog";

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
  score?: number | null; // 0..1 (ローカルの嘘スコア)
  analysis?: any;
};

function isMissingRelationError(err: any, relation: string) {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes(relation.toLowerCase()) && text.includes("does not exist");
}

function inferAttachmentKindHint(post: Post, content: string): LieScoreAttachmentKind {
  const analysis = post.analysis as any;
  let hasImage = false;
  let hasVideo = false;
  let hasUrl = false;
  const attachments = [
    ...(Array.isArray(analysis?.attachments) ? analysis.attachments : []),
    ...(Array.isArray(analysis?.media) ? analysis.media : []),
    ...(Array.isArray(analysis?.images) ? analysis.images : []),
  ];
  attachments.forEach((raw: any) => {
    const text = String(
      raw?.type ?? raw?.mime_type ?? raw?.mime ?? raw?.kind ?? raw?.url ?? raw?.src ?? raw ?? ""
    ).toLowerCase();
    if (!text) return;
    if (/video|mp4|mov|webm|m3u8/.test(text)) hasVideo = true;
    if (/image|png|jpe?g|gif|webp|heic|avif/.test(text)) hasImage = true;
    if (/https?:\/\//.test(text)) hasUrl = true;
  });
  if (
    Number(analysis?.media_count ?? analysis?.image_count ?? analysis?.attachments_count ?? 0) > 0
  ) {
    hasImage = hasImage || Number(analysis?.image_count ?? 0) > 0 || !hasVideo;
  }
  const urls = content.match(/https?:\/\/\S+/gi) ?? [];
  urls.forEach((u) => {
    hasUrl = true;
    if (/\.(mp4|mov|webm)(\?|$)/i.test(u)) hasVideo = true;
    if (/\.(png|jpe?g|gif|webp|heic|avif)(\?|$)/i.test(u)) hasImage = true;
  });
  const kindCount = [hasImage, hasVideo, hasUrl].filter(Boolean).length;
  if (kindCount > 1) return "mixed";
  if (hasVideo) return "video";
  if (hasImage) return "image";
  if (hasUrl) return "url";
  return "none";
}

function inferAttachmentMixKeyHint(post: Post, content: string): string {
  const analysis = post.analysis as any;
  let imageCount = 0;
  let videoCount = 0;
  let urlCount = 0;
  const attachments = [
    ...(Array.isArray(analysis?.attachments) ? analysis.attachments : []),
    ...(Array.isArray(analysis?.media) ? analysis.media : []),
    ...(Array.isArray(analysis?.images) ? analysis.images : []),
  ];
  attachments.forEach((raw: any) => {
    const text = String(
      raw?.type ?? raw?.mime_type ?? raw?.mime ?? raw?.kind ?? raw?.url ?? raw?.src ?? raw ?? ""
    ).toLowerCase();
    if (!text) return;
    if (/video|mp4|mov|webm|m3u8/.test(text)) videoCount += 1;
    if (/image|png|jpe?g|gif|webp|heic|avif/.test(text)) imageCount += 1;
    if (/https?:\/\//.test(text)) urlCount += 1;
  });
  const urls = content.match(/https?:\/\/\S+/gi) ?? [];
  urls.forEach((u) => {
    urlCount += 1;
    if (/\.(mp4|mov|webm)(\?|$)/i.test(u)) videoCount += 1;
    if (/\.(png|jpe?g|gif|webp|heic|avif)(\?|$)/i.test(u)) imageCount += 1;
  });
  if (imageCount <= 0 && videoCount <= 0 && urlCount <= 0) return "none";
  const b = (n: number) => (n <= 0 ? 0 : n === 1 ? 1 : 2);
  return `i${b(imageCount)}v${b(videoCount)}u${b(urlCount)}`;
}

function attachmentKindLabel(kind: LieScoreAttachmentKind) {
  if (kind === "image") return "画像";
  if (kind === "video") return "動画";
  if (kind === "url") return "URL";
  if (kind === "mixed") return "複合";
  return "なし";
}

function ScoreBadge({
  score,
  aiPercent,
}: {
  score: number | null | undefined;
  aiPercent?: number | null;
}) {
  let pct: number;

  if (typeof aiPercent === "number") {
    // AI 由来の「嘘％」がある場合はそれを優先
    pct = Math.max(0, Math.min(100, Math.round(aiPercent)));
  } else {
    // 従来どおり score (0..1) から計算
    const s = Math.max(0, Math.min(1, Number(score ?? 0) || 0));
    pct = Math.round(s * 100);
  }

  const hue = 120 - Math.min(120, pct);

  return (
    <span
      className="text-xs px-2 py-1 rounded-full border"
      style={{
        background: `hsl(${hue} 70% 95%)`,
        borderColor: `hsl(${hue} 50% 60%)`,
      }}
      title={`投稿文の盛り・ネタ感を含むAIクセ ${pct}%`}
    >
      AIクセ {pct}%
    </span>
  );
}

export default function PostCard({
  p,
  onLikeChanged,
  onBoostChanged,
  onReplySubmitted,
}: {
  p: Post;
  onLikeChanged?: (nextLiked: boolean) => void;
  onBoostChanged?: (nextBoosted: boolean) => void;
  onReplySubmitted?: () => void;
}) {
  // ✅ Supabase クライアントを1回だけ生成
  const sb = useMemo(() => supabase(), []);

  const content = (p.text ?? p.body ?? "").toString();
  const lieAnalysis = useMemo(() => analyzeLieScore({ text: content }), [content]);
  const [openCount, setOpenCount] = useState(0);
  const [reportCount, setReportCount] = useState(0);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [lieLearnedContext, setLieLearnedContext] = useState<LieScoreLearnedContextCoefficient | null>(null);
  const [lieLearnedContextAvailable, setLieLearnedContextAvailable] = useState(true);
  const [lieLearnedHistory, setLieLearnedHistory] = useState<LieScoreLearnedContextHistoryPoint[]>([]);
  const [lieLearnedHistoryAvailable, setLieLearnedHistoryAvailable] = useState(true);
  const [lieLearnedHistoryDaily, setLieLearnedHistoryDaily] = useState<LieScoreLearnedContextHistoryPoint[]>([]);
  const [lieLearnedHistoryDailyAvailable, setLieLearnedHistoryDailyAvailable] = useState(true);
  const [lieLearnedHistoryMode, setLieLearnedHistoryMode] = useState<"raw" | "daily" | "overlay">("overlay");
  const lieLearnedPersistSigRef = useRef<string>("");
  const displayedLieLearnedHistory = useMemo(
    () => (lieLearnedHistoryMode === "daily" ? lieLearnedHistoryDaily : lieLearnedHistory),
    [lieLearnedHistory, lieLearnedHistoryDaily, lieLearnedHistoryMode]
  );
  const displayedLieLearnedHistoryAvailable = useMemo(
    () => (lieLearnedHistoryMode === "daily" ? lieLearnedHistoryDailyAvailable : lieLearnedHistoryAvailable),
    [lieLearnedHistoryAvailable, lieLearnedHistoryDailyAvailable, lieLearnedHistoryMode]
  );
  const rawLieLearnedTrendRatios = useMemo(
    () => buildLieScoreLearnedContextTrendRatios(lieLearnedHistory, 12),
    [lieLearnedHistory]
  );
  const dailyLieLearnedTrendRatios = useMemo(
    () => buildLieScoreLearnedContextTrendRatios(lieLearnedHistoryDaily, 12),
    [lieLearnedHistoryDaily]
  );
  const overlayLieLearnedTrendBars = useMemo(() => {
    const raw = rawLieLearnedTrendRatios;
    const daily = dailyLieLearnedTrendRatios;
    const count = Math.max(raw.length, daily.length);
    if (count <= 0) return [] as Array<{ raw: number | null; daily: number | null; isLast: boolean }>;
    return Array.from({ length: count }, (_, idx) => {
      const rawIdx = idx - (count - raw.length);
      const dailyIdx = idx - (count - daily.length);
      return {
        raw: rawIdx >= 0 ? raw[rawIdx] ?? null : null,
        daily: dailyIdx >= 0 ? daily[dailyIdx] ?? null : null,
        isLast: idx === count - 1,
      };
    });
  }, [dailyLieLearnedTrendRatios, rawLieLearnedTrendRatios]);
  const lieLearnedTrendRatios = useMemo(
    () =>
      lieLearnedHistoryMode === "overlay"
        ? rawLieLearnedTrendRatios
        : buildLieScoreLearnedContextTrendRatios(displayedLieLearnedHistory, 12),
    [displayedLieLearnedHistory, lieLearnedHistoryMode, rawLieLearnedTrendRatios]
  );
  const postPersonaKey = String(
    p.analysis?.persona?.selected ??
      p.analysis?.persona?.candidates?.[0]?.key ??
      ""
  ).trim();
  const postPersonaName = postPersonaKey ? personaDisplayName(postPersonaKey) : null;

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
  const authorIdentity = useMemo(
    () =>
      resolveSocialIdentity({
        id: author.id ?? null,
        handle: author.handle ?? null,
        displayName: author.name ?? null,
      }),
    [author.handle, author.id, author.name]
  );
  const authorLabels = useMemo(
    () => resolveSocialIdentityLabels(authorIdentity),
    [authorIdentity]
  );
  const authorPrimaryLabel = authorLabels.primary;
  const authorSecondaryLabel = authorLabels.secondary;

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

  // 🔖 保存 / コレクション
  const [saves, setSaves] = useState<number>(0);
  const [saved, setSaved] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);
  const [saveCollectionKey, setSaveCollectionKey] = useState<string>("saved");
  const [saveCollectionLabel, setSaveCollectionLabel] = useState<string>("保存");
  const [saveCollectionAvailable, setSaveCollectionAvailable] = useState(false);

  // 真偽
  const [voteTrue, setVoteTrue] = useState(0);
  const [voteFalse, setVoteFalse] = useState(0);
  const [myVote, setMyVote] = useState<1 | 0 | -1>(0);
  const [pendingVote, setPendingVote] = useState(false);

  // ラベル
  const labelKeys = useMemo(
    () => LABELS.map((l) => l.key) as readonly LabelKey[],
    []
  );
  const [labelCounts, setLabelCounts] = useState<Record<LabelKey, number>>(
    Object.fromEntries(labelKeys.map((k) => [k, 0])) as Record<
      LabelKey,
      number
    >
  );
  const [myLabels, setMyLabels] = useState<Set<LabelKey>>(new Set());
  const [pendingLabelKey, setPendingLabelKey] = useState<LabelKey | null>(
    null
  );

  // スレッド/返信
  const [showThread, setShowThread] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyCount, setReplyCount] = useState<number>(
    p.reply_count ?? 0
  );
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // 🔥 LLM 由来の「嘘％」（AI 判定バッジから通知される）
  const [aiLiePercent, setAiLiePercent] = useState<number | null>(null);
  const calibratedLie = useMemo(
    () => {
      const content = String(p.text ?? p.body ?? "");
      const attachmentKind = inferAttachmentKindHint(p, content);
      const attachmentMixKey = inferAttachmentMixKeyHint(p, content);
      return calibrateLieScoreWithFeedback(lieAnalysis, {
        opens: openCount,
        replies: replyCount,
        reports: reportCount,
        truthTrueVotes: voteTrue,
        truthFalseVotes: voteFalse,
        learnedContext: lieLearnedContext,
        context: {
          timeBucket: inferLieScoreTimeBucket(p.created_at),
          weekdayBucket: inferLieScoreWeekdayBucket(p.created_at),
          postFormat: normalizeLieScorePostFormat(
            String(
              p.analysis?.post_format ??
                p.analysis?.postFormat ??
                p.analysis?.persona?.post_format ??
                ""
            ) || null
          ),
          personaKey: String(
            p.analysis?.persona?.selected ?? p.analysis?.persona?.candidates?.[0]?.key ?? ""
          ).trim() || null,
          attachmentKind,
          attachmentMixKey,
          hasAttachment: attachmentKind !== "none",
          textLengthBucket: inferLieScoreTextLengthBucket(content),
          ageHours: inferLieScoreAgeHours(p.created_at),
        },
      });
    },
    [
      lieAnalysis,
      lieLearnedContext,
      openCount,
      p.analysis,
      p.body,
      p.created_at,
      p.text,
      replyCount,
      reportCount,
      voteFalse,
      voteTrue,
    ]
  );

  // Hydration エラー対策：ロケール固定でフォーマット
  const createdAtLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date(p.created_at));
    } catch {
      return p.created_at;
    }
  }, [p.created_at]);

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
      if (alive) setViewerId(user?.id ?? null);

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
        if (alive)
          setMyVote((mv.data?.value as 1 | -1 | undefined) ?? 0);

        // 自分のラベル
        const myLs = await sb
          .from("post_labels")
          .select("label")
          .eq("post_id", p.id)
          .eq("user_id", user.id);
        if (alive) {
          const set = new Set<LabelKey>();
          (myLs.data ?? []).forEach((r: any) => {
            if (labelKeys.includes(r.label as LabelKey))
              set.add(r.label as LabelKey);
          });
          setMyLabels(set);
        }
      }

      // 真偽件数
      const [t1, t2, opensRes, reportsRes] = await Promise.all([
        sb
          .from("truth_votes")
          .select("id", { count: "exact", head: true })
          .eq("post_id", p.id)
          .eq("value", 1),
        sb
          .from("truth_votes")
          .select("id", { count: "exact", head: true })
          .eq("post_id", p.id)
          .eq("value", -1),
        sb
          .from("user_post_open_state")
          .select("post_id", { count: "exact", head: true })
          .eq("post_id", p.id)
          .eq("user_id", user.id),
        sb
          .from("user_reports")
          .select("id", { count: "exact", head: true })
          .eq("post_id", p.id),
      ]);
      if (alive) {
        if (typeof t1.count === "number") setVoteTrue(t1.count);
        if (typeof t2.count === "number") setVoteFalse(t2.count);
        if (typeof opensRes.count === "number") setOpenCount(Math.max(0, opensRes.count));
        if (!reportsRes.error && typeof reportsRes.count === "number") {
          setReportCount(Math.max(0, reportsRes.count));
        } else if (reportsRes.error && isMissingRelationError(reportsRes.error, "user_reports")) {
          setReportCount(0);
        }
      }

      // ラベル件数
      const allLabels = await sb
        .from("post_labels")
        .select("label")
        .eq("post_id", p.id);
      if (alive) {
        const counts = Object.fromEntries(
          labelKeys.map((k) => [k, 0])
        ) as Record<LabelKey, number>;
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

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const res = await fetch(`/api/posts/${encodeURIComponent(p.id)}/save`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        if (stop || !json) return;
        if (typeof json.saveCount === "number") setSaves(Math.max(0, json.saveCount));
        setSaved(Boolean(json.saved));
        setSaveCollectionAvailable(Boolean(json.collectionAvailable));
        if (json.collection?.key) setSaveCollectionKey(String(json.collection.key));
        if (json.collection?.label) setSaveCollectionLabel(String(json.collection.label));
      } catch {
        // ignore
      }
    })();
    return () => {
      stop = true;
    };
  }, [p.id]);

  useEffect(() => {
    if (!viewerId) return;
    const content = String(p.text ?? p.body ?? "");
    const attachmentKind = inferAttachmentKindHint(p, content);
    const attachmentMixKey = inferAttachmentMixKeyHint(p, content);
    const feedbackInput = {
      opens: openCount,
      replies: replyCount,
      reports: reportCount,
      truthTrueVotes: voteTrue,
      truthFalseVotes: voteFalse,
      context: {
        timeBucket: inferLieScoreTimeBucket(p.created_at),
        weekdayBucket: inferLieScoreWeekdayBucket(p.created_at),
        postFormat: normalizeLieScorePostFormat(
          String(
            p.analysis?.post_format ??
              p.analysis?.postFormat ??
              p.analysis?.persona?.post_format ??
              ""
          ) || null
        ),
        personaKey: postPersonaKey || null,
        attachmentKind,
        attachmentMixKey,
        hasAttachment: attachmentKind !== "none",
        textLengthBucket: inferLieScoreTextLengthBucket(content),
        ageHours: inferLieScoreAgeHours(p.created_at),
      },
    } as const;
    const provisional = calibrateLieScoreWithFeedback(lieAnalysis, feedbackInput);
    const weekdayTimeBucket = provisional.feedbackSignals.weekdayTimeBucket;
    const contextKey =
      provisional.feedbackSignals.learnedContextKey ??
      buildLieScoreLearnedContextKey({
        weekdayTimeBucket,
        personaKey: provisional.feedbackSignals.personaKey,
        attachmentMixKey,
      });

    if (!weekdayTimeBucket || !contextKey) {
      setLieLearnedContext(null);
      setLieLearnedHistory([]);
      return;
    }

    const sig = JSON.stringify({
      viewerId,
      postId: p.id,
      contextKey,
      opens: openCount,
      replies: replyCount,
      reports: reportCount,
      truthTrueVotes: voteTrue,
      truthFalseVotes: voteFalse,
    });
    if (lieLearnedPersistSigRef.current === sig) return;
    lieLearnedPersistSigRef.current = sig;

    let alive = true;
    (async () => {
      try {
        const [res, historyRes, historyDailyRes] = await Promise.all([
          sb
            .from("user_lie_score_context_coefficients")
            .select("context_key,adjustment_bias,confidence,samples,updated_at")
            .eq("user_id", viewerId)
            .eq("context_key", contextKey)
            .maybeSingle(),
          sb
            .from("user_lie_score_context_coefficient_history")
            .select("created_at,adjustment_bias,confidence,samples")
            .eq("user_id", viewerId)
            .eq("context_key", contextKey)
            .order("created_at", { ascending: false })
            .limit(14),
          sb
            .from("user_lie_score_context_coefficient_history_daily")
            .select("day,avg_adjustment_bias,avg_confidence,points")
            .eq("user_id", viewerId)
            .eq("context_key", contextKey)
            .order("day", { ascending: false })
            .limit(45),
        ]);

        if (historyRes.error) {
          if (isMissingRelationError(historyRes.error, "user_lie_score_context_coefficient_history")) {
            if (alive) {
              setLieLearnedHistoryAvailable(false);
              setLieLearnedHistory([]);
            }
          } else {
            throw historyRes.error;
          }
        } else if (alive) {
          setLieLearnedHistoryAvailable(true);
          setLieLearnedHistory(
            ((historyRes.data ?? []) as any[])
              .map((row) => {
                const at = String(row?.created_at ?? "").trim();
                if (!at) return null;
                return {
                  at,
                  adjustmentBias: Number(row?.adjustment_bias ?? 0) || 0,
                  confidence: Math.max(0, Math.min(1, Number(row?.confidence ?? 0) || 0)),
                  samples: Math.max(0, Math.floor(Number(row?.samples ?? 0) || 0)),
                } satisfies LieScoreLearnedContextHistoryPoint;
              })
              .filter(Boolean)
              .reverse() as LieScoreLearnedContextHistoryPoint[]
          );
        }

        if (historyDailyRes.error) {
          if (isMissingRelationError(historyDailyRes.error, "user_lie_score_context_coefficient_history_daily")) {
            if (alive) {
              setLieLearnedHistoryDailyAvailable(false);
              setLieLearnedHistoryDaily([]);
            }
          } else {
            throw historyDailyRes.error;
          }
        } else if (alive) {
          setLieLearnedHistoryDailyAvailable(true);
          setLieLearnedHistoryDaily(
            ((historyDailyRes.data ?? []) as any[])
              .map((row) => {
                const day = String(row?.day ?? "").trim();
                if (!day) return null;
                return {
                  at: `${day}T00:00:00.000Z`,
                  adjustmentBias: Number(row?.avg_adjustment_bias ?? 0) || 0,
                  confidence: Math.max(0, Math.min(1, Number(row?.avg_confidence ?? 0) || 0)),
                  samples: Math.max(0, Math.floor(Number(row?.points ?? 0) || 0)),
                } satisfies LieScoreLearnedContextHistoryPoint;
              })
              .filter(Boolean)
              .reverse() as LieScoreLearnedContextHistoryPoint[]
          );
        }

        if (res.error) {
          if (isMissingRelationError(res.error, "user_lie_score_context_coefficients")) {
            if (alive) {
              setLieLearnedContextAvailable(false);
              setLieLearnedContext(null);
            }
            return;
          }
          throw res.error;
        }

        let current: LieScoreLearnedContextCoefficient | null = res.data
          ? {
              contextKey: String((res.data as any).context_key ?? contextKey),
              adjustmentBias: Number((res.data as any).adjustment_bias ?? 0) || 0,
              confidence: Number((res.data as any).confidence ?? 0) || 0,
              samples: Math.max(0, Math.floor(Number((res.data as any).samples ?? 0) || 0)),
              updatedAt: (res.data as any).updated_at ?? null,
            }
          : null;

        if (alive) setLieLearnedContextAvailable(true);

        const observation = deriveLieScoreLearnedContextObservation(feedbackInput);
        if (observation) {
          const next = evolveLieScoreLearnedContextCoefficient({
            current,
            observation,
          });
          const nowIso = new Date().toISOString();
          const [up, historyInsert] = await Promise.all([
            sb.from("user_lie_score_context_coefficients").upsert(
              {
                user_id: viewerId,
                context_key: contextKey,
                weekday_time_bucket: weekdayTimeBucket,
                persona_key: provisional.feedbackSignals.personaKey ?? "global",
                attachment_mix_key: attachmentMixKey,
                adjustment_bias: next.adjustmentBias,
                confidence: next.confidence,
                samples: next.samples,
                updated_at: nowIso,
              },
              { onConflict: "user_id,context_key" }
            ),
            sb.from("user_lie_score_context_coefficient_history").insert({
              user_id: viewerId,
              context_key: contextKey,
              weekday_time_bucket: weekdayTimeBucket,
              persona_key: provisional.feedbackSignals.personaKey ?? "global",
              attachment_mix_key: attachmentMixKey,
              adjustment_bias: next.adjustmentBias,
              confidence: next.confidence,
              samples: next.samples,
              created_at: nowIso,
            }),
          ]);
          if (up.error) {
            if (isMissingRelationError(up.error, "user_lie_score_context_coefficients")) {
              if (alive) {
                setLieLearnedContextAvailable(false);
                setLieLearnedContext(null);
              }
              return;
            }
          } else {
            current = {
              contextKey,
              adjustmentBias: next.adjustmentBias,
              confidence: next.confidence,
              samples: next.samples,
              updatedAt: nowIso,
            };
            if (!historyInsert.error && alive) {
              setLieLearnedHistoryMode("overlay");
              setLieLearnedHistory((prev) =>
                [
                  ...prev,
                  {
                    at: nowIso,
                    adjustmentBias: next.adjustmentBias,
                    confidence: next.confidence,
                    samples: next.samples,
                  } satisfies LieScoreLearnedContextHistoryPoint,
                ].slice(-14)
              );
            } else if (
              historyInsert.error &&
              isMissingRelationError(historyInsert.error, "user_lie_score_context_coefficient_history")
            ) {
              if (alive) setLieLearnedHistoryAvailable(false);
            }
          }
        }

        if (!alive) return;
        setLieLearnedContext(current);
      } catch {
        if (!alive) return;
        setLieLearnedContext(null);
        setLieLearnedHistory([]);
        setLieLearnedHistoryDaily([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [
    lieAnalysis,
    openCount,
    p.analysis,
    p.body,
    p.created_at,
    p.id,
    p.text,
    postPersonaKey,
    replyCount,
    reportCount,
    sb,
    viewerId,
    voteFalse,
    voteTrue,
  ]);

  useEffect(() => {
    setLieLearnedHistoryMode("overlay");
  }, [p.id]);

  async function ensureLoginOrRedirect() {
    try {
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) {
        location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
        return null;
      }
      return user;
    } catch {
      setActionMessage("ログイン状態を確認できませんでした。時間をおいて再度お試しください。");
      return null;
    }
  }

  // いいね
  async function toggleLike() {
    if (pendingLike) return;
    const user = await ensureLoginOrRedirect();
    if (!user) return;
    setPendingLike(true);
    setActionMessage(null);

    const prevLiked = liked,
      prevLikes = likes;
    const nextLiked = !prevLiked;
    setLiked(nextLiked);
    setLikes(prevLikes + (nextLiked ? 1 : -1));

    try {
      if (nextLiked) {
        const { error } = await sb
          .from("reactions")
          .insert({ post_id: p.id, user_id: user.id, kind: "like" });
        if (error) throw error;
        onLikeChanged?.(true);
      } else {
        const { error } = await sb
          .from("reactions")
          .delete()
          .eq("post_id", p.id)
          .eq("user_id", user.id)
          .eq("kind", "like");
        if (error) throw error;
        onLikeChanged?.(false);
      }
    } catch {
      setLiked(prevLiked);
      setLikes(prevLikes);
      setActionMessage("いいねを更新できませんでした。時間をおいて再度お試しください。");
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
    setActionMessage(null);

    const prevBoosted = boosted,
      prevBoosts = boosts;
    const nextBoosted = !prevBoosted;
    setBoosted(nextBoosted);
    setBoosts(prevBoosts + (nextBoosted ? 1 : -1));

    try {
      if (nextBoosted) {
        const { error } = await sb
          .from("reactions")
          .insert({ post_id: p.id, user_id: user.id, kind: "boost" });
        if (error) throw error;
        onBoostChanged?.(true);
      } else {
        const { error } = await sb
          .from("reactions")
          .delete()
          .eq("post_id", p.id)
          .eq("user_id", user.id)
          .eq("kind", "boost");
        if (error) throw error;
        onBoostChanged?.(false);
      }
    } catch {
      setBoosted(prevBoosted);
      setBoosts(prevBoosts);
      setActionMessage("拡散を更新できませんでした。時間をおいて再度お試しください。");
    } finally {
      setPendingBoost(false);
    }
  }

  async function savePost(nextSaved?: boolean, nextCollection?: { key: string; label: string }) {
    if (pendingSave) return;
    const user = await ensureLoginOrRedirect();
    if (!user) return;
    setPendingSave(true);
    setActionMessage(null);

    const prevSaved = saved;
    const prevSaves = saves;
    const prevCollectionKey = saveCollectionKey;
    const prevCollectionLabel = saveCollectionLabel;

    const targetSaved = typeof nextSaved === "boolean" ? nextSaved : !saved;
    const targetCollectionKey = nextCollection?.key ?? saveCollectionKey ?? "saved";
    const targetCollectionLabel = nextCollection?.label ?? saveCollectionLabel ?? "保存";

    setSaved(targetSaved);
    setSaves((c) => Math.max(0, c + (targetSaved === prevSaved ? 0 : targetSaved ? 1 : -1)));
    setSaveCollectionKey(targetCollectionKey);
    setSaveCollectionLabel(targetCollectionLabel);

    try {
      const res = await fetch(`/api/posts/${encodeURIComponent(p.id)}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saved: targetSaved,
          collectionKey: targetCollectionKey,
          collectionLabel: targetCollectionLabel,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error ?? "save_failed");
      }
      setSaved(Boolean(json?.saved));
      if (typeof json?.saveCount === "number") setSaves(Math.max(0, json.saveCount));
      setSaveCollectionAvailable(Boolean(json?.collectionAvailable));
      if (json?.collection?.key) setSaveCollectionKey(String(json.collection.key));
      if (json?.collection?.label) setSaveCollectionLabel(String(json.collection.label));
    } catch {
      setSaved(prevSaved);
      setSaves(prevSaves);
      setSaveCollectionKey(prevCollectionKey);
      setSaveCollectionLabel(prevCollectionLabel);
      setActionMessage("保存を更新できませんでした。時間をおいて再度お試しください。");
    } finally {
      setPendingSave(false);
    }
  }

  async function chooseCustomCollection() {
    const user = await ensureLoginOrRedirect();
    if (!user) return;
    const label = window.prompt("保存先コレクション名（例: ネタ帳 / 後で読む / 研究）", saveCollectionLabel || "保存");
    if (!label) return;
    const normalized = label.trim();
    if (!normalized) return;
    const key = normalized
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_ -]+/gu, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 24) || "saved";
    await savePost(true, { key, label: normalized.slice(0, 24) });
  }

  // 真偽
  async function castVote(v: 1 | -1) {
    if (pendingVote) return;
    const user = await ensureLoginOrRedirect();
    if (!user) return;
    setPendingVote(true);
    setActionMessage(null);

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
      const { data, error } = await sb.rpc("upsert_truth_vote", {
        post_id: p.id,
        value: next,
      });
      if (error) throw error;
      if (data) {
        const t = Number((data as any).true ?? nt);
        const f = Number((data as any).false ?? nf);
        const m = Number(
          (data as any).my_vote ?? next
        ) as 1 | 0 | -1;
        setVoteTrue(t);
        setVoteFalse(f);
        setMyVote(m);
      }
    } catch {
      setMyVote(prev);
      setVoteTrue(prevTrue);
      setVoteFalse(prevFalse);
      setActionMessage("投票を更新できませんでした。時間をおいて再度お試しください。");
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
    setActionMessage(null);
    const had = myLabels.has(label);
    const prevSet = new Set(myLabels);
    const prevCounts = { ...labelCounts };

    const nextSet = new Set(prevSet);
    if (had) nextSet.delete(label);
    else nextSet.add(label);
    setMyLabels(nextSet);
    setLabelCounts((c) => ({
      ...c,
      [label]: Math.max(0, (c[label] ?? 0) + (had ? -1 : 1)),
    }));

    try {
      if (!had) {
        const { error } = await sb
          .from("post_labels")
          .insert({ post_id: p.id, user_id: user.id, label });
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
      setActionMessage("ラベルを更新できませんでした。時間をおいて再度お試しください。");
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
    setActionMessage(null);
    try {
      const r = await sb.rpc("create_reply", {
        parent: p.id,
        body: replyText.trim(),
      });
      if (r.error) throw r.error;
      setReplyText("");
      setShowReply(false);
      setShowThread(true); // 送ったらスレッドを開く
      setReplyCount((c) => (c ?? 0) + 1); // カウント楽観更新
      setActionMessage("返信を投稿しました。");
      onReplySubmitted?.();
    } catch {
      setActionMessage("返信を投稿できませんでした。時間をおいて再度お試しください。");
    } finally {
      setReplying(false);
    }
  }

  return (
    <div className="rounded border p-4 bg-white space-y-3">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href={
            author.handle
              ? `/u/${encodeURIComponent(author.handle)}`
              : "#"
          }
          className="flex items-center gap-2 min-w-0"
        >
          <img
            src={author.avatar ?? "https://placehold.co/32x32"}
            className="w-7 h-7 rounded-full border object-cover"
            alt={authorPrimaryLabel}
          />
          <span className="font-medium truncate max-w-[12rem]">
            {authorPrimaryLabel}
          </span>
          {authorSecondaryLabel && (
            <span className="opacity-60">{authorSecondaryLabel}</span>
          )}
        </Link>
        <span className="opacity-60">·</span>
        <time dateTime={p.created_at} className="opacity-60">
          {createdAtLabel}
        </time>
        <div className="ml-auto flex items-center gap-2">
          {author.id && (
            <FollowButton targetId={author.id as string} />
          )}
        </div>
      </div>

      {/* 本文 */}
      {postPersonaKey && postPersonaName && (
        <div className="text-xs inline-flex">
          <span
            className="px-2 py-0.5 rounded-full border bg-blue-50 border-blue-300"
            title="この投稿から得られたキャラ成長のシグナルです。投稿自体のキャラではありません。"
          >
            成長シグナル: {postPersonaName}系
          </span>
        </div>
      )}
      <div className="whitespace-pre-wrap break-words text-[15px] leading-6">
        {content}
      </div>

      {/* 嘘スコア & AI 判定 */}
      <div className="flex flex-col items-stretch gap-1">
        <div className="flex justify-end">
          {/* AI の嘘％があればそれを優先してバッジに表示 */}
          <ScoreBadge score={aiLiePercent == null ? calibratedLie.score : p.score} aiPercent={aiLiePercent} />
        </div>
        {(calibratedLie.cautionChips.length > 0 || calibratedLie.reliefChips.length > 0) && (
          <div className="flex flex-wrap gap-1 justify-end">
            {calibratedLie.cautionChips.slice(0, 2).map((chip) => (
              <span key={`lie-caution-${p.id}-${chip}`} className="text-[11px] px-2 py-0.5 rounded-full border bg-rose-50 border-rose-200">
                {chip}
              </span>
            ))}
            {calibratedLie.reliefChips.slice(0, 2).map((chip) => (
              <span key={`lie-relief-${p.id}-${chip}`} className="text-[11px] px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-200">
                {chip}
              </span>
            ))}
          </div>
        )}
        {Math.abs(calibratedLie.adjustment) >= 0.01 && (
          <div className="text-[11px] text-slate-400 text-right">
            反応補正 {calibratedLie.adjustment > 0 ? "+" : ""}
            {Math.round(calibratedLie.adjustment * 100)}pt
            {calibratedLie.feedbackSignals.opens > 0
              ? ` / 開封 ${calibratedLie.feedbackSignals.opens}`
              : ""}
          </div>
        )}
        <div className="text-[11px] text-slate-400 text-right">
          反応が増えるほど、投稿の届き方メモがあなた向けに調整されます。
        </div>
        {calibratedLie.reasons[0] && (
          <div className="text-[11px] text-slate-500 text-right">{calibratedLie.reasons[0]}</div>
        )}
        <AiPostVerdictBadge
          postId={p.id}
          text={content}
          onLiePercentChange={setAiLiePercent}
        />
      </div>

      {/* アクション */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {/* いいね */}
        <button
          onClick={toggleLike}
          disabled={pendingLike}
          className={`px-2 py-1 rounded border ${
            liked ? "bg-pink-50 border-pink-300" : "bg-gray-50"
          } disabled:opacity-60`}
          title="いいね"
        >
          ♥ {likes}
        </button>

        {/* 拡散（Boost） */}
        <button
          onClick={toggleBoost}
          disabled={pendingBoost}
          className={`px-2 py-1 rounded border ${
            boosted
              ? "bg-purple-50 border-purple-300"
              : "bg-gray-50"
          } disabled:opacity-60`}
          title="拡散（フォロワーに広める）"
        >
          拡散 {boosts}
        </button>

        <button
          onClick={() => savePost()}
          disabled={pendingSave}
          className={`px-2 py-1 rounded border ${
            saved ? "bg-amber-50 border-amber-300" : "bg-gray-50"
          } disabled:opacity-60`}
          title="保存 / コレクションに追加"
        >
          保存 {saves}
        </button>
        {saved && (
          <div className="flex items-center gap-1">
            <select
              value={saveCollectionKey}
              onChange={(e) => {
                const key = e.target.value;
                const map: Record<string, string> = {
                  saved: "保存",
                  read_later: "後で読む",
                  idea: "ネタ帳",
                  research: "研究",
                  favorite: "お気に入り",
                };
                if (key === "__custom__") {
                  void chooseCustomCollection();
                  return;
                }
                void savePost(true, { key, label: map[key] ?? saveCollectionLabel ?? "保存" });
              }}
              className="px-2 py-1 rounded border bg-white text-xs"
              title="保存先コレクション"
            >
              <option value="saved">保存</option>
              <option value="read_later">後で読む</option>
              <option value="idea">ネタ帳</option>
              <option value="research">研究</option>
              <option value="favorite">お気に入り</option>
              {!["saved", "read_later", "idea", "research", "favorite"].includes(saveCollectionKey) && (
                <option value={saveCollectionKey}>{saveCollectionLabel}</option>
              )}
              <option value="__custom__">+ 新規</option>
            </select>
            {!saveCollectionAvailable && (
              <span className="text-[10px] opacity-60">整理機能は準備中</span>
            )}
          </div>
        )}

        {/* 真偽 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => castVote(1)}
            disabled={pendingVote}
            className={`px-2 py-1 rounded border ${
              myVote === 1
                ? "bg-green-50 border-green-300"
                : "bg-gray-50"
            } disabled:opacity-60`}
            title="本当だと思う"
          >
            本当 {voteTrue}
          </button>
          <button
            onClick={() => castVote(-1)}
            disabled={pendingVote}
            className={`px-2 py-1 rounded border ${
              myVote === -1
                ? "bg-red-50 border-red-300"
                : "bg-gray-50"
            } disabled:opacity-60`}
            title="嘘だと思う"
          >
            違う {voteFalse}
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
                className={`px-2 py-1 rounded border text-xs ${
                  mine
                    ? "bg-blue-50 border-blue-300"
                    : "bg-gray-50"
                } disabled:opacity-60`}
                title={l.text}
              >
                {l.text} {cnt > 0 ? `(${cnt})` : ""}
              </button>
            );
          })}
        </div>

        {/* 返信/スレッド */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => setShowThread((v) => !v)}
            className="px-2 py-1 rounded border bg-gray-50"
            title="この投稿の返信を表示/非表示"
          >
            返信 {replyCount}
          </button>
          <Link
            href={`/p/${p.id}`}
            className="px-2 py-1 rounded border bg-gray-50"
            title="スレッドページへ"
          >
            ↗ スレッド
          </Link>
          <button
            onClick={() => setShowReply((v) => !v)}
            className="px-2 py-1 rounded border bg-gray-50"
          >
            返信する
          </button>
        </div>
      </div>

      {/* 返信フォーム */}
      {actionMessage && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          {actionMessage}
        </div>
      )}
      {showReply && (
        <div className="space-y-2">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            className="w-full border rounded p-2 h-20"
            placeholder="返信を入力…"
          />
          <div className="flex gap-2">
            <button
              onClick={submitReply}
              disabled={replying || !replyText.trim()}
              className="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
            >
              返信を送信
            </button>
            <button
              onClick={() => setShowReply(false)}
              className="px-3 py-1 rounded border"
            >
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
