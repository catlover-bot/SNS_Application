// apps/web/src/app/personas/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

type Item = {
  key: string;
  title: string;
  blurb: string | null;
  // image_url は使わない
  // image_url?: string | null;
  theme?: string | null;
};

async function getCatalog(): Promise<Item[]> {
  const supa = await supabaseServer();
  const { data, error } = await supa
    .from("persona_archetype_defs")
    .select("key,title,blurb,theme")
    .order("title", { ascending: true });

  if (error) {
    console.error("[/personas] supabase error:", error.message);
    return [];
  }
  return data ?? [];
}

export default async function PersonasCatalogPage() {
  const items = await getCatalog();

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">キャラ図鑑</h1>

      {items.length === 0 ? (
        <div className="text-sm opacity-70">
          キャラ一覧の取得に失敗したか、データがありません。
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((r) => {
            // 常にローカルPNGを参照
            const src = `/persona-images/${encodeURIComponent(r.key)}.png`;
            const placeholder = "/persona-images/_placeholder.png";

            return (
              <Link
                key={r.key}
                href={`/personas/${encodeURIComponent(r.key)}`}
                className="group block rounded-2xl border bg-white overflow-hidden hover:shadow-md transition"
              >
                {/* Server Component なのでイベントハンドラは付けない */}
                <div className="w-full aspect-square flex items-center justify-center bg-white">
                  <img
                    src={src}
                    alt={r.title}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-contain"
                    // フォールバックは nginx/edge が 404 を返した場合の
                    // ブラウザ再要求に任せるのが基本だが、ここでは
                    // 画像欠落時の視覚崩れを防ぐため 404 を placeholder に置き換えるため、
                    // `onError` を使いたくなる。ただし Server Component では不可。
                    // → 代替として public 側で 404 を _placeholder.png に張り替える案もあるが、
                    //   まずはファイルを用意しておけば OK（ローカルPNG揃ってるなら出ます）
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
      )}
    </div>
  );
}
