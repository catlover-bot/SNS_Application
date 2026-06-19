import { createClient } from "@supabase/supabase-js";
import { getSupabaseBuildSafeConfig } from "../src/lib/supabase/config";

const config = getSupabaseBuildSafeConfig();
if (!config) throw new Error("Supabase is not configured for this web runtime.");

export const supabase = createClient(
  config.url,
  config.anonKey
);
