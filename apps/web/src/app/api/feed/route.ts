import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function clampInt(v: string | null, min: number, max: number, def: number) {
  const n = Number(v ?? "");
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function isMissingRelationError(err: any, table = "user_blocks") {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes(table) && text.includes("does not exist");
}

async function loadBlockedIds(supa: any, userId: string | null) {
  if (!userId) return new Set<string>();
  const blocks = await supa
    .from("user_blocks")
    .select("blocked_id")
    .eq("blocker_id", userId)
    .limit(500);
  if (blocks.error) {
    if (isMissingRelationError(blocks.error)) return new Set<string>();
    return new Set<string>();
  }
  return new Set(
    (blocks.data ?? [])
      .map((x: any) => String(x?.blocked_id ?? "").trim())
      .filter((x: string) => x.length > 0)
  );
}

export async function GET(req: Request) {
  const supa = await supabaseServer();
  const url = new URL(req.url);
  const limit = clampInt(url.searchParams.get("limit"), 1, 60, 20);
  const offset = clampInt(url.searchParams.get("offset"), 0, 1000, 0);

  const {
    data: { user },
  } = await supa.auth.getUser();
  const blockedIds = await loadBlockedIds(supa, user?.id ?? null);
  const fetchLimit = blockedIds.size > 0 ? Math.min(limit * 4, 180) : limit;

  const r = await supa
    .from("feed_latest")
    .select("*")
    .range(offset, offset + fetchLimit - 1);
  if (r.error) return NextResponse.json({ error: r.error.message }, { status: 400 });

  const items =
    blockedIds.size === 0
      ? (r.data ?? [])
      : (r.data ?? []).filter((x: any) => !blockedIds.has(String(x?.author ?? "").trim()));

  return NextResponse.json(items.slice(0, limit));
}
