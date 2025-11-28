// apps/web/src/app/api/personas/compat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type Mode = "friendship" | "romance";

export async function GET(req: NextRequest) {
  const supa = await supabaseServer();
  const { searchParams } = new URL(req.url);

  const key = searchParams.get("key");
  const mode = (searchParams.get("mode") as Mode) ?? "friendship";

  if (!key) {
    return NextResponse.json(
      { error: "key is required" },
      { status: 400 }
    );
  }

  // --- 1. 相性スコア本体（VIEW: persona_compat_tags） ---
  const { data: compatRows, error: compatError } = await supa
    .from("persona_compat_tags")
    .select(
      `
      source_key,
      target_key,
      kind,
      score,
      relation_label
    `
    )
    .eq("source_key", key)
    .eq("kind", mode)
    .order("score", { ascending: false })
    .limit(50);

  if (compatError) {
    console.error("[api/personas/compat] compat error", compatError);
    return NextResponse.json(
      { error: compatError.message },
      { status: 500 }
    );
  }

  if (!compatRows || compatRows.length === 0) {
    return NextResponse.json([]);
  }

  // --- 2. 相性相手の persona_defs をまとめて取得 ---
  const targetKeys = Array.from(
    new Set(
      compatRows
        .map((r) => r.target_key)
        .filter((k): k is string => !!k && k.trim().length > 0)
    )
  );

  let personaMap: Record<
    string,
    {
      key: string;
      title: string | null;
      theme: string | null;
      vibe_tags: string[] | null;
      icon: string | null;
    }
  > = {};

  if (targetKeys.length > 0) {
    const { data: personas, error: personaError } = await supa
      .from("persona_defs")
      .select("key,title,theme,vibe_tags,icon")
      .in("key", targetKeys);

    if (personaError) {
      console.error(
        "[api/personas/compat] persona_defs error",
        personaError
      );
      // persona 情報なしでも最低限スコアは返す
    } else if (personas) {
      for (const p of personas) {
        personaMap[p.key] = {
          key: p.key,
          title: p.title,
          theme: p.theme,
          vibe_tags: p.vibe_tags,
          icon: p.icon,
        };
      }
    }
  }

  // --- 3. persona 情報をマージして返す ---
  const enriched = compatRows.map((row) => {
    const p = row.target_key ? personaMap[row.target_key] : undefined;

    return {
      source_key: row.source_key,
      target_key: row.target_key,
      score: row.score,
      relation_label: row.relation_label ?? null,
      target_title: p?.title ?? null,
      target_theme: p?.theme ?? null,
      target_vibe_tags: p?.vibe_tags ?? null,
      target_icon: p?.icon ?? null,
    };
  });

  return NextResponse.json(enriched);
}
