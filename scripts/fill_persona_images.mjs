#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

function readFlag(name) {
  return process.argv.includes(`--${name}`);
}

function readOption(name, def) {
  const key = `--${name}`;
  const idx = process.argv.indexOf(key);
  if (idx < 0) return def;
  return process.argv[idx + 1] ?? def;
}

function toInt(v, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(0, Math.floor(n));
}

function safeKey(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/[^0-9a-zA-Z_-]+/g, "_");
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const baseUrl = String(readOption("base-url", process.env.WEB_BASE_URL || "http://localhost:3000")).replace(/\/$/, "");
  const coveragePath = String(readOption("coverage-path", "/api/personas/image-coverage"));
  const outDirRel = String(readOption("out-dir", "apps/web/public/persona-images"));
  const limit = toInt(readOption("limit", "0"), 0);
  const overwrite = readFlag("overwrite");
  const dryRun = readFlag("dry-run");
  const includeAll = readFlag("all");

  const coverageUrl = new URL(coveragePath, `${baseUrl}/`).toString();
  console.log(`[persona-images] coverage: ${coverageUrl}`);

  const coverageRes = await fetch(coverageUrl, {
    headers: { accept: "application/json" },
  });
  if (!coverageRes.ok) {
    const body = await coverageRes.text().catch(() => "");
    throw new Error(`coverage API failed: ${coverageRes.status} ${coverageRes.statusText}\n${body}`);
  }

  const coverage = await coverageRes.json();
  const items = Array.isArray(coverage?.items) ? coverage.items : [];
  const sourceAll = includeAll ? items : items.filter((x) => !x?.has_static_image);
  const missingAll = items.filter((x) => !x?.has_static_image);
  const targets = limit > 0 ? sourceAll.slice(0, limit) : sourceAll;

  const outDir = path.resolve(process.cwd(), outDirRel);
  await fs.mkdir(outDir, { recursive: true });

  console.log(
    `[persona-images] total=${items.length} missing=${missingAll.length} target=${targets.length} mode=${
      includeAll ? "all" : "missing_only"
    } out=${outDir}`
  );

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of targets) {
    const key = safeKey(item?.key);
    if (!key) continue;

    const dst = path.join(outDir, `${key}.png`);
    if (!overwrite && (await exists(dst))) {
      skipped += 1;
      console.log(`[skip] ${key} already exists`);
      continue;
    }

    const apiImageUrl = new URL(String(item?.api_image ?? `/api/personas/image/${encodeURIComponent(key)}`), `${baseUrl}/`).toString();
    if (dryRun) {
      generated += 1;
      console.log(`[dry-run] ${key} <= ${apiImageUrl}`);
      continue;
    }

    try {
      const imgRes = await fetch(apiImageUrl);
      if (!imgRes.ok) {
        throw new Error(`${imgRes.status} ${imgRes.statusText}`);
      }
      const buf = Buffer.from(await imgRes.arrayBuffer());
      await sharp(buf)
        .resize(800, 800, { fit: "cover" })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toFile(dst);
      generated += 1;
      console.log(`[ok] ${key} -> ${path.relative(process.cwd(), dst)}`);
    } catch (e) {
      failed += 1;
      console.error(`[failed] ${key}: ${(e && e.message) || e}`);
    }
  }

  console.log(
    `[persona-images] done generated=${generated} skipped=${skipped} failed=${failed} dryRun=${dryRun}`
  );
  if (failed > 0) process.exitCode = 2;
}

main().catch((e) => {
  console.error(`[persona-images] fatal: ${e?.message ?? e}`);
  process.exitCode = 1;
});
