import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

function sanitizeKey(raw: string) {
  const cleaned = raw.trim().replace(/[^0-9a-zA-Z_-]+/g, "_");
  return cleaned || "unknown_persona";
}

function hashInt(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function clamp(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function rand(seed: number, idx: number) {
  const x = Math.sin(seed * (idx + 1) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function escapeXml(raw: string) {
  return String(raw ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function initialsFromKey(key: string) {
  const parts = key.split(/[_-]+/g).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  const plain = key.replace(/[_-]+/g, "");
  return plain.slice(0, 2).toUpperCase() || "P";
}

type MotifKind = "chaos" | "nature" | "logic" | "show" | "hybrid";

function detectMotif(key: string, title?: string | null): MotifKind {
  const text = `${key} ${(title ?? "").trim()}`.toLowerCase();
  if (/(chaos|wink|trick|tease|magus|comic|wild|juggler)/.test(text)) return "chaos";
  if (/(garden|gentle|soft|peace|tide|yielder|keeper|anchor)/.test(text)) return "nature";
  if (/(puzzle|judge|sage|engineer|prof|detective|try|why|curator|sculptor)/.test(text)) {
    return "logic";
  }
  if (/(chef|spice|buzz|host|summoner|afterparty|mood)/.test(text)) return "show";
  return "hybrid";
}

function motifLayer(kind: MotifKind, hash: number) {
  if (kind === "chaos") {
    return [
      `<path d="M90 498 L226 344 L350 488 L478 302 L618 456 L720 334" stroke="rgba(255,255,255,0.38)" stroke-width="20" fill="none" stroke-linecap="round"/>`,
      `<polygon points="402,188 440,278 540,286 462,350 484,448 402,398 320,448 342,350 264,286 364,278" fill="rgba(255,255,255,0.22)"/>`,
      `<circle cx="174" cy="220" r="${48 + Math.floor(rand(hash, 4) * 26)}" fill="rgba(255,255,255,0.15)"/>`,
    ].join("");
  }
  if (kind === "nature") {
    return [
      `<path d="M168 586 C236 486, 358 466, 430 536 C496 600, 586 620, 680 562" stroke="rgba(255,255,255,0.42)" stroke-width="16" fill="none" stroke-linecap="round"/>`,
      `<ellipse cx="282" cy="266" rx="56" ry="34" transform="rotate(-28 282 266)" fill="rgba(255,255,255,0.2)"/>`,
      `<ellipse cx="544" cy="246" rx="62" ry="36" transform="rotate(22 544 246)" fill="rgba(255,255,255,0.2)"/>`,
      `<ellipse cx="640" cy="470" rx="42" ry="24" transform="rotate(-18 640 470)" fill="rgba(255,255,255,0.16)"/>`,
    ].join("");
  }
  if (kind === "logic") {
    const grid = Array.from({ length: 6 }).map((_, i) => {
      const x = 166 + i * 82;
      const y = 174 + (i % 2) * 14;
      return `<rect x="${x}" y="${y}" width="64" height="64" rx="16" fill="rgba(255,255,255,0.18)"/>`;
    });
    return `${grid.join("")}<circle cx="608" cy="546" r="62" stroke="rgba(255,255,255,0.34)" stroke-width="14" fill="none"/><circle cx="608" cy="546" r="14" fill="rgba(255,255,255,0.34)"/>`;
  }
  if (kind === "show") {
    return [
      `<circle cx="402" cy="278" r="170" fill="rgba(255,255,255,0.14)"/>`,
      `<path d="M142 612 C252 478, 560 476, 662 612 L662 676 L142 676 Z" fill="rgba(255,255,255,0.19)"/>`,
      `<path d="M256 652 L342 542 L420 652 Z" fill="rgba(255,255,255,0.26)"/>`,
      `<path d="M384 652 L470 522 L558 652 Z" fill="rgba(255,255,255,0.3)"/>`,
    ].join("");
  }
  return [
    `<circle cx="402" cy="404" r="240" stroke="rgba(255,255,255,0.2)" stroke-width="10" fill="none"/>`,
    `<circle cx="402" cy="404" r="172" stroke="rgba(255,255,255,0.28)" stroke-width="10" fill="none"/>`,
    `<path d="M184 504 C250 414, 368 378, 468 436 C556 486, 612 474, 690 410" stroke="rgba(255,255,255,0.36)" stroke-width="16" fill="none" stroke-linecap="round"/>`,
  ].join("");
}

function buildSvg(key: string, title?: string | null) {
  const hash = hashInt(key);
  const hueA = hash % 360;
  const hueB = (hash * 7 + 53) % 360;
  const hueC = (hash * 11 + 131) % 360;
  const chip = initialsFromKey(title?.trim() || key);
  const text = escapeXml((title?.trim() || key).slice(0, 24));
  const motif = detectMotif(key, title);
  const orbitCount = 4;
  const orbits = Array.from({ length: orbitCount }).map((_, i) => {
    const x = 140 + Math.floor(rand(hash, i) * 520);
    const y = 140 + Math.floor(rand(hash, i + 20) * 520);
    const r = 32 + Math.floor(rand(hash, i + 40) * 54);
    const opacity = clamp(0.08 + rand(hash, i + 80) * 0.12, 0.08, 0.22);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="rgba(255,255,255,${opacity.toFixed(3)})"/>`;
  });
  const chipEscaped = escapeXml(chip);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="hsl(${hueA} 78% 58%)"/>
      <stop offset="55%" stop-color="hsl(${hueB} 74% 52%)"/>
      <stop offset="100%" stop-color="hsl(${hueC} 68% 48%)"/>
    </linearGradient>
    <radialGradient id="shine" cx="20%" cy="14%" r="70%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.38)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
    <linearGradient id="badge" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.95)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0.75)"/>
    </linearGradient>
  </defs>
  <rect width="800" height="800" rx="88" fill="url(#g)"/>
  <rect width="800" height="800" rx="88" fill="url(#shine)"/>
  ${orbits.join("")}
  ${motifLayer(motif, hash)}
  <rect x="76" y="76" width="648" height="648" rx="80" fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.24)" stroke-width="4"/>
  <circle cx="400" cy="378" r="150" fill="url(#badge)" />
  <circle cx="400" cy="378" r="150" fill="none" stroke="rgba(255,255,255,0.34)" stroke-width="6"/>
  <text x="400" y="434" text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI" font-size="160" font-weight="800" fill="rgba(21,33,56,0.9)">${chipEscaped}</text>
  <rect x="164" y="560" width="472" height="96" rx="48" fill="rgba(16,24,40,0.28)"/>
  <text x="400" y="620" text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI" font-size="38" font-weight="600" fill="rgba(255,255,255,0.94)">${text}</text>
</svg>`;
}

async function findStaticImage(key: string) {
  const baseDir = path.join(process.cwd(), "public", "persona-images");
  const candidates = [`${key}.png`, `${key}_legend.png`, `${key}_lite.png`];

  for (const name of candidates) {
    try {
      await fs.access(path.join(baseDir, name));
      return `/persona-images/${encodeURIComponent(name)}`;
    } catch {
      // noop
    }
  }
  return null;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> } | { params: { key: string } }
) {
  const params = "then" in ctx.params ? await ctx.params : ctx.params;
  let raw = params.key ?? "";
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // keep raw
  }
  const key = sanitizeKey(raw);
  const title = req.nextUrl.searchParams.get("title");

  const staticPath = await findStaticImage(key);
  if (staticPath) {
    return NextResponse.redirect(new URL(staticPath, req.url), 307);
  }

  const svg = buildSvg(key, title);
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
