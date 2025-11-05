// apps/web/src/app/api/trending/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const arche = searchParams.get("arche_key");
  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 50);
  const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0);

  const supabase = await supabaseServer(); // <-- await
  const { data, error } = await supabase.rpc("top_persona_posts", {
    arche_key: arche,
    limit_count: limit,
    offset_count: offset,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return new NextResponse(JSON.stringify(data ?? []), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
