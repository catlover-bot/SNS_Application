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
};

const imgSrcFor = (key: string) => `/persona-images/${encodeURIComponent(key)}.png`;

async function fetchCatalogDirect(): Promise<Item[]> {
  const supa = await supabaseServer();
  const { data, error } = await supa
    .from("persona_archetype_defs")
    .select("key,title,blurb,image_url,theme")
    .order("title", { ascending: true });

  if (error) {
    console.error("[personas/page] fetchCatalogDirect error:", error);
    throw new Error(`failed to load personas: ${error.message}`);
  }
  return (data ?? []) as Item[];
}

export default async function PersonasCatalogPage() {
  const items = await fetchCatalogDirect();

  if (!items.length) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">キャラ図鑑</h1>
        <div className="opacity-70 text-sm">登録済みのキャラが見つかりませんでした。</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">キャラ図鑑</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((r) => (
          <Link
            key={r.key}
            href={`/personas/${encodeURIComponent(r.key)}`}
            className="group block rounded-2xl border bg-white overflow-hidden hover:shadow-md transition"
          >
            <div className="w-full aspect-square flex items-center justify-center bg-white">
              <img
                src={imgSrcFor(r.key)}
                alt={r.title}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = "/persona-images/_missing.png";
                }}
              />
            </div>

            <div className="p-4">
              <div className="text-base font-semibold group-hover:underline">{r.title}</div>
              <div className="text-xs opacity-60">@{r.key}</div>
              <p className="text-sm opacity-80 mt-1 line-clamp-3">{r.blurb ?? ""}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
