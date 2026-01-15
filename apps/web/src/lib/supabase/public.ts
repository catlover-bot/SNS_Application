import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cookie不要の「公開読み取り」用クライアント（anon key）
export function supabasePublic(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
