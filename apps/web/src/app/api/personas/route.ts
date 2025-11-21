// apps/web/src/app/api/personas/route.ts
export const revalidate = 3600;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const supa = await supabaseServer();

  const { data, error } = await supa
    .from("persona_archetype_defs")
    .select("key,title,blurb,image_url,theme,category")
    .order("category", { ascending: true })
    .order("title", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}
