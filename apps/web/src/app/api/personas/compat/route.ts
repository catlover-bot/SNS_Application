// apps/web/src/app/api/personas/compat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

interface CompatRowRaw {
  source_key: string;
  target_key: string;
  kind: string;
  score: number;
  relation_label: string | null;
  mode: string; // DB上には general 等が入っている想定
}

interface PersonaDefRow {
  key: string;
  title: string;
  icon: string | null;
  theme: string | null;
  relation_style: string | null;
  vibe_tags: string[] | null;
}

type QueryMode = "friendship" | "romance";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const sourceKey = searchParams.get("key");
    const modeParam = (searchParams.get("mode") ?? "friendship") as QueryMode;
    const limitParam = searchParams.get("limit");

    if (!sourceKey) {
      return NextResponse.json(
        { error: "missing `key` query param" },
        { status: 400 }
      );
    }

    if (!["friendship", "romance"].includes(modeParam)) {
      return NextResponse.json(
        { error: "invalid `mode` (use friendship|romance)" },
        { status: 400 }
      );
    }

    const limit =
      limitParam && !Number.isNaN(Number(limitParam))
        ? Math.min(Math.max(Number(limitParam), 1), 50)
        : 16;

    // supabaseServer が関数か、そのままクライアントか分からないので両対応
    const raw = supabaseServer as any;
    const supabase = typeof raw === "function" ? await raw() : raw;

    if (!supabase || typeof supabase.from !== "function") {
      throw new Error(
        "supabaseServer から Supabase クライアントを取得できませんでした。" +
          "他の API (/api/feed など) での使い方と同じ形に揃えてください。"
      );
    }

    // ★ ここがポイント：DB の kind(friendship/romance) を使って絞る
    const { data: compatRowsRaw, error: compatError } = await supabase
      .from("persona_compat")
      .select("source_key, target_key, kind, score, relation_label, mode")
      .eq("source_key", sourceKey)
      .eq("kind", modeParam)
      .neq("target_key", sourceKey)
      .order("score", { ascending: false })
      .limit(limit);

    if (compatError) {
      console.error("[persona_compat] error:", compatError);
      return NextResponse.json(
        {
          error: "failed to load compat",
          details: compatError.message,
        },
        { status: 500 }
      );
    }

    const compatRows = (compatRowsRaw ?? []) as CompatRowRaw[];

    if (compatRows.length === 0) {
      return NextResponse.json({
        mode: modeParam,
        sourceKey,
        items: [],
      });
    }

    const targetKeys = [...new Set(compatRows.map((r) => r.target_key))];

    // 対象キャラの定義を取得
    const { data: personaDefsRaw, error: defsError } = await supabase
      .from("persona_defs")
      .select("key, title, icon, theme, relation_style, vibe_tags")
      .in("key", targetKeys);

    if (defsError) {
      console.error("[persona_defs] error:", defsError);
      return NextResponse.json(
        {
          error: "failed to load persona defs",
          details: defsError.message,
        },
        { status: 500 }
      );
    }

    const personaDefs = (personaDefsRaw ?? []) as PersonaDefRow[];

    const defMap = new Map<string, PersonaDefRow>();
    personaDefs.forEach((row) => defMap.set(row.key, row));

    const items = compatRows.map((row) => {
      const def = defMap.get(row.target_key);
      return {
        targetKey: row.target_key,
        kind: row.kind, // friendship / romance
        score: row.score,
        relationLabel: row.relation_label,
        title: def?.title ?? row.target_key,
        icon: def?.icon ?? null,
        theme: def?.theme ?? null,
        relationStyle: def?.relation_style ?? null,
        vibeTags: def?.vibe_tags ?? [],
        // DB の mode は今のところ 'general' 固定なので返さない
      };
    });

    return NextResponse.json({
      mode: modeParam,
      sourceKey,
      items,
    });
  } catch (err: any) {
    console.error("[persona_compat API] fatal error", err);
    return NextResponse.json(
      {
        error: "internal_error",
        details: err?.message ?? String(err),
      },
      { status: 500 }
    );
  }
}
