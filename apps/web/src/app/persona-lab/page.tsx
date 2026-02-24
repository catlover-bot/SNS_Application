"use client";

import { useEffect, useMemo, useState } from "react";

type PersonaItem = {
  key: string;
  title: string;
  blurb?: string | null;
  theme?: string | null;
};

type Mode = "friendship" | "romance";

type CompatItem = {
  targetKey: string;
  kind: string;
  score: number;
  relationLabel: string | null;
  title: string;
  icon: string | null;
  theme: string | null;
  relationStyle: string | null;
  vibeTags?: string[] | null;
  insights?: {
    chemistryType: string;
    overallScore: number;
    dimensions: Array<{
      key: string;
      label: string;
      score: number;
      note: string;
    }>;
    strengths: string[];
    risks: string[];
    prompts: string[];
  } | null;
};

type DialogueMeta = {
  sourceKey: string;
  targetKey: string;
  mode: Mode;
  relationLabel: string | null;
  score: number | null;
};

type DialogueResponse = {
  drafts: string[];
  strategy: string;
  tips?: string[];
  meta?: DialogueMeta;
};

type PersonaImageCoverageItem = {
  key: string;
  title: string;
  has_static_image: boolean;
  static_image: string | null;
  api_image: string;
};

type PersonaImageCoverageResponse = {
  ok: boolean;
  total: number;
  static_count: number;
  fallback_count: number;
  coverage_pct: number;
  items: PersonaImageCoverageItem[];
};

function clampPct(v: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  if (n <= 1) return Math.max(0, Math.min(100, Math.round(n * 100)));
  return Math.max(0, Math.min(100, Math.round(n)));
}

function chemistryLabel(mode: Mode, percent: number) {
  if (mode === "romance") {
    if (percent >= 90) return "運命級";
    if (percent >= 75) return "かなり相性◎";
    if (percent >= 60) return "安定して良い";
    if (percent >= 40) return "工夫次第";
    return "刺激強め";
  }
  if (percent >= 90) return "最強コンビ";
  if (percent >= 75) return "超相性◎";
  if (percent >= 60) return "良いチーム";
  if (percent >= 40) return "クセあり相棒";
  return "挑戦的コンビ";
}

function starterLines(source: string, target: string, mode: Mode, relation?: string | null) {
  const base = relation?.trim() || chemistryLabel(mode, 65);
  if (mode === "romance") {
    return [
      `${source}「最近、${target}と話すと落ち着くんだよね」`,
      `${target}「それ、私も同じこと思ってた」`,
      `テーマ: ${base} を活かすなら、共通の趣味を1つ深掘りする`,
    ];
  }
  return [
    `${source}「${target}、この案件一緒にやる？」`,
    `${target}「いいね、役割分担を先に決めよう」`,
    `テーマ: ${base} を活かすなら、最初にゴール定義を合わせる`,
  ];
}

export default function PersonaLabPage() {
  const [personas, setPersonas] = useState<PersonaItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [sourceKey, setSourceKey] = useState("");
  const [mode, setMode] = useState<Mode>("friendship");

  const [compatItems, setCompatItems] = useState<CompatItem[]>([]);
  const [compatLoading, setCompatLoading] = useState(false);
  const [compatError, setCompatError] = useState<string | null>(null);
  const [targetKey, setTargetKey] = useState("");

  const [dialogueContext, setDialogueContext] = useState("");
  const [dialogueReplyToText, setDialogueReplyToText] = useState("");
  const [dialogueLoading, setDialogueLoading] = useState(false);
  const [dialogueError, setDialogueError] = useState<string | null>(null);
  const [dialogueStrategy, setDialogueStrategy] = useState("");
  const [dialogueTips, setDialogueTips] = useState<string[]>([]);
  const [dialogueDrafts, setDialogueDrafts] = useState<string[]>([]);
  const [dialogueMeta, setDialogueMeta] = useState<DialogueMeta | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<PersonaImageCoverageResponse | null>(null);

  useEffect(() => {
    let stop = false;
    (async () => {
      setListLoading(true);
      setListError(null);
      try {
        const res = await fetch("/api/personas", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error ?? "キャラ一覧の取得に失敗しました");
        const rows = (Array.isArray(json) ? json : []) as PersonaItem[];
        if (stop) return;
        setPersonas(rows);
        if (rows.length > 0) setSourceKey(rows[0].key);
      } catch (e: any) {
        if (!stop) setListError(e?.message ?? "キャラ一覧の取得に失敗しました");
      } finally {
        if (!stop) setListLoading(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, []);

  async function loadImageCoverage() {
    setCoverageLoading(true);
    setCoverageError(null);
    try {
      const res = await fetch("/api/personas/image-coverage", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as PersonaImageCoverageResponse | null;
      if (!res.ok || !json?.ok) {
        throw new Error((json as any)?.error ?? "画像カバレッジの取得に失敗しました");
      }
      setCoverage(json);
    } catch (e: any) {
      setCoverageError(e?.message ?? "画像カバレッジの取得に失敗しました");
      setCoverage(null);
    } finally {
      setCoverageLoading(false);
    }
  }

  useEffect(() => {
    void loadImageCoverage();
  }, []);

  useEffect(() => {
    if (!sourceKey) return;
    let stop = false;
    (async () => {
      setCompatLoading(true);
      setCompatError(null);
      try {
        const params = new URLSearchParams({
          key: sourceKey,
          mode,
          limit: "24",
        });
        const res = await fetch(`/api/personas/compat?${params.toString()}`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error ?? "相性データ取得に失敗しました");
        const rows = (json?.items ?? []) as CompatItem[];
        if (stop) return;
        setCompatItems(rows);
        if (rows.length > 0) {
          setTargetKey((prev) => {
            if (prev && rows.some((r) => r.targetKey === prev)) return prev;
            return rows[0].targetKey;
          });
        } else {
          setTargetKey("");
        }
      } catch (e: any) {
        if (!stop) {
          setCompatError(e?.message ?? "相性データ取得に失敗しました");
          setCompatItems([]);
          setTargetKey("");
        }
      } finally {
        if (!stop) setCompatLoading(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, [mode, sourceKey]);

  useEffect(() => {
    setDialogueError(null);
    setDialogueDrafts([]);
    setDialogueTips([]);
    setDialogueStrategy("");
    setDialogueMeta(null);
    setCopiedIndex(null);
  }, [mode, sourceKey, targetKey]);

  const sourcePersona = useMemo(
    () => personas.find((p) => p.key === sourceKey) ?? null,
    [personas, sourceKey]
  );
  const selectedCompat = useMemo(
    () => compatItems.find((x) => x.targetKey === targetKey) ?? null,
    [compatItems, targetKey]
  );
  const selectedPercent = clampPct(selectedCompat?.score ?? 0);
  const selectedLabel = selectedCompat?.relationLabel || chemistryLabel(mode, selectedPercent);
  const generatedLines = useMemo(
    () =>
      sourcePersona && selectedCompat
        ? starterLines(sourcePersona.title, selectedCompat.title, mode, selectedCompat.relationLabel)
        : [],
    [mode, selectedCompat, sourcePersona]
  );

  const quickContexts = useMemo(() => {
    if (!sourcePersona || !selectedCompat) return [];
    const pair = `${sourcePersona.title} × ${selectedCompat.title}`;
    return [
      `${pair}で朝の挨拶に返信する`,
      `${pair}で最近の失敗談に返す`,
      `${pair}で次の週末の予定を相談する`,
    ];
  }, [selectedCompat, sourcePersona]);

  async function copyDraft(text: string, idx: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(idx);
      window.setTimeout(() => setCopiedIndex(null), 1200);
    } catch {
      setDialogueError("コピーに失敗しました。");
    }
  }

  async function generateDialogue() {
    if (!sourceKey || !targetKey || dialogueLoading) return;
    setDialogueLoading(true);
    setDialogueError(null);
    setCopiedIndex(null);

    try {
      const res = await fetch("/api/personas/dialogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceKey,
          targetKey,
          mode,
          context: dialogueContext.trim(),
          replyToText: dialogueReplyToText.trim(),
        }),
      });
      const json = (await res.json().catch(() => null)) as DialogueResponse | null;
      if (!res.ok || !json) {
        throw new Error((json as any)?.error ?? "返信草案の生成に失敗しました");
      }
      setDialogueDrafts(
        (Array.isArray(json.drafts) ? json.drafts : [])
          .map((x) => String(x).trim())
          .filter(Boolean)
          .slice(0, 3)
      );
      setDialogueStrategy((json.strategy ?? "").trim());
      setDialogueTips(
        (Array.isArray(json.tips) ? json.tips : [])
          .map((x) => String(x).trim())
          .filter(Boolean)
          .slice(0, 4)
      );
      setDialogueMeta(json.meta ?? null);
    } catch (e: any) {
      setDialogueError(e?.message ?? "返信草案の生成に失敗しました");
      setDialogueDrafts([]);
      setDialogueTips([]);
      setDialogueMeta(null);
      setDialogueStrategy("");
    } finally {
      setDialogueLoading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">キャラ相性ラボ</h1>
        <p className="text-sm opacity-70">
          キャラの組み合わせを試し、相性の根拠と会話スターターをすぐ作れます。
        </p>
      </header>

      <section className="rounded-xl border bg-white p-4 space-y-4">
        <div className="grid md:grid-cols-3 gap-3">
          <label className="space-y-1">
            <div className="text-xs opacity-70">自分キャラ</div>
            <select
              className="w-full border rounded px-3 py-2 bg-white"
              value={sourceKey}
              onChange={(e) => setSourceKey(e.target.value)}
              disabled={listLoading || personas.length === 0}
            >
              {personas.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.title} (@{p.key})
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <div className="text-xs opacity-70">相性モード</div>
            <select
              className="w-full border rounded px-3 py-2 bg-white"
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
            >
              <option value="friendship">友情モード</option>
              <option value="romance">恋愛モード</option>
            </select>
          </label>

          <label className="space-y-1">
            <div className="text-xs opacity-70">相手キャラ</div>
            <select
              className="w-full border rounded px-3 py-2 bg-white"
              value={targetKey}
              onChange={(e) => setTargetKey(e.target.value)}
              disabled={compatLoading || compatItems.length === 0}
            >
              {compatItems.map((c) => (
                <option key={c.targetKey} value={c.targetKey}>
                  {c.title} (@{c.targetKey})
                </option>
              ))}
            </select>
          </label>
        </div>

        {listError && <div className="text-sm text-red-600">{listError}</div>}
        {compatError && <div className="text-sm text-red-600">{compatError}</div>}
      </section>

      {compatLoading ? (
        <section className="rounded-xl border bg-white p-6 text-sm opacity-70">相性を計算中…</section>
      ) : !selectedCompat ? (
        <section className="rounded-xl border bg-white p-6 text-sm opacity-70">
          相性データが見つかりません。
        </section>
      ) : (
        <section className="grid lg:grid-cols-2 gap-4">
          <article className="rounded-xl border bg-white p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs opacity-60">ケミストリー結果</div>
                <div className="text-lg font-semibold">{selectedLabel}</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold">{selectedPercent}%</div>
                <div className="text-xs opacity-60">compatibility</div>
              </div>
            </div>
            <div className="h-2 rounded bg-gray-100 overflow-hidden">
              <div
                className="h-full bg-blue-500"
                style={{ width: `${Math.max(3, selectedPercent)}%` }}
              />
            </div>
            <div className="text-sm opacity-80">
              {sourcePersona?.title ?? sourceKey} × {selectedCompat.title} の{" "}
              {mode === "romance" ? "恋愛" : "友情"} 相性
            </div>
            {selectedCompat.relationStyle && (
              <div className="text-sm">
                <span className="opacity-60 mr-1">相性スタイル:</span>
                {selectedCompat.relationStyle}
              </div>
            )}
            {selectedCompat.insights ? (
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="opacity-60 mr-1">ケミストリー型:</span>
                  {selectedCompat.insights.chemistryType} ({selectedCompat.insights.overallScore}%)
                </div>
                <div className="space-y-1">
                  {selectedCompat.insights.dimensions.map((d) => (
                    <div key={d.key}>
                      <div className="flex items-center justify-between text-xs">
                        <span>{d.label}</span>
                        <span>{d.score}%</span>
                      </div>
                      <div className="h-1.5 rounded bg-gray-100 overflow-hidden">
                        <div className="h-full bg-indigo-500" style={{ width: `${Math.max(4, d.score)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                {selectedCompat.insights.strengths.length > 0 ? (
                  <ul className="text-xs space-y-1">
                    {selectedCompat.insights.strengths.slice(0, 2).map((s) => (
                      <li key={s}>強み: {s}</li>
                    ))}
                  </ul>
                ) : null}
                {selectedCompat.insights.risks.length > 0 ? (
                  <ul className="text-xs space-y-1 text-amber-800">
                    {selectedCompat.insights.risks.slice(0, 2).map((r) => (
                      <li key={r}>注意: {r}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            {selectedCompat.vibeTags?.length ? (
              <div className="flex flex-wrap gap-2">
                {selectedCompat.vibeTags.slice(0, 6).map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 rounded-full border bg-gray-50"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </article>

          <article className="rounded-xl border bg-white p-4 space-y-3">
            <div className="text-xs opacity-60">会話スターター</div>
            <ul className="space-y-2">
              {generatedLines.map((line) => (
                <li key={line} className="text-sm p-2 rounded bg-gray-50 border">
                  {line}
                </li>
              ))}
            </ul>
            {generatedLines.length > 0 && (
              <a
                href={`/compose?seed=${encodeURIComponent(generatedLines.join("\n"))}`}
                className="inline-block text-sm underline"
              >
                このスターターで投稿を作る
              </a>
            )}
          </article>
        </section>
      )}

      <section className="rounded-xl border bg-white p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium">キャラ対話AI</div>
            <p className="text-xs opacity-70">
              相性ペア向けに、返信草案を3案まとめて生成します。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void generateDialogue()}
            disabled={!sourceKey || !targetKey || dialogueLoading}
            className="px-3 py-2 rounded border bg-white text-sm disabled:opacity-60"
          >
            {dialogueLoading ? "生成中…" : "返信草案を生成"}
          </button>
        </div>

        <textarea
          className="w-full border rounded-lg p-3 h-24"
          placeholder="会話の文脈（例: 初対面で軽く挨拶、仕事の相談、デートの誘い）"
          value={dialogueContext}
          onChange={(e) => setDialogueContext(e.target.value)}
        />
        <textarea
          className="w-full border rounded-lg p-3 h-20"
          placeholder="返信先投稿本文（任意）"
          value={dialogueReplyToText}
          onChange={(e) => setDialogueReplyToText(e.target.value)}
        />

        {quickContexts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {quickContexts.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setDialogueContext(c)}
                className="text-xs px-2 py-1 rounded-full border bg-gray-50"
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {dialogueError && <div className="text-sm text-red-600">{dialogueError}</div>}

        {dialogueDrafts.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {dialogueStrategy ? (
                <span className="px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200">
                  方針: {dialogueStrategy}
                </span>
              ) : null}
              {dialogueMeta?.relationLabel ? (
                <span className="px-2 py-0.5 rounded-full bg-pink-50 border border-pink-200">
                  相性: {dialogueMeta.relationLabel}
                </span>
              ) : null}
              {dialogueMeta?.score != null ? (
                <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200">
                  score {clampPct(dialogueMeta.score)}%
                </span>
              ) : null}
            </div>

            <div className="grid md:grid-cols-3 gap-3">
              {dialogueDrafts.map((line, idx) => (
                <article key={`${line}-${idx}`} className="rounded-lg border bg-gray-50 p-3 space-y-2">
                  <div className="text-xs opacity-60">Draft {idx + 1}</div>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">{line}</div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => void copyDraft(line, idx)}
                      className="px-2 py-1 rounded border bg-white"
                    >
                      {copiedIndex === idx ? "コピー済み" : "コピー"}
                    </button>
                    <a
                      className="px-2 py-1 rounded border bg-white"
                      href={`/compose?seed=${encodeURIComponent(line)}`}
                    >
                      投稿画面へ
                    </a>
                  </div>
                </article>
              ))}
            </div>

            {dialogueTips.length > 0 && (
              <div className="rounded border bg-white p-3">
                <div className="text-xs opacity-60 mb-1">運用ヒント</div>
                <ul className="text-sm space-y-1">
                  {dialogueTips.map((tip) => (
                    <li key={tip}>• {tip}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-4">
        <div className="text-sm font-medium mb-2">上位マッチ一覧</div>
        {compatItems.length === 0 ? (
          <div className="text-sm opacity-60">データなし</div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {compatItems.slice(0, 12).map((item) => {
              const pct = clampPct(item.score);
              const active = item.targetKey === targetKey;
              return (
                <button
                  key={item.targetKey}
                  type="button"
                  onClick={() => setTargetKey(item.targetKey)}
                  className={`text-left rounded-lg border p-3 ${
                    active ? "border-blue-500 bg-blue-50" : "bg-white"
                  }`}
                >
                  <div className="font-medium text-sm">{item.title}</div>
                  <div className="text-xs opacity-60">@{item.targetKey}</div>
                  <div className="mt-2 text-xs">相性 {pct}%</div>
                  {item.insights?.chemistryType ? (
                    <div className="text-xs opacity-70 mt-1">{item.insights.chemistryType}</div>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">キャラ画像カバレッジ</div>
            <div className="text-xs opacity-70">静的画像の不足は自動生成フォールバックで補完されます。</div>
          </div>
          <button
            type="button"
            onClick={() => void loadImageCoverage()}
            disabled={coverageLoading}
            className="px-3 py-1.5 rounded border bg-white text-sm disabled:opacity-60"
          >
            {coverageLoading ? "更新中…" : "更新"}
          </button>
        </div>

        {coverageError ? <div className="text-sm text-red-600">{coverageError}</div> : null}
        {!coverage ? (
          <div className="text-sm opacity-70">読み込み中…</div>
        ) : (
          <>
            <div className="grid md:grid-cols-4 gap-2">
              <div className="rounded border bg-gray-50 p-2 text-sm">
                総キャラ: <span className="font-semibold">{coverage.total}</span>
              </div>
              <div className="rounded border bg-gray-50 p-2 text-sm">
                静的画像: <span className="font-semibold">{coverage.static_count}</span>
              </div>
              <div className="rounded border bg-gray-50 p-2 text-sm">
                フォールバック: <span className="font-semibold">{coverage.fallback_count}</span>
              </div>
              <div className="rounded border bg-gray-50 p-2 text-sm">
                静的率: <span className="font-semibold">{coverage.coverage_pct}%</span>
              </div>
            </div>

            {coverage.fallback_count > 0 ? (
              <div className="space-y-2">
                <div className="text-xs opacity-70">静的画像が未配置のキャラ（先頭20件）</div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {coverage.items
                    .filter((x) => !x.has_static_image)
                    .slice(0, 20)
                    .map((x) => (
                      <div key={x.key} className="rounded border bg-gray-50 p-2 text-sm space-y-1">
                        <div className="font-medium">{x.title}</div>
                        <div className="text-xs opacity-70">@{x.key}</div>
                        <a className="text-xs underline" href={x.api_image} target="_blank" rel="noreferrer">
                          自動生成画像を確認
                        </a>
                      </div>
                    ))}
                </div>
              </div>
            ) : (
              <div className="text-sm text-emerald-700">全キャラに静的画像が割り当て済みです。</div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
