import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type PushJobRow = {
  id: string;
  user_id: string;
  notification_id?: string | null;
  post_id?: string | null;
  kind: string;
  title: string;
  body: string;
  payload?: any;
  status: string;
  attempts: number;
  max_attempts: number;
  available_after?: string | null;
};

type PushDeviceRow = {
  expo_push_token?: string | null;
};

function isMissingRelationError(err: any, relation: string) {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes(relation.toLowerCase()) && text.includes("does not exist");
}

function isExpoPushToken(token: string) {
  return /^ExponentPushToken\[[^\]]+\]$/.test(token) || /^ExpoPushToken\[[^\]]+\]$/.test(token);
}

function chunkArray<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function toPositiveInt(v: any, fallback: number, min = 1, max = 10_000) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

async function bumpMetrics(args: {
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
  for (const kind of ["__all__", String(args.kind || "__all__")]) {
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
    if (rpc.error) {
      const text = `${rpc.error?.message ?? ""} ${rpc.error?.details ?? ""}`.toLowerCase();
      if (
        !text.includes("push_delivery_bump_daily_metrics") &&
        !isMissingRelationError(rpc.error, "push_delivery_daily_metrics")
      ) {
        break;
      }
    }
  }
}

async function insertDeliveryEventsSafe(supa: any, rows: any[]) {
  if (!rows.length) return;
  const ins = await supa.from("push_delivery_events").insert(rows);
  if (ins.error && !isMissingRelationError(ins.error, "push_delivery_events")) {
    // best-effort
  }
}

async function dispatchOneJob(supa: any, job: PushJobRow) {
  const now = new Date().toISOString();
  const devicesRes = await supa
    .from("user_push_devices")
    .select("expo_push_token")
    .eq("user_id", job.user_id)
    .eq("provider", "expo")
    .eq("enabled", true)
    .order("updated_at", { ascending: false })
    .limit(40);

  if (devicesRes.error) {
    const missing = isMissingRelationError(devicesRes.error, "user_push_devices");
    await insertDeliveryEventsSafe(supa, [
      {
        user_id: job.user_id,
        job_id: job.id,
        notification_id: job.notification_id ?? null,
        post_id: job.post_id ?? null,
        kind: job.kind,
        provider: "expo",
        event_type: "error",
        status: "error",
        error_code: missing ? "push_devices_missing" : "push_devices_read_failed",
        error_message: devicesRes.error.message ?? "push_devices_read_failed",
        metadata: { source: "worker" },
        created_at: now,
      },
    ]);
    await bumpMetrics({ supa, userId: job.user_id, kind: job.kind, errorDelta: 1 });
    return {
      status: "failed" as const,
      sent: 0,
      targets: 0,
      disabled: 0,
      error: missing ? "user_push_devices_missing" : devicesRes.error.message ?? "push_devices_read_failed",
    };
  }

  const rows = (devicesRes.data ?? []) as PushDeviceRow[];
  const tokens = Array.from(
    new Set(
      rows
        .map((r) => String(r.expo_push_token ?? "").trim())
        .filter((x) => x.length > 0 && isExpoPushToken(x))
    )
  );

  if (tokens.length === 0) {
    return {
      status: "sent" as const,
      sent: 0,
      targets: 0,
      disabled: 0,
      error: null as string | null,
    };
  }

  let sent = 0;
  let errorCount = 0;
  const invalidTokens = new Set<string>();
  const errors: string[] = [];
  const eventRows: any[] = [];

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
            title: job.title,
            body: job.body,
            data: {
              kind: job.kind,
              post_id: job.post_id ?? null,
              postId: job.post_id ?? null,
              notification_id: job.notification_id ?? null,
              notificationId: job.notification_id ?? null,
              push_job_id: job.id,
              pushJobId: job.id,
              screen: "notifications",
            },
          }))
        ),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        errorCount += chunk.length;
        errors.push(
          typeof json?.errors?.[0]?.message === "string"
            ? json.errors[0].message
            : `expo_push_http_${res.status}`
        );
        chunk.forEach((token) => {
          eventRows.push({
            user_id: job.user_id,
            job_id: job.id,
            notification_id: job.notification_id ?? null,
            post_id: job.post_id ?? null,
            kind: job.kind,
            provider: "expo",
            event_type: "error",
            expo_push_token: token,
            status: "error",
            error_code: `expo_push_http_${res.status}`,
            error_message: errors[errors.length - 1],
            metadata: { source: "worker" },
            created_at: now,
          });
        });
        continue;
      }

      const data = Array.isArray(json?.data) ? json.data : [];
      data.forEach((row: any, idx: number) => {
        const token = chunk[idx];
        if (!token) return;
        if (row?.status === "ok") {
          sent += 1;
          eventRows.push({
            user_id: job.user_id,
            job_id: job.id,
            notification_id: job.notification_id ?? null,
            post_id: job.post_id ?? null,
            kind: job.kind,
            provider: "expo",
            event_type: "sent",
            expo_push_token: token,
            provider_ticket_id: row?.id ?? null,
            status: "ok",
            metadata: { source: "worker" },
            created_at: now,
          });
          return;
        }
        errorCount += 1;
        const code = String(row?.details?.error ?? row?.message ?? "").trim();
        if (code) errors.push(code);
        if (code === "DeviceNotRegistered") invalidTokens.add(token);
        eventRows.push({
          user_id: job.user_id,
          job_id: job.id,
          notification_id: job.notification_id ?? null,
          post_id: job.post_id ?? null,
          kind: job.kind,
          provider: "expo",
          event_type: code === "DeviceNotRegistered" ? "device_not_registered" : "error",
          expo_push_token: token,
          status: row?.status ?? "error",
          error_code: code || "unknown_error",
          error_message: code || "unknown_error",
          metadata: { source: "worker" },
          created_at: now,
        });
      });
    } catch (e: any) {
      errorCount += chunk.length;
      errors.push(e?.message ?? "expo_push_send_failed");
      chunk.forEach((token) => {
        eventRows.push({
          user_id: job.user_id,
          job_id: job.id,
          notification_id: job.notification_id ?? null,
          post_id: job.post_id ?? null,
          kind: job.kind,
          provider: "expo",
          event_type: "error",
          expo_push_token: token,
          status: "error",
          error_code: "network_error",
          error_message: e?.message ?? "expo_push_send_failed",
          metadata: { source: "worker" },
          created_at: now,
        });
      });
    }
  }

  await insertDeliveryEventsSafe(supa, eventRows);

  if (invalidTokens.size > 0) {
    await supa
      .from("user_push_devices")
      .update({
        enabled: false,
        last_delivery_status: "device_not_registered",
        updated_at: now,
      })
      .eq("user_id", job.user_id)
      .in("expo_push_token", Array.from(invalidTokens));
  }

  await supa
    .from("user_push_devices")
    .update({
      last_delivery_at: now,
      last_delivery_status: errorCount > 0 ? (sent > 0 ? "partial" : "error") : "ok",
      updated_at: now,
    })
    .eq("user_id", job.user_id)
    .eq("provider", "expo")
    .eq("enabled", true);

  await bumpMetrics({
    supa,
    userId: job.user_id,
    kind: job.kind,
    sentDelta: sent,
    errorDelta: errorCount > 0 ? 1 : 0,
    deviceNotRegisteredDelta: invalidTokens.size,
  });

  const status = errorCount === 0 ? "sent" : sent > 0 ? "partial" : "failed";
  return {
    status,
    sent,
    targets: tokens.length,
    disabled: invalidTokens.size,
    error: errors[0] ?? null,
  };
}

async function processLockedJobLifecycle(supa: any, job: PushJobRow) {
  const result = await dispatchOneJob(supa, job);
  const attempts = Math.max(0, Number(job.attempts ?? 0) || 0);
  const maxAttempts = Math.max(1, Number(job.max_attempts ?? 4) || 4);
  const shouldRetry = result.status === "failed" && attempts < maxAttempts;
  const backoffMinutes = Math.min(60, Math.max(1, attempts * 2));
  const availableAfter = new Date(Date.now() + backoffMinutes * 60_000).toISOString();

  await supa
    .from("push_notification_jobs")
    .update({
      status: shouldRetry ? "pending" : result.status,
      available_after: shouldRetry ? availableAfter : new Date().toISOString(),
      processed_at: shouldRetry ? null : new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      last_error: result.error,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  return {
    id: job.id,
    userId: job.user_id,
    kind: job.kind,
    status: shouldRetry ? "pending_retry" : result.status,
    sent: result.sent,
    targets: result.targets,
    disabled: result.disabled,
    error: result.error,
    attempts,
    maxAttempts,
  };
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
) {
  if (items.length === 0) return [] as R[];
  const out = new Array<R | null>(items.length).fill(null);
  let cursor = 0;
  const laneCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(
    Array.from({ length: laneCount }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        out[i] = await worker(items[i] as T, i);
      }
    })
  );
  return out.filter((x): x is R => x !== null);
}

async function runDispatchPass(
  supa: any,
  args: {
    source: string;
    limit: number;
    autoScale: boolean;
    requestedParallelism: number;
    jobsPerWorkerTarget: number;
    maxParallelism: number;
  }
) {
  const nowIso = new Date().toISOString();
  const backlogRes = await supa
    .from("push_notification_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .lte("available_after", nowIso);

  if (backlogRes.error) {
    if (isMissingRelationError(backlogRes.error, "push_notification_jobs")) {
      return {
        ok: true as const,
        available: false as const,
        processed: 0,
        jobs: [] as any[],
      };
    }
    return {
      ok: false as const,
      status: 500,
      error: backlogRes.error.message ?? "queue_count_failed",
    };
  }

  const pendingBefore = Math.max(0, Number(backlogRes.count ?? 0) || 0);
  const parallelism = args.autoScale
    ? Math.max(
        1,
        Math.min(args.maxParallelism, Math.ceil(Math.max(1, pendingBefore) / args.jobsPerWorkerTarget))
      )
    : args.requestedParallelism;
  const effectiveLimit = Math.max(args.limit, Math.min(500, parallelism * args.jobsPerWorkerTarget));

  const candidatesRes = await supa
    .from("push_notification_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("available_after", nowIso)
    .order("created_at", { ascending: true })
    .limit(effectiveLimit);

  if (candidatesRes.error) {
    if (isMissingRelationError(candidatesRes.error, "push_notification_jobs")) {
      return {
        ok: true as const,
        available: false as const,
        processed: 0,
        jobs: [] as any[],
      };
    }
    return {
      ok: false as const,
      status: 500,
      error: candidatesRes.error.message ?? "queue_read_failed",
    };
  }

  const candidates = (candidatesRes.data ?? []) as PushJobRow[];
  const claimedJobs: PushJobRow[] = [];

  for (const row of candidates) {
    const lockRes = await supa
      .from("push_notification_jobs")
      .update({
        status: "processing",
        attempts: Math.max(0, Number(row.attempts ?? 0) || 0) + 1,
        locked_at: new Date().toISOString(),
        locked_by: `api:${args.source}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("*")
      .single();

    if (lockRes.error || !lockRes.data) continue;
    claimedJobs.push(lockRes.data as PushJobRow);
  }

  const results = await runWithConcurrency(claimedJobs, parallelism, async (job) =>
    processLockedJobLifecycle(supa, job)
  );
  const pendingAfterEstimate = Math.max(0, pendingBefore - results.length);

  return {
    ok: true as const,
    available: true as const,
    source: args.source,
    autoScale: args.autoScale,
    parallelism,
    pendingBefore,
    pendingAfterEstimate,
    selected: candidates.length,
    claimed: claimedJobs.length,
    effectiveLimit,
    processed: results.length,
    shouldContinue:
      pendingAfterEstimate > 0 && (claimedJobs.length >= effectiveLimit || results.length >= effectiveLimit),
    jobs: results,
  };
}

export async function POST(req: NextRequest) {
  const secret = process.env.PUSH_DISPATCH_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "push_dispatch_secret_not_configured" }, { status: 503 });
  }
  const provided = req.headers.get("x-push-dispatch-secret")?.trim();
  if (!provided || provided !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const limit = toPositiveInt(body?.limit ?? req.nextUrl.searchParams.get("limit"), 20, 1, 500);
  const source = String(body?.source ?? "manual").slice(0, 48);
  const autoScale =
    String(body?.autoScale ?? req.nextUrl.searchParams.get("autoScale") ?? "true").toLowerCase() !==
    "false";
  const requestedParallelism = toPositiveInt(
    body?.parallelism ?? req.nextUrl.searchParams.get("parallelism"),
    1,
    1,
    16
  );
  const jobsPerWorkerTarget = toPositiveInt(
    body?.jobsPerWorker ?? req.nextUrl.searchParams.get("jobsPerWorker"),
    Number(process.env.PUSH_DISPATCH_JOBS_PER_WORKER ?? 12) || 12,
    1,
    100
  );
  const maxParallelism = toPositiveInt(
    body?.maxParallelism ??
      req.nextUrl.searchParams.get("maxParallelism") ??
      process.env.PUSH_DISPATCH_MAX_PARALLELISM,
    6,
    1,
    24
  );
  const autoReenter =
    String(body?.autoReenter ?? req.nextUrl.searchParams.get("autoReenter") ?? "true").toLowerCase() !==
    "false";
  const maxPasses = toPositiveInt(
    body?.maxPasses ??
      req.nextUrl.searchParams.get("maxPasses") ??
      process.env.PUSH_DISPATCH_MAX_PASSES,
    3,
    1,
    20
  );
  const maxReturnedJobs = toPositiveInt(
    body?.maxReturnedJobs ?? req.nextUrl.searchParams.get("maxReturnedJobs"),
    300,
    10,
    2000
  );

  const supa = supabaseAdmin() as any;
  const passSummaries: any[] = [];
  const allJobs: any[] = [];
  let finalPass: any = null;

  for (let pass = 1; pass <= maxPasses; pass += 1) {
    const passResult = await runDispatchPass(supa, {
      source: `${source}:p${pass}`,
      limit,
      autoScale,
      requestedParallelism,
      jobsPerWorkerTarget,
      maxParallelism,
    });

    if (passResult.ok === false) {
      return NextResponse.json({ ok: false, error: passResult.error }, { status: passResult.status ?? 500 });
    }
    if (passResult.available === false) {
      return NextResponse.json({ ok: true, available: false, processed: 0, jobs: [], passes: [] });
    }

    finalPass = passResult;
    passSummaries.push({
      pass,
      source: passResult.source,
      processed: passResult.processed,
      claimed: passResult.claimed,
      selected: passResult.selected,
      pendingBefore: passResult.pendingBefore,
      pendingAfterEstimate: passResult.pendingAfterEstimate,
      parallelism: passResult.parallelism,
      effectiveLimit: passResult.effectiveLimit,
      shouldContinue: passResult.shouldContinue,
    });
    if (Array.isArray(passResult.jobs) && allJobs.length < maxReturnedJobs) {
      allJobs.push(...passResult.jobs.slice(0, Math.max(0, maxReturnedJobs - allJobs.length)));
    }

    if (!(autoReenter && passResult.shouldContinue)) break;
  }

  const processedTotal = passSummaries.reduce(
    (acc, p) => acc + Math.max(0, Number(p.processed ?? 0) || 0),
    0
  );

  return NextResponse.json({
    ok: true,
    available: true,
    source,
    autoScale,
    autoReenter,
    maxPasses,
    passCount: passSummaries.length,
    processed: processedTotal,
    shouldContinue: Boolean(finalPass?.shouldContinue),
    lastPass: finalPass
      ? {
          parallelism: finalPass.parallelism,
          pendingBefore: finalPass.pendingBefore,
          pendingAfterEstimate: finalPass.pendingAfterEstimate,
          effectiveLimit: finalPass.effectiveLimit,
          selected: finalPass.selected,
          claimed: finalPass.claimed,
          processed: finalPass.processed,
        }
      : null,
    passes: passSummaries,
    jobs: allJobs,
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
