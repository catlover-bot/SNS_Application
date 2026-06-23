"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildTimelineLearningActionTips,
  buildTimelineLearningSectionSummary,
  buildTimelineWeightTrendDeltaSummary,
  buildTimelineWeightTrendRatios,
  formatTimelineWeightPointLabel,
  pickTimelineHighlights,
  rankTimelineByUserSignals,
  resolvePostAuthorIdentity,
  resolveSocialIdentityLabels,
  splitByOpenedIds,
  type TimelineSignalWeightsHistoryPoint,
  type TimelineSignalWeights,
} from "@sns/core";
import { fetchFeedPage, fetchTimelineSignals, updateTimelineSignalWeights } from "@/lib/socialDataClient";
import { useSocialFeedState } from "@/lib/useSocialListState";
import SignedInDemoGuide from "@/components/SignedInDemoGuide";
import { personaDisplayName } from "@/lib/personaCatalog";

type FeedItem = {
  id: string;
  created_at: string;
  text?: string | null;
  arche_key?: string | null;
  score?: number | null;
  analysis?: any;
  author?: string | null;
  author_handle?: string | null;
  author_display?: string | null;
};

const PAGE = 20;

export default function HomeFeed() {
  const [feedState, feedActions] = useSocialFeedState<FeedItem>({ hasMore: true, items: [] });
  const [openedIds, setOpenedIds] = useState<Record<string, true>>({});
  const [followedAuthorIds, setFollowedAuthorIds] = useState<string[]>([]);
  const [savedPostIds, setSavedPostIds] = useState<string[]>([]);
  const [timelineSignalWeights, setTimelineSignalWeights] = useState<TimelineSignalWeights | null>(null);
  const [timelineSignalWeightsSamples, setTimelineSignalWeightsSamples] = useState<number>(0);
  const [timelineSignalWeightsHistory, setTimelineSignalWeightsHistory] = useState<
    TimelineSignalWeightsHistoryPoint[]
  >([]);
  const openStateRequestedIds = useRef<Set<string>>(new Set());
  const persistedOpenedIds = useRef<Set<string>>(new Set());
  const weightsPersistSigRef = useRef<string>("");
  const rawItems = feedState.items;
  const loading = feedState.loading;
  const error = feedState.error;
  const ended = !feedState.hasMore;
  const interestedAuthorIds = useMemo(() => {
    const s = new Set<string>();
    rawItems.forEach((item) => {
      if (!openedIds[item.id]) return;
      const authorId = String(item.author ?? "").trim();
      const authorHandle = String(item.author_handle ?? "").replace(/^@+/, "").trim();
      if (authorId) s.add(authorId);
      if (authorHandle) s.add(authorHandle);
    });
    return Array.from(s);
  }, [openedIds, rawItems]);
  const items = useMemo(
    () =>
      rankTimelineByUserSignals(rawItems, {
        openedIds,
        savedPostIds,
        followedAuthorIds,
        interestedAuthorIds,
        weights: timelineSignalWeights ?? undefined,
        learningInput: {
          openedCount: Object.keys(openedIds).length,
          savedCount: savedPostIds.length,
          followedCount: followedAuthorIds.length,
        },
      }).map((x) => x.item),
    [followedAuthorIds, interestedAuthorIds, openedIds, rawItems, savedPostIds, timelineSignalWeights]
  );
  const { fresh: freshItems, past: pastItems } = useMemo(
    () => splitByOpenedIds(items, openedIds),
    [items, openedIds]
  );
  const timelineHighlights = useMemo(
    () =>
      pickTimelineHighlights(items, {
        popularLimit: 3,
        forYouLimit: 4,
        openedIds,
        followedAuthorIds,
        savedPostIds,
        interestedAuthorIds,
      }),
    [followedAuthorIds, interestedAuthorIds, items, openedIds, savedPostIds]
  );
  const timelineWeightTrendBars = useMemo(() => {
    return buildTimelineWeightTrendRatios(timelineSignalWeightsHistory, 16).map((v) =>
      Math.round(v * 100)
    );
  }, [timelineSignalWeightsHistory]);
  const timelineWeightTrendDeltaLabels = useMemo(() => {
    const delta = buildTimelineWeightTrendDeltaSummary(timelineSignalWeightsHistory, 10);
    if (!delta) return null;
    return {
      save: formatTimelineWeightPointLabel(delta.saved, { signed: true }),
      follow: formatTimelineWeightPointLabel(delta.followed, { signed: true }),
      openPenalty: formatTimelineWeightPointLabel(delta.openedPenalty, { signed: true }),
    };
  }, [timelineSignalWeightsHistory]);
  const timelineLearningSummary = useMemo(
    () =>
      buildTimelineLearningSectionSummary({
        weightsSamples: timelineSignalWeightsSamples,
        learningInput: {
          openedCount: Object.keys(openedIds).length,
          savedCount: savedPostIds.length,
          followedCount: followedAuthorIds.length,
        },
        historyCount: timelineSignalWeightsHistory.length,
      }),
    [
      followedAuthorIds.length,
      openedIds,
      savedPostIds.length,
      timelineSignalWeightsHistory.length,
      timelineSignalWeightsSamples,
    ]
  );
  const timelineLearningActionTips = useMemo(
    () =>
      buildTimelineLearningActionTips({
        weightsSamples: timelineSignalWeightsSamples,
        learningInput: {
          openedCount: Object.keys(openedIds).length,
          savedCount: savedPostIds.length,
          followedCount: followedAuthorIds.length,
        },
        weights: timelineSignalWeights ?? null,
        history: timelineSignalWeightsHistory,
      }),
    [
      followedAuthorIds.length,
      openedIds,
      savedPostIds.length,
      timelineSignalWeights,
      timelineSignalWeightsHistory,
      timelineSignalWeightsSamples,
    ]
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { res, json } = await fetchTimelineSignals();
        if (!alive || !res.ok || !json) return;
        setFollowedAuthorIds(
          Array.isArray(json.followedAuthorIds)
            ? json.followedAuthorIds.map((x) => String(x ?? "").trim()).filter(Boolean)
            : []
        );
        setSavedPostIds(
          Array.isArray(json.savedPostIds)
            ? json.savedPostIds.map((x) => String(x ?? "").trim()).filter(Boolean)
            : []
        );
        const opened = Array.isArray(json.openedPostIds)
          ? json.openedPostIds.map((x) => String(x ?? "").trim()).filter(Boolean)
          : [];
        if (json.weights && typeof json.weights === "object") {
          setTimelineSignalWeights(json.weights);
        }
        setTimelineSignalWeightsSamples(Math.max(0, Math.floor(Number(json.weightsSamples ?? 0) || 0)));
        setTimelineSignalWeightsHistory(
          Array.isArray(json.weightsHistory)
            ? (json.weightsHistory as TimelineSignalWeightsHistoryPoint[])
            : []
        );
        if (opened.length > 0) {
          opened.forEach((x) => persistedOpenedIds.current.add(x));
          setOpenedIds((prev) => {
            const next = { ...prev };
            opened.forEach((x) => {
              next[x] = true;
            });
            return next;
          });
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const learningInput = {
      openedCount: Object.keys(openedIds).length,
      savedCount: savedPostIds.length,
      followedCount: followedAuthorIds.length,
    };
    if (
      learningInput.openedCount <= 0 &&
      learningInput.savedCount <= 0 &&
      learningInput.followedCount <= 0
    ) {
      return;
    }
    const sig = JSON.stringify(learningInput);
    if (weightsPersistSigRef.current === sig) return;
    weightsPersistSigRef.current = sig;

    let cancelled = false;
    (async () => {
      try {
        const { res, json } = await updateTimelineSignalWeights(learningInput);
        if (cancelled || !res.ok || !json) return;
        if (json.weights && typeof json.weights === "object") {
          setTimelineSignalWeights(json.weights);
        }
        if (json.weightsSamples != null) {
          setTimelineSignalWeightsSamples(Math.max(0, Math.floor(Number(json.weightsSamples) || 0)));
        }
        if (Array.isArray(json.weightsHistory) && json.weightsHistory.length > 0) {
          setTimelineSignalWeightsHistory((prev) => {
            const merged = [...prev, ...(json.weightsHistory as TimelineSignalWeightsHistoryPoint[])];
            const seen = new Set<string>();
            const deduped: TimelineSignalWeightsHistoryPoint[] = [];
            merged.forEach((point) => {
              const key = `${point.at}|${point.samples}`;
              if (seen.has(key)) return;
              seen.add(key);
              deduped.push(point);
            });
            return deduped.slice(-24);
          });
        }
      } catch {
        // ignore: ranking still works with local learned weights
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [followedAuthorIds.length, openedIds, savedPostIds.length]);

  const hydrateOpenedState = useCallback(async (postIds: string[]) => {
    const unique = Array.from(new Set(postIds.map((x) => String(x ?? "").trim()).filter(Boolean)));
    if (unique.length === 0) return;
    const missing = unique.filter((x) => !openStateRequestedIds.current.has(x));
    if (missing.length === 0) return;
    missing.forEach((x) => openStateRequestedIds.current.add(x));

    try {
      const params = new URLSearchParams();
      params.set("postIds", missing.join(","));
      const res = await fetch(`/api/me/post-open-state?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json().catch(() => null);
      const opened = Array.isArray(json?.openedIds)
        ? json.openedIds.map((x: any) => String(x ?? "").trim()).filter(Boolean)
        : [];
      if (opened.length === 0) return;
      opened.forEach((x) => persistedOpenedIds.current.add(x));
      setOpenedIds((prev) => {
        const next = { ...prev };
        opened.forEach((x) => {
          next[x] = true;
        });
        return next;
      });
    } catch {
      // ignore
    }
  }, []);

  const persistOpenedState = useCallback(async (postId: string) => {
    try {
      const res = await fetch("/api/me/post-open-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId,
          source: "home_feed",
        }),
      });
      if (!res.ok) {
        persistedOpenedIds.current.delete(postId);
      }
    } catch {
      persistedOpenedIds.current.delete(postId);
    }
  }, []);

  const markOpened = useCallback(
    (postId: string) => {
      const id = String(postId ?? "").trim();
      if (!id) return;
      setOpenedIds((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
      if (persistedOpenedIds.current.has(id)) return;
      persistedOpenedIds.current.add(id);
      void persistOpenedState(id);
    },
    [persistOpenedState]
  );

  async function loadMore() {
    if (loading || ended) return;
    feedActions.start(false);

    try {
      const { json } = await fetchFeedPage({ limit: PAGE, offset: rawItems.length });
      const got: FeedItem[] = Array.isArray(json) ? json : json?.items ?? [];
      feedActions.append(got, {
        hasMore: got.length >= PAGE,
        offset: rawItems.length + got.length,
      });
      void hydrateOpenedState(got.map((x) => x.id));
    } catch {
      // 失敗しても落とさない
      feedActions.fail("タイムライン取得に失敗しました");
    }
  }

  useEffect(() => {
    // 初回ロード
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <header className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
          For You Timeline
        </div>
        <h1 className="mt-1 text-2xl font-bold">あなた向けタイムライン</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          開いた投稿、保存した投稿、フォローした相手からおすすめの重みが育ちます。
          キャラ傾向と相性も混ぜながら、次に読みたくなる投稿を並べます。
        </p>
      </header>

      {items.length === 0 && !loading ? <SignedInDemoGuide /> : null}

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <div className="font-medium">タイムラインを読み込めませんでした</div>
          <p className="mt-1">時間をおいてもう一度お試しください。</p>
          <button
            type="button"
            onClick={() => void loadMore()}
            className="mt-3 rounded-full border border-rose-200 bg-white px-3 py-1.5 hover:bg-rose-100"
            disabled={loading}
          >
            {loading ? "読み込み中…" : "再読み込み"}
          </button>
        </div>
      )}

      {(timelineHighlights.popular.length > 0 || timelineHighlights.forYou.length > 0) && (
        <section className="space-y-3 rounded-xl border bg-white p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{timelineLearningSummary.title}</h2>
            <span className="text-xs opacity-70">
              人気 {timelineHighlights.popular.length} / あなた向け {timelineHighlights.forYou.length}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            {timelineLearningSummary.stageDescription}
          </p>
          {timelineLearningActionTips.length > 0 && (
            <div className="rounded-lg border bg-blue-50 px-3 py-2">
              <div className="text-[11px] font-semibold text-blue-900">おすすめを育てるコツ</div>
              <div className="mt-1 space-y-1">
                {timelineLearningActionTips.map((tip) => (
                  <div key={tip.key} className="text-[11px] text-blue-800">
                    ・{tip.label}: {tip.detail}
                  </div>
                ))}
              </div>
            </div>
          )}
          {timelineSignalWeightsSamples > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-slate-400">
                  {timelineLearningSummary.stageLabel} / 更新 {timelineSignalWeightsSamples}回（フォロー/保存/開封を反映）
                </p>
                <a href="/persona-feed" className="text-[11px] underline text-blue-700 whitespace-nowrap">
                  キャラTLを見る
                </a>
              </div>
              {timelineWeightTrendBars.length > 1 && (
                <div className="rounded-lg border bg-slate-50 px-2 py-2">
                  <div className="flex h-10 items-end gap-1">
                    {timelineWeightTrendBars.map((h, idx) => (
                      <div
                        key={`tl-weight-bar-${idx}`}
                        className="flex-1 rounded-sm bg-gradient-to-t from-blue-500 to-cyan-300"
                        style={{ height: `${Math.max(8, h)}%` }}
                      />
                    ))}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-500">
                    <span>重み推移</span>
                    {timelineWeightTrendDeltaLabels ? (
                      <>
                        <span>保存 {timelineWeightTrendDeltaLabels.save}pt</span>
                        <span>フォロー {timelineWeightTrendDeltaLabels.follow}pt</span>
                        <span>開封抑制 {timelineWeightTrendDeltaLabels.openPenalty}pt</span>
                      </>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          )}

          {timelineHighlights.popular.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700">人気の投稿</div>
              {timelineHighlights.popular.map((p) => {
                const labels = resolveSocialIdentityLabels(resolvePostAuthorIdentity(p));
                return (
                  <a
                    key={`popular-${p.id}`}
                    href={`/p/${encodeURIComponent(p.id)}`}
                    onClick={() => markOpened(p.id)}
                    className="block rounded-lg border bg-slate-50 p-3 hover:bg-slate-100"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-slate-800">{labels.primary}</div>
                        <div className="truncate text-xs text-slate-600">{p.text ?? ""}</div>
                      </div>
                      <span className="shrink-0 text-[11px] rounded-full border px-2 py-0.5 bg-white">
                        人気 {Math.round((Number(p.score ?? 0) || 0) * 100)}%
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          )}

          {timelineHighlights.forYou.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700">あなた向け</div>
              {timelineHighlights.forYou.map(({ item: p, reason }) => {
                const labels = resolveSocialIdentityLabels(resolvePostAuthorIdentity(p));
                return (
                  <a
                    key={`for-you-${p.id}`}
                    href={`/p/${encodeURIComponent(p.id)}`}
                    onClick={() => markOpened(p.id)}
                    className="block rounded-lg border bg-blue-50 p-3 hover:bg-blue-100"
                  >
                    <div className="text-xs font-semibold text-slate-800 truncate">{labels.primary}</div>
                    <div className="text-xs text-slate-600 line-clamp-2">{p.text ?? ""}</div>
                    <div className="mt-1 text-[11px] text-blue-700">{reason}</div>
                  </a>
                );
              })}
            </div>
          )}
        </section>
      )}

      {freshItems.length > 0 && (
        <section className="space-y-3 rounded-xl border bg-white p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">新着</h2>
            <span className="text-xs rounded-full border bg-amber-50 border-amber-200 px-2 py-0.5">
              {freshItems.length}
            </span>
          </div>
          {freshItems.map((p) => (
            <article key={p.id} className="rounded-xl border p-3 bg-white">
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  {(() => {
                    const author = resolvePostAuthorIdentity(p);
                    const labels = resolveSocialIdentityLabels(author);
                    const primary = labels.primary;
                    const secondary = labels.secondary;
                    return (
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-800">{primary}</div>
                        {secondary ? (
                          <div className="truncate text-slate-500">{secondary}</div>
                        ) : null}
                      </div>
                    );
                  })()}
                </div>
                <div className="opacity-60 shrink-0">{new Date(p.created_at).toLocaleString()}</div>
              </div>
              <p className="whitespace-pre-wrap">{p.text}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <a
                  href={`/p/${encodeURIComponent(p.id)}`}
                  onClick={() => markOpened(p.id)}
                  className="inline-block underline text-xs"
                >
                  投稿を開く
                </a>
                {p.arche_key && (
                  <a
                    href={`/personas/${encodeURIComponent(p.arche_key)}`}
                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-gray-50 hover:bg-gray-100"
                    title="この投稿から得られたキャラ成長のシグナルです"
                  >
                    <span>成長シグナル</span>
                    <span className="opacity-70">{personaDisplayName(p.arche_key)}系</span>
                  </a>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {pastItems.length > 0 && (
        <section className="space-y-3 rounded-xl border bg-white p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">過去</h2>
            <span className="text-xs rounded-full border bg-gray-50 px-2 py-0.5">{pastItems.length}</span>
          </div>
          {pastItems.map((p) => (
            <article key={p.id} className="rounded-xl border p-3 bg-white">
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  {(() => {
                    const author = resolvePostAuthorIdentity(p);
                    const labels = resolveSocialIdentityLabels(author);
                    const primary = labels.primary;
                    const secondary = labels.secondary;
                    return (
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-800">{primary}</div>
                        {secondary ? (
                          <div className="truncate text-slate-500">{secondary}</div>
                        ) : null}
                      </div>
                    );
                  })()}
                </div>
                <div className="opacity-60 shrink-0">{new Date(p.created_at).toLocaleString()}</div>
              </div>
              <p className="whitespace-pre-wrap">{p.text}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <a
                  href={`/p/${encodeURIComponent(p.id)}`}
                  onClick={() => markOpened(p.id)}
                  className="inline-block underline text-xs"
                >
                  投稿を開く
                </a>
                {p.arche_key && (
                  <a
                    href={`/personas/${encodeURIComponent(p.arche_key)}`}
                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-gray-50 hover:bg-gray-100"
                    title="この投稿から得られたキャラ成長のシグナルです"
                  >
                    <span>成長シグナル</span>
                    <span className="opacity-70">{personaDisplayName(p.arche_key)}系</span>
                  </a>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
          <div className="font-semibold text-slate-900">タイムラインはこれから育ちます</div>
          <p className="mt-1">
            投稿を読む、保存する、フォローするほどおすすめがあなたのキャラに近づきます。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="/compose" className="rounded-full bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
              投稿する
            </a>
            <a href="/persona-feed" className="rounded-full border border-slate-200 bg-white px-4 py-2 hover:bg-slate-50">
              キャラ別TLへ
            </a>
            <a href="/search" className="rounded-full border border-slate-200 bg-white px-4 py-2 hover:bg-slate-50">
              投稿を探す
            </a>
          </div>
        </div>
      )}

      {!loading && items.length > 0 && freshItems.length === 0 && pastItems.length === 0 && (
        <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">
          表示できる投稿がありません。条件を変えて再読み込みしてください。
        </div>
      )}

      <div className="py-4 flex justify-center">
        <button
          onClick={loadMore}
          className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-50"
          disabled={loading || ended}
          type="button"
        >
          {loading ? "読み込み中…" : ended ? "これ以上はありません" : "もっと読む"}
        </button>
      </div>
    </div>
  );
}
