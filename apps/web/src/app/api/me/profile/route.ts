import { NextResponse } from "next/server";
import {
  requireRateLimit,
  requireSameOrigin,
  safeJsonError,
} from "@/lib/apiSecurity";
import { supabaseServer } from "@/lib/supabase/server";

const PROFILE_FIELDS = "id,handle,display_name,bio,avatar_url,updated_at";
const FRIENDLY_FALLBACK_NAME = "新米恐竜使い";

type ProfileRow = {
  id: string;
  handle: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  updated_at: string | null;
};

function cleanOptionalText(value: unknown, maxLength: number) {
  if (value == null) return null;
  const cleaned = String(value).trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

function defaultDisplayName(user: { user_metadata?: Record<string, unknown> | null }) {
  const metadata = user.user_metadata ?? {};
  return (
    cleanOptionalText(metadata.display_name, 50) ??
    cleanOptionalText(metadata.full_name, 50) ??
    cleanOptionalText(metadata.name, 50) ??
    FRIENDLY_FALLBACK_NAME
  );
}

function publicProfile(row: ProfileRow) {
  return {
    display_name: cleanOptionalText(row.display_name, 50) ?? FRIENDLY_FALLBACK_NAME,
    handle: cleanOptionalText(row.handle, 20),
    avatar_url: cleanOptionalText(row.avatar_url, 2048),
    bio: cleanOptionalText(row.bio, 300),
    updated_at: row.updated_at ?? null,
  };
}

function profileResponse(row: ProfileRow) {
  return NextResponse.json(
    { profile: publicProfile(row) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

async function loadOrCreateProfile(
  supa: Awaited<ReturnType<typeof supabaseServer>>,
  user: { id: string; user_metadata?: Record<string, unknown> | null }
) {
  const current = await supa
    .from("profiles")
    .select(PROFILE_FIELDS)
    .eq("id", user.id)
    .maybeSingle();

  if (current.error) return { row: null, error: true } as const;
  if (current.data) return { row: current.data as ProfileRow, error: false } as const;

  const created = await supa
    .from("profiles")
    .upsert(
      {
        id: user.id,
        display_name: defaultDisplayName(user),
      },
      { onConflict: "id" }
    )
    .select(PROFILE_FIELDS)
    .single();

  if (created.error || !created.data) return { row: null, error: true } as const;
  return { row: created.data as ProfileRow, error: false } as const;
}

export async function GET() {
  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();

  if (!user) return safeJsonError("not_authenticated", 401);

  const result = await loadOrCreateProfile(supa, user);
  if (result.error || !result.row) return safeJsonError("profile_unavailable", 500);

  return profileResponse(result.row);
}

export async function PATCH(req: Request) {
  const originError = requireSameOrigin(req);
  if (originError) return originError;

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 16_384) {
    return safeJsonError("profile_payload_too_large", 413);
  }

  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();

  if (!user) return safeJsonError("not_authenticated", 401);

  const rateLimitError = requireRateLimit({
    key: `profile-update:${user.id}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (rateLimitError) return rateLimitError;

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return safeJsonError("invalid_json", 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return safeJsonError("invalid_json", 400);
  }

  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
  if (!["display_name", "handle", "bio", "avatar_url"].some(has)) {
    return safeJsonError("profile_fields_required", 400);
  }

  const existing = await loadOrCreateProfile(supa, user);
  if (existing.error || !existing.row) return safeJsonError("profile_unavailable", 500);

  const next = {
    id: user.id,
    display_name: existing.row.display_name ?? defaultDisplayName(user),
    handle: existing.row.handle,
    bio: existing.row.bio,
    avatar_url: existing.row.avatar_url,
  };

  if (has("display_name")) {
    const raw = String(body.display_name ?? "").trim();
    if (raw.length > 50) return safeJsonError("display_name_too_long", 400);
    next.display_name = cleanOptionalText(raw, 50) ?? FRIENDLY_FALLBACK_NAME;
  }

  if (has("handle")) {
    const raw = String(body.handle ?? "").trim().replace(/^@+/, "");
    if (raw && !/^[A-Za-z0-9_]{3,20}$/.test(raw)) {
      return safeJsonError("invalid_handle", 400);
    }
    next.handle = raw || null;
  }

  if (has("bio")) {
    const raw = String(body.bio ?? "").trim();
    if (raw.length > 300) return safeJsonError("bio_too_long", 400);
    next.bio = cleanOptionalText(raw, 300);
  }

  if (has("avatar_url")) {
    const raw = String(body.avatar_url ?? "").trim();
    if (raw.length > 2048) return safeJsonError("avatar_url_too_long", 400);
    if (raw && !/^https?:\/\//i.test(raw)) return safeJsonError("invalid_avatar_url", 400);
    next.avatar_url = raw || null;
  }

  const saved = await supa
    .from("profiles")
    .upsert(next, { onConflict: "id" })
    .select(PROFILE_FIELDS)
    .single();

  if (saved.error || !saved.data) {
    if (saved.error?.code === "23505") return safeJsonError("handle_already_used", 409);
    return safeJsonError("profile_save_failed", 500);
  }

  return profileResponse(saved.data as ProfileRow);
}
