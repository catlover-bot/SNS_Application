// apps/web/src/app/personas/[key]/page.tsx
export const revalidate = 3600;

import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

type Persona = {
  key: string;
  title: string;
  blurb: string | null;
  long_desc?: string | null;
  image_url?: string | null;
  theme?: string | null;
  strengths?: string[] | null;
  pitfalls?: string[] | null;
  ideal_roles?: string[] | null;
  growth_tips?: string[] | null;
  sample_bio?: string | null;
  w?: number[] | null;
};

export default async function PersonaDetailPage({ params }: { params: { key: string } }) {
  const { key } = params;

  const supa = await supabaseServer();

  const { data: persona, error } = await supa
    .from("persona_archetype_defs")
    .select(
      "key,title,blurb,long_desc,image_url,theme,strengths,pitfalls,ideal_roles,growth_tips,sample_bio,w"
    )
    .eq("key", key)
    .maybeSingle();

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-3">
        <Link href="/personas" className="text-sm underline">
          ← キャラ図鑑に戻る
        </Link>
        <div className="rounded border bg-red-50 text-red-700 p-4 text-sm">
          取得に失敗しました: {error.message}
        </div>
      </div>
    );
  }

  if (!persona) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-3">
        <Link href="/personas" className="text-sm underline">
          ← キャラ図鑑に戻る
        </Link>
        <div className="opacity-70">指定のキャラ @{key} は見つかりませんでした。</div>
      </div>
    );
  }

  const primary = persona.image_url || `/persona-images/${persona.key}.png`;

  // 関連投稿（失敗しても続行）
  let hot: any[] = [];
  try {
    const { data: hotData } = await supa.rpc("top_persona_posts", {
      arche_key: key,
      limit_count: 10,
      offset_count: 0,
    });
    hot = hotData ?? [];
  } catch {
    hot = [];
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Link href="/personas" className="text-sm underline">
        ← キャラ図鑑に戻る
      </Link>

      <header className="flex items-start gap-4">
        <img
          src={primary}
          alt={persona.title}
          width={160}
          height={160}
          className="w-40 h-40 object-contain border rounded-xl bg-white"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = "/persona-images/_placeholder.png";
          }}
        />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{persona.title}</h1>
          <div className="opacity-70">@{persona.key}</div>
          {persona.blurb && <p className="mt-2 opacity-80">{persona.blurb}</p>}
        </div>
      </header>

      {persona.long_desc && (
        <section className="prose max-w-none">
          <p className="whitespace-pre-wrap">{persona.long_desc}</p>
        </section>
      )}

      {(persona.strengths?.length || persona.pitfalls?.length) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {persona.strengths?.length ? (
            <div className="rounded border p-4 bg-white">
              <h2 className="font-semibold mb-2">強み</h2>
              <ul className="list-disc pl-5 space-y-1">
                {persona.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          ) : null}
          {persona.pitfalls?.length ? (
            <div className="rounded border p-4 bg-white">
              <h2 className="font-semibold mb-2">落とし穴</h2>
              <ul className="list-disc pl-5 space-y-1">
                {persona.pitfalls.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          ) : null}
        </section>
      )}

      {Array.isArray(hot) && hot.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">このキャラに関連する注目投稿</h2>
          <ul className="space-y-2">
            {hot.slice(0, 10).map((p: any) => (
              <li key={p.id} className="rounded border p-3 bg-white">
                <div className="text-xs opacity-60">{new Date(p.created_at).toLocaleString()}</div>
                <p className="whitespace-pre-wrap">{p.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
