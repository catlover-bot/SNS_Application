import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const supa = await supabaseServer();
  const { data } = await supa
    .from("prompts_of_day")
    .select("*")
    .eq("date", new Date().toISOString().slice(0,10))
    .maybeSingle();
  return NextResponse.json(data ?? null);
}

export async function POST(req: Request) {
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const body = await req.json();
  const { title, body: desc } = body ?? {};
  if (!title) return NextResponse.json({ error: "title_required" }, { status: 400 });

  const up = await supa
    .from("prompts_of_day")
    .upsert({ date: new Date().toISOString().slice(0,10), title, body: desc })
    .select()
    .maybeSingle();

  return NextResponse.json(up.data ?? null);
}
