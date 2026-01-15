// apps/web/src/components/PersonaCompatTabs.tsx
"use client";

import { useEffect, useState } from "react";

type Mode = "general" | "friendship" | "romance";

type CompatItem = {
  targetKey: string;
  kind: string;
  score: number;
  relationLabel: string | null;
  title: string;
  icon: string | null;
  theme: string | null;
  relationStyle: string | null;
};

type Props = {
  sourceKey: string;
  initialMode?: Mode;
  limit?: number;
};

export function PersonaCompatTabs({
  sourceKey,
  initialMode = "general",
  limit = 12,
}: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [items, setItems] = useState<CompatItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          source: sourceKey,
          mode,
          limit: String(limit),
        });
        const res = await fetch(`/api/personas/compat?${params.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setItems(data.items ?? []);
        }
      } catch (e: any) {
        if (!cancelled) {
          console.error(e);
          setError(e.message ?? "エラーが発生しました");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [sourceKey, mode, limit]);

  const modeLabel = (m: Mode) => {
    switch (m) {
      case "general":
        return "総合";
      case "friendship":
        return "友情";
      case "romance":
        return "恋愛";
    }
  };

  return (
    <div className="mt-6">
      <div className="flex gap-2 border-b border-neutral-800 pb-1 text-sm">
        {(["general", "friendship", "romance"] as Mode[]).map((m) => {
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1 transition ${
                active
                  ? "bg-pink-600 text-white"
                  : "bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
              }`}
            >
              {modeLabel(m)}
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="py-4 text-sm text-neutral-400">読み込み中…</div>
      )}
      {error && (
        <div className="py-4 text-sm text-red-400">
          相性情報の取得に失敗しました: {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="py-4 text-sm text-neutral-400">
          このモードの相性データはまだありません。
        </div>
      )}

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <div
            key={`${mode}-${sourceKey}-${item.targetKey}-${item.kind}`}
            className="flex items-start gap-3 rounded-xl border border-neutral-800 bg-neutral-950/60 p-3"
          >
            {/* アイコン部：とりあえず頭文字の丸アイコン */}
            <div className="mt-1 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-neutral-800 text-lg font-semibold">
              {item.title.slice(0, 1)}
            </div>

            <div className="flex-1 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-neutral-50">
                    {item.title}
                  </div>
                  <div className="text-xs text-neutral-400">
                    {item.relationStyle ?? item.kind}
                  </div>
                </div>
                <div className="text-right text-xs text-neutral-400">
                  <div className="font-mono">
                    {Math.round(item.score * 10) / 10}
                  </div>
                  <div className="text-[10px] text-neutral-500">compat</div>
                </div>
              </div>

              {item.relationLabel && (
                <div className="mt-1 text-xs text-neutral-200">
                  {item.relationLabel}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
