"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Image from "next/image";

type PersonaDetail = {
  key: string;
  title: string | null;
  theme: string | null;
  vibe_tags: string[] | null;
  talk_style: string | null;
  blurb: string | null; // キャラ詳細
  icon: string | null; // 画像 or 絵文字 or URL
  relation_style?: string | null;
};

type Mode = "friendship" | "romance";

type CompatRow = {
  source_key: string;
  target_key: string;
  score: number | null;
  // API によっては無い可能性もあるので全部 optional 扱い
  target_title?: string | null;
  target_theme?: string | null;
  target_vibe_tags?: string[] | null;
  target_icon?: string | null;
  relation_label?: string | null;
};

const MODE_LABEL: Record<Mode, string> = {
  friendship: "友情モード",
  romance: "恋愛モード",
};

// 0〜1 または 0〜100 どちらのスコアでもそこそこいい感じに解釈する
function percent(score: number | null | undefined): number {
  if (typeof score !== "number" || Number.isNaN(score)) return 0;
  const s = score;
  if (s <= 0) return 0;
  if (s <= 1) return Math.round(s * 100); // 0〜1
  if (s <= 100) return Math.round(s); // 0〜100
  return 100;
}

function themeLabel(theme: string | null | undefined): string {
  switch (theme) {
    case "social":
      return "社交タイプ";
    case "chaos":
      return "カオスタイプ";
    case "logic":
      return "ロジックタイプ";
    default:
      return "未分類タイプ";
  }
}

/**
 * スコア＆モードから自動で「相性タイトル」をつける
 * DB に relation_label があればそちらを優先し、なければこれを使う想定
 */
function autoRelationLabel(
  mode: Mode,
  score: number | null | undefined
): string {
  const p = percent(score);

  if (mode === "romance") {
    if (p >= 90) return "運命級ソウルメイト候補";
    if (p >= 75) return "かなり甘々になれそうな関係";
    if (p >= 60) return "現実的にちょうど良い相性バランス";
    if (p >= 40) return "距離感の取り方がカギな相性";
    return "ハマると沼るスリリングなコンビ";
  } else {
    // friendship
    if (p >= 90) return "相棒レベルの親友コンビ";
    if (p >= 75) return "安心感バツグンのチームメイト";
    if (p >= 60) return "噛み合うところ多めのフレンド";
    if (p >= 40) return "クセはあるけど面白い相棒";
    return "距離感むずいスパイス相性";
  }
}

/**
 * icon カラム or key から画像/絵文字を決める
 */
function resolveIcon(
  icon: string | null | undefined,
  key: string | null | undefined
): { isImage: boolean; value: string } {
  const raw = icon?.trim();
  const safeKey = (key && key.trim()) || "default";

  if (raw) {
    if (
      raw.startsWith("http://") ||
      raw.startsWith("https://") ||
      raw.startsWith("/")
    ) {
      return { isImage: true, value: raw };
    }

    if (raw.length <= 3) {
      return { isImage: false, value: raw };
    }

    const base =
      raw.endsWith(".png") || raw.endsWith(".jpg") || raw.endsWith(".jpeg")
        ? raw
        : `${raw}.png`;

    return { isImage: true, value: `/persona-images/${base}` };
  }

  return {
    isImage: true,
    value: `/persona-images/${safeKey}.png`,
  };
}

export default function PersonaDetailPage() {
  const params = useParams<{ key: string }>();
  const personaKey =
    typeof params.key === "string"
      ? decodeURIComponent(params.key)
      : "unknown";

  const [persona, setPersona] = useState<PersonaDetail | null>(null);
  const [loadingPersona, setLoadingPersona] = useState(true);
  const [personaError, setPersonaError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("friendship");
  const [compat, setCompat] = useState<{
    friendship: CompatRow[] | null;
    romance: CompatRow[] | null;
  }>({
    friendship: null,
    romance: null,
  });
  const [compatError, setCompatError] = useState<string | null>(null);
  const [loadingCompat, setLoadingCompat] = useState(false);

  // 相性相手の persona 詳細キャッシュ
  const [compatPersonaMap, setCompatPersonaMap] = useState<
    Record<string, PersonaDetail | undefined>
  >({});

  // --- キャラ詳細の取得（自分自身：persona_defs から） ---
  useEffect(() => {
    let alive = true;
    setLoadingPersona(true);
    setPersonaError(null);

    (async () => {
      try {
        const res = await fetch(
          `/api/persona_defs?key=${encodeURIComponent(personaKey)}`
        );
        if (!res.ok) {
          const t = await res.text();
          console.error(
            "[persona detail page] persona api error",
            res.status,
            t
          );
          throw new Error(t || res.statusText);
        }
        const data = (await res.json()) as PersonaDetail;
        if (!alive) return;
        setPersona(data);
      } catch (e: any) {
        console.error("[persona detail page] persona error", e);
        if (!alive) return;
        setPersonaError("キャラ情報の取得に失敗しました。");
        setPersona(null);
      } finally {
        if (alive) setLoadingPersona(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [personaKey]);

  // --- 相性データの取得（モード別） ---
  useEffect(() => {
    let alive = true;
    setCompatError(null);

    if (compat[mode] !== null) {
      return;
    }

    setLoadingCompat(true);

    (async () => {
      try {
        const res = await fetch(
          `/api/personas/compat?key=${encodeURIComponent(
            personaKey
          )}&mode=${mode}`
        );
        if (!res.ok) {
          const t = await res.text();
          console.error(
            "[persona detail page] compat api error",
            res.status,
            t
          );
          throw new Error(t || res.statusText);
        }
        const rows = (await res.json()) as CompatRow[];
        if (!alive) return;

        setCompat((prev) => ({
          ...prev,
          [mode]: rows ?? [],
        }));
      } catch (e: any) {
        console.error("[persona detail page] compat error", e);
        if (!alive) return;
        setCompatError("相性データの取得に失敗しました。");
        setCompat((prev) => ({
          ...prev,
          [mode]: [],
        }));
      } finally {
        if (alive) setLoadingCompat(false);
      }
    })();

    return () => {
      alive = false;
    };
    // compat 自体ではなく、対象モードだけを見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, personaKey, compat[mode]]);

  const currentCompat: CompatRow[] = useMemo(
    () => compat[mode] ?? [],
    [compat, mode]
  );

  // --- 相性相手の persona 詳細をまとめて取得（persona_defs から） ---
  useEffect(() => {
    const rows = currentCompat;
    if (!rows || rows.length === 0) return;

    const keys = Array.from(
      new Set(
        rows
          .map((r) => r.target_key)
          .filter((k): k is string => !!k && k.trim().length > 0)
      )
    );
    if (!keys.length) return;

    let cancelled = false;

    (async () => {
      for (const key of keys) {
        if (cancelled) return;

        // 既にキャッシュ済みならスキップ
        if (compatPersonaMap[key]) continue;

        try {
          const res = await fetch(
            `/api/persona_defs?key=${encodeURIComponent(key)}`
          );
          if (!res.ok) continue;
          const data = (await res.json()) as PersonaDetail;
          if (cancelled) return;
          setCompatPersonaMap((prev) => {
            if (prev[key]) return prev;
            return { ...prev, [key]: data };
          });
        } catch {
          // 無視して次へ
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCompat]);

  const [topCompat, restCompat] = useMemo(() => {
    // target_key が入っている行だけ使う
    const rowsWithKey = currentCompat.filter(
      (r) => !!r.target_key && r.target_key.trim().length > 0
    );
    if (!rowsWithKey.length) return [null, []] as const;
    const [first, ...rest] = rowsWithKey;
    return [first, rest] as const;
  }, [currentCompat]);

  const iconInfo = resolveIcon(persona?.icon, personaKey);

  return (
    <div className="space-y-6">
      <div className="text-sm mb-1">
        <Link
          href="/personas"
          className="text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
        >
          ← キャラ図鑑へ戻る
        </Link>
      </div>

      {personaError && (
        <div className="text-xs text-red-600 mb-1">
          キャラ情報の取得に失敗しました。（キー: {personaKey}）
        </div>
      )}

      {/* キャラヘッダー */}
      <section className="rounded-2xl border bg-white/80 px-4 py-4 sm:px-6 sm:py-5 flex gap-4 items-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center overflow-hidden shrink-0 border">
          {iconInfo.isImage ? (
            <Image
              src={iconInfo.value}
              alt={persona?.title || personaKey || "キャラアイコン"}
              width={64}
              height={64}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-2xl">{iconInfo.value}</span>
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="text-xs text-slate-400 break-all">
            key: {personaKey}
          </div>
          <div className="text-lg sm:text-xl font-semibold truncate">
            {loadingPersona
              ? "読み込み中…"
              : persona?.title || personaKey || "（名称未設定）"}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] bg-slate-50 text-slate-700">
              {themeLabel(persona?.theme)}
            </span>
            {(persona?.vibe_tags ?? [])
              .slice(0, 4)
              .map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
                >
                  {tag}
                </span>
              ))}
          </div>
        </div>
      </section>

      {/* キャラ詳細情報 */}
      <section className="rounded-2xl border bg-slate-50 px-4 py-3 sm:px-6 sm:py-4">
        <div className="text-xs font-semibold text-slate-600 mb-1">
          キャラ詳細情報
        </div>
        <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
          {personaError
            ? "キャラ詳細情報を読み込めませんでした。"
            : persona?.blurb ?? "このキャラの詳細情報は準備中です。"}
        </p>
      </section>

      {/* 話し方のクセ */}
      {persona?.talk_style && (
        <section className="rounded-2xl border bg-slate-50 px-4 py-3 sm:px-6 sm:py-4">
          <div className="text-xs font-semibold text-slate-600 mb-1">
            話し方のクセ
          </div>
          <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
            {persona.talk_style}
          </p>
        </section>
      )}

      {/* ソウルメイト候補 */}
      <section className="rounded-2xl border bg-white/80 px-4 py-4 sm:px-6 sm:py-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <div className="text-xs font-semibold text-sky-600 tracking-wide">
              ソウルメイト候補
            </div>
            <p className="text-xs text-slate-500 mt-1">
              あなたのキャラと特に相性が良い{" "}
              <span className="font-semibold">友情モード / 恋愛モード</span>
              の相手キャラをスコア付きで表示します。
            </p>
          </div>
          <div className="inline-flex rounded-full bg-slate-100 p-1 text-xs">
            <button
              type="button"
              onClick={() => setMode("friendship")}
              className={`px-3 py-1 rounded-full ${
                mode === "friendship"
                  ? "bg-white shadow-sm text-slate-900"
                  : "text-slate-500"
              }`}
            >
              友情モード
            </button>
            <button
              type="button"
              onClick={() => setMode("romance")}
              className={`px-3 py-1 rounded-full ${
                mode === "romance"
                  ? "bg-white shadow-sm text-rose-700"
                  : "text-slate-500"
              }`}
            >
              恋愛モード
            </button>
          </div>
        </div>

        {compatError && (
          <div className="text-xs text-red-600">{compatError}</div>
        )}

        {loadingCompat && !currentCompat.length ? (
          <div className="text-xs text-slate-500 py-6 text-center">
            相性データを読み込み中…
          </div>
        ) : !currentCompat.length ? (
          <div className="text-xs text-slate-500 py-6 text-center border rounded-xl bg-slate-50">
            まだこのキャラの相性データがありません。
          </div>
        ) : (
          <>
            {/* No.1 ソウルメイト候補 */}
            {topCompat && (() => {
              const tp = topCompat;
              const targetPersona =
                compatPersonaMap[tp.target_key] ?? null;

              const displayTitle =
                targetPersona?.title ||
                tp.target_title ||
                "（名称未設定）";

              const displayKey =
                targetPersona?.key || tp.target_key || "unknown";

              const displayVibes =
                targetPersona?.vibe_tags ??
                tp.target_vibe_tags ??
                [];

              const icon = resolveIcon(
                targetPersona?.icon ?? tp.target_icon ?? null,
                targetPersona?.key ?? tp.target_key ?? "unknown"
              );

              // ★ 相性タイトル（DB の relation_label があれば優先）
              const relationLabel =
                tp.relation_label ?? autoRelationLabel(mode, tp.score);

              return (
                <div className="rounded-2xl border bg-gradient-to-br from-rose-50 via-amber-50 to-sky-50 px-4 py-4 sm:px-6 sm:py-5 flex flex-col sm:flex-row gap-3 sm:gap-4">
                  {/* 相性相手のアイコン */}
                  <div className="w-12 h-12 rounded-xl bg-white/80 flex items-center justify-center overflow-hidden shrink-0 border border-rose-100">
                    {icon.isImage ? (
                      <Image
                        src={icon.value}
                        alt={`${displayTitle} のアイコン`}
                        width={48}
                        height={48}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xl">{icon.value}</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="text-[10px] font-semibold text-rose-500 uppercase tracking-wide">
                      ソウルメイト候補 No.1
                    </div>
                    <div className="text-base sm:text-lg font-semibold truncate">
                      {displayTitle}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      @{displayKey}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-rose-700 border border-rose-100">
                        {MODE_LABEL[mode]} {percent(tp.score)}%{" "}
                        {mode === "romance" ? "💘" : "🤝"}
                      </span>
                      {relationLabel && (
                        <span className="inline-flex items-center rounded-full bg-white/80 px-2 py-0.5 text-[11px] text-slate-700 border border-slate-100">
                          {relationLabel}
                        </span>
                      )}

                      {displayVibes.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center rounded-full bg-white/60 px-2 py-0.5 text-[11px] text-slate-700 border border-slate-100"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center sm:items-start justify-end">
                    <div className="text-right space-y-1">
                      <div className="text-xs text-slate-500">
                        {MODE_LABEL[mode]}
                      </div>
                      <div className="text-3xl font-semibold">
                        {percent(tp.score)}
                        <span className="text-base ml-1">%</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* その他候補 */}
            {restCompat.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {restCompat.map((row) => {
                  const targetPersona =
                    compatPersonaMap[row.target_key] ?? null;

                  const displayTitle =
                    targetPersona?.title ||
                    row.target_title ||
                    "（名称未設定）";

                  const displayKey =
                    targetPersona?.key ||
                    row.target_key ||
                    "unknown";

                  const displayVibes =
                    targetPersona?.vibe_tags ??
                    row.target_vibe_tags ??
                    [];

                  const icon = resolveIcon(
                    targetPersona?.icon ??
                      row.target_icon ??
                      null,
                    targetPersona?.key ??
                      row.target_key ??
                      "unknown"
                  );

                  // ★ ここも同じく、 relation_label → 自動タイトル fallback
                  const relationLabel =
                    row.relation_label ?? autoRelationLabel(mode, row.score);

                  return (
                    <div
                      key={`${row.target_key}-${mode}`}
                      className="rounded-xl border bg-white/80 px-4 py-3 flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          {/* 相性相手のアイコン（小さめ） */}
                          <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center overflow-hidden shrink-0 border border-slate-100">
                            {icon.isImage ? (
                              <Image
                                src={icon.value}
                                alt={`${displayTitle} のアイコン`}
                                width={32}
                                height={32}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-lg">
                                {icon.value}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">
                              {displayTitle}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              @{displayKey}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] text-slate-500">
                            {MODE_LABEL[mode]}
                          </div>
                          <div className="text-xl font-semibold">
                            {percent(row.score)}
                            <span className="text-xs ml-1">%</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {relationLabel && (
                          <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700 border border-slate-100">
                            {relationLabel}
                          </span>
                        )}

                        {displayVibes.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700 border border-slate-100"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
