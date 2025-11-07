// apps/web/src/app/api/personas/[key]/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function normalizeKey(s: string) {
  // 先頭@許容、前後空白除去、小文字化、- を _ に揃える
  return s.replace(/^@/, "").trim().toLowerCase().replace(/-/g, "_");
}

export async function GET(req: Request, ctx: { params?: { key?: string } }) {
  // ① 通常の params
  let raw = (ctx?.params?.key ?? "").toString();

  // ② もし空なら URL からフォールバック抽出（まれに params が空の事象に対応）
  if (!raw) {
    const m = new URL(req.url).pathname.match(/\/api\/personas\/([^\/?#]+)/i);
    raw = m?.[1] ?? "";
  }

  const key = normalizeKey(decodeURIComponent(raw));

  if (!key) {
    // デバッグ情報も返す（クライアントのエラーパネルで可視化できるように）
    return NextResponse.json({ error: "bad_request", raw, normalized: key }, { status: 400 });
  }

  const supa = await supabaseServer();

  const { data: persona, error } = await supa
    .from("persona_archetype_defs")
    .select(
      "key,title,blurb,long_desc,image_url,theme,strengths,pitfalls,ideal_roles,growth_tips,sample_bio,w"
    )
    .eq("key", key)
    .maybeSingle();

  if (error) {
    console.warn("[/api/personas/[key]] select error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!persona) {
    return NextResponse.json({ error: "not_found", key }, { status: 404 });
  }

  const { data: hot, error: hotErr } = await supa.rpc("top_persona_posts", {
    arche_key: key,
    limit_count: 10,
    offset_count: 0,
  });
  if (hotErr) console.warn("[/api/personas/[key]] hot error:", hotErr?.message);

  return NextResponse.json({ persona, hot: hot ?? [] });
}
