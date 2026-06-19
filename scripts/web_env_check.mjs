#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const envFiles = [
  path.join(repoRoot, "apps", "web", ".env.local"),
  path.join(repoRoot, "apps", "web", ".env"),
  path.join(repoRoot, ".env.local"),
  path.join(repoRoot, ".env"),
];

const groups = [
  {
    title: "Required for real authenticated Web QA",
    level: "required",
    vars: [
      {
        name: "NEXT_PUBLIC_SUPABASE_URL",
        note: "Supabase project URL used by the Web client.",
      },
      {
        name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        note: "Supabase anon key used by the Web client.",
      },
    ],
  },
  {
    title: "Recommended for stable local Web checks",
    level: "recommended",
    vars: [
      {
        name: "NEXT_PUBLIC_BASE_URL",
        note: "Helps server-rendered routes call local APIs consistently.",
      },
      {
        name: "NEXT_PUBLIC_SITE_URL",
        note: "Optional same-origin allowlist value for protected write APIs.",
      },
    ],
  },
  {
    title: "Optional AI-assisted demo features",
    level: "optional",
    vars: [
      {
        name: "LLM_API_BASE_URL",
        note: "Needed only when testing AI summary/dialogue provider calls.",
      },
      {
        name: "LLM_API_KEY",
        note: "Needed only when testing AI summary/dialogue provider calls.",
      },
      {
        name: "LLM_MODEL_NAME",
        note: "Optional model override for AI summary/dialogue calls.",
      },
    ],
  },
  {
    title: "Optional internal/admin access",
    level: "optional",
    vars: [
      {
        name: "WEB_ADMIN_EMAILS",
        note: "Comma-separated admin email allowlist for internal dashboards.",
      },
      {
        name: "WEB_INTERNAL_ROUTES",
        note: "Local dev-only flag; leave unset unless intentionally testing internal routes.",
      },
      {
        name: "ENABLE_INTERNAL_DASHBOARDS",
        note: "Compatibility placeholder; the current Web proxy does not require it.",
      },
      {
        name: "INTERNAL_API_SECRET",
        note: "Compatibility placeholder; not required for the current Web QA flow.",
      },
    ],
  },
];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return new Map();
  const out = new Map();
  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const eq = normalized.indexOf("=");
    if (eq <= 0) continue;
    const key = normalized.slice(0, eq).trim();
    const value = normalized.slice(eq + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    out.set(key, value.length > 0);
  }
  return out;
}

const fileMaps = envFiles.map((filePath) => ({
  filePath,
  relPath: path.relative(repoRoot, filePath) || filePath,
  vars: parseEnvFile(filePath),
}));

function presenceFor(name) {
  if (typeof process.env[name] === "string" && process.env[name]?.trim()) {
    return { present: true, source: "process environment" };
  }
  const file = fileMaps.find((entry) => entry.vars.get(name));
  if (file) return { present: true, source: file.relPath };
  return { present: false, source: null };
}

function printGroup(group) {
  console.log(`\n${group.title}`);
  for (const item of group.vars) {
    const found = presenceFor(item.name);
    const marker = found.present ? "ok" : group.level === "required" ? "missing" : "not set";
    const source = found.present ? ` (${found.source})` : "";
    console.log(`- ${marker}: ${item.name}${source}`);
    console.log(`  ${item.note}`);
  }
}

console.log("Web authenticated QA environment check");
console.log("No environment values are printed by this script.");
console.log(
  `Checked: process environment, ${fileMaps.map((entry) => entry.relPath).join(", ")}`
);

let missingRequired = 0;
for (const group of groups) {
  printGroup(group);
  if (group.level === "required") {
    missingRequired += group.vars.filter((item) => !presenceFor(item.name).present).length;
  }
}

if (missingRequired > 0) {
  console.log(
    `\nMissing ${missingRequired} required variable${missingRequired === 1 ? "" : "s"}.`
  );
  console.log(
    "Add the missing names to apps/web/.env.local or export them in your shell before running authenticated QA."
  );
  process.exit(1);
}

console.log("\nRequired Web environment is present for authenticated QA.");
