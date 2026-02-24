import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type PersonaKeyRow = {
  key: string;
  title?: string | null;
  image_url?: string | null;
  icon?: string | null;
};

async function resolveStaticImagePath(baseDir: string, key: string) {
  const candidates = [`${key}.png`, `${key}_legend.png`, `${key}_lite.png`];
  for (const name of candidates) {
    try {
      await fs.access(path.join(baseDir, name));
      return `/persona-images/${encodeURIComponent(name)}`;
    } catch {
      // no-op
    }
  }
  return null;
}

export async function GET() {
  const baseDir = path.join(process.cwd(), "public", "persona-images");
  let supa: any = null;
  let initError: string | null = null;
  try {
    supa = await supabaseServer();
  } catch (e: any) {
    initError = e?.message ?? "supabase_server_init_failed";
  }

  if (!supa) {
    try {
      const names = await fs.readdir(baseDir);
      const keys = Array.from(
        new Set(
          names
            .filter((n) => n.toLowerCase().endsWith(".png"))
            .map((n) => n.replace(/\.png$/i, "").replace(/_(legend|lite)$/i, ""))
        )
      ).sort((a, b) => a.localeCompare(b));
      const rows = keys.map((key) => ({
        key,
        title: key,
        has_static_image: true,
        static_image: `/persona-images/${encodeURIComponent(`${key}.png`)}`,
        api_image: `/api/personas/image/${encodeURIComponent(key)}?title=${encodeURIComponent(key)}`,
        db_image_url: null,
        db_icon: null,
      }));
      return NextResponse.json({
        ok: true,
        source: "filesystem_only",
        total: rows.length,
        static_count: rows.length,
        fallback_count: 0,
        coverage_pct: 100,
        warnings: [initError].filter(Boolean),
        items: rows,
      });
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: initError ?? "supabase_server_init_failed",
        },
        { status: 500 }
      );
    }
  }

  const [archeRes, defsRes] = await Promise.all([
    supa.from("persona_archetype_defs").select("key,title,image_url").limit(2000),
    supa.from("persona_defs").select("key,title,icon").limit(2000),
  ]);

  if (archeRes.error && defsRes.error) {
    try {
      const names = await fs.readdir(baseDir);
      const keys = Array.from(
        new Set(
          names
            .filter((n) => n.toLowerCase().endsWith(".png"))
            .map((n) => n.replace(/\.png$/i, "").replace(/_(legend|lite)$/i, ""))
        )
      ).sort((a, b) => a.localeCompare(b));
      const rows = keys.map((key) => ({
        key,
        title: key,
        has_static_image: true,
        static_image: `/persona-images/${encodeURIComponent(`${key}.png`)}`,
        api_image: `/api/personas/image/${encodeURIComponent(key)}?title=${encodeURIComponent(key)}`,
        db_image_url: null,
        db_icon: null,
      }));
      return NextResponse.json({
        ok: true,
        source: "filesystem_only",
        total: rows.length,
        static_count: rows.length,
        fallback_count: 0,
        coverage_pct: 100,
        warnings: [`persona defs fetch failed: ${archeRes.error.message}; ${defsRes.error.message}`],
        items: rows,
      });
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: `persona defs fetch failed: ${archeRes.error.message}; ${defsRes.error.message}`,
        },
        { status: 500 }
      );
    }
  }

  const byKey = new Map<string, PersonaKeyRow>();
  ((archeRes.data ?? []) as PersonaKeyRow[]).forEach((row) => {
    if (!row?.key) return;
    byKey.set(row.key, {
      key: row.key,
      title: row.title ?? null,
      image_url: row.image_url ?? null,
      icon: null,
    });
  });
  ((defsRes.data ?? []) as PersonaKeyRow[]).forEach((row) => {
    if (!row?.key) return;
    const prev = byKey.get(row.key);
    byKey.set(row.key, {
      key: row.key,
      title: row.title ?? prev?.title ?? null,
      image_url: prev?.image_url ?? null,
      icon: row.icon ?? null,
    });
  });

  const keys = Array.from(byKey.keys()).sort((a, b) => a.localeCompare(b));
  const rows = await Promise.all(
    keys.map(async (key) => {
      const base = byKey.get(key)!;
      const staticImage = await resolveStaticImagePath(baseDir, key);
      return {
        key,
        title: base.title ?? key,
        has_static_image: Boolean(staticImage),
        static_image: staticImage,
        api_image: `/api/personas/image/${encodeURIComponent(key)}?title=${encodeURIComponent(
          base.title ?? key
        )}`,
        db_image_url: base.image_url ?? null,
        db_icon: base.icon ?? null,
      };
    })
  );

  const total = rows.length;
  const staticCount = rows.filter((r) => r.has_static_image).length;
  const fallbackCount = Math.max(0, total - staticCount);
  const coveragePct = total > 0 ? Math.round((staticCount / total) * 1000) / 10 : 0;

  return NextResponse.json({
    ok: true,
    total,
    static_count: staticCount,
    fallback_count: fallbackCount,
    coverage_pct: coveragePct,
    warnings: [
      archeRes.error?.message ?? null,
      defsRes.error?.message ?? null,
    ].filter(Boolean),
    items: rows,
  });
}
