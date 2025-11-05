// apps/web/src/app/api/personas/[key]/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ key: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { key } = await ctx.params;

  const supa = await supabaseServer();

  const { data: persona, error } = await supa
    .from("persona_archetype_defs")
    .select(
      "key,title,blurb,long_desc,image_url,theme,strengths,pitfalls,ideal_roles,growth_tips,sample_bio,w"
    )
    .eq("key", key)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!persona) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: hot, error: hotErr } = await supa.rpc("top_persona_posts", {
    arche_key: key,
    limit_count: 10,
    offset_count: 0,
  });
  if (hotErr) console.warn("[/api/personas/[key]] hot error:", hotErr);

  return NextResponse.json({ persona, hot: hot ?? [] });
}
