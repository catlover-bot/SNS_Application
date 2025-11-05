// apps/web/src/app/personas/page.tsx
export const revalidate = 3600;

import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";

type Item = {
  key: string;
  title: string;
  blurb: string | null;
  image_url?: string | null;
  theme?: string | null;
};

async function fetchCatalog(): Promise<Item[]> {
  // Server Component では相対URL不可。ヘッダから絶対URLを作る
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (!host) throw new Error("failed to detect host");

  const origin = `${proto}://${host}`;
  const res = await fetch(`${origin}/api/personas`, {
    next: { revalidate: 3600, tags: ["personas"] },
  });
  if (!res.ok) throw new Error("failed to load personas");
  return res.json();
}

const imgSrcFor = (key: string) => `/persona-images/${encodeURIComponent(key)}.png`;

export default function PersonasCatalogPage() {
  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">キャラ図鑑</h1>
      <Suspense fallback={<div>読み込み中…</div>}>
        <CatalogContent />
      </Suspense>
    </div>
  );
}

async function CatalogContent() {
  const items = await fetchCatalog();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {items.map((r) => (
        <Link
          key={r.key}
          href={`/personas/${encodeURIComponent(r.key)}`}
          className="group block rounded-2xl border bg-white overflow-hidden hover:shadow-md transition"
        >
          {/* 画像は /public/persona-images/<key>.png を参照 */}
          <div className="w-full aspect-square flex items-center justify-center bg-white">
            <img
              src={imgSrcFor(r.key)}
              alt={r.title}
              className="w-full h-full object-cover"
              loading="lazy"
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
  );
}
