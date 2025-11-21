"use client";

import { supabaseClient } from "@/lib/supabase/client";

/**
 * ログイン済みユーザーの profiles 行を必ず用意するユーティリティ。
 * - 未ログイン: null を返す
 * - ログイン済み: 必要なら profiles を作成して user.id を返す
 */
export async function ensureProfile(): Promise<string | null> {
  const supabase = supabaseClient();

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return null;

  // 既存チェック
  const { data: exist } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!exist) {
    const defaultHandle =
      user.email?.split("@")[0] ?? `user_${user.id.slice(0, 6)}`;
    const display =
      (user.user_metadata as any)?.name ??
      (user.user_metadata as any)?.full_name ??
      defaultHandle;

    // 作成（RLS の影響を受けるので policies は要確認）
    await supabase.from("profiles").insert({
      id: user.id,
      handle: defaultHandle,
      display_name: display,
    });
  }

  return user.id;
}
