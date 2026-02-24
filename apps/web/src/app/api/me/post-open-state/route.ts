import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const MAX_POST_IDS = 200;

function parsePostIdsFromSearchParams(url: URL) {
  const fromCsv = (url.searchParams.get("postIds") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const fromMulti = url.searchParams
    .getAll("postId")
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
  return Array.from(new Set([...fromCsv, ...fromMulti])).slice(0, MAX_POST_IDS);
}

function parsePostIdsFromBody(body: any) {
  const one = String(body?.postId ?? "").trim();
  const many = Array.isArray(body?.postIds)
    ? body.postIds.map((x: any) => String(x ?? "").trim()).filter(Boolean)
    : [];
  return Array.from(new Set([...(one ? [one] : []), ...many])).slice(0, MAX_POST_IDS);
}

function isMissingOpenStateTableError(err: any) {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes("user_post_open_state") && text.includes("does not exist");
}

export async function GET(req: NextRequest) {
  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated", openedIds: [] }, { status: 401 });
  }

  const url = new URL(req.url);
  const postIds = parsePostIdsFromSearchParams(url);
  if (postIds.length === 0) {
    return NextResponse.json({ openedIds: [] });
  }

  const res = await supa
    .from("user_post_open_state")
    .select("post_id")
    .eq("user_id", user.id)
    .in("post_id", postIds)
    .limit(postIds.length);

  if (res.error) {
    if (isMissingOpenStateTableError(res.error)) {
      return NextResponse.json({ openedIds: [], degraded: true });
    }
    return NextResponse.json(
      { error: res.error.message ?? "failed_to_load_open_state", openedIds: [] },
      { status: 500 }
    );
  }

  const openedIds = Array.from(
    new Set(
      (res.data ?? [])
        .map((r: any) => String(r?.post_id ?? "").trim())
        .filter((x: string) => x.length > 0)
    )
  );

  return NextResponse.json({ openedIds });
}

export async function POST(req: NextRequest) {
  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const postIds = parsePostIdsFromBody(body);
  const source = String(body?.source ?? "").trim() || null;
  if (postIds.length === 0) {
    return NextResponse.json({ ok: true, count: 0 });
  }

  const now = new Date().toISOString();
  const rows = postIds.map((postId) => ({
    user_id: user.id,
    post_id: postId,
    source,
    opened_at: now,
    updated_at: now,
  }));

  const up = await supa
    .from("user_post_open_state")
    .upsert(rows, { onConflict: "user_id,post_id" });

  if (up.error) {
    if (isMissingOpenStateTableError(up.error)) {
      return NextResponse.json({ ok: false, degraded: true }, { status: 200 });
    }
    return NextResponse.json(
      { ok: false, error: up.error.message ?? "failed_to_save_open_state" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, count: rows.length });
}
