import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server"; // 縺・▽繧ゅ・繧ｵ繝ｼ繝舌・繧ｯ繝ｩ繧､繧｢繝ｳ繝・

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const since = url.searchParams.get("since"); // ISO譁・ｭ怜・ or null

  const supabase = createClient();
  const { data, error } = await supabase.rpc("feed_light", {
    limit_count: limit,
    since: since ? new Date(since).toISOString() : null,
  });

  if (error) {
    console.warn("[api/feed] rpc error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [] });
}
