// apps/web/src/app/personas/[key]/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { supabaseServer } from "@/lib/supabase/server";

type Persona = {
  key: string;
  title: string;
  blurb: string | null;
  long_desc: string | null;
  theme: string | null;
  strengths: string[] | null;
  pitfalls: string[] | null;
  ideal_roles: string[] | null;
  growth_tips: string[] | null;
  sample_bio: string | null;
  w: number | null;
};

export default async function PersonaDetailPage({ params }: { params: { key: string } }) {
  const key = params.key;

  const supa = await supabaseServer();

  const { data: persona, error } = await supa
    .from("persona_archetype_defs")
    .select(
      "key,title,blurb,long_desc,theme,strengths,pitfalls,ideal_roles,growth_tips,sample_bio,w"
    )
    .eq("key", key)
    .maybeSingle();

  if (error) {
    console.error("[persona detail] supabase error:", error.message);
    return <div className="p-6">読み込みに失敗しました。</div>;
  }
  if (!persona) {
    return <div className="p-6">このキャラは見つかりませんでした。</div>;
  }

  // 一覧と同じくローカルPNGを絶対優先（image_url は使わない）
  const imgSrc = `/persona-images/${encodeURIComponent(key)}.png`;

  // 関連の人気ポスト（あれば）
  const { data: hot, error: hotErr } = await supa.rpc("top_persona_posts", {
    arche_key: key,
    limit_count: 10,
    offset_count: 0,
  });
  if (hotErr) console.warn("[persona detail] top_persona_posts error:", hotErr);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* 画像（Server Componentなので onError は付けない） */}
      <div className="w-full aspect-square bg-white border rounded-2xl flex items-center justify-center overflow-hidden">
        <img src={imgSrc} alt={persona.title} className="w-full h-full object-contain" />
      </div>

      <header>
        <h1 className="text-2xl font-bold">{persona.title}</h1>
        <div className="text-sm opacity-60">@{persona.key}</div>
      </header>

      {persona.blurb && <p className="opacity-80 whitespace-pre-wrap">{persona.blurb}</p>}

      {persona.long_desc && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">説明</h2>
          <p className="whitespace-pre-wrap opacity-80">{persona.long_desc}</p>
        </section>
      )}

      {persona.strengths?.length ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">強み</h2>
          <ul className="list-disc pl-5 opacity-80">
            {persona.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </section>
      ) : null}

      {persona.pitfalls?.length ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">落とし穴</h2>
          <ul className="list-disc pl-5 opacity-80">
            {persona.pitfalls.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </section>
      ) : null}

      {persona.ideal_roles?.length ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">活躍しやすい役割</h2>
          <ul className="list-disc pl-5 opacity-80">
            {persona.ideal_roles.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </section>
      ) : null}

      {persona.growth_tips?.length ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">成長のヒント</h2>
          <ul className="list-disc pl-5 opacity-80">
            {persona.growth_tips.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </section>
      ) : null}

      {persona.sample_bio && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">サンプル自己紹介</h2>
          <p className="whitespace-pre-wrap opacity-80">{persona.sample_bio}</p>
        </section>
      )}

      {Array.isArray(hot) && hot.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">人気の投稿</h2>
          <ul className="space-y-2">
            {hot.map((row: any) => (
              <li key={row.id} className="rounded border p-3 bg-white">
                <div className="text-xs opacity-60">{new Date(row.created_at).toLocaleString()}</div>
                <div className="whitespace-pre-wrap">{row.text}</div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
