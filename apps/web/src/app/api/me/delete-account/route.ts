import { NextResponse } from "next/server";
import { requireRateLimit, requireSameOrigin } from "@/lib/apiSecurity";
import { supabaseServer } from "@/lib/supabase/server";

function isMissingFunctionError(err: any, fn = "delete_my_account") {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes("function") && text.includes("does not exist") && text.includes(fn);
}

export async function POST(req: Request) {
  const originErr = requireSameOrigin(req, { allowMissingOrigin: false });
  if (originErr) return originErr;

  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });
  }

  const rateLimitErr = requireRateLimit({
    key: `delete-account:${user.id}`,
    limit: 2,
    windowMs: 60_000,
  });
  if (rateLimitErr) return rateLimitErr;

  const rpc = await supa.rpc("delete_my_account");
  if (rpc.error) {
    const message = isMissingFunctionError(rpc.error)
      ? "delete_my_account RPC is missing. Apply docs/sql/app_store_safety.sql first."
      : rpc.error.message;
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, result: rpc.data ?? null });
}
