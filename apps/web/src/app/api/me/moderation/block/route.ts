import { NextResponse } from "next/server";
import { requireRateLimit, requireSameOrigin } from "@/lib/apiSecurity";
import { supabaseServer } from "@/lib/supabase/server";

function isMissingRelationError(err: any, table = "user_blocks") {
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
    key: `block:${user.id}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (rateLimitErr) return rateLimitErr;

  const body = await req.json().catch(() => ({}));
  const blockedId = String(body?.blocked_id ?? "").trim();
  if (!blockedId) {
    return NextResponse.json({ ok: false, error: "blocked_id_required" }, { status: 400 });
  }
  if (blockedId === user.id) {
    return NextResponse.json({ ok: false, error: "cannot_block_self" }, { status: 400 });
  }

  const up = await supa.from("user_blocks").upsert(
    {
      blocker_id: user.id,
      blocked_id: blockedId,
      reason: body?.reason ?? null,
      created_at: new Date().toISOString(),
    },
    { onConflict: "blocker_id,blocked_id" }
  );

  if (up.error) {
    const message = isMissingRelationError(up.error)
      ? "user_blocks table is missing. Apply docs/sql/app_store_safety.sql first."
      : up.error.message;
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const originErr = requireSameOrigin(req, { allowMissingOrigin: false });
  if (originErr) return originErr;

  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  const rateLimitErr = requireRateLimit({
    key: `unblock:${user.id}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (rateLimitErr) return rateLimitErr;

  const url = new URL(req.url);
  const blockedId = String(url.searchParams.get("blocked_id") ?? "").trim();
  if (!blockedId) {
    return NextResponse.json({ ok: false, error: "blocked_id_required" }, { status: 400 });
  }

  const del = await supa
    .from("user_blocks")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", blockedId);

  if (del.error) {
    return NextResponse.json({ ok: false, error: del.error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
