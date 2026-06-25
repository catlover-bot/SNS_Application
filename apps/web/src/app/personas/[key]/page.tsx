"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Image from "next/image";
import { buildPersonaPostingGuide, buildPersonaProfile } from "@sns/core";
import { getPersonaProfile, personaDisplayName } from "@/lib/personaCatalog";
import { getPersonaColorClasses, PersonaGameBadges } from "@/components/PersonaGameBadges";
import AnimatedPersonaImage from "@/components/AnimatedPersonaImage";
import PersonaEvolutionPreviewStrip from "@/components/PersonaEvolutionPreviewStrip";
import {
  buildPersonaEvolutionProgress,
  type PersonaEvolutionProgress,
} from "@/lib/personaEvolution";

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

// APIから整形後に使う型
type CompatRow = {
  source_key: string;
  target_key: string;
  score: number | null;
  // API 側からくる情報をここに格納
  target_title?: string | null;
  target_theme?: string | null;
  target_vibe_tags?: string[] | null;
  target_icon?: string | null;
  relation_label?: string | null;
};

type CompatApiResponse = {
  mode: string;
  sourceKey: string;
  items: {
    targetKey: string;
    kind: string;
    score: number;
    relationLabel: string | null;
    title: string;
    icon: string | null;
    theme: string | null;
    relationStyle: string | null;
    vibeTags?: string[] | null;
  }[];
};

type OwnedPersonaProfileResponse = {
  personas?: Array<{
    persona_key: string;
    score: number | null;
    confidence: number | null;
  }>;
  breakdowns?: Array<{
    personaKey: string;
    totalScore: number;
    confidence: number;
    evolution?: PersonaEvolutionProgress;
  }>;
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
function autoRelationLabel(mode: Mode, score: number | null | undefined): string {
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
  key: string | null | undefined,
  title?: string | null
): { isImage: boolean; value: string } {
  const raw = icon?.trim();
  const safeKey = (key && key.trim()) || "default";
  const safeTitle = (title ?? "").trim();

  if (raw) {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return { isImage: true, value: raw };
    }
    if (raw.startsWith("/persona-images/")) {
      const name = raw.replace("/persona-images/", "").replace(/\.(png|jpe?g|svg)$/i, "");
      const qs = safeTitle ? `?title=${encodeURIComponent(safeTitle)}` : "";
      return { isImage: true, value: `/api/personas/image/${encodeURIComponent(name)}${qs}` };
    }
    if (raw.startsWith("/")) {
      return { isImage: true, value: raw };
    }

    // 絵文字っぽい場合
    if (raw.length <= 3) {
      return { isImage: false, value: raw };
    }

    const iconKey = raw.replace(/\.(png|jpe?g|svg)$/i, "");
    const qs = safeTitle ? `?title=${encodeURIComponent(safeTitle)}` : "";
    return {
      isImage: true,
      value: `/api/personas/image/${encodeURIComponent(iconKey)}${qs}`,
    };
  }

  // icon が無い場合は key ベースでローカル画像にフォールバック
  const qs = safeTitle ? `?title=${encodeURIComponent(safeTitle)}` : "";
  return {
    isImage: true,
    value: `/api/personas/image/${encodeURIComponent(safeKey)}${qs}`,
  };
}

function PersonaIconImage(props: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className: string;
}) {
  if (props.src.startsWith("/api/personas/image/")) {
    return <img {...props} />;
  }
  return <Image {...props} />;
}

export default function PersonaDetailPage() {
  const params = useParams<{ key: string }>();
  const personaKey =
    typeof params.key === "string" ? decodeURIComponent(params.key) : "unknown";

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
  const [ownedEvolution, setOwnedEvolution] = useState<PersonaEvolutionProgress | null>(null);

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
          throw new Error("persona_unavailable");
        }
        const data = (await res.json()) as PersonaDetail;
        if (!alive) return;
        setPersona(data);
      } catch {
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

  useEffect(() => {
    let alive = true;
    setOwnedEvolution(null);

    (async () => {
      try {
        const res = await fetch("/api/me/persona_profile", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as OwnedPersonaProfileResponse | null;
        if (!alive || !data) return;

        const breakdown = (data.breakdowns ?? []).find((item) => item.personaKey === personaKey);
        if (breakdown?.evolution?.stage?.key) {
          setOwnedEvolution(breakdown.evolution);
          return;
        }

        const personaRow = (data.personas ?? []).find((item) => item.persona_key === personaKey);
        if (personaRow) {
          setOwnedEvolution(
            buildPersonaEvolutionProgress({
              personaKey,
              score: personaRow.score,
              confidence: personaRow.confidence,
            })
          );
        }
      } catch {
        // Public detail pages still work when the viewer is signed out.
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

    // すでにそのモードのデータを持っている場合は再フェッチしない
    if (compat[mode] !== null) {
      return;
    }

    setLoadingCompat(true);

    (async () => {
      try {
        const params = new URLSearchParams({
          key: personaKey,
          mode,
          limit: "16",
        });

        const res = await fetch(`/api/personas/compat?${params.toString()}`);
        if (!res.ok) {
          throw new Error("persona_compat_unavailable");
        }

        const data = (await res.json()) as CompatApiResponse;
        if (!alive) return;

        const rows: CompatRow[] = (data.items ?? []).map((item) => ({
          source_key: data.sourceKey,
          target_key: item.targetKey,
          score: item.score,
          target_title: personaDisplayName(item.targetKey),
          target_theme: item.theme,
          target_vibe_tags: item.vibeTags ?? [],
          target_icon: item.icon,
          relation_label: item.relationLabel ?? undefined,
        }));

        setCompat((prev) => ({
          ...prev,
          [mode]: rows,
        }));
      } catch {
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

  const [topCompat, restCompat] = useMemo(() => {
    const rowsWithKey = currentCompat.filter(
      (r) => !!r.target_key && r.target_key.trim().length > 0
    );
    if (!rowsWithKey.length) return [null, []] as const;
    const [first, ...rest] = rowsWithKey;
    return [first, rest] as const;
  }, [currentCompat]);

  const catalogProfile = useMemo(() => getPersonaProfile(personaKey), [personaKey]);
  const color = getPersonaColorClasses(personaKey);
  const iconInfo = resolveIcon(persona?.icon, personaKey, catalogProfile.displayName);
  const detailHeroStageKey = ownedEvolution?.stage.key ?? "discovery";
  const profile = useMemo(
    () =>
      buildPersonaProfile({
        key: personaKey,
        title: catalogProfile.displayName,
        theme: persona?.theme ?? null,
        blurb: catalogProfile.description,
        talkStyle: persona?.talk_style ?? null,
        relationStyle: persona?.relation_style ?? null,
        vibeTags: persona?.vibe_tags ?? [],
      }),
    [
      persona?.blurb,
      persona?.relation_style,
      persona?.talk_style,
      persona?.theme,
      persona?.title,
      persona?.vibe_tags,
      catalogProfile.description,
      catalogProfile.displayName,
      personaKey,
    ]
  );
  const postingGuide = useMemo(
    () =>
      buildPersonaPostingGuide({
        key: personaKey,
        title: catalogProfile.displayName,
        theme: persona?.theme ?? null,
        blurb: catalogProfile.description,
        talkStyle: persona?.talk_style ?? null,
        relationStyle: persona?.relation_style ?? null,
        vibeTags: persona?.vibe_tags ?? [],
      }),
    [
      persona?.blurb,
      persona?.relation_style,
      persona?.talk_style,
      persona?.theme,
      persona?.title,
      persona?.vibe_tags,
      catalogProfile.description,
      catalogProfile.displayName,
      personaKey,
    ]
  );

  return (
    <div className="space-y-6">
      <div className="mb-1 text-sm">
        <Link
          href="/personas"
          className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700"
        >
          ← 恐竜図鑑へ戻る
        </Link>
      </div>

      {personaError && (
        <div className="mb-1 text-xs text-red-600">
          一部の追加情報を取得できなかったため、恐竜図鑑の情報を表示しています。
        </div>
      )}

      {/* キャラヘッダー */}
      <section className={`flex flex-col items-center gap-4 rounded-2xl border bg-gradient-to-br px-4 py-5 sm:flex-row sm:px-6 ${color.card}`}>
        <AnimatedPersonaImage
          personaKey={personaKey}
          stageKey={detailHeroStageKey}
          displayName={catalogProfile.displayName}
          iconEmoji={iconInfo.isImage ? catalogProfile.iconEmoji : iconInfo.value}
          silhouetteEmoji={catalogProfile.silhouetteEmoji}
          variant="hero"
          motion="sparkle"
          className="h-36 w-36 shrink-0 rounded-3xl border border-white/80 bg-white/75 shadow-sm sm:h-40 sm:w-40"
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="truncate text-lg font-semibold sm:text-xl">
            {loadingPersona ? "読み込み中…" : catalogProfile.displayName}
          </div>
          <div className="text-sm font-medium text-blue-700">{catalogProfile.title}</div>
          {catalogProfile.speciesName && <div className="text-xs text-slate-500">{catalogProfile.speciesName}</div>}
          <PersonaGameBadges personaKey={personaKey} showEvolutionStage={false} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700">
              {themeLabel(persona?.theme)}
            </span>
            {catalogProfile.traits
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
        <div className="mb-1 text-xs font-semibold text-slate-600">
          キャラ詳細情報
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
          {catalogProfile.description}
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border bg-emerald-50 px-4 py-3 sm:px-6 sm:py-4">
          <div className="text-xs font-semibold text-emerald-800">育ちやすい投稿</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-emerald-950">
            {catalogProfile.growthSignals.map((signal) => <li key={signal}>{signal}</li>)}
          </ul>
        </div>
        <div className="rounded-2xl border bg-blue-50 px-4 py-3 sm:px-6 sm:py-4">
          <div className="text-xs font-semibold text-blue-800">AI判定との関係</div>
          <p className="mt-1 text-xs leading-5 text-blue-800">
            AI判定は投稿のクセを読み、その積み重ねがキャラ成長の材料になります。
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-blue-950">
            {(catalogProfile.aiScoreHints ?? []).map((hint) => <li key={hint}>{hint}</li>)}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-violet-50 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Evolution forms</div>
            <h2 className="mt-1 text-lg font-bold text-slate-950">進化段階</h2>
          </div>
          <span className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-semibold text-violet-700">
            1体 × 4段階
          </span>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          この恐竜は、投稿傾向が積み重なるほど同じ個性のまま進化します。別の恐竜へ置き換わる仕組みではありません。
        </p>
        <PersonaEvolutionPreviewStrip
          personaKey={personaKey}
          displayName={catalogProfile.displayName}
          currentStageKey={ownedEvolution?.stage.key}
          unlockedStages={ownedEvolution?.unlockedStages}
          variant="showcase"
          className="mt-4"
        />
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-semibold text-amber-900">この恐竜を育てるヒント</div>
          <p className="mt-1 text-sm leading-6 text-amber-950">{catalogProfile.evolutionHint}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 sm:px-6 sm:py-4">
        <div className="text-sm font-semibold text-indigo-950">あなた自身の恐竜を見てみる</div>
        <p className="mt-1 text-sm leading-6 text-indigo-900/80">
          図鑑は12体の恐竜を見る場所です。あなた自身の恐竜は、投稿の成長シグナルから育ちます。
        </p>
        <Link
          href="/dashboard/persona"
          className="mt-3 inline-flex rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          マイ恐竜を確認する
        </Link>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href="/compose" className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          この恐竜を育てる投稿を書く
        </Link>
        <Link href="/personas" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          恐竜図鑑に戻る
        </Link>
      </div>

      <section className="rounded-2xl border bg-slate-50 px-4 py-3 sm:px-6 sm:py-4 space-y-2">
        <div className="text-xs font-semibold text-slate-600">性格プロファイル</div>
        <p className="text-sm text-slate-800">{profile.summary}</p>
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700">
            口調: {profile.toneGuide}
          </span>
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700">
            関係性: {profile.relationGuide}
          </span>
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700">
            返信フック: {profile.hook}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {profile.avoid.slice(0, 3).map((x) => (
            <span
              key={x}
              className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700"
            >
              注意: {x}
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-white/90 px-4 py-3 sm:px-6 sm:py-4 space-y-3">
        <div className="text-xs font-semibold text-sky-700">キャラ運用ガイド</div>
        <p className="text-sm text-slate-700">{postingGuide.summary}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 rounded-xl border bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-600">おすすめフォーマット</div>
            {postingGuide.recommendedFormats.map((f) => (
              <div key={f.key} className="rounded-lg border bg-white p-2">
                <div className="text-xs font-semibold text-slate-800">{f.label}</div>
                <div className="text-[11px] text-slate-600">{f.reason}</div>
              </div>
            ))}
          </div>
          <div className="space-y-2 rounded-xl border bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-600">おすすめ時間帯</div>
            {postingGuide.recommendedTimeBuckets.map((t) => (
              <div key={t.key} className="rounded-lg border bg-white p-2">
                <div className="text-xs font-semibold text-slate-800">{t.label}</div>
                <div className="text-[11px] text-slate-600">{t.reason}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {postingGuide.attachmentHints.slice(0, 3).map((hint) => (
            <span
              key={hint}
              className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] text-cyan-800"
            >
              添付ヒント: {hint}
            </span>
          ))}
          <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-800">
            相性の使い方: {postingGuide.buddyStrategy}
          </span>
        </div>
        <div className="space-y-1">
          <div className="text-xs font-semibold text-slate-600">書き出し例</div>
          {postingGuide.hookExamples.slice(0, 3).map((hook) => (
            <div key={hook} className="text-xs text-slate-700 rounded-lg border bg-slate-50 px-2 py-1">
              {hook}
            </div>
          ))}
        </div>
      </section>

      {/* 話し方のクセ */}
      {persona?.talk_style && (
        <section className="rounded-2xl border bg-slate-50 px-4 py-3 sm:px-6 sm:py-4">
          <div className="mb-1 text-xs font-semibold text-slate-600">
            話し方のクセ
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
            {persona.talk_style}
          </p>
        </section>
      )}

      {/* ソウルメイト候補 */}
      <section className="space-y-4 rounded-2xl border bg-white/80 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <div className="text-xs font-semibold tracking-wide text-sky-600">
              ソウルメイト候補
            </div>
            <p className="mt-1 text-xs text-slate-500">
              あなたのキャラと特に相性が良い{" "}
              <span className="font-semibold">友情モード / 恋愛モード</span>
              の相手キャラをスコア付きで表示します。
            </p>
          </div>
          <div className="inline-flex rounded-full bg-slate-100 p-1 text-xs">
            <button
              type="button"
              onClick={() => setMode("friendship")}
              className={`rounded-full px-3 py-1 ${
                mode === "friendship"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              友情モード
            </button>
            <button
              type="button"
              onClick={() => setMode("romance")}
              className={`rounded-full px-3 py-1 ${
                mode === "romance"
                  ? "bg-white text-rose-700 shadow-sm"
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
          <div className="py-6 text-center text-xs text-slate-500">
            相性データを読み込み中…
          </div>
        ) : !currentCompat.length ? (
          <div className="rounded-xl border bg-slate-50 py-6 text-center text-xs text-slate-500">
            まだこのキャラの相性データがありません。
          </div>
        ) : (
          <>
            {/* No.1 ソウルメイト候補 */}
            {topCompat && (() => {
              const tp = topCompat;

              const displayTitle = personaDisplayName(tp.target_key);
              const displayVibes = tp.target_vibe_tags ?? [];
              const icon = resolveIcon(tp.target_icon ?? null, tp.target_key ?? "unknown", displayTitle);

              const relationLabel =
                tp.relation_label ?? autoRelationLabel(mode, tp.score);

              return (
                <div className="flex flex-col gap-3 rounded-2xl border bg-gradient-to-br from-rose-50 via-amber-50 to-sky-50 px-4 py-4 sm:flex-row sm:gap-4 sm:px-6 sm:py-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-rose-100 bg-white/80">
                    {icon.isImage ? (
                      <PersonaIconImage
                        src={icon.value}
                        alt={`${displayTitle} のアイコン`}
                        width={48}
                        height={48}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xl">{icon.value}</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-rose-500">
                      ソウルメイト候補 No.1
                    </div>
                    <div className="text-base font-semibold sm:text-lg">
                      {displayTitle}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center rounded-full border border-rose-100 bg-white/70 px-2 py-0.5 text-[11px] text-rose-700">
                        {MODE_LABEL[mode]} {percent(tp.score)}%{" "}
                        {mode === "romance" ? "💘" : "🤝"}
                      </span>
                      {relationLabel && (
                        <span className="inline-flex items-center rounded-full border border-slate-100 bg-white/80 px-2 py-0.5 text-[11px] text-slate-700">
                          {relationLabel}
                        </span>
                      )}

                      {displayVibes.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center rounded-full border border-slate-100 bg-white/60 px-2 py-0.5 text-[11px] text-slate-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end sm:items-start">
                    <div className="space-y-1 text-right">
                      <div className="text-xs text-slate-500">
                        {MODE_LABEL[mode]}
                      </div>
                      <div className="text-3xl font-semibold">
                        {percent(tp.score)}
                        <span className="ml-1 text-base">%</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* その他候補 */}
            {restCompat.length > 0 && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {restCompat.map((row) => {
                  const displayTitle = personaDisplayName(row.target_key);
                  const displayVibes = row.target_vibe_tags ?? [];
                  const icon = resolveIcon(
                    row.target_icon ?? null,
                    row.target_key ?? "unknown",
                    displayTitle
                  );
                  const relationLabel =
                    row.relation_label ?? autoRelationLabel(mode, row.score);

                  return (
                    <div
                      key={`${row.target_key}-${mode}`}
                      className="flex flex-col gap-2 rounded-xl border bg-white/80 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-start gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                            {icon.isImage ? (
                              <PersonaIconImage
                                src={icon.value}
                                alt={`${displayTitle} のアイコン`}
                                width={32}
                                height={32}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="text-lg">{icon.value}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">
                              {displayTitle}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] text-slate-500">
                            {MODE_LABEL[mode]}
                          </div>
                          <div className="text-xl font-semibold">
                            {percent(row.score)}
                            <span className="ml-1 text-xs">%</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {relationLabel && (
                          <span className="inline-flex items-center rounded-full border border-slate-100 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700">
                            {relationLabel}
                          </span>
                        )}

                        {displayVibes.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center rounded-full border border-slate-100 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700"
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
