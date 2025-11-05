// apps/web/src/app/personas/page.tsx
export const revalidate = 3600;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

type Item = {
  key: string;
  title: string;
  blurb: string | null;
  image_url?: string | null;
  theme?: string | null;
};

const imgSrcFor = (key: string) => `/persona-images/${encodeURIComponent(key)}.png`;

export default async function PersonasCatalogPage() {
  const supa = await supabaseServer();
  const { data, error } = await supa
    .from("persona_archetype_defs")
    .select("key,title,blurb,image_url,theme")
    .order("title", { ascending: true });

  if (error) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">キャラ図鑑</h1>
        <div className="rounded border bg-red-50 text-red-700 p-4 text-sm">
          キャラ一覧の取得に失敗しました: {error.message}
        </div>
      </div>
    );
  }

  const items: Item[] = data ?? [];

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">キャラ図鑑</h1>

      {items.length === 0 ? (
        <div className="opacity-70 text-sm">登録済みのキャラが見つかりませんでした。</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((r) => {
            const primary = r.image_url || imgSrcFor(r.key);
            const fallback = imgSrcFor(r.key);
            const placeholder = "/persona-images/_placeholder.png";

            return (
              <Link
                key={r.key}
                href={`/personas/${encodeURIComponent(r.key)}`}
                className="group block rounded-2xl border bg-white overflow-hidden hover:shadow-md transition"
              >
                <div className="relative w-full aspect-square bg-white">
                  <img
                    src={primary}
                    alt={r.title}
                    loading="lazy"
                    decoding="async"
                    width={768}
                    height={768}
                    className="absolute inset-0 w-full h-full object-contain"
                    onError={(e) => {
                      const img = e.currentTarget as HTMLImageElement;
                      if (img.src.endsWith(primary) && primary !== fallback) {
                        img.src = fallback;
                      } else {
                        img.src = placeholder;
                      }
                    }}
                  />
                </div>

                <div className="p-4">
                  <div className="text-base font-semibold group-hover:underline">
                    {r.title}
                  </div>
                  <div className="text-xs opacity-60">@{r.key}</div>
                  <p className="text-sm opacity-80 mt-1 line-clamp-3">{r.blurb ?? ""}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
