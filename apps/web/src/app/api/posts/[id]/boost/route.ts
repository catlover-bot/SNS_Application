import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ ok:false, error: "not_authenticated" }, { status: 401 });

  // 付与（存在したら無視）
  const { error } = await supa.from("reactions").upsert({
    post_id: params.id, user_id: user.id, kind: "boost"
  }, { onConflict: "post_id,user_id,kind" });
  if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok:true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ ok:false, error: "not_authenticated" }, { status: 401 });

  const { error } = await supa.from("reactions")
    .delete()
    .eq("post_id", params.id)
    .eq("user_id", user.id)
    .eq("kind", "boost");
  if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok:true });
}
