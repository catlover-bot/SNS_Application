// apps/web/src/lib/supabase/client.ts
"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBuildSafeConfig } from "./config";

function resolveSupabaseBrowserConfig() {
  const config = getSupabaseBuildSafeConfig();
  if (config) return config;
  throw new Error("Supabase is not configured for this web runtime.");
}

export function supabaseClient(): SupabaseClient {
  const { url, anonKey } = resolveSupabaseBrowserConfig();
  return createBrowserClient(url, anonKey);
}
