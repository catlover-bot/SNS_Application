"use client";
import useSWRInfinite from "swr/infinite";

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function HomeFeed() {
  const getKey = (index: number, prev: any) => {
    if (prev && (!prev.items || prev.items.length === 0)) return null;
    const lastISO = prev?.items?.[prev.items.length - 1]?.created_at;
    const qs = new URLSearchParams({ limit: "20" });
    if (lastISO) qs.set("since", lastISO); // ・劃reated_at髯埼・・縺ｨ縺阪・縲恵efore縲阪・譁ｹ縺瑚・辟ｶ縲Ｇeed蛛ｴ繧呈・鬆・↓縺吶ｋ縺ｪ繧峨％縺薙・隱ｿ謨ｴ縲・
    return `/api/feed?${qs.toString()}`;
  };

  const { data, size, setSize, isLoading } = useSWRInfinite(getKey, fetcher);
  const items = (data ?? []).flatMap((d: any) => d.items ?? []);

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-3">
      {items.map((p: any) => (
        <article key={p.id} className="rounded-xl border p-3 bg-white">
          <div className="text-xs opacity-60">{new Date(p.created_at).toLocaleString()}</div>
          <p className="whitespace-pre-wrap">{p.text}</p>

          {/* 莉｣陦ｨ繧ｭ繝｣繝ｩ繝舌ャ繧ｸ・医≠繧後・・・*/}
          {p.arche_key && (
            <a
              href={`/personas/${encodeURIComponent(p.arche_key)}`}
              className="inline-flex items-center gap-1 text-xs mt-2 px-2 py-0.5 rounded-full border bg-gray-50 hover:bg-gray-100"
              title={`@${p.arche_key}`}
            >
              <span>莉｣陦ｨ繧ｭ繝｣繝ｩ</span>
              <span className="opacity-70">@{p.arche_key}</span>
            </a>
          )}
        </article>
      ))}

      <div className="py-4 flex justify-center">
        <button
          onClick={() => setSize(size + 1)}
          className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-50"
          disabled={isLoading || (data && data[data.length - 1]?.items?.length === 0)}
        >
          {isLoading ? "隱ｭ縺ｿ霎ｼ縺ｿ荳ｭ窶ｦ" : "繧ゅ▲縺ｨ隕九ｋ"}
        </button>
      </div>
    </div>
  );
}
