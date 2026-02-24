import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function isMissingRelationError(err: any, relation: string) {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes(relation.toLowerCase()) && text.includes("does not exist");
}

function dayBefore(daysAgo: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  const daysParam = Number(req.nextUrl.searchParams.get("days") ?? 28);
  const days = Math.max(7, Math.min(90, Number.isFinite(daysParam) ? Math.floor(daysParam) : 28));
  const fromDay = dayBefore(days - 1);

  const [devicesRes, metricsRes, eventsRes, sentReceiptRes, pendingReceiptRes, queueRes, queueAgeRes] =
    await Promise.all([
    supa
      .from("user_push_devices")
      .select("provider,enabled,platform,updated_at,last_delivery_at,last_delivery_status,permission_status")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(20),
    supa
      .from("push_delivery_daily_metrics")
      .select("*")
      .eq("user_id", user.id)
      .gte("day", fromDay)
      .order("day", { ascending: true })
      .limit(days * 4),
    supa
      .from("push_delivery_events")
      .select("id,created_at,event_type,kind,error_code,error_message,status")
      .eq("user_id", user.id)
      .gte("created_at", `${fromDay}T00:00:00.000Z`)
      .in("event_type", ["open", "error", "device_not_registered"])
      .order("created_at", { ascending: false })
      .limit(500),
    supa
      .from("push_delivery_events")
      .select("id,created_at,event_type,kind,status,provider_ticket_id,provider_receipt_id")
      .eq("user_id", user.id)
      .eq("event_type", "sent")
      .gte("created_at", `${fromDay}T00:00:00.000Z`)
      .order("created_at", { ascending: false })
      .limit(Math.min(5000, days * 300)),
    supa
      .from("push_delivery_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("provider", "expo")
      .eq("event_type", "sent")
      .not("provider_ticket_id", "is", null)
      .is("provider_receipt_id", null)
      .gte("created_at", `${fromDay}T00:00:00.000Z`),
    supa
      .from("push_notification_jobs")
      .select("id,status,created_at", { count: "exact" })
      .eq("user_id", user.id)
      .in("status", ["pending", "processing"])
      .limit(200),
    supa
      .from("push_notification_jobs")
      .select("created_at")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    ]);

  const available =
    !devicesRes.error &&
    !metricsRes.error &&
    !eventsRes.error &&
    !sentReceiptRes.error &&
    !pendingReceiptRes.error &&
    !queueRes.error &&
    !queueAgeRes.error;

  const relationErrors: Array<[string, any]> = [
    ["user_push_devices", devicesRes.error],
    ["push_delivery_daily_metrics", metricsRes.error],
    ["push_delivery_events", eventsRes.error],
    ["push_delivery_events", sentReceiptRes.error],
    ["push_delivery_events", pendingReceiptRes.error],
    ["push_notification_jobs", queueRes.error],
  ];
  const missingAny = relationErrors.find(
    ([relation, err]) => err && isMissingRelationError(err, relation)
  );

  if (missingAny) {
    return NextResponse.json({
      ok: true,
      available: false,
      reason: `${missingAny[0]}_missing`,
      days,
      points: [],
      queue: { pending: 0, processing: 0, oldestPendingMinutes: null },
      receipts: { pending: 0 },
      devices: [],
      summary: null,
      recentErrors: [],
    });
  }

  if (
    devicesRes.error ||
    metricsRes.error ||
    eventsRes.error ||
    sentReceiptRes.error ||
    pendingReceiptRes.error ||
    queueRes.error ||
    queueAgeRes.error
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          devicesRes.error?.message ||
          metricsRes.error?.message ||
          eventsRes.error?.message ||
          sentReceiptRes.error?.message ||
          pendingReceiptRes.error?.message ||
          queueRes.error?.message ||
          queueAgeRes.error?.message ||
          "push_dashboard_failed",
      },
      { status: 500 }
    );
  }

  const metricsRows = (metricsRes.data ?? []) as Array<{
    day: string;
    kind: string;
    queued_count: number;
    sent_count: number;
    error_count: number;
    open_count: number;
    device_not_registered_count: number;
  }>;
  const eventRows = (eventsRes.data ?? []) as Array<{
    id: number;
    created_at: string;
    event_type: string;
    kind: string | null;
    error_code?: string | null;
    error_message?: string | null;
    status?: string | null;
  }>;
  const sentReceiptRows = (sentReceiptRes.data ?? []) as Array<{
    id: number;
    created_at: string;
    event_type: string;
    kind: string | null;
    status?: string | null;
    provider_ticket_id?: string | null;
    provider_receipt_id?: string | null;
  }>;

  const openFallback = new Map<string, number>();
  const deliveredFallback = new Map<string, number>();
  const receiptErrorFallback = new Map<string, number>();
  eventRows.forEach((ev) => {
    if (ev.event_type !== "open") return;
    const day = String(ev.created_at ?? "").slice(0, 10);
    const kind = String(ev.kind ?? "__all__") || "__all__";
    const key = `${day}|${kind}`;
    openFallback.set(key, (openFallback.get(key) ?? 0) + 1);
    const allKey = `${day}|__all__`;
    openFallback.set(allKey, (openFallback.get(allKey) ?? 0) + 1);
  });
  sentReceiptRows.forEach((ev) => {
    const day = String(ev.created_at ?? "").slice(0, 10);
    const kind = String(ev.kind ?? "__all__") || "__all__";
    const put = (map: Map<string, number>) => {
      const key = `${day}|${kind}`;
      map.set(key, (map.get(key) ?? 0) + 1);
      const allKey = `${day}|__all__`;
      map.set(allKey, (map.get(allKey) ?? 0) + 1);
    };
    if (String(ev.status ?? "") === "delivered" && String(ev.provider_receipt_id ?? "").trim()) {
      put(deliveredFallback);
    } else if (String(ev.status ?? "") === "receipt_error" && String(ev.provider_receipt_id ?? "").trim()) {
      put(receiptErrorFallback);
    }
  });

  const points = metricsRows
    .map((row) => {
      const fallbackOpen = openFallback.get(`${row.day}|${row.kind}`) ?? 0;
      const fallbackDelivered = deliveredFallback.get(`${row.day}|${row.kind}`) ?? 0;
      const fallbackReceiptErrors = receiptErrorFallback.get(`${row.day}|${row.kind}`) ?? 0;
      const openCount = Math.max(Number(row.open_count ?? 0) || 0, fallbackOpen);
      const queued = Math.max(0, Number(row.queued_count ?? 0) || 0);
      const sent = Math.max(0, Number(row.sent_count ?? 0) || 0);
      const errors = Math.max(0, Number(row.error_count ?? 0) || 0);
      const delivered = Math.max(0, fallbackDelivered);
      const receiptErrors = Math.max(0, fallbackReceiptErrors);
      const deliveryRate = queued > 0 ? sent / queued : sent > 0 ? 1 : 0;
      const sentToDeliveredRate = sent > 0 ? delivered / sent : 0;
      const openRate = sent > 0 ? openCount / sent : 0;
      return {
        day: String(row.day),
        kind: String(row.kind ?? "__all__"),
        queued,
        sent,
        delivered,
        receiptErrors,
        errors,
        opens: openCount,
        deviceNotRegistered: Math.max(0, Number(row.device_not_registered_count ?? 0) || 0),
        deliveryRate,
        sentToDeliveredRate,
        openRate,
      };
    })
    .sort((a, b) => a.day.localeCompare(b.day));

  const summaryBase = points.filter((p) => p.kind === "__all__");
  const sum = summaryBase.reduce(
    (acc, p) => {
      acc.queued += p.queued;
      acc.sent += p.sent;
      acc.delivered += p.delivered;
      acc.receiptErrors += p.receiptErrors;
      acc.errors += p.errors;
      acc.opens += p.opens;
      acc.deviceNotRegistered += p.deviceNotRegistered;
      return acc;
    },
    { queued: 0, sent: 0, delivered: 0, receiptErrors: 0, errors: 0, opens: 0, deviceNotRegistered: 0 }
  );

  const queueRows = (queueRes.data ?? []) as Array<{ status: string; created_at: string }>;
  const pending = queueRows.filter((x) => x.status === "pending").length;
  const processing = queueRows.filter((x) => x.status === "processing").length;
  const oldestPendingAt = (queueAgeRes.data as any)?.created_at
    ? String((queueAgeRes.data as any).created_at)
    : null;
  const oldestPendingMinutes =
    oldestPendingAt && Number.isFinite(Date.parse(oldestPendingAt))
      ? Math.max(0, Math.floor((Date.now() - Date.parse(oldestPendingAt)) / 60000))
      : null;
  const pendingReceiptCount = Math.max(0, Number(pendingReceiptRes.count ?? 0) || 0);

  return NextResponse.json({
    ok: true,
    available: true,
    days,
    points,
    queue: {
      pending,
      processing,
      oldestPendingMinutes,
    },
    receipts: {
      pending: pendingReceiptCount,
    },
    devices: (devicesRes.data ?? []) as any[],
    summary: {
      ...sum,
      deliveryRate: sum.queued > 0 ? sum.sent / sum.queued : sum.sent > 0 ? 1 : 0,
      sentToDeliveredRate: sum.sent > 0 ? sum.delivered / sum.sent : 0,
      openRate: sum.sent > 0 ? sum.opens / sum.sent : 0,
    },
    recentErrors: eventRows
      .filter((x) => x.event_type !== "open")
      .slice(0, 20)
      .map((x) => ({
        id: x.id,
        at: x.created_at,
        kind: x.kind,
        eventType: x.event_type,
        code: x.error_code ?? null,
        message: x.error_message ?? x.status ?? null,
      })),
  });
}
