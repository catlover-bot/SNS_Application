// apps/web/src/app/api/persona_defs/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");

  if (!key) {
    return NextResponse.json(
      { error: "key is required" },
      { status: 400 }
    );
  }

  const supa = await supabaseServer();

  const { data, error } = await supa
    .from("persona_defs")
    .select(`
      key,
      title,
      theme,
      vibe_tags,
      talk_style,
      blurb,
      icon,
      relation_style
    `)
    .eq("key", key)
    .maybeSingle();

  if (error) {
    console.error("[persona_defs api] detail error", error);
    return NextResponse.json(
      { error: "failed to load persona" },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "persona not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}
