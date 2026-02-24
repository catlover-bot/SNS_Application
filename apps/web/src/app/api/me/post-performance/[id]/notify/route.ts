import { NextRequest, NextResponse } from "next/server";
import { requireRateLimit, requireSameOrigin } from "@/lib/apiSecurity";
import { supabaseServer } from "@/lib/supabase/server";

type ReactionRow = { kind?: string | null };
type PushDeviceRow = {
  expo_push_token?: string | null;
  failure_count?: number | null;
};
type GrowthAlertPicked = ReturnType<typeof pickGrowthAlert>;

function isMissingRelationError(err: any, relation: string) {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes(relation.toLowerCase()) && text.includes("does not exist");
}

function normalizeReactionKind(raw: string | null | undefined) {
  const kind = String(raw ?? "").toLowerCase().trim();
  if (!kind) return "unknown";
  if (kind.includes("like")) return "like";
  if (kind.includes("boost") || kind.includes("repost")) return "boost";
  if (kind.includes("save") || kind.includes("bookmark") || kind.includes("favorite")) return "save";
  return kind;
}

function bucketRate(v: number | null | undefined, unit = 0.05) {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return 0;
  return Math.max(0, Math.min(20, Math.floor(v / unit)));
}

function pickGrowthAlert(args: {
  counts: { saves: number; replies: number; opens: number };
  rates: { savePerOpen: number | null; replyPerOpen: number | null };
  prevState: {
    last_save_count: number;
    last_reply_count: number;
    last_open_count: number;
    last_save_rate_bucket: number;
    last_reply_rate_bucket: number;
  } | null;
}) {
  const prev = args.prevState ?? {
    last_save_count: 0,
    last_reply_count: 0,
    last_open_count: 0,
    last_save_rate_bucket: 0,
    last_reply_rate_bucket: 0,
  };

  const saveMilestones = [1, 3, 5, 10, 20];
  const replyMilestones = [1, 2, 5, 10];
  const openMilestones = [5, 10, 20, 50];

  const saveHit = saveMilestones.find((n) => prev.last_save_count < n && args.counts.saves >= n);
  if (saveHit != null) {
    return {
      kind: "creator_growth_save",
      title: `保存が伸びています（${saveHit}件達成）`,
      body: `この投稿の保存数が ${args.counts.saves} 件になりました。再利用価値の高い内容として見られています。`,
      reason: "save_milestone",
    };
  }

  const replyHit = replyMilestones.find((n) => prev.last_reply_count < n && args.counts.replies >= n);
  if (replyHit != null) {
    return {
      kind: "creator_growth_reply",
      title: `返信が増えています（${replyHit}件達成）`,
      body: `この投稿の返信数が ${args.counts.replies} 件になりました。会話が生まれやすい投稿です。`,
      reason: "reply_milestone",
    };
  }

  const openHit = openMilestones.find((n) => prev.last_open_count < n && args.counts.opens >= n);
  if (openHit != null) {
    return {
      kind: "creator_growth_open",
      title: `開封が伸びています（${openHit}件到達）`,
      body: `この投稿の開封数が ${args.counts.opens} 件になりました。冒頭のフックが機能しています。`,
      reason: "open_milestone",
    };
  }

  const saveRateBucket = bucketRate(args.rates.savePerOpen, 0.05);
  if (saveRateBucket >= Math.max(2, prev.last_save_rate_bucket + 1)) {
    return {
      kind: "creator_growth_save_rate",
      title: "保存率が伸びています",
      body: `保存率が ${Math.round((args.rates.savePerOpen ?? 0) * 100)}% まで伸びました。保存されやすい型として再現を試せます。`,
      reason: "save_rate_bucket",
    };
  }

  const replyRateBucket = bucketRate(args.rates.replyPerOpen, 0.05);
  if (replyRateBucket >= Math.max(2, prev.last_reply_rate_bucket + 1)) {
    return {
      kind: "creator_growth_reply_rate",
      title: "返信率が伸びています",
      body: `返信率が ${Math.round((args.rates.replyPerOpen ?? 0) * 100)}% になりました。質問や終わり方の型が刺さっています。`,
      reason: "reply_rate_bucket",
    };
  }

  return null;
}

function isExpoPushToken(token: string) {
  return /^ExponentPushToken\[[^\]]+\]$/.test(token) || /^ExpoPushToken\[[^\]]+\]$/.test(token);
}

function chunkArray<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function sendExpoPushGrowthBestEffort(args: {
  supa: any;
  userId: string;
  postId: string;
  kind: string;
  title: string;
  body: string;
}) {
  const devicesRes = await args.supa
    .from("user_push_devices")
    .select("expo_push_token,failure_count")
    .eq("user_id", args.userId)
    .eq("provider", "expo")
    .eq("enabled", true)
    .order("updated_at", { ascending: false })
    .limit(40);

  if (devicesRes.error) {
    if (isMissingRelationError(devicesRes.error, "user_push_devices")) {
      return { attempted: false, available: false, sent: 0, targets: 0, disabled: 0, errors: [] as string[] };
    }
    return {
      attempted: false,
      available: true,
      sent: 0,
      targets: 0,
      disabled: 0,
      errors: [devicesRes.error.message ?? "push_devices_read_failed"],
    };
  }

  const rows = (devicesRes.data ?? []) as PushDeviceRow[];
  const tokens = Array.from(
    new Set(
      rows
        .map((r) => String(r.expo_push_token ?? "").trim())
        .filter((t) => t.length > 0 && isExpoPushToken(t))
    )
  );
  if (tokens.length === 0) {
    return { attempted: false, available: true, sent: 0, targets: 0, disabled: 0, errors: [] as string[] };
  }

  let sent = 0;
  const invalidTokens = new Set<string>();
  const errors: string[] = [];

  for (const chunk of chunkArray(tokens, 100)) {
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(
          chunk.map((to) => ({
            to,
            sound: "default",
            title: args.title,
            body: args.body,
            data: {
              kind: args.kind,
              post_id: args.postId,
              screen: "notifications",
            },
          }))
        ),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        errors.push(
          typeof json?.errors?.[0]?.message === "string"
            ? json.errors[0].message
            : `expo_push_http_${res.status}`
        );
        continue;
      }

      const data = Array.isArray(json?.data) ? json.data : [];
      data.forEach((row: any, idx: number) => {
        if (row?.status === "ok") {
          sent += 1;
          return;
        }
        const code = String(row?.details?.error ?? row?.message ?? "").trim();
        if (code) errors.push(code);
        if (code === "DeviceNotRegistered") {
          const token = chunk[idx];
          if (token) invalidTokens.add(token);
        }
      });
    } catch (e: any) {
      errors.push(e?.message ?? "expo_push_send_failed");
    }
  }

  if (invalidTokens.size > 0) {
    const invalidList = Array.from(invalidTokens);
    await args.supa
      .from("user_push_devices")
      .update({
        enabled: false,
        last_delivery_status: "device_not_registered",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", args.userId)
      .in("expo_push_token", invalidList);
  }

  if (tokens.length > 0) {
    await args.supa
      .from("user_push_devices")
      .update({
        last_delivery_at: new Date().toISOString(),
        last_delivery_status: errors.length > 0 ? "partial" : "ok",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", args.userId)
      .eq("provider", "expo")
      .eq("enabled", true);
  }

  return {
    attempted: true,
    available: true,
    sent,
    targets: tokens.length,
    disabled: invalidTokens.size,
    errors: Array.from(new Set(errors)).slice(0, 5),
  };
}

async function bumpPushDailyMetricsSafe(args: {
  supa: any;
  userId: string;
  kind: string;
  queuedDelta?: number;
  sentDelta?: number;
  errorDelta?: number;
  openDelta?: number;
  deviceNotRegisteredDelta?: number;
}) {
  const day = new Date().toISOString().slice(0, 10);
  const kinds = ["__all__", String(args.kind || "__all__")];
  for (const kind of kinds) {
    const rpc = await args.supa.rpc("push_delivery_bump_daily_metrics", {
      p_user_id: args.userId,
      p_day: day,
      p_kind: kind,
      p_queued_delta: Math.max(0, args.queuedDelta ?? 0),
      p_sent_delta: Math.max(0, args.sentDelta ?? 0),
      p_error_delta: Math.max(0, args.errorDelta ?? 0),
      p_open_delta: Math.max(0, args.openDelta ?? 0),
      p_device_not_registered_delta: Math.max(0, args.deviceNotRegisteredDelta ?? 0),
    });
    if (rpc.error && !isMissingRelationError(rpc.error, "push_delivery_daily_metrics")) {
      const text = `${rpc.error?.message ?? ""} ${rpc.error?.details ?? ""} ${rpc.error?.hint ?? ""}`.toLowerCase();
      if (!text.includes("push_delivery_bump_daily_metrics")) {
        break;
      }
    }
  }
}

async function enqueueGrowthPushJobBestEffort(args: {
  req: NextRequest;
  supa: any;
  userId: string;
  postId: string;
  notificationId: string | null;
  picked: NonNullable<GrowthAlertPicked>;
}) {
  const now = new Date().toISOString();
  const ins = await args.supa
    .from("push_notification_jobs")
    .insert({
      user_id: args.userId,
      notification_id: args.notificationId,
      post_id: args.postId,
      kind: args.picked.kind,
      title: args.picked.title,
      body: args.picked.body,
      payload: {
        reason: args.picked.reason,
        source: "creator_growth",
      },
      status: "pending",
      attempts: 0,
      max_attempts: 4,
      available_after: now,
      created_at: now,
      updated_at: now,
    })
    .select("id,status")
    .single();

  if (ins.error) {
    if (isMissingRelationError(ins.error, "push_notification_jobs")) {
      return { queued: false, available: false, jobId: null as string | null, error: null as string | null };
    }
    return {
      queued: false,
      available: true,
      jobId: null as string | null,
      error: ins.error.message ?? "push_job_enqueue_failed",
    };
  }

  const jobId = String(ins.data?.id ?? "").trim() || null;
  if (jobId) {
    const evIns = await args.supa.from("push_delivery_events").insert({
      user_id: args.userId,
      job_id: jobId,
      notification_id: args.notificationId,
      post_id: args.postId,
      kind: args.picked.kind,
      provider: "expo",
      event_type: "queued",
      status: "queued",
      metadata: { source: "creator_growth" },
      created_at: now,
    });
    if (!evIns.error || !isMissingRelationError(evIns.error, "push_delivery_events")) {
      // ignore best-effort errors; queue remains valid
    }
    await bumpPushDailyMetricsSafe({
      supa: args.supa,
      userId: args.userId,
      kind: args.picked.kind,
      queuedDelta: 1,
    });
  }

  const dispatchSecret = process.env.PUSH_DISPATCH_SECRET?.trim();
  if (dispatchSecret) {
    const origin = args.req.nextUrl.origin;
    void fetch(`${origin}/api/internal/push-dispatch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-push-dispatch-secret": dispatchSecret,
      },
      body: JSON.stringify({ limit: 10, source: "growth_notify_enqueue" }),
      cache: "no-store",
    }).catch(() => undefined);
  }

  return { queued: true, available: true, jobId, error: null as string | null };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const originErr = requireSameOrigin(req, { allowMissingOrigin: false });
  if (originErr) return originErr;

  const postId = String(params?.id ?? "").trim();
  if (!postId) return NextResponse.json({ ok: false, error: "invalid_post_id" }, { status: 400 });

  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  const rateErr = requireRateLimit({
    key: `post-growth-notify:${user.id}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (rateErr) return rateErr;

  const postRes = await supa.from("posts").select("id,author,text").eq("id", postId).maybeSingle();
  if (postRes.error) {
    return NextResponse.json({ ok: false, error: postRes.error.message ?? "post_read_failed" }, { status: 500 });
  }
  const post = postRes.data as any;
  if (!post) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (String(post.author ?? "").trim() !== user.id) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const [reactionsRes, repliesRes, opensRes, stateRes] = await Promise.all([
    supa.from("reactions").select("kind").eq("post_id", postId),
    supa.from("posts").select("id").eq("parent_id", postId),
    supa.from("user_post_open_state").select("user_id").eq("post_id", postId),
    supa
      .from("user_post_growth_alert_state")
      .select(
        "last_save_count,last_reply_count,last_open_count,last_save_rate_bucket,last_reply_rate_bucket,last_notified_at"
      )
      .eq("user_id", user.id)
      .eq("post_id", postId)
      .maybeSingle(),
  ]);

  if (reactionsRes.error) {
    return NextResponse.json(
      { ok: false, error: reactionsRes.error.message ?? "reactions_read_failed" },
      { status: 500 }
    );
  }

  const counts = { saves: 0, replies: 0, opens: 0 };
  ((reactionsRes.data ?? []) as ReactionRow[]).forEach((r) => {
    const kind = normalizeReactionKind(r.kind);
    if (kind === "save") counts.saves += 1;
  });
  counts.replies = Math.max(0, (repliesRes.data ?? []).length);
  counts.opens = opensRes.error ? 0 : Math.max(0, (opensRes.data ?? []).length);

  const rates = {
    savePerOpen: counts.opens > 0 ? counts.saves / counts.opens : null,
    replyPerOpen: counts.opens > 0 ? counts.replies / counts.opens : null,
  };

  const prevState =
    stateRes.error && isMissingRelationError(stateRes.error, "user_post_growth_alert_state")
      ? null
      : (stateRes.data as any | null);

  const picked = pickGrowthAlert({ counts, rates, prevState });
  const now = new Date().toISOString();

  const nextState = {
    user_id: user.id,
    post_id: postId,
    last_notified_at: picked ? now : prevState?.last_notified_at ?? null,
    last_save_count: counts.saves,
    last_reply_count: counts.replies,
    last_open_count: counts.opens,
    last_save_rate_bucket: bucketRate(rates.savePerOpen, 0.05),
    last_reply_rate_bucket: bucketRate(rates.replyPerOpen, 0.05),
    updated_at: now,
  };

  const stateUp = await supa.from("user_post_growth_alert_state").upsert(nextState, {
    onConflict: "user_id,post_id",
  });
  const stateAvailable = !stateUp.error;
  if (stateUp.error && !isMissingRelationError(stateUp.error, "user_post_growth_alert_state")) {
    return NextResponse.json(
      { ok: false, error: stateUp.error.message ?? "growth_state_upsert_failed" },
      { status: 500 }
    );
  }

  if (!picked) {
    return NextResponse.json({
      ok: true,
      notified: false,
      stateAvailable,
      counts,
      rates,
    });
  }

  const ins = await supa
    .from("notifications")
    .insert({
      user_id: user.id,
      actor_id: user.id,
      kind: picked.kind,
      title: picked.title,
      body: picked.body,
      post_id: postId,
      created_at: now,
    })
    .select("id")
    .single();
  if (ins.error) {
    return NextResponse.json(
      { ok: false, error: ins.error.message ?? "notification_insert_failed", stateAvailable },
      { status: 500 }
    );
  }

  const notificationId = String((ins.data as any)?.id ?? "").trim() || null;
  const queued = await enqueueGrowthPushJobBestEffort({
    req,
    supa,
    userId: user.id,
    postId,
    notificationId,
    picked,
  });

  const push =
    queued.available && queued.queued
      ? {
          queued: true,
          queueAvailable: true,
          jobId: queued.jobId,
          attempted: false,
          sent: 0,
          targets: 0,
          disabled: 0,
          errors: [],
        }
      : await sendExpoPushGrowthBestEffort({
          supa,
          userId: user.id,
          postId,
          kind: picked.kind,
          title: picked.title,
          body: picked.body,
        });

  if (!queued.queued && queued.error) {
    (push as any).queueError = queued.error;
  }

  return NextResponse.json({
    ok: true,
    notified: true,
    stateAvailable,
    alert: picked,
    counts,
    rates,
    notificationId,
    push,
  });
}
