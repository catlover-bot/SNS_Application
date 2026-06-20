// apps/web/src/app/api/persona_defs/route.ts
import { NextResponse } from "next/server";
import { safeJsonError } from "@/lib/apiSecurity";
import { findDefaultPersona } from "@/lib/personaCatalog";
import { isSupabaseConfigured } from "@/lib/supabase/config";
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

  if (!isSupabaseConfigured()) {
    return safeJsonError("service_unavailable", 503);
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
    return safeJsonError("persona_unavailable", 500);
  }

  if (!data) {
    const fallback = findDefaultPersona(key);
    if (fallback) return NextResponse.json(fallback);
    return NextResponse.json(
      { error: "persona not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}
