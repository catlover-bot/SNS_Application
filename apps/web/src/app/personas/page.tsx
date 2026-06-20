// apps/web/src/app/personas/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { defaultPersonaArchetypes } from "@/lib/personaCatalog";
import { isSupabaseConfigured } from "@/lib/supabase/config";
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
  let items: Item[] = [];
  let hasError = false;

  if (isSupabaseConfigured()) {
    try {
      const supa = await supabaseServer();
      const { data, error } = await supa
        .from("persona_archetype_defs")
        .select("key,title,blurb,image_url,theme,category")
        .order("category", { ascending: true })
        .order("title", { ascending: true });

      items = (data?.length ? data : defaultPersonaArchetypes()) as Item[];
      hasError = Boolean(error);
    } catch {
      hasError = true;
      items = defaultPersonaArchetypes();
    }
  } else {
    items = defaultPersonaArchetypes();
  }

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
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Persona Catalog
          </div>
          <h1 className="mt-1 text-2xl font-bold">キャラ図鑑</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            投稿から見えてくるキャラの一覧です。自分の投稿がどのタイプに近いか、相性の良い相手は誰かを探せます。
          </p>
        </div>
        {hasError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            キャラ一覧を読み込めませんでした。時間をおいて再度お試しください。
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
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
          <div className="font-semibold text-slate-900">キャラ図鑑は準備中です</div>
          <p className="mt-1">
            データ接続後は、投稿から見えたキャラや相性の良いタイプをここで探せます。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/compose" className="rounded-full bg-blue-600 px-4 py-2 text-white">
              投稿する
            </Link>
            <Link href="/persona-lab" className="rounded-full border border-slate-200 bg-white px-4 py-2">
              相性ラボへ
            </Link>
          </div>
        </div>
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
                    const src = `/api/personas/image/${encodeURIComponent(r.key)}?title=${encodeURIComponent(
                      r.title
                    )}`;
                    return (
                      <Link
                        key={r.key}
                        href={`/personas/${encodeURIComponent(r.key)}`}
                        className="group block overflow-hidden rounded-lg border bg-white transition hover:shadow-md"
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
