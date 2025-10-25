// apps/web/src/lib/supabase.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

// Dev の HMR でも 1 インスタンスに保つ
const g = globalThis as unknown as { __supabase?: SupabaseClient };

export const supabase: SupabaseClient =
  g.__supabase ??
  createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    // 必要に応じて Realtime/DB のオプションもここで指定可
    // realtime: { params: { eventsPerSecond: 5 } },
    // db: { schema: "public" },
  });

g.__supabase ??= supabase;
