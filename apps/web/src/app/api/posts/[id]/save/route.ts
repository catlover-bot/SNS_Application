import { NextRequest, NextResponse } from "next/server";
import { requireRateLimit, requireSameOrigin } from "@/lib/apiSecurity";
import { supabaseServer } from "@/lib/supabase/server";

function isMissingRelationError(err: any, relation: string) {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes(relation.toLowerCase()) && text.includes("does not exist");
}

function sanitizeCollectionKey(raw: string | null | undefined) {
  const normalized = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_ -]+/gu, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return normalized || "saved";
}

function sanitizeCollectionLabel(raw: string | null | undefined) {
  const label = String(raw ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
  return label || "保存";
}

async function loadSaveState(supa: any, userId: string, postId: string) {
  const [countRes, meSaveRes, collectionRes] = await Promise.all([
    supa
      .from("reactions")
      .select("id", { count: "exact", head: true })
      .eq("post_id", postId)
      .eq("kind", "save"),
    supa
      .from("reactions")
      .select("user_id")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .eq("kind", "save")
      .maybeSingle(),
    supa
      .from("user_saved_post_collections")
      .select("collection_key,collection_label,updated_at")
      .eq("user_id", userId)
      .eq("post_id", postId)
      .maybeSingle(),
  ]);

  const saveCount = typeof countRes.count === "number" ? countRes.count : 0;
  const saved = Boolean(meSaveRes.data);
  const collectionAvailable = !collectionRes.error;
  const collection =
    collectionRes.data && typeof collectionRes.data === "object"
      ? {
          key: String(collectionRes.data.collection_key ?? "saved"),
          label: String(collectionRes.data.collection_label ?? "保存"),
          updatedAt: String(collectionRes.data.updated_at ?? ""),
        }
      : null;

  return {
    saveCount,
    saved,
    collectionAvailable,
    collection,
    degraded:
      Boolean(countRes.error) ||
      (collectionRes.error && !isMissingRelationError(collectionRes.error, "user_saved_post_collections")),
  };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const postId = String(id ?? "").trim();
  if (!postId) return NextResponse.json({ error: "invalid_post_id" }, { status: 400 });

  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const state = await loadSaveState(supa, user.id, postId);
  return NextResponse.json({ ok: true, postId, ...state });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const originErr = requireSameOrigin(req, { allowMissingOrigin: false });
  if (originErr) return originErr;

  const { id } = params;
  const postId = String(id ?? "").trim();
  if (!postId) return NextResponse.json({ ok: false, error: "invalid_post_id" }, { status: 400 });

  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  const rateErr = requireRateLimit({
    key: `post-save:${user.id}`,
    limit: 40,
    windowMs: 60_000,
  });
  if (rateErr) return rateErr;

  const body = await req.json().catch(() => ({}));
  const requestedSaved =
    typeof body?.saved === "boolean" ? body.saved : Boolean(body?.toggle ?? true);
  const collectionKey = sanitizeCollectionKey(body?.collectionKey ?? body?.collection_key);
  const collectionLabel = sanitizeCollectionLabel(body?.collectionLabel ?? body?.collection_label);

  const now = new Date().toISOString();
  if (requestedSaved) {
    const saveIns = await supa
      .from("reactions")
      .upsert(
        {
          post_id: postId,
          user_id: user.id,
          kind: "save",
          created_at: now,
        },
        { onConflict: "post_id,user_id,kind" }
      );
    if (saveIns.error) {
      return NextResponse.json(
        { ok: false, error: saveIns.error.message ?? "save_insert_failed" },
        { status: 400 }
      );
    }

    const collUp = await supa.from("user_saved_post_collections").upsert(
      {
        user_id: user.id,
        post_id: postId,
        collection_key: collectionKey,
        collection_label: collectionLabel,
        updated_at: now,
      },
      { onConflict: "user_id,post_id" }
    );
    const collectionDegraded =
      !!collUp.error && isMissingRelationError(collUp.error, "user_saved_post_collections");
    if (collUp.error && !collectionDegraded) {
      return NextResponse.json(
        { ok: false, error: collUp.error.message ?? "collection_upsert_failed" },
        { status: 400 }
      );
    }

    const state = await loadSaveState(supa, user.id, postId);
    return NextResponse.json({
      ok: true,
      saved: true,
      postId,
      collectionDegraded,
      ...state,
    });
  }

  return clearSaveState({ supa, userId: user.id, postId });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const originErr = requireSameOrigin(req, { allowMissingOrigin: false });
  if (originErr) return originErr;

  const { id } = params;
  const postId = String(id ?? "").trim();
  if (!postId) return NextResponse.json({ ok: false, error: "invalid_post_id" }, { status: 400 });

  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  const rateErr = requireRateLimit({
    key: `post-save:${user.id}`,
    limit: 40,
    windowMs: 60_000,
  });
  if (rateErr) return rateErr;

  return clearSaveState({ supa, userId: user.id, postId });
}

async function clearSaveState(args: { supa: any; userId: string; postId: string }) {
  const [delReaction, delCollection] = await Promise.all([
    args.supa
      .from("reactions")
      .delete()
      .eq("post_id", args.postId)
      .eq("user_id", args.userId)
      .eq("kind", "save"),
    args.supa
      .from("user_saved_post_collections")
      .delete()
      .eq("user_id", args.userId)
      .eq("post_id", args.postId),
  ]);
  const collectionDegraded =
    !!delCollection.error && isMissingRelationError(delCollection.error, "user_saved_post_collections");
  if (delReaction.error) {
    return NextResponse.json(
      { ok: false, error: delReaction.error.message ?? "save_delete_failed" },
      { status: 400 }
    );
  }
  if (delCollection.error && !collectionDegraded) {
    return NextResponse.json(
      { ok: false, error: delCollection.error.message ?? "collection_delete_failed" },
      { status: 400 }
    );
  }
  const state = await loadSaveState(args.supa, args.userId, args.postId);
  return NextResponse.json({
    ok: true,
    saved: false,
    postId: args.postId,
    collectionDegraded,
    ...state,
  });
}
