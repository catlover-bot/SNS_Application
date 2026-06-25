import { NextRequest, NextResponse } from "next/server";
import { findDefaultPersona } from "@/lib/personaCatalog";
import { getPersonaBaseImageSrc } from "@/lib/personaImages";

function normalizeKey(raw: string) {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key: rawKey } = await params;
  const key = normalizeKey(rawKey ?? "");
  const persona = findDefaultPersona(key);

  if (!persona) {
    return NextResponse.json({ ok: false, error: "persona_not_found" }, { status: 404 });
  }

  return NextResponse.redirect(new URL(getPersonaBaseImageSrc(persona.key), req.url), 307);
}
