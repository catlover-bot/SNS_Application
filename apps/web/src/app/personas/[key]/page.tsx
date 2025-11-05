// apps/web/src/app/personas/[key]/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { supabaseServer } from "@/lib/supabase/server";

export default async function PersonaDetailPage({ params }: { params: { key: string } }) {
  const key = params.key;
  const supa = await supabaseServer();

  const { data: persona, error } = await supa
    .from("persona_archetype_defs")
    .select("key,title,blurb,long_desc,theme,strengths,pitfalls,ideal_roles,growth_tips,sample_bio,w")
    .eq("key", key)
    .maybeSingle();

  if (error || !persona) {
    return <div className="p-6">見つかりませんでした。</div>;
  }

  // ここでも image_url は使わずローカルPNG固定
  const imgSrc = `/persona-images/${encodeURIComponent(key)}.png`;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="w-full aspect-square bg-white flex items-center justify-center">
        <img src={imgSrc} alt={persona.title} className="w-full h-full object-contain" />
      </div>

      <h1 className="text-2xl font-bold">{persona.title}</h1>
      <p className="opacity-80 whitespace-pre-wrap">{persona.blurb ?? ""}</p>
      {/* 以下、必要な項目を表示 */}
    </div>
  );
}
