import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseRuntimeConfig } from "./config";

// Cookie不要の「公開読み取り」用クライアント（anon key）
export function supabasePublic(): SupabaseClient {
  const config = getSupabaseRuntimeConfig();
  if (!config) throw new Error("SUPABASE_NOT_CONFIGURED");
  return createClient(config.url, config.anonKey);
}
