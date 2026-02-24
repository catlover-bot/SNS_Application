import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type PersonaDefRow = {
  key: string;
  title: string | null;
  theme: string | null;
  blurb: string | null;
  talk_style: string | null;
  relation_style: string | null;
  vibe_tags: string[] | null;
};

function clampInt(v: string | null, min: number, max: number, def: number) {
  const n = Number(v ?? "");
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function normalizeText(raw: string) {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(raw: string) {
  const normalized = normalizeText(raw);
  const words = normalized.split(" ").map((x) => x.trim()).filter(Boolean);
  const dense = normalized.replace(/\s+/g, "");
  const bi: string[] = [];
  for (let i = 0; i < dense.length - 1; i += 1) {
    bi.push(dense.slice(i, i + 2));
  }
  return uniq([...words, ...bi]).filter((x) => x.length >= 2);
}

function scorePersona(textTokens: string[], row: PersonaDefRow) {
  const fields = [
    row.key,
    row.title ?? "",
    row.theme ?? "",
    row.blurb ?? "",
    row.talk_style ?? "",
    row.relation_style ?? "",
    ...(row.vibe_tags ?? []),
  ];
  const merged = normalizeText(fields.join(" "));
  const tags = (row.vibe_tags ?? []).map((x) => normalizeText(x)).filter(Boolean);

  let score = 0;
  const reasons: string[] = [];

  textTokens.forEach((t) => {
    if (merged.includes(t)) {
      score += 1.15;
      reasons.push(t);
    }
    if (tags.some((tag) => tag.includes(t) || t.includes(tag))) {
      score += 0.75;
      reasons.push(t);
    }
  });

  // キー一致は強く効かせる
  if (textTokens.some((t) => row.key.includes(t) || t.includes(row.key))) {
    score += 1.8;
    reasons.push(row.key);
  }

  return {
    key: row.key,
    title: row.title ?? row.key,
    score,
    reasonTokens: uniq(reasons).slice(0, 6),
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const text = String(body?.text ?? "").trim();
  const limit = clampInt(String(body?.limit ?? "6"), 1, 20, 6);

  if (!text) {
    return NextResponse.json({ items: [] });
  }

  const tokens = tokenize(text);
  if (!tokens.length) {
    return NextResponse.json({ items: [] });
  }

  const supa = await supabaseServer();
  const defsRes = await supa
    .from("persona_defs")
    .select("key,title,theme,blurb,talk_style,relation_style,vibe_tags")
    .limit(500);

  const rows = (defsRes.data ?? []) as PersonaDefRow[];
  if (!rows.length) {
    return NextResponse.json({ items: [] });
  }

  const ranked = rows
    .map((row) => scorePersona(tokens, row))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return NextResponse.json({ items: ranked });
}
