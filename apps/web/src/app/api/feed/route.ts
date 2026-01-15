import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supa = await supabaseServer();
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  const r = await supa.from("feed_latest").select("*").range(offset, offset + limit - 1);
  if (r.error) return NextResponse.json({ error: r.error.message }, { status: 400 });
  return NextResponse.json(r.data ?? []);
}
