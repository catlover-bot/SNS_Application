// apps/web/src/app/api/personas/route.ts
export const revalidate = 3600;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supa = await supabaseServer();

    // ⚠ ここで 'w' 列を選んでいると 42703 で死にます。削除。
    const { data, error } = await supa
      .from("persona_archetype_defs")
      .select("key,title,blurb,image_url,theme")
      .order("title", { ascending: true });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unexpected error" },
      { status: 500 }
    );
  }
}
