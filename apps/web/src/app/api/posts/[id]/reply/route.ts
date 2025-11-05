// apps/web/src/app/api/posts/[id]/reply/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supa = supabaseServer();
  const { body } = await req.json();
  // RLS 下で insert（ユーザーはCookieのJWTで識別）
  const { data, error } = await supa.from("replies").insert({ post_id: params.id, body }).select().maybeSingle();
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json(data);
}
