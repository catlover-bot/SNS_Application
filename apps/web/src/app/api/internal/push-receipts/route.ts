import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type SentEventRow = {
  id: number;
  user_id: string;
  job_id?: string | null;
  notification_id?: string | null;
  post_id?: string | null;
  kind?: string | null;
  expo_push_token?: string | null;
  provider_ticket_id?: string | null;
  provider_receipt_id?: string | null;
  created_at?: string | null;
};

function isMissingRelationError(err: any, relation: string) {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes(relation.toLowerCase()) && text.includes("does not exist");
}

function chunkArray<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function toPositiveInt(v: any, fallback: number, min = 1, max = 5000) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
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

async function runReceiptsPass(
  supa: any,
  args: {
    source: string;
    limit: number;
    autoScale: boolean;
    requestedParallelism: number;
    ticketsPerWorkerTarget: number;
    maxParallelism: number;
    minAgeSeconds: number;
    sinceDays: number;
  }
) {
  const beforeIso = new Date(Date.now() - args.minAgeSeconds * 1000).toISOString();
  const sinceIso = new Date(Date.now() - args.sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const pendingCountRes = await supa
    .from("push_delivery_events")
    .select("id", { count: "exact", head: true })
    .eq("provider", "expo")
    .eq("event_type", "sent")
    .not("provider_ticket_id", "is", null)
    .is("provider_receipt_id", null)
    .gte("created_at", sinceIso)
    .lte("created_at", beforeIso);

  if (pendingCountRes.error) {
    if (isMissingRelationError(pendingCountRes.error, "push_delivery_events")) {
      return { ok: true as const, available: false as const, processed: 0, receiptsChecked: 0 };
    }
    return {
      ok: false as const,
      status: 500,
      error: pendingCountRes.error.message ?? "push_receipts_count_failed",
    };
  }

  const pendingBefore = Math.max(0, Number(pendingCountRes.count ?? 0) || 0);
  const parallelism = args.autoScale
    ? Math.max(
        1,
        Math.min(args.maxParallelism, Math.ceil(Math.max(1, pendingBefore) / args.ticketsPerWorkerTarget))
      )
    : args.requestedParallelism;
  const effectiveLimit = Math.max(args.limit, Math.min(5000, parallelism * args.ticketsPerWorkerTarget));

  const pendingRes = await supa
    .from("push_delivery_events")
    .select(
      "id,user_id,job_id,notification_id,post_id,kind,expo_push_token,provider_ticket_id,provider_receipt_id,created_at"
    )
    .eq("provider", "expo")
    .eq("event_type", "sent")
    .not("provider_ticket_id", "is", null)
    .is("provider_receipt_id", null)
    .gte("created_at", sinceIso)
    .lte("created_at", beforeIso)
    .order("created_at", { ascending: true })
    .limit(effectiveLimit);

  if (pendingRes.error) {
    if (isMissingRelationError(pendingRes.error, "push_delivery_events")) {
      return { ok: true as const, available: false as const, processed: 0, receiptsChecked: 0 };
    }
    return {
      ok: false as const,
      status: 500,
      error: pendingRes.error.message ?? "push_receipts_query_failed",
    };
  }

  const pendingRows = (pendingRes.data ?? []) as SentEventRow[];
  const ticketToRows = new Map<string, SentEventRow[]>();
  for (const row of pendingRows) {
    const ticket = String(row.provider_ticket_id ?? "").trim();
    if (!ticket) continue;
    const list = ticketToRows.get(ticket) ?? [];
    list.push(row);
    ticketToRows.set(ticket, list);
  }
  const ticketIds = Array.from(ticketToRows.keys());

  let delivered = 0;
  let receiptErrors = 0;
  let deviceNotRegistered = 0;
  let pendingReceipts = 0;
  let checked = 0;
  const chunkResults = await runWithConcurrency(
    chunkArray(ticketIds, 200),
    parallelism,
    async (chunk) => {
      const local = {
        delivered: 0,
        receiptErrors: 0,
        deviceNotRegistered: 0,
        pendingReceipts: 0,
        checked: 0,
        recentErrorEvents: [] as any[],
        disableTokensByUser: new Map<string, Set<string>>(),
      };
      try {
        const res = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ ids: chunk }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          local.pendingReceipts += chunk.length;
          return local;
        }
        const receiptMap = json?.data && typeof json.data === "object" ? json.data : {};
        for (const ticketId of chunk) {
          const rows = ticketToRows.get(ticketId) ?? [];
          const receipt = receiptMap?.[ticketId];
          if (!receipt || typeof receipt !== "object") {
            local.pendingReceipts += 1;
            continue;
          }
          local.checked += 1;
          const status = String((receipt as any).status ?? "").trim();
          if (status === "ok") {
            await supa
              .from("push_delivery_events")
              .update({
                provider_receipt_id: ticketId,
                status: "delivered",
              })
              .in(
                "id",
                rows.map((r) => r.id)
              )
              .is("provider_receipt_id", null);
            local.delivered += rows.length || 1;
            continue;
          }

          const detailsError = String((receipt as any)?.details?.error ?? "").trim();
          const message = String((receipt as any)?.message ?? detailsError ?? "receipt_error").trim();
          const code = detailsError || "receipt_error";

          await supa
            .from("push_delivery_events")
            .update({
              provider_receipt_id: ticketId,
              status: "receipt_error",
              error_code: code,
              error_message: message,
            })
            .in(
              "id",
              rows.map((r) => r.id)
            )
            .is("provider_receipt_id", null);

          local.receiptErrors += rows.length || 1;
          if (code === "DeviceNotRegistered") {
            local.deviceNotRegistered += rows.length || 1;
            for (const row of rows) {
              const token = String(row.expo_push_token ?? "").trim();
              if (!token) continue;
              const bucket = local.disableTokensByUser.get(row.user_id) ?? new Set<string>();
              bucket.add(token);
              local.disableTokensByUser.set(row.user_id, bucket);
            }
          }

          const first = rows[0];
          if (first) {
            local.recentErrorEvents.push({
              user_id: first.user_id,
              job_id: first.job_id ?? null,
              notification_id: first.notification_id ?? null,
              post_id: first.post_id ?? null,
              kind: first.kind ?? null,
              provider: "expo",
              event_type: code === "DeviceNotRegistered" ? "device_not_registered" : "error",
              expo_push_token: first.expo_push_token ?? null,
              provider_ticket_id: ticketId,
              provider_receipt_id: ticketId,
              status: "receipt_error",
              error_code: code,
              error_message: message,
              metadata: { source: "receipt_worker", receipt: true, workerSource: args.source },
              created_at: new Date().toISOString(),
            });
          }
        }
      } catch {
        local.pendingReceipts += chunk.length;
      }
      return local;
    }
  );

  const recentErrorEvents: any[] = [];
  const disableTokensByUser = new Map<string, Set<string>>();
  chunkResults.forEach((r) => {
    delivered += r.delivered;
    receiptErrors += r.receiptErrors;
    deviceNotRegistered += r.deviceNotRegistered;
    pendingReceipts += r.pendingReceipts;
    checked += r.checked;
    if (Array.isArray(r.recentErrorEvents) && r.recentErrorEvents.length > 0) {
      recentErrorEvents.push(...r.recentErrorEvents);
    }
    r.disableTokensByUser.forEach((set, userId) => {
      const bucket = disableTokensByUser.get(userId) ?? new Set<string>();
      set.forEach((token) => bucket.add(token));
      disableTokensByUser.set(userId, bucket);
    });
  });

  if (recentErrorEvents.length > 0) {
    await supa.from("push_delivery_events").insert(recentErrorEvents.slice(0, 200));
  }

  for (const [userId, tokenSet] of disableTokensByUser) {
    const tokens = Array.from(tokenSet);
    if (tokens.length === 0) continue;
    await supa
      .from("user_push_devices")
      .update({
        enabled: false,
        last_delivery_status: "device_not_registered",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .in("expo_push_token", tokens);
  }

  return {
    ok: true as const,
    available: true as const,
    source: args.source,
    autoScale: args.autoScale,
    parallelism,
    pendingBefore,
    effectiveLimit,
    fetchedSentRows: pendingRows.length,
    ticketsRequested: ticketIds.length,
    receiptsChecked: checked,
    pendingReceipts,
    shouldContinue: pendingBefore > pendingRows.length || pendingReceipts > 0,
    delivered,
    receiptErrors,
    deviceNotRegistered,
  };
}

export async function POST(req: NextRequest) {
  const secret =
    process.env.PUSH_RECEIPTS_SECRET?.trim() || process.env.PUSH_DISPATCH_SECRET?.trim() || "";
  if (!secret) {
    return NextResponse.json({ ok: false, error: "push_receipts_secret_not_configured" }, { status: 503 });
  }
  const provided = req.headers.get("x-push-dispatch-secret")?.trim();
  if (!provided || provided !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const source = String(body?.source ?? "manual").slice(0, 48);
  const limit = toPositiveInt(body?.limit ?? req.nextUrl.searchParams.get("limit"), 300, 1, 1500);
  const autoScale =
    String(body?.autoScale ?? req.nextUrl.searchParams.get("autoScale") ?? "true").toLowerCase() !==
    "false";
  const requestedParallelism = toPositiveInt(
    body?.parallelism ?? req.nextUrl.searchParams.get("parallelism"),
    1,
    1,
    16
  );
  const ticketsPerWorkerTarget = toPositiveInt(
    body?.ticketsPerWorker ?? req.nextUrl.searchParams.get("ticketsPerWorker"),
    Number(process.env.PUSH_RECEIPTS_TICKETS_PER_WORKER ?? 200) || 200,
    20,
    1000
  );
  const maxParallelism = toPositiveInt(
    body?.maxParallelism ??
      req.nextUrl.searchParams.get("maxParallelism") ??
      process.env.PUSH_RECEIPTS_MAX_PARALLELISM,
    6,
    1,
    24
  );
  const minAgeSeconds = toPositiveInt(
    body?.minAgeSeconds ?? req.nextUrl.searchParams.get("minAgeSeconds"),
    20,
    0,
    600
  );
  const sinceDays = toPositiveInt(body?.sinceDays ?? req.nextUrl.searchParams.get("sinceDays"), 3, 1, 14);
  const autoReenter =
    String(body?.autoReenter ?? req.nextUrl.searchParams.get("autoReenter") ?? "true").toLowerCase() !==
    "false";
  const maxPasses = toPositiveInt(
    body?.maxPasses ??
      req.nextUrl.searchParams.get("maxPasses") ??
      process.env.PUSH_RECEIPTS_MAX_PASSES,
    3,
    1,
    20
  );

  const supa = supabaseAdmin() as any;
  const passes: Array<{
    pass: number;
    source: string;
    parallelism: number;
    pendingBefore: number;
    effectiveLimit: number;
    fetchedSentRows: number;
    ticketsRequested: number;
    receiptsChecked: number;
    pendingReceipts: number;
    delivered: number;
    receiptErrors: number;
    deviceNotRegistered: number;
    shouldContinue: boolean;
  }> = [];
  let finalPass: any = null;
  let totals = {
    fetchedSentRows: 0,
    ticketsRequested: 0,
    receiptsChecked: 0,
    pendingReceipts: 0,
    delivered: 0,
    receiptErrors: 0,
    deviceNotRegistered: 0,
  };

  for (let pass = 1; pass <= maxPasses; pass += 1) {
    const passResult = await runReceiptsPass(supa, {
      source: `${source}:p${pass}`,
      limit,
      autoScale,
      requestedParallelism,
      ticketsPerWorkerTarget,
      maxParallelism,
      minAgeSeconds,
      sinceDays,
    });

    if (passResult.ok === false) {
      return NextResponse.json({ ok: false, error: passResult.error }, { status: passResult.status ?? 500 });
    }
    if (passResult.available === false) {
      return NextResponse.json({
        ok: true,
        available: false,
        processed: 0,
        receiptsChecked: 0,
        passCount: 0,
        passes: [],
      });
    }

    finalPass = passResult;
    passes.push({
      pass,
      source: passResult.source,
      parallelism: passResult.parallelism,
      pendingBefore: passResult.pendingBefore,
      effectiveLimit: passResult.effectiveLimit,
      fetchedSentRows: passResult.fetchedSentRows,
      ticketsRequested: passResult.ticketsRequested,
      receiptsChecked: passResult.receiptsChecked,
      pendingReceipts: passResult.pendingReceipts,
      delivered: passResult.delivered,
      receiptErrors: passResult.receiptErrors,
      deviceNotRegistered: passResult.deviceNotRegistered,
      shouldContinue: passResult.shouldContinue,
    });

    totals = {
      fetchedSentRows: totals.fetchedSentRows + (passResult.fetchedSentRows ?? 0),
      ticketsRequested: totals.ticketsRequested + (passResult.ticketsRequested ?? 0),
      receiptsChecked: totals.receiptsChecked + (passResult.receiptsChecked ?? 0),
      pendingReceipts: passResult.pendingReceipts ?? totals.pendingReceipts,
      delivered: totals.delivered + (passResult.delivered ?? 0),
      receiptErrors: totals.receiptErrors + (passResult.receiptErrors ?? 0),
      deviceNotRegistered: totals.deviceNotRegistered + (passResult.deviceNotRegistered ?? 0),
    };

    if (!(autoReenter && passResult.shouldContinue)) break;
  }

  return NextResponse.json({
    ok: true,
    available: true,
    source,
    autoScale,
    autoReenter,
    maxPasses,
    passCount: passes.length,
    processed: totals.receiptsChecked,
    receiptsChecked: totals.receiptsChecked,
    fetchedSentRows: totals.fetchedSentRows,
    ticketsRequested: totals.ticketsRequested,
    pendingReceipts: totals.pendingReceipts,
    delivered: totals.delivered,
    receiptErrors: totals.receiptErrors,
    deviceNotRegistered: totals.deviceNotRegistered,
    shouldContinue: Boolean(finalPass?.shouldContinue),
    lastPass: finalPass
      ? {
          parallelism: finalPass.parallelism,
          pendingBefore: finalPass.pendingBefore,
          effectiveLimit: finalPass.effectiveLimit,
          fetchedSentRows: finalPass.fetchedSentRows,
          ticketsRequested: finalPass.ticketsRequested,
          receiptsChecked: finalPass.receiptsChecked,
          pendingReceipts: finalPass.pendingReceipts,
        }
      : null,
    passes,
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
