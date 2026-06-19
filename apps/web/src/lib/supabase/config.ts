const BUILD_TIME_SUPABASE_URL = "https://placeholder.supabase.co";
const BUILD_TIME_SUPABASE_ANON_KEY = "placeholder-anon-key";

export const SUPABASE_UNAVAILABLE_MESSAGE =
  "PersonaLens is not connected to its data service in this environment.";

export type SupabaseRuntimeConfig = {
  url: string;
  anonKey: string;
};

export function getSupabaseRuntimeConfig(): SupabaseRuntimeConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function getSupabaseBuildSafeConfig(): SupabaseRuntimeConfig | null {
  return (
    getSupabaseRuntimeConfig() ??
    (typeof window === "undefined"
      ? {
          url: BUILD_TIME_SUPABASE_URL,
          anonKey: BUILD_TIME_SUPABASE_ANON_KEY,
        }
      : null)
  );
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseRuntimeConfig());
}
