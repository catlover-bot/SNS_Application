export const revalidate = 3600;

import Link from "next/link";

type Item = {
  key: string;
  title: string;
  blurb: string | null;
  image_url?: string | null;
  theme?: string | null;
};

async function fetchCatalog(): Promise<Item[]> {
  const res = await fetch(`/api/personas`, {
    next: { revalidate: 3600, tags: ["personas"] },
  });
  if (!res.ok) {
    // 失敗内容をコンソールに出す（開発中だけ）
    const body = await res.text().catch(() => "");
    console.warn("[/personas] fetch failed", res.status, body);
    throw new Error("failed to load personas");
  }
  return res.json();
}

export default function PersonasCatalogPage() {
  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">キャラ図鑑</h1>
      <CatalogContent />
    </div>
  );
}

async function CatalogContent() {
  const items = await fetchCatalog();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {items.map((r) => {
        const primary = r.image_url || `/persona-images/${r.key}.png`;
        const fallback = `/persona-images/${r.key}.png`;
        const placeholder = `/persona-images/_placeholder.png`; // ② で作る

        return (
          <Link
            key={r.key}
            href={`/personas/${encodeURIComponent(r.key)}`}
            className="group block rounded-2xl border bg-white overflow-hidden hover:shadow-md transition"
          >
            {/* 画像枠：常に正方形で崩れない */}
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
                  // 1回目の失敗 → /persona-images/${key}.png にフォールバック
                  if (img.src.endsWith(primary) && primary !== fallback) {
                    img.src = fallback;
                  } else {
                    // 2回目も失敗 → プレースホルダーへ
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
              <p className="text-sm opacity-80 mt-1 line-clamp-3">
                {r.blurb ?? ""}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
