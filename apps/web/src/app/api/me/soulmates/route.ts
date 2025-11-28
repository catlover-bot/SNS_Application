// apps/web/src/app/api/me/soulmates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type Row = {
  target_user_id: string;
  target_persona_key: string;
  romance_score: number;
  relation_label: string | null;
};

export async function GET(req: NextRequest) {
  const supabaseMaybe = supabaseServer() as any;
  const supabase =
    typeof supabaseMaybe.then === "function"
      ? await supabaseMaybe
      : supabaseMaybe;

  // ログインユーザー
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? "20");
  const offset = Number(searchParams.get("offset") ?? "0");
  const p_limit = Number.isFinite(limit) ? limit : 20;
  const p_offset = Number.isFinite(offset) ? offset : 0;

  // ① ソウルメイト候補の生データ
  const { data, error } = await supabase.rpc("recommend_soulmates", {
    p_user_id: user.id,
    p_limit,
    p_offset,
  });

  if (error) {
    console.error("[soulmates] rpc error", error);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  const rows = (data ?? []) as Row[];

  if (rows.length === 0) {
    return NextResponse.json({ soulmates: [] });
  }

  // ② プロフィール情報（名前 / アイコン）
  const userIds = Array.from(new Set(rows.map((r) => r.target_user_id)));
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, handle, display_name, avatar_url")
    .in("id", userIds);

  if (profErr) {
    console.error("[soulmates] profiles error", profErr);
  }

  const profileMap = new Map(
    (profiles ?? []).map((p: any) => [p.id as string, p])
  );

  // ③ キャラ名（日本語タイトル）
  const personaKeys = Array.from(
    new Set(rows.map((r) => r.target_persona_key))
  );

  const { data: defs, error: defsErr } = await supabase
    .from("persona_defs")
    .select("key, title")
    .in("key", personaKeys);

  if (defsErr) {
    console.error("[soulmates] persona_defs error", defsErr);
  }

  const personaMap = new Map(
    (defs ?? []).map((d: any) => [d.key as string, d.title as string])
  );

  // ④ フロント用の整形
  const payload = rows.map((r) => {
    const prof = profileMap.get(r.target_user_id);
    const personaTitle =
      personaMap.get(r.target_persona_key) ?? r.target_persona_key;

    return {
      user_id: r.target_user_id,
      persona_key: r.target_persona_key,
      persona_title: personaTitle,
      romance_score: r.romance_score,
      percent: Math.round(r.romance_score * 100),
      relation_label: r.relation_label,
      handle: prof?.handle ?? null,
      display_name: prof?.display_name ?? null,
      avatar_url: prof?.avatar_url ?? null,
    };
  });

  return NextResponse.json({ soulmates: payload });
}
