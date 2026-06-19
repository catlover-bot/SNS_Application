import { NextResponse } from "next/server";
import { safeJsonError } from "@/lib/apiSecurity";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ ok:false, error: "not_authenticated" }, { status: 401 });
  const { id } = await params;

  // 付与（存在したら無視）
  const { error } = await supa.from("reactions").upsert({
    post_id: id, user_id: user.id, kind: "boost"
  }, { onConflict: "post_id,user_id,kind" });
  if (error) return safeJsonError("boost_failed", 500);
  return NextResponse.json({ ok:true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supa = await supabaseServer();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ ok:false, error: "not_authenticated" }, { status: 401 });
  const { id } = await params;

  const { error } = await supa.from("reactions")
    .delete()
    .eq("post_id", id)
    .eq("user_id", user.id)
    .eq("kind", "boost");
  if (error) return safeJsonError("boost_update_failed", 500);
  return NextResponse.json({ ok:true });
}
