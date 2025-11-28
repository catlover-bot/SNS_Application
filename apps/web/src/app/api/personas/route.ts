// apps/web/src/app/api/personas/route.ts
export const revalidate = 3600;

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// GET /api/personas
//   - 一覧:   /api/personas
//   - 詳細:   /api/personas?key=afterparty_host_legend
export async function GET(req: NextRequest) {
  const supa = await supabaseServer();
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");

  // --- キャラ詳細（persona_defs） ---
  if (key) {
    const { data, error } = await supa
      .from("persona_defs")
      .select(
        `
        key,
        title,
        theme,
        vibe_tags,
        talk_style,
        blurb,
        icon,
        relation_style
      `
      )
      .eq("key", key)
      .maybeSingle();

    if (error) {
      console.error("[api/personas] detail error", error);
      return NextResponse.json(
        { error: error.message },
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

  // --- 一覧（図鑑用）: archetype テーブルをそのまま利用 ---
  const { data, error } = await supa
    .from("persona_archetype_defs")
    .select(
      `
      key,
      title,
      blurb,
      image_url,
      theme,
      category
    `
    )
    .order("category", { ascending: true })
    .order("title", { ascending: true });

  if (error) {
    console.error("[api/personas] list error", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  // フロント側で扱いやすいように image_url -> icon に寄せる
  const mapped =
    data?.map((row) => ({
      key: row.key,
      title: row.title,
      blurb: row.blurb,
      icon: row.image_url ?? null,
      theme: row.theme,
      category: row.category,
    })) ?? [];

  return NextResponse.json(mapped);
}
