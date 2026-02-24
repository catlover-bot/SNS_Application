"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveNotificationActorIdentity, splitByReadAt } from "@sns/core";
import { supabaseClient as supabase } from "@/lib/supabase/client";
import { fetchNotificationsList, markNotificationsRead as markNotificationsReadApi } from "@/lib/socialDataClient";
import { useNotificationsState } from "@/lib/useSocialListState";

type NotificationItem = {
  id: string;
  kind?: string | null;
  title?: string | null;
  body?: string | null;
  created_at: string;
  read_at?: string | null;
  actor_handle?: string | null;
  actor_display?: string | null;
  post_id?: string | null;
};

type NotificationFilter = "all" | "reply" | "like" | "follow" | "boost";

function matchNotificationFilter(kind: string | null | undefined, filter: NotificationFilter) {
  if (filter === "all") return true;
  const k = String(kind ?? "").toLowerCase();
  if (filter === "boost") return k.includes("boost") || k.includes("repost");
  return k.includes(filter);
}

function notificationLabel(kind: string | null | undefined) {
  const k = String(kind ?? "").toLowerCase();
  if (k.includes("creator_growth") || k.includes("growth_")) return "成績";
  if (k.includes("reply")) return "返信";
  if (k.includes("follow")) return "フォロー";
  if (k.includes("like")) return "いいね";
  if (k.includes("boost") || k.includes("repost")) return "拡散";
  if (k.includes("truth") || k.includes("vote")) return "真偽";
  return "通知";
}

export default function NotificationsPage() {
  const sb = useMemo(() => supabase(), []);
  const [listState, listActions] = useNotificationsState<NotificationItem>({ items: [] });
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [busyRead, setBusyRead] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const items = listState.items;
  const loading = listState.loading;
  const error = listState.error;

  const fetchItems = useCallback(async () => {
    listActions.start(true);
    try {
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) {
        location.href = "/login?next=/notifications";
        return;
      }
      setViewerId(user.id);

      const { res, json } = await fetchNotificationsList();
      if (!res.ok) {
        throw new Error(json?.error ?? "通知の取得に失敗しました");
      }
      const nextItems = (json?.items ?? []) as NotificationItem[];
      listActions.replace(nextItems, { hasMore: false, offset: nextItems.length });
    } catch (e: any) {
      listActions.fail(e?.message ?? "通知の取得に失敗しました");
    }
  }, [listActions, sb]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    if (!viewerId) return;

    const channel = sb
      .channel(`notifications:${viewerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${viewerId}` },
        () => {
          void fetchItems();
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [fetchItems, sb, viewerId]);

  const unreadIds = useMemo(
    () => items.filter((x) => !x.read_at).map((x) => x.id),
    [items]
  );

  const markRead = useCallback(async (ids: string[]) => {
    if (busyRead || ids.length === 0) return;
    setBusyRead(true);
    try {
      const { res, json } = await markNotificationsReadApi(ids);
      if (!res.ok) {
        throw new Error(json?.error ?? "既読化に失敗しました");
      }
      const nowIso = new Date().toISOString();
      listActions.replace(
        items.map((x) => (ids.includes(x.id) ? { ...x, read_at: nowIso } : x)),
        {
          hasMore: listState.hasMore,
          offset: listState.offset,
        }
      );
    } catch (e: any) {
      listActions.setError(e?.message ?? "既読化に失敗しました");
    } finally {
      setBusyRead(false);
    }
  }, [busyRead, items, listActions, listState.hasMore, listState.offset]);

  const markAllRead = useCallback(async () => {
    await markRead(unreadIds);
  }, [markRead, unreadIds]);

  const filteredItems = useMemo(
    () => items.filter((x) => matchNotificationFilter(x.kind, filter)),
    [filter, items]
  );
  const { fresh: freshItems, past: pastItems } = useMemo(
    () => splitByReadAt(filteredItems),
    [filteredItems]
  );

  return (
    <div className="space-y-4 max-w-3xl mx-auto p-6">
      <div className="flex items-center">
        <h1 className="text-xl font-semibold">通知</h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs rounded-full border px-2 py-1 bg-gray-50">
            未読 {unreadIds.length}
          </span>
          <button
            type="button"
            onClick={markAllRead}
            disabled={busyRead || unreadIds.length === 0}
            className="text-sm border rounded px-3 py-1 bg-white disabled:opacity-50"
          >
            すべて既読
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { key: "all", label: "すべて" },
            { key: "reply", label: "返信" },
            { key: "like", label: "いいね" },
            { key: "follow", label: "フォロー" },
            { key: "boost", label: "拡散" },
          ] as Array<{ key: NotificationFilter; label: string }>
        ).map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => setFilter(x.key)}
            className={`text-sm rounded-full border px-3 py-1 ${
              filter === x.key ? "bg-blue-600 text-white border-blue-600" : "bg-white"
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded border bg-red-50 text-red-700 text-sm p-3">{error}</div>
      )}

      {loading ? (
        <div className="opacity-60 text-sm">読み込み中…</div>
      ) : items.length === 0 ? (
        <div className="opacity-60 text-sm">通知はまだありません。</div>
      ) : filteredItems.length === 0 ? (
        <div className="opacity-60 text-sm">この種類の通知はまだありません。</div>
      ) : (
        <div className="space-y-3">
          {freshItems.length > 0 && (
            <section className="space-y-2 rounded-xl border bg-white p-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">新着</h2>
                <span className="text-xs rounded-full border bg-amber-50 border-amber-200 px-2 py-0.5">
                  {freshItems.length}
                </span>
              </div>
              {freshItems.map((n) => {
                const actorIdentity = resolveNotificationActorIdentity(n);
                const actor = actorIdentity.primaryLabel || "だれか";
                const title = n.title || n.body || `${actor} さんからの通知`;
                return (
                  <article key={n.id} className="rounded border border-amber-200 bg-amber-50 p-3">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="opacity-60">
                        {new Date(n.created_at).toLocaleString("ja-JP")}
                      </span>
                      <span className="rounded bg-white px-2 py-0.5">{notificationLabel(n.kind)}</span>
                      <span className="rounded bg-amber-200 text-amber-900 px-2 py-0.5">未読</span>
                    </div>
                    <div className="mt-1 text-sm">{title}</div>
                    {actorIdentity.handleLabel ? (
                      <div className="mt-1 text-xs text-amber-900/80">{actorIdentity.handleLabel}</div>
                    ) : null}
                    <div className="mt-2 flex items-center gap-3">
                      {n.post_id && (
                        <a
                          href={`/p/${encodeURIComponent(n.post_id)}`}
                          onClick={() => {
                            void markRead([n.id]);
                          }}
                          className="inline-block underline text-sm"
                        >
                          投稿を開く
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => void markRead([n.id])}
                        disabled={busyRead}
                        className="text-xs border rounded px-2 py-1 bg-white disabled:opacity-50"
                      >
                        既読にする
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>
          )}

          {pastItems.length > 0 && (
            <section className="space-y-2 rounded-xl border bg-white p-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">過去</h2>
                <span className="text-xs rounded-full border bg-gray-50 px-2 py-0.5">
                  {pastItems.length}
                </span>
              </div>
              {pastItems.map((n) => {
                const actorIdentity = resolveNotificationActorIdentity(n);
                const actor = actorIdentity.primaryLabel || "だれか";
                const title = n.title || n.body || `${actor} さんからの通知`;
                return (
                  <article key={n.id} className="rounded border bg-white p-3">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="opacity-60">
                        {new Date(n.created_at).toLocaleString("ja-JP")}
                      </span>
                      <span className="rounded bg-gray-100 px-2 py-0.5">{notificationLabel(n.kind)}</span>
                    </div>
                    <div className="mt-1 text-sm">{title}</div>
                    {actorIdentity.handleLabel ? (
                      <div className="mt-1 text-xs text-slate-500">{actorIdentity.handleLabel}</div>
                    ) : null}
                    <div className="mt-2 flex items-center gap-3">
                      {n.post_id && (
                        <a href={`/p/${encodeURIComponent(n.post_id)}`} className="inline-block underline text-sm">
                          投稿を開く
                        </a>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
