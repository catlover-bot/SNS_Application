// apps/web/src/components/FollowButton.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabase/client";

type Props = { targetId: string };

/**
 * supabaseClient が「関数（factory）」でも「インスタンス（singleton）」でも動くように吸収
 */
function useSupabaseStable() {
  // 1回だけ安定化して取得
  return useMemo(() => {
    const anyVal = supabaseClient as any;
    return typeof anyVal === "function" ? anyVal() : anyVal;
  }, []);
}

export default function FollowButton({ targetId }: Props) {
  const supabase = useSupabaseStable();

  const [me, setMe] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!targetId) return;
    let alive = true;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!alive) return;

      setMe(user?.id ?? null);
      if (!user || user.id === targetId) return;

      const { data, error } = await supabase
        .from("follows")
        .select("follower")
        .eq("follower", user.id)
        .eq("followee", targetId)
        .maybeSingle();

      if (!alive) return;
      if (!error) setFollowing(!!data);
    })();

    return () => { alive = false; };
  }, [supabase, targetId]);

  if (!me || me === targetId) return null;

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("toggle_follow", { target: targetId });
    if (!error) setFollowing(!!data);
    setBusy(false);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={`px-3 py-1 rounded border text-sm ${following ? "bg-gray-50" : "bg-blue-600 text-white"}`}
      disabled={busy}
      aria-busy={busy}
    >
      {following ? "フォロー中" : "フォロー"}
    </button>
  );
}
