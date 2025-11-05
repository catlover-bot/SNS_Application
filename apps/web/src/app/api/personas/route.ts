// apps/web/src/app/api/personas/route.ts
export const revalidate = 3600;

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * キャラ図鑑のカタログ用API。
 * 画面で必要なフィールド（key, title, blurb, image_url, theme）のみ返す。
 */
export async function GET() {
  try {
    const supa = await supabaseServer();

    const { data, error } = await supa
      .from("persona_archetype_defs")
      .select("key,title,blurb,image_url,theme")
      .order("title", { ascending: true });

    if (error) {
      // DBエラーは500で返す（Vercel関数ログにメッセージが出る）
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data ?? []);
  } catch (e: any) {
    // 予期しない例外
    return NextResponse.json(
      { error: e?.message ?? "unexpected error" },
      { status: 500 }
    );
  }
}
