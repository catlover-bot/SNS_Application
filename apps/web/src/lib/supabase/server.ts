// apps/web/src/lib/supabase/server.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Next.js のバージョン差で cookies() が sync/async の両パターンがある。
 * どちらでも動くように吸収してから Supabase クライアントを返す。
 */
export async function supabaseServer(): Promise<SupabaseClient> {
  // cookies() が Promise の場合と、同期オブジェクトの場合を両対応
  const maybe = cookies() as any;
  const bag = typeof maybe?.then === "function" ? await maybe : maybe;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(url, anon, {
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
