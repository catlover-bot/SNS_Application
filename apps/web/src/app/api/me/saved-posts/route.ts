import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function clampInt(v: string | null, min: number, max: number, def: number) {
  const n = Number(v ?? "");
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function isMissingRelationError(err: any, relation: string) {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes(relation.toLowerCase()) && text.includes("does not exist");
}

type SavedRow = {
  post_id: string | null;
  collection_key: string | null;
  collection_label: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export async function GET(req: NextRequest) {
  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const limit = clampInt(url.searchParams.get("limit"), 1, 80, 30);
  const offset = clampInt(url.searchParams.get("offset"), 0, 2000, 0);
  const collectionFilter = String(url.searchParams.get("collection") ?? "").trim();

  const baseQuery = supa
    .from("user_saved_post_collections")
    .select("post_id,collection_key,collection_label,created_at,updated_at")
    .eq("user_id", user.id);
  const pageQuery = (collectionFilter ? baseQuery.eq("collection_key", collectionFilter) : baseQuery)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const [pageRes, summaryRes] = await Promise.all([
    pageQuery,
    supa
      .from("user_saved_post_collections")
      .select("collection_key,collection_label,updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(2000),
  ]);

  if (pageRes.error) {
    if (isMissingRelationError(pageRes.error, "user_saved_post_collections")) {
      return NextResponse.json({
        ok: true,
        available: false,
        items: [],
        collections: [],
        total: 0,
      });
    }
    return NextResponse.json(
      { error: pageRes.error.message ?? "saved_posts_read_failed" },
      { status: 500 }
    );
  }

  const savedRows = (pageRes.data ?? []) as SavedRow[];
  const postIds = savedRows
    .map((r) => String(r?.post_id ?? "").trim())
    .filter(Boolean);
  let postRows: any[] = [];
  if (postIds.length > 0) {
    const enriched = await supa.from("v_posts_enriched").select("*").in("id", postIds).limit(postIds.length);
    if (!enriched.error && enriched.data) {
      postRows = enriched.data;
    } else {
      const raw = await supa.from("posts").select("*").in("id", postIds).limit(postIds.length);
      postRows = raw.data ?? [];
    }
  }

  const postMap = new Map<string, any>();
  postRows.forEach((row) => {
    const id = String((row as any)?.id ?? "").trim();
    if (id) postMap.set(id, row);
  });

  const items = savedRows
    .map((row) => {
      const postId = String(row?.post_id ?? "").trim();
      const post = postMap.get(postId);
      if (!post) return null;
      return {
        ...post,
        save_meta: {
          collection_key: String(row?.collection_key ?? "saved"),
          collection_label: String(row?.collection_label ?? "保存"),
          saved_at: String(row?.updated_at ?? row?.created_at ?? ""),
        },
      };
    })
    .filter(Boolean);

  const collectionRows = ((summaryRes.data ?? []) as Array<{
    collection_key: string | null;
    collection_label: string | null;
    updated_at: string | null;
  }>);
  const collectionMap = new Map<
    string,
    { key: string; label: string; count: number; lastSavedAt: string | null }
  >();
  collectionRows.forEach((row) => {
    const key = String(row?.collection_key ?? "saved").trim() || "saved";
    const label = String(row?.collection_label ?? "保存").trim() || "保存";
    const cur = collectionMap.get(key) ?? { key, label, count: 0, lastSavedAt: null };
    cur.count += 1;
    if (!cur.lastSavedAt || (row?.updated_at && row.updated_at > cur.lastSavedAt)) {
      cur.lastSavedAt = row?.updated_at ?? cur.lastSavedAt;
    }
    if (!cur.label && label) cur.label = label;
    collectionMap.set(key, cur);
  });

  const collections = Array.from(collectionMap.values()).sort((a, b) => {
    const at = String(a.lastSavedAt ?? "");
    const bt = String(b.lastSavedAt ?? "");
    if (at !== bt) return bt.localeCompare(at);
    return b.count - a.count;
  });

  return NextResponse.json({
    ok: true,
    available: true,
    items,
    collections,
    total: collectionRows.length,
    page: {
      limit,
      offset,
      hasMore: savedRows.length === limit,
      collection: collectionFilter || null,
    },
  });
}

