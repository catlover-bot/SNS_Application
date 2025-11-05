// apps/web/src/app/api/personas/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supa = await supabaseServer();
    const { data, error } = await supa
      .from("persona_archetype_defs")
      .select("key,title,blurb,image_url,theme")
      .order("title", { ascending: true });

    if (error) {
      console.error("[api/personas] supabase error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json(data ?? []);
  } catch (e: any) {
    console.error("[api/personas] unhandled error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unhandled error" },
      { status: 500 }
    );
  }
}
