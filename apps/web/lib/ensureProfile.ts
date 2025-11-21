import { supabase } from "./supabase";

export async function ensureProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: exist } = await supabase
    .from("profiles").select("id").eq("id", user.id).maybeSingle();

  if (!exist) {
    await supabase.from("profiles").insert({
      id: user.id,
      handle: user.email?.split("@")[0] ?? `user_${user.id.slice(0,6)}`,
      display_name: user.user_metadata?.name ?? "No name"
    });
  }
  return user.id;
}
