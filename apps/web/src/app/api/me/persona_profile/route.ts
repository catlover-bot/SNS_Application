// apps/web/src/app/api/me/persona_profile/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const supa = await supabaseServer();

  // ログインユーザー取得
  const {
    data: { user },
    error: authErr,
  } = await supa.auth.getUser();

  if (authErr) {
    console.error("[/api/me/persona_profile] auth error:", authErr.message);
  }

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // 自分のキャラスコア一覧
  const { data: personas, error: pErr } = await supa
    .from("user_personas")
    .select("persona_key, score, confidence")
    .eq("user_id", user.id)
    .order("score", { ascending: false });

  if (pErr) {
    console.error("[/api/me/persona_profile] user_personas error:", pErr.message);
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  if (!personas || personas.length === 0) {
    return NextResponse.json({ personas: [], defs: [] });
  }

  // 対応するキャラ定義（タイトルなど）
  const keys = personas.map((r) => r.persona_key).filter(Boolean);
  let defs: { key: string; title: string; theme: string | null }[] = [];

  if (keys.length > 0) {
    const { data: defRows, error: dErr } = await supa
      .from("persona_archetype_defs")
      .select("key,title,theme")
      .in("key", keys as string[]);

    if (dErr) {
      console.warn("[/api/me/persona_profile] defs error:", dErr.message);
    } else if (defRows) {
      defs = defRows as any;
    }
  }

  return NextResponse.json({ personas, defs });
}
