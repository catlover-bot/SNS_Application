import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type ReactionRow = { post_id?: string | null; kind?: string | null; created_at?: string | null };
type ReplyRow = { parent_id?: string | null; created_at?: string | null };
type OpenRow = { post_id?: string | null; opened_at?: string | null };
type PersonaFeedEventRow = { post_id?: string | null; event_type?: string | null; created_at?: string | null };

function clamp(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function isMissingRelationError(err: any, relation: string) {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes(relation.toLowerCase()) && text.includes("does not exist");
}

function parseAnalysis(raw: any) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return typeof raw === "object" ? raw : null;
}

function normalizeReactionKind(raw: string | null | undefined) {
  const kind = String(raw ?? "").toLowerCase().trim();
  if (!kind) return "unknown";
  if (kind.includes("like")) return "like";
  if (kind.includes("boost") || kind.includes("repost")) return "boost";
  if (kind.includes("save") || kind.includes("bookmark") || kind.includes("favorite")) return "save";
  if (kind.includes("reply")) return "reply";
  return kind;
}

function countReactionKinds(rows: ReactionRow[]) {
  let likes = 0;
  let boosts = 0;
  let saves = 0;
  rows.forEach((r) => {
    const kind = normalizeReactionKind(r?.kind);
    if (kind === "like") likes += 1;
    if (kind === "boost") boosts += 1;
    if (kind === "save") saves += 1;
  });
  return { likes, boosts, saves };
}

function countPersonaFeedEvents(rows: PersonaFeedEventRow[]) {
  let impressions = 0;
  let opens = 0;
  rows.forEach((r) => {
    const ev = String(r?.event_type ?? "").trim();
    if (ev === "impression") impressions += 1;
    if (ev === "open") opens += 1;
  });
  return { impressions, opens };
}

function ratio(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

function round(v: number | null | undefined, digits = 3) {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const p = 10 ** digits;
  return Math.round(v * p) / p;
}

function formatHourLabel(d: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function buildTrendTimes(createdAtIso: string, now: Date, points = 8) {
  const createdMs = Date.parse(createdAtIso);
  const nowMs = now.getTime();
  const startMs = Number.isFinite(createdMs) ? createdMs : nowMs;
  const endMs = Math.max(startMs + 5 * 60_000, nowMs);
  const span = endMs - startMs;
  const list: number[] = [];
  for (let i = 0; i < points; i += 1) {
    const ratio = points <= 1 ? 1 : i / (points - 1);
    list.push(Math.round(startMs + span * ratio));
  }
  return Array.from(new Set(list)).sort((a, b) => a - b);
}

function cumulativeCount(times: number[], atOrBeforeMs: number) {
  let count = 0;
  for (let i = 0; i < times.length; i += 1) {
    if (times[i] <= atOrBeforeMs) count += 1;
    else break;
  }
  return count;
}

function summarizeSinglePost(args: {
  reactions: ReactionRow[];
  replies: ReplyRow[];
  opens: OpenRow[];
  pfEvents: PersonaFeedEventRow[];
}) {
  const reactionCounts = countReactionKinds(args.reactions);
  const replyCount = args.replies.length;
  const uniqueOpenCount = args.opens.length;
  const pfCounts = countPersonaFeedEvents(args.pfEvents);
  const saveRate = ratio(reactionCounts.saves, Math.max(1, uniqueOpenCount));
  const replyRate = ratio(replyCount, Math.max(1, uniqueOpenCount));
  const likeRate = ratio(reactionCounts.likes, Math.max(1, uniqueOpenCount));
  const boostRate = ratio(reactionCounts.boosts, Math.max(1, uniqueOpenCount));
  const personaFeedOpenRate = ratio(pfCounts.opens, pfCounts.impressions);

  const composite = clamp(
    (likeRate ?? 0) * 0.22 +
      (replyRate ?? 0) * 0.28 +
      (saveRate ?? 0) * 0.32 +
      (boostRate ?? 0) * 0.18 +
      (personaFeedOpenRate ?? 0) * 0.15,
    0,
    1.2
  );
  const normalizedComposite = clamp(composite / 0.55, 0, 1);
  const grade =
    normalizedComposite >= 0.82
      ? "S"
      : normalizedComposite >= 0.64
      ? "A"
      : normalizedComposite >= 0.46
      ? "B"
      : normalizedComposite >= 0.28
      ? "C"
      : "D";

  return {
    counts: {
      likes: reactionCounts.likes,
      boosts: reactionCounts.boosts,
      saves: reactionCounts.saves,
      replies: replyCount,
      uniqueOpens: uniqueOpenCount,
      personaFeedImpressions: pfCounts.impressions,
      personaFeedOpens: pfCounts.opens,
    },
    rates: {
      likePerOpen: round(likeRate),
      replyPerOpen: round(replyRate),
      savePerOpen: round(saveRate),
      boostPerOpen: round(boostRate),
      personaFeedOpenRate: round(personaFeedOpenRate),
    },
    score: {
      composite: round(normalizedComposite),
      grade,
    },
  };
}

function aggregateByPostId<T extends { post_id?: string | null }>(rows: T[]) {
  const map = new Map<string, T[]>();
  rows.forEach((row) => {
    const postId = String(row?.post_id ?? "").trim();
    if (!postId) return;
    const list = map.get(postId) ?? [];
    list.push(row);
    map.set(postId, list);
  });
  return map;
}

function aggregateRepliesByParentId(rows: ReplyRow[]) {
  const map = new Map<string, ReplyRow[]>();
  rows.forEach((row) => {
    const postId = String(row?.parent_id ?? "").trim();
    if (!postId) return;
    const list = map.get(postId) ?? [];
    list.push(row);
    map.set(postId, list);
  });
  return map;
}

function avg(values: Array<number | null | undefined>) {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function getBuzzMetricScore(analysis: any, key: string) {
  const metrics = Array.isArray(analysis?.buzz?.metrics) ? analysis.buzz.metrics : [];
  const row = metrics.find((m: any) => String(m?.key ?? "") === key);
  const n = Number(row?.score ?? NaN);
  return Number.isFinite(n) ? n : null;
}

function buildSuggestions(args: {
  analysis: any;
  text: string;
  current: ReturnType<typeof summarizeSinglePost>;
  comparison: {
    savePerOpenDelta: number | null;
    replyPerOpenDelta: number | null;
    personaFeedOpenRateDelta: number | null;
  };
}) {
  const tips: string[] = [];
  const hook = getBuzzMetricScore(args.analysis, "hook");
  const cta = getBuzzMetricScore(args.analysis, "cta");
  const novelty = getBuzzMetricScore(args.analysis, "novelty");
  const emotion = getBuzzMetricScore(args.analysis, "emotion");
  const text = String(args.text ?? "").trim();
  const hasQuestion = /[?？]/.test(text);
  const hasNumber = /\d/.test(text);

  const openRate = args.current.rates.personaFeedOpenRate ?? 0;
  const replyRate = args.current.rates.replyPerOpen ?? 0;
  const saveRate = args.current.rates.savePerOpen ?? 0;

  if (openRate < 0.18) {
    if ((hook ?? 0) < 60) {
      tips.push("冒頭1文を強化: 先頭20文字に『結論 / 失敗 / 検証 / 意外』の要素を入れると開封率が上がりやすいです。");
    } else if ((emotion ?? 0) < 55) {
      tips.push("感情の輪郭を追加: 喜び/悔しさ/驚きなどを1語だけ足すと開封後の離脱が減りやすいです。");
    }
  }

  if (replyRate < 0.06) {
    if (!hasQuestion || (cta ?? 0) < 55) {
      tips.push("返信導線を追加: 最後に『あなたならどうする？』『どっち派？』の1問を入れると返信率が伸びやすいです。");
    } else {
      tips.push("返信しやすい設計に変更: 二択・一言回答の質問にすると反応の最初のハードルを下げられます。");
    }
  }

  if (saveRate < 0.05) {
    if (!hasNumber || (novelty ?? 0) < 55) {
      tips.push("保存される形に変換: 数字・手順・比較（例: 3つのポイント）を入れると保存率が上がりやすいです。");
    } else {
      tips.push("再利用価値を明示: 『あとで見返す用』『テンプレ』などの一言を入れると保存率が伸びやすいです。");
    }
  }

  if ((args.comparison.personaFeedOpenRateDelta ?? 0) < -0.05) {
    tips.push("前回より開封が落ち気味です。題材はそのままで、1行目だけ別パターン（攻め/共感/短文）を試して比較してください。");
  }
  if ((args.comparison.savePerOpenDelta ?? 0) > 0.03) {
    tips.push("保存率は前回より改善しています。この型をテンプレ化して連投すると再現しやすいです。");
  }

  if (tips.length === 0) {
    tips.push("全体バランスは良好です。次は冒頭だけ2パターン作って投稿時間帯を変え、再現性を取りにいくのがおすすめです。");
  }

  return tips.slice(0, 4);
}

function buildHighlights(args: { analysis: any; current: ReturnType<typeof summarizeSinglePost> }) {
  const highlights: string[] = [];
  const metrics = Array.isArray(args.analysis?.buzz?.metrics) ? args.analysis.buzz.metrics : [];
  metrics
    .map((m: any) => ({
      key: String(m?.key ?? ""),
      label: String(m?.label ?? m?.key ?? ""),
      score: Number(m?.score ?? 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .forEach((m) => {
      if (m.score >= 60) highlights.push(`強み: ${m.label} ${Math.round(m.score)}%`);
    });

  const rates = args.current.rates;
  if ((rates.savePerOpen ?? 0) >= 0.08) highlights.push("保存率が高め（再利用価値あり）");
  if ((rates.replyPerOpen ?? 0) >= 0.1) highlights.push("返信率が高め（会話が生まれやすい）");
  if ((rates.personaFeedOpenRate ?? 0) >= 0.22) highlights.push("キャラ別TLでの開封率が高め");

  return Array.from(new Set(highlights)).slice(0, 4);
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const postId = String(id ?? "").trim();
  if (!postId) return NextResponse.json({ error: "invalid_post_id" }, { status: 400 });

  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const postRes = await supa
    .from("posts")
    .select("id,author,created_at,text,score,analysis")
    .eq("id", postId)
    .maybeSingle();
  if (postRes.error) {
    return NextResponse.json({ error: postRes.error.message ?? "post_read_failed" }, { status: 500 });
  }
  const post = postRes.data as any;
  if (!post) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (String(post.author ?? "").trim() !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const createdAt = String(post.created_at ?? new Date().toISOString());
  const now = new Date();

  const [curReactionsRes, curRepliesRes, curOpensRes, curPfEventsRes, prevPostsRes] = await Promise.all([
    supa.from("reactions").select("post_id,kind,created_at").eq("post_id", postId),
    supa.from("posts").select("parent_id,created_at").eq("parent_id", postId),
    supa.from("user_post_open_state").select("post_id,opened_at").eq("post_id", postId),
    supa
      .from("persona_feed_mode_ab_events")
      .select("post_id,event_type,created_at")
      .eq("post_id", postId)
      .in("event_type", ["impression", "open"])
      .limit(20000),
    supa
      .from("posts")
      .select("id,created_at,text,score,analysis")
      .eq("author", user.id)
      .lt("created_at", createdAt)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const openStateAvailable = !curOpensRes.error || isMissingRelationError(curOpensRes.error, "user_post_open_state");
  const pfEventsAvailable =
    !curPfEventsRes.error || isMissingRelationError(curPfEventsRes.error, "persona_feed_mode_ab_events");

  const curReactions = (curReactionsRes.data ?? []) as ReactionRow[];
  const curReplies = (curRepliesRes.data ?? []) as ReplyRow[];
  const curOpens = curOpensRes.error ? [] : ((curOpensRes.data ?? []) as OpenRow[]);
  const curPfEvents = curPfEventsRes.error ? [] : ((curPfEventsRes.data ?? []) as PersonaFeedEventRow[]);
  const currentSummary = summarizeSinglePost({
    reactions: curReactions,
    replies: curReplies,
    opens: curOpens,
    pfEvents: curPfEvents,
  });

  const prevPosts = (prevPostsRes.data ?? []) as Array<{
    id: string;
    created_at: string;
    text?: string | null;
    score?: number | null;
    analysis?: any;
  }>;
  const prevIds = prevPosts.map((p) => p.id).filter(Boolean);

  let prevComparison = {
    samples: 0,
    averages: {
      likePerOpen: null as number | null,
      replyPerOpen: null as number | null,
      savePerOpen: null as number | null,
      boostPerOpen: null as number | null,
      personaFeedOpenRate: null as number | null,
      composite: null as number | null,
    },
    delta: {
      likePerOpen: null as number | null,
      replyPerOpen: null as number | null,
      savePerOpen: null as number | null,
      boostPerOpen: null as number | null,
      personaFeedOpenRate: null as number | null,
      composite: null as number | null,
    },
  };

  if (prevIds.length > 0) {
    const [prevReactionsRes, prevRepliesRes, prevOpensRes, prevPfEventsRes] = await Promise.all([
      supa.from("reactions").select("post_id,kind,created_at").in("post_id", prevIds),
      supa.from("posts").select("parent_id,created_at").in("parent_id", prevIds),
      supa.from("user_post_open_state").select("post_id,opened_at").in("post_id", prevIds),
      supa
        .from("persona_feed_mode_ab_events")
        .select("post_id,event_type,created_at")
        .in("post_id", prevIds)
        .in("event_type", ["impression", "open"])
        .limit(20000),
    ]);

    const byReactions = aggregateByPostId((prevReactionsRes.data ?? []) as ReactionRow[]);
    const byReplies = aggregateRepliesByParentId((prevRepliesRes.data ?? []) as ReplyRow[]);
    const byOpens = prevOpensRes.error ? new Map<string, OpenRow[]>() : aggregateByPostId((prevOpensRes.data ?? []) as OpenRow[]);
    const byPfEvents =
      prevPfEventsRes.error
        ? new Map<string, PersonaFeedEventRow[]>()
        : aggregateByPostId((prevPfEventsRes.data ?? []) as PersonaFeedEventRow[]);

    const prevSummaries = prevIds.map((id) =>
      summarizeSinglePost({
        reactions: byReactions.get(id) ?? [],
        replies: byReplies.get(id) ?? [],
        opens: byOpens.get(id) ?? [],
        pfEvents: byPfEvents.get(id) ?? [],
      })
    );

    const avgs = {
      likePerOpen: avg(prevSummaries.map((s) => s.rates.likePerOpen)),
      replyPerOpen: avg(prevSummaries.map((s) => s.rates.replyPerOpen)),
      savePerOpen: avg(prevSummaries.map((s) => s.rates.savePerOpen)),
      boostPerOpen: avg(prevSummaries.map((s) => s.rates.boostPerOpen)),
      personaFeedOpenRate: avg(prevSummaries.map((s) => s.rates.personaFeedOpenRate)),
      composite: avg(prevSummaries.map((s) => s.score.composite)),
    };

    prevComparison = {
      samples: prevSummaries.length,
      averages: {
        likePerOpen: round(avgs.likePerOpen),
        replyPerOpen: round(avgs.replyPerOpen),
        savePerOpen: round(avgs.savePerOpen),
        boostPerOpen: round(avgs.boostPerOpen),
        personaFeedOpenRate: round(avgs.personaFeedOpenRate),
        composite: round(avgs.composite),
      },
      delta: {
        likePerOpen:
          avgs.likePerOpen == null ? null : round((currentSummary.rates.likePerOpen ?? 0) - avgs.likePerOpen),
        replyPerOpen:
          avgs.replyPerOpen == null ? null : round((currentSummary.rates.replyPerOpen ?? 0) - avgs.replyPerOpen),
        savePerOpen:
          avgs.savePerOpen == null ? null : round((currentSummary.rates.savePerOpen ?? 0) - avgs.savePerOpen),
        boostPerOpen:
          avgs.boostPerOpen == null ? null : round((currentSummary.rates.boostPerOpen ?? 0) - avgs.boostPerOpen),
        personaFeedOpenRate:
          avgs.personaFeedOpenRate == null
            ? null
            : round((currentSummary.rates.personaFeedOpenRate ?? 0) - avgs.personaFeedOpenRate),
        composite:
          avgs.composite == null ? null : round((currentSummary.score.composite ?? 0) - avgs.composite),
      },
    };
  }

  const reactionTimesByKind = {
    like: curReactions
      .filter((r) => normalizeReactionKind(r.kind) === "like")
      .map((r) => Date.parse(String(r.created_at ?? "")))
      .filter(Number.isFinite)
      .sort((a, b) => a - b),
    boost: curReactions
      .filter((r) => normalizeReactionKind(r.kind) === "boost")
      .map((r) => Date.parse(String(r.created_at ?? "")))
      .filter(Number.isFinite)
      .sort((a, b) => a - b),
    save: curReactions
      .filter((r) => normalizeReactionKind(r.kind) === "save")
      .map((r) => Date.parse(String(r.created_at ?? "")))
      .filter(Number.isFinite)
      .sort((a, b) => a - b),
  };
  const replyTimes = curReplies
    .map((r) => Date.parse(String(r.created_at ?? "")))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const openTimes = curOpens
    .map((r) => Date.parse(String(r.opened_at ?? "")))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const pfImpressionTimes = curPfEvents
    .filter((r) => String(r.event_type ?? "") === "impression")
    .map((r) => Date.parse(String(r.created_at ?? "")))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const pfOpenTimes = curPfEvents
    .filter((r) => String(r.event_type ?? "") === "open")
    .map((r) => Date.parse(String(r.created_at ?? "")))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  const trendTimes = buildTrendTimes(createdAt, now, 10);
  const trend = trendTimes.map((ms) => {
    const opens = cumulativeCount(openTimes, ms);
    const saves = cumulativeCount(reactionTimesByKind.save, ms);
    const replies = cumulativeCount(replyTimes, ms);
    const likes = cumulativeCount(reactionTimesByKind.like, ms);
    const boosts = cumulativeCount(reactionTimesByKind.boost, ms);
    const impressions = cumulativeCount(pfImpressionTimes, ms);
    const personaFeedOpens = cumulativeCount(pfOpenTimes, ms);
    return {
      at: new Date(ms).toISOString(),
      label: formatHourLabel(new Date(ms)),
      counts: {
        opens,
        saves,
        replies,
        likes,
        boosts,
        personaFeedImpressions: impressions,
        personaFeedOpens,
      },
      rates: {
        savePerOpen: round(ratio(saves, Math.max(1, opens))),
        replyPerOpen: round(ratio(replies, Math.max(1, opens))),
        likePerOpen: round(ratio(likes, Math.max(1, opens))),
        personaFeedOpenRate: round(ratio(personaFeedOpens, impressions)),
      },
    };
  });

  const analysis = parseAnalysis(post.analysis);
  const buzz = analysis?.buzz ?? null;
  const persona = analysis?.persona ?? null;

  const highlights = buildHighlights({ analysis, current: currentSummary });
  const suggestions = buildSuggestions({
    analysis,
    text: String(post.text ?? ""),
    current: currentSummary,
    comparison: {
      savePerOpenDelta: prevComparison.delta.savePerOpen,
      replyPerOpenDelta: prevComparison.delta.replyPerOpen,
      personaFeedOpenRateDelta: prevComparison.delta.personaFeedOpenRate,
    },
  });

  return NextResponse.json({
    ok: true,
    post: {
      id: String(post.id),
      created_at: createdAt,
      text: String(post.text ?? ""),
      lieScorePct: Math.round(clamp(Number(post.score ?? 0), 0, 1) * 100),
      persona: {
        selected: String(persona?.selected ?? "").trim() || null,
        candidates: Array.isArray(persona?.candidates) ? persona.candidates.slice(0, 3) : [],
      },
      buzz: buzz
        ? {
            score: Number(buzz.score ?? 0),
            calibratedScore: Number(buzz.calibratedScore ?? buzz.score ?? 0),
            level: String(buzz.level ?? ""),
            metrics: Array.isArray(buzz.metrics) ? buzz.metrics : [],
            hashtags: Array.isArray(buzz.hashtags) ? buzz.hashtags.slice(0, 5) : [],
            tips: Array.isArray(buzz.tips) ? buzz.tips.slice(0, 4) : [],
            replyPrompt: String(buzz.replyPrompt ?? ""),
          }
        : null,
    },
    scorecard: {
      ...currentSummary,
      highlights,
      suggestions,
    },
    comparison: prevComparison,
    trend: {
      points: trend,
      basis: {
        openCount: openStateAvailable ? "user_post_open_state(unique viewers)" : "not_available",
        personaFeedEvents: pfEventsAvailable ? "persona_feed_mode_ab_events" : "not_available",
      },
    },
    generated_at: new Date().toISOString(),
  });
}
