"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type PushPoint = {
  day: string;
  kind: string;
  queued: number;
  sent: number;
  delivered: number;
  receiptErrors: number;
  errors: number;
  opens: number;
  deviceNotRegistered: number;
  deliveryRate: number;
  sentToDeliveredRate: number;
  openRate: number;
};

type PushDashboardResponse = {
  ok: boolean;
  available: boolean;
  reason?: string;
  days: number;
  points: PushPoint[];
  queue: { pending: number; processing: number; oldestPendingMinutes: number | null };
  receipts: { pending: number };
  devices: Array<{
    provider?: string | null;
    enabled?: boolean | null;
    platform?: string | null;
    updated_at?: string | null;
    last_delivery_at?: string | null;
    last_delivery_status?: string | null;
    permission_status?: string | null;
  }>;
  summary: {
    queued: number;
    sent: number;
    delivered: number;
    receiptErrors: number;
    errors: number;
    opens: number;
    deviceNotRegistered: number;
    deliveryRate: number;
    sentToDeliveredRate: number;
    openRate: number;
  } | null;
  recentErrors: Array<{
    id: number;
    at: string;
    kind: string | null;
    eventType: string;
    code: string | null;
    message: string | null;
  }>;
};

function pct(v: number | null | undefined) {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v * 100)));
}

export default function PushDeliveryDashboardPage() {
  const [days, setDays] = useState(28);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PushDashboardResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/me/push-delivery/dashboard?days=${days}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) throw new Error(json?.error ?? "Push配信ダッシュボード取得に失敗しました");
      setData(json as PushDashboardResponse);
    } catch (e: any) {
      setError(e?.message ?? "Push配信ダッシュボード取得に失敗しました");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPoints = useMemo(
    () => (data?.points ?? []).filter((x) => x.kind === "__all__"),
    [data?.points]
  );

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Push配信ダッシュボード</h1>
        <p className="text-sm opacity-70">
          growth通知の queue backlog / queued→sent / sent→delivered / 開封率 / 無効トークンを運用監視します。
        </p>
      </header>

      <div className="rounded-xl border bg-white p-3 flex flex-wrap items-center gap-3">
        <label className="text-sm flex items-center gap-2">
          期間
          <select
            className="border rounded px-2 py-1"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[14, 28, 42, 56].map((d) => (
              <option key={d} value={d}>
                直近{d}日
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void load()} className="px-3 py-1 rounded border">
          {loading ? "更新中…" : "更新"}
        </button>
        <a href="/dashboard" className="text-sm underline ml-auto">
          ダッシュボードへ戻る
        </a>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {data && !data.available ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          Push delivery queue/metrics テーブル未適用です（{data.reason ?? "missing"}）。
        </div>
      ) : null}

      {data?.available ? (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border bg-white p-4 space-y-1">
              <div className="text-xs opacity-70">Queue Backlog</div>
              <div className="text-xl font-semibold">
                pending {data.queue.pending} / processing {data.queue.processing}
              </div>
              <div className="text-xs opacity-70">
                最古 pending:{" "}
                {data.queue.oldestPendingMinutes == null
                  ? "なし"
                  : `${data.queue.oldestPendingMinutes} 分`}
              </div>
              <div className="text-xs opacity-70">
                receipt未確定: {data.receipts?.pending ?? 0}
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4 space-y-1">
              <div className="text-xs opacity-70">配信率 / 開封率</div>
              <div className="text-xl font-semibold">
                配信 {pct(data.summary?.deliveryRate)}% / 開封 {pct(data.summary?.openRate)}%
              </div>
              <div className="text-xs opacity-70">
                queued {data.summary?.queued ?? 0} / sent {data.summary?.sent ?? 0} / open {data.summary?.opens ?? 0}
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4 space-y-1">
              <div className="text-xs opacity-70">Sent→Delivered率</div>
              <div className="text-xl font-semibold">
                到達 {pct(data.summary?.sentToDeliveredRate)}%
              </div>
              <div className="text-xs opacity-70">
                delivered {data.summary?.delivered ?? 0} / receipt_error {data.summary?.receiptErrors ?? 0}
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4 space-y-1">
              <div className="text-xs opacity-70">端末状態</div>
              <div className="text-xl font-semibold">
                有効 {data.devices.filter((d) => d.enabled !== false).length} / 合計 {data.devices.length}
              </div>
              <div className="text-xs opacity-70">
                無効トークン累計 {data.summary?.deviceNotRegistered ?? 0}
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-white p-4 space-y-3">
            <div className="font-semibold text-sm">日次推移（全通知種別）</div>
            <div className="space-y-2">
              {totalPoints.length === 0 ? (
                <div className="text-sm opacity-70">まだデータがありません。</div>
              ) : (
                totalPoints.map((p) => (
                  <div key={`push-day-${p.day}`} className="rounded-lg border bg-slate-50 p-3">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span>{p.day}</span>
                      <span className="opacity-70">
                        配信 {pct(p.deliveryRate)}% / 到達 {pct(p.sentToDeliveredRate)}% / 開封 {pct(p.openRate)}%
                      </span>
                    </div>
                    <div className="grid gap-2 md:grid-cols-3">
                      <div className="space-y-1">
                        <div className="text-[11px] opacity-70">配信率</div>
                        <div className="h-2 rounded bg-slate-200 overflow-hidden">
                          <div
                            className="h-full bg-cyan-500"
                            style={{ width: `${pct(p.deliveryRate)}%` }}
                          />
                        </div>
                        <div className="text-[10px] opacity-70">
                          queued {p.queued} / sent {p.sent} / error {p.errors}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[11px] opacity-70">Sent→Delivered率</div>
                        <div className="h-2 rounded bg-slate-200 overflow-hidden">
                          <div
                            className="h-full bg-violet-500"
                            style={{ width: `${pct(p.sentToDeliveredRate)}%` }}
                          />
                        </div>
                        <div className="text-[10px] opacity-70">
                          delivered {p.delivered} / receipt_error {p.receiptErrors}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[11px] opacity-70">開封率</div>
                        <div className="h-2 rounded bg-slate-200 overflow-hidden">
                          <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${pct(p.openRate)}%` }}
                          />
                        </div>
                        <div className="text-[10px] opacity-70">
                          open {p.opens} / device_not_registered {p.deviceNotRegistered}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border bg-white p-4 space-y-2">
              <div className="font-semibold text-sm">Push端末一覧</div>
              {data.devices.length === 0 ? (
                <div className="text-sm opacity-70">登録端末はまだありません。</div>
              ) : (
                data.devices.map((d, idx) => (
                  <div key={`push-device-${idx}`} className="rounded border p-2 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span>{d.platform ?? "unknown"} / {d.provider ?? "expo"}</span>
                      <span className={d.enabled === false ? "text-red-600" : "text-emerald-700"}>
                        {d.enabled === false ? "disabled" : "enabled"}
                      </span>
                    </div>
                    <div className="opacity-70">
                      権限 {d.permission_status ?? "unknown"} / 最終配信 {d.last_delivery_status ?? "未記録"}
                    </div>
                    <div className="opacity-70">
                      更新 {d.updated_at ? new Date(d.updated_at).toLocaleString("ja-JP") : "未記録"}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="rounded-xl border bg-white p-4 space-y-2">
              <div className="font-semibold text-sm">最近の配信エラー</div>
              {data.recentErrors.length === 0 ? (
                <div className="text-sm opacity-70">目立ったエラーはありません。</div>
              ) : (
                data.recentErrors.map((e) => (
                  <div key={`push-err-${e.id}`} className="rounded border p-2 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span>{e.kind ?? "__all__"}</span>
                      <span>{new Date(e.at).toLocaleString("ja-JP")}</span>
                    </div>
                    <div className="opacity-70">{e.eventType}</div>
                    <div className="text-red-700">{e.code ?? e.message ?? "error"}</div>
                    {e.message && e.message !== e.code ? (
                      <div className="opacity-70 break-all">{e.message}</div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
