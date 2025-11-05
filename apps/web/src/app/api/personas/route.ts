// apps/web/src/app/api/personas/route.ts
export const revalidate = 3600;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supa = await supabaseServer();
    const { data, error } = await supa
      .from("persona_archetype_defs")
      // ⬇️ 'w' を削除（存在しない列で500になっていた可能性が高い）
      .select("key,title,blurb,image_url,theme")
      .order("title", { ascending: true });

    if (error) {
      console.error("[/api/personas] select error:", {
        message: error.message,
        details: (error as any).details,
        hint: (error as any).hint,
        code: (error as any).code,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data ?? []);
  } catch (e: any) {
    console.error("[/api/personas] unexpected error:", e);
    return NextResponse.json({ error: e?.message ?? "unknown error" }, { status: 500 });
  }
}
