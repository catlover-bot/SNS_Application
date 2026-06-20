// apps/web/src/app/trending/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import PostCard from "@/components/PostCard";

type TrendingResult = {
  items: any[];
  usedPersonas: string[];
  hasError: boolean;
};

async function fetchTrending(): Promise<TrendingResult> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/trending?limit=30`, {
      cache: "no-store",
    });
    if (!res.ok) return { items: [], usedPersonas: [], hasError: true };

    const json = await res.json().catch(() => null);
    return {
      items: Array.isArray(json?.items)
        ? json.items.filter(
            (item: unknown) =>
              Boolean(item) && typeof item === "object" && Boolean(String((item as any).id ?? "").trim())
          )
        : [],
      usedPersonas: Array.isArray(json?.used_personas)
        ? json.used_personas.map((value: unknown) => String(value ?? "").trim()).filter(Boolean)
        : [],
      hasError: false,
    };
  } catch {
    return { items: [], usedPersonas: [], hasError: true };
  }
}

export default async function TrendingPage() {
  const { items, usedPersonas, hasError } = await fetchTrending();

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <header className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold">トレンド</h1>
            <p className="mt-2 text-sm text-slate-600">
              いま反応が集まっている投稿を、キャラ傾向も少し加味して眺められます。
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
            {usedPersonas.length > 0 ? (
              <span className="text-xs px-2 py-1 rounded-full border bg-amber-50">
                あなた向け（{usedPersonas.join(", ")}）
              </span>
            ) : (
              <span className="text-xs px-2 py-1 rounded-full border bg-gray-50">
                全体人気順
              </span>
            )}
            <Link href="/personas" className="underline">キャラ図鑑</Link>
          </div>
        </div>
      </header>

      {hasError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          トレンドを読み込めませんでした。時間をおいて再度お試しください。
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
          まだおすすめが見つかりませんでした。投稿や反応が増えるとここに表示されます。
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((p: any) => (
            <div key={p.id} className="relative">
              {/* PostCard は既存のまま利用 */}
              <PostCard p={p} />
              {/* 右上にランキング情報（軽く） */}
              {("score" in p || "matched_persona" in p) && (
                <div className="absolute top-2 right-2 text-xs text-gray-500 bg-white/80 px-2 py-1 rounded border">
                  {p.matched_persona ? `相性 ${p.matched_persona}` : "全体"}
                  {typeof p.score === "number" ? ` · 注目度 ${Math.round(Math.max(0, Math.min(1, p.score)) * 100)}%` : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
