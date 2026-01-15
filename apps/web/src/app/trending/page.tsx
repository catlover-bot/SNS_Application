// apps/web/src/app/trending/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import PostCard from "@/components/PostCard";

async function fetchTrending(): Promise<{items:any[]; used_personas:string[]}> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/trending?limit=30`, {
    // SSR で毎回取りたい（デモなら no-store でもOK）
    cache: "no-store",
  });
  if (!res.ok) {
    // 失敗しても空配列返す
    return { items: [], used_personas: [] };
  }
  return res.json();
}

export default async function TrendingPage() {
  const { items, used_personas } = await fetchTrending();

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <header className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">トレンド</h1>
        {used_personas.length > 0 ? (
          <span className="text-xs px-2 py-1 rounded-full border bg-amber-50">
            あなた向け（{used_personas.join(", ")}）
          </span>
        ) : (
          <span className="text-xs px-2 py-1 rounded-full border bg-gray-50">
            全体人気順
          </span>
        )}
        <div className="ml-auto text-sm">
          <Link href="/personas" className="underline">キャラ図鑑</Link>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="opacity-70 text-sm">おすすめが見つかりませんでした。</div>
      ) : (
        <div className="space-y-3">
          {items.map((p: any) => (
            <div key={p.id} className="relative">
              {/* PostCard は既存のまま利用 */}
              <PostCard p={p} />
              {/* 右上にスコア/マッチ情報（軽く） */}
              {("score" in p || "matched_persona" in p) && (
                <div className="absolute top-2 right-2 text-xs text-gray-500 bg-white/80 px-2 py-1 rounded border">
                  {p.matched_persona ? `match: ${p.matched_persona}` : "global"}
                  {typeof p.score === "number" ? ` · ${p.score.toFixed(5)}` : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
