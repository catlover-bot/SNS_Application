// apps/web/src/lib/supabase/server.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/** 呼び出し側で await して使ってください（トップレベルで呼ばない） */
export async function supabaseServer(): Promise<SupabaseClient> {
  const bag = await cookies(); // ✅ await 必須

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return bag.get(name)?.value ?? null;
        },
        set() {
          /* 必要になったら NextResponse で実装 */
        },
        remove() {
          /* 必要になったら NextResponse で実装 */
        },
      },
    }
  );
}
