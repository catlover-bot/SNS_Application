// apps/web/src/components/FollowButton.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseClient } from "@/lib/supabase/client";

type Props = { targetId: string };

/**
 * supabaseClient が「関数（factory）」でも「インスタンス（singleton）」でも動くように吸収
 */
function useSupabaseStable() {
  const configured = isSupabaseConfigured();
  // 1回だけ安定化して取得
  return useMemo(() => {
    if (!configured) return null;
    const anyVal = supabaseClient as any;
    return typeof anyVal === "function" ? anyVal() : anyVal;
  }, [configured]);
}

export default function FollowButton({ targetId }: Props) {
  const supabase = useSupabaseStable();

  const [me, setMe] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!targetId || !supabase) return;
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
    if (busy || !supabase) return;
    setBusy(true);
    setError(null);
    const prev = following;
    setFollowing((cur) => !cur);
    try {
      const { data, error } = await supabase.rpc("toggle_follow", { target: targetId });
      if (error) throw error;
      setFollowing(!!data);
    } catch {
      setFollowing(prev);
      setError("フォロー状態を更新できませんでした。時間をおいて再度お試しください。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={toggle}
        className={`px-3 py-1 rounded border text-sm ${following ? "bg-gray-50" : "bg-blue-600 text-white"}`}
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? "更新中…" : following ? "フォロー中" : "フォロー"}
      </button>
      {error && <span className="text-xs text-rose-700">{error}</span>}
    </div>
  );
}
