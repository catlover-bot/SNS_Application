// apps/web/src/app/api/personas/[key]/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ key: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { key: raw } = await ctx.params;
  const key = (raw ?? "").trim();
  if (!key) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const supa = await supabaseServer();

  const { data: persona, error } = await supa
    .from("persona_archetype_defs")
    .select(
      "key,title,blurb,long_desc,image_url,theme,strengths,pitfalls,ideal_roles,growth_tips,sample_bio,w"
    )
    .eq("key", key)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!persona) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // 相性（友情/恋愛）をまとめて返す
  const { data: compatAll, error: cErr } = await supa
    .from("v_persona_compat")
    .select("target_key,target_title,kind,score,tags,note")
    .eq("source_key", key)
    .order("score", { ascending: false });

  if (cErr) {
    // 相性が取れなくても本体だけは返す
    return NextResponse.json({ persona, compat: { friendship: [], romance: [] } });
  }

  const friendship = (compatAll ?? []).filter((x) => x.kind === "friendship");
  const romance = (compatAll ?? []).filter((x) => x.kind === "romance");

  // ついでにホット投稿も現状通り付けておく（失敗しても無視）
  const { data: hot } = await supa.rpc("top_persona_posts", {
    arche_key: key,
    limit_count: 10,
    offset_count: 0,
  });

  return NextResponse.json({
    persona,
    compat: { friendship, romance },
    hot: hot ?? [],
  });
}
