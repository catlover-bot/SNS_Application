export const revalidate = 3600;

import { supabaseServer } from "@/lib/supabase/server";

export default async function PersonaDetailPage({
  params,
}: {
  params: { key: string };
}) {
  const supa = await supabaseServer();

  const { data: persona } = await supa
    .from("persona_archetype_defs")
    .select(
      "key,title,blurb,long_desc,image_url,theme,strengths,pitfalls,ideal_roles,growth_tips,sample_bio,w"
    )
    .eq("key", params.key)
    .maybeSingle();

  if (!persona) {
    return <div className="p-6">Not found</div>;
  }

  const primary = persona.image_url || `/persona-images/${persona.key}.png`;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="w-full aspect-square bg-white">
        <img
          src={primary}
          alt={persona.title}
          loading="lazy"
          decoding="async"
          width={768}
          height={768}
          className="w-full h-full object-contain"
        />
      </div>

      <h1 className="text-2xl font-bold">{persona.title}</h1>
      {persona.blurb && <p className="opacity-80">{persona.blurb}</p>}
      {persona.long_desc && (
        <p className="opacity-80 whitespace-pre-wrap">{persona.long_desc}</p>
      )}
    </div>
  );
}
