import { NextResponse } from "next/server";
import { requireRateLimit, requireSameOrigin } from "@/lib/apiSecurity";
import { supabaseServer } from "@/lib/supabase/server";

function isMissingRelationError(err: any, table = "user_reports") {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes(table) && text.includes("does not exist");
}

export async function POST(req: Request) {
  const originErr = requireSameOrigin(req, { allowMissingOrigin: false });
  if (originErr) return originErr;

  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  const rateLimitErr = requireRateLimit({
    key: `report:${user.id}`,
    limit: 12,
    windowMs: 60_000,
  });
  if (rateLimitErr) return rateLimitErr;

  const body = await req.json().catch(() => ({}));
  const postId = String(body?.post_id ?? "").trim() || null;
  const targetUserId = String(body?.target_user_id ?? "").trim() || null;
  const reason = String(body?.reason ?? "other").trim() || "other";

  if (!postId && !targetUserId) {
    return NextResponse.json({ ok: false, error: "post_id_or_target_user_id_required" }, { status: 400 });
  }

  const ins = await supa.from("user_reports").insert({
    reporter_id: user.id,
    target_user_id: targetUserId,
    post_id: postId,
    reason,
    detail: body?.detail ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (ins.error) {
    const message = isMissingRelationError(ins.error)
      ? "user_reports table is missing. Apply docs/sql/app_store_safety.sql first."
      : ins.error.message;
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
