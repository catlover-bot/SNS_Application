// apps/web/src/app/personas/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

type Item = {
  key: string;
  title: string;
  blurb: string | null;
  image_url?: string | null;
  theme?: string | null;
  category?: string | null;
};

function anchorId(label: string) {
  return (label || "General").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default async function PersonasCatalogPage() {
  const supa = await supabaseServer();
  const { data, error } = await supa
    .from("persona_archetype_defs")
    .select("key,title,blurb,image_url,theme,category")
    .order("category", { ascending: true })
    .order("title", { ascending: true });

  const items: Item[] = data ?? [];
  const errMsg = error?.message;

  // カテゴリごとにグルーピング（空は "General" 扱いに）
  const groups = new Map<string, Item[]>();
  for (const r of items) {
    const cat = (r.category ?? "General").trim() || "General";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(r);
  }

  const categories = Array.from(groups.keys());

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold">キャラ図鑑</h1>
        {errMsg && (
          <div className="rounded border bg-red-50 text-red-700 p-3 text-sm">
            キャラ一覧の取得に失敗しました：{errMsg}
          </div>
        )}
        {items.length > 0 && (
          <nav className="flex flex-wrap gap-2 text-sm">
            {categories.map((c) => (
              <a
                key={c}
                href={`#${anchorId(c)}`}
                className="px-3 py-1 rounded-full border bg-white hover:bg-gray-50"
              >
                {c}
              </a>
            ))}
          </nav>
        )}
      </header>

      {items.length === 0 ? (
        <div className="opacity-70 text-sm">登録済みのキャラが見つかりませんでした。</div>
      ) : (
        <div className="space-y-10">
          {categories.map((cat) => {
            const list = groups.get(cat)!;
            return (
              <section key={cat} id={anchorId(cat)} className="scroll-mt-20">
                <h2 className="text-lg font-semibold mb-3 sticky top-14 bg-white/80 backdrop-blur py-2">
                  {cat}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {list.map((r) => {
                    const src = `/persona-images/${encodeURIComponent(r.key)}.png`;
                    const fallback = `/persona-images/${encodeURIComponent(r.key)}_legend.png`;
                    const fallback2 = `/persona-images/${encodeURIComponent(r.key)}_lite.png`;
                    const missing = "/persona-images/_missing.png";
                    // Server Component では onError を使えないため、外部URLは使わずローカル優先
                    // 画像の欠落は _missing.png に集約
                    return (
                      <Link
                        key={r.key}
                        href={`/personas/${encodeURIComponent(r.key)}`}
                        className="group block rounded-2xl border bg-white overflow-hidden hover:shadow-md transition"
                      >
                        <div className="w-full aspect-square flex items-center justify-center bg-white">
                          {/* 最も一般的なファイル名を優先。派生(_legend/_lite)は詳細ページ側のマルチフォールバックで吸収 */}
                          <img
                            src={src}
                            alt={r.title}
                            loading="lazy"
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="p-4">
                          <div className="text-base font-semibold group-hover:underline">
                            {r.title}
                          </div>
                          <div className="text-xs opacity-60">@{r.key}</div>
                          <p className="text-sm opacity-80 mt-1 line-clamp-3">
                            {r.blurb ?? ""}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
