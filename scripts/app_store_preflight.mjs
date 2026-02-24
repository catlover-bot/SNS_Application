#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function hasEnvKey(fileText, key) {
  const re = new RegExp(`^\\s*${key}\\s*=`, "m");
  return re.test(fileText);
}

const failures = [];
const warns = [];

const easPath = path.join(root, "apps/mobile/eas.json");
const easJson = readJson(easPath);
if (!easJson) {
  failures.push("apps/mobile/eas.json is missing");
}
const usesRemoteAppVersion = easJson?.cli?.appVersionSource === "remote";

const appJsonPath = path.join(root, "apps/mobile/app.json");
const appJson = readJson(appJsonPath);
if (!appJson?.expo) {
  failures.push(`missing or invalid JSON: ${appJsonPath}`);
} else {
  const expo = appJson.expo;
  if (!expo.name || expo.name === "mobile") failures.push("apps/mobile/app.json expo.name is not production-ready");
  if (!expo.slug || expo.slug === "mobile") failures.push("apps/mobile/app.json expo.slug is not production-ready");
  if (!expo.ios?.bundleIdentifier) failures.push("apps/mobile/app.json expo.ios.bundleIdentifier is required");
  if (!expo.ios?.buildNumber && !usesRemoteAppVersion) {
    failures.push("apps/mobile/app.json expo.ios.buildNumber is required when appVersionSource is not remote");
  }
  if (!expo.ios?.buildNumber && usesRemoteAppVersion) {
    warns.push("apps/mobile/app.json expo.ios.buildNumber is omitted because appVersionSource=remote");
  }
  if (!expo.android?.package) failures.push("apps/mobile/app.json expo.android.package is required");
  if (!(Number.isInteger(expo.android?.versionCode) && expo.android.versionCode > 0)) {
    failures.push("apps/mobile/app.json expo.android.versionCode must be a positive integer");
  }
}

const mobileEnvPath = path.join(root, "apps/mobile/.env");
const mobileEnv = readText(mobileEnvPath);
if (!mobileEnv) failures.push("apps/mobile/.env is missing");
for (const key of [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_WEB_BASE_URL",
]) {
  if (!hasEnvKey(mobileEnv, key)) failures.push(`apps/mobile/.env missing ${key}`);
}

const webEnvPath = path.join(root, "apps/web/.env.local");
const webEnv = readText(webEnvPath);
if (!webEnv) failures.push("apps/web/.env.local is missing");
for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
  if (!hasEnvKey(webEnv, key)) failures.push(`apps/web/.env.local missing ${key}`);
}

for (const requiredFile of [
  "apps/web/src/app/legal/terms/page.tsx",
  "apps/web/src/app/legal/privacy/page.tsx",
  "apps/web/src/app/legal/guidelines/page.tsx",
  "apps/web/src/app/support/page.tsx",
  "docs/sql/post_open_state.sql",
  "docs/sql/app_store_safety.sql",
  "supabase/migrations/20260221064046_app_store_safety.sql",
  "supabase/migrations/20260221191000_post_open_state.sql",
]) {
  if (!fs.existsSync(path.join(root, requiredFile))) {
    failures.push(`missing required file: ${requiredFile}`);
  }
}

const mobilePkg = readJson(path.join(root, "apps/mobile/package.json"));
if (!mobilePkg?.scripts?.["build:ios:prod"]) warns.push("apps/mobile/package.json missing build:ios:prod script");
if (!mobilePkg?.scripts?.["submit:ios:prod"]) warns.push("apps/mobile/package.json missing submit:ios:prod script");

if (failures.length === 0) {
  console.log("[preflight] PASS: App Store baseline checks passed.");
} else {
  console.log("[preflight] FAIL");
  failures.forEach((f) => console.log(` - ${f}`));
}
if (warns.length > 0) {
  console.log("[preflight] WARN");
  warns.forEach((w) => console.log(` - ${w}`));
}

if (failures.length > 0) process.exit(1);
