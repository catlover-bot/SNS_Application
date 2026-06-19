// apps/web/src/lib/supabase/server.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseRuntimeConfig } from "./config";

/**
 * Next.js のバージョン差で cookies() が sync/async の両パターンがある。
 * どちらでも動くように吸収してから Supabase クライアントを返す。
 */
export async function supabaseServer(): Promise<SupabaseClient> {
  // cookies() が Promise の場合と、同期オブジェクトの場合を両対応
  const maybe = cookies() as any;
  const bag = typeof maybe?.then === "function" ? await maybe : maybe;

  const config = getSupabaseRuntimeConfig();
  if (!config) throw new Error("SUPABASE_NOT_CONFIGURED");

  return createServerClient(config.url, config.anonKey, {
    cookies: {
      get(name: string) {
        return bag.get(name)?.value ?? null;
      },
      // このモジュールでは読み取り専用で十分
      set() {},
      remove() {},
    },
  });
}
