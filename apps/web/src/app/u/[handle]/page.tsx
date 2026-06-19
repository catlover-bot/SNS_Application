// apps/web/src/app/u/[handle]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseClient as getSupabase } from "@/lib/supabase/client";
import FollowButton from "@/components/FollowButton";
import PostCard from "@/components/PostCard";
import ProfileCharacterRadar from "@/components/ProfileCharacterRadar";

type Profile = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
};

export default function UserPage() {
  const configured = isSupabaseConfigured();
  // ✅ Supabase クライアントは 1 回だけ生成
  const supabase = useMemo(() => (configured ? getSupabase() : null), [configured]);

  const params = useParams();
  // useParams() は string | string[] の可能性があるのでガード
  const handleParam = (params as Record<string, unknown>)?.handle as
    | string
    | string[]
    | undefined;

  const handle =
    typeof handleParam === "string"
      ? handleParam
      : Array.isArray(handleParam)
      ? handleParam[0]
      : "";

  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);

  useEffect(() => {
    if (!handle) return;
    if (!supabase) {
      setLoading(false);
      setServiceUnavailable(true);
      return;
    }
    let alive = true;

    (async () => {
      setLoading(true);
      setNotFound(false);
      setServiceUnavailable(false);

      // プロフィール取得
      const p = await supabase
        .from("profiles")
        .select("id, handle, display_name, avatar_url, bio")
        .eq("handle", handle)
        .maybeSingle();

      if (!alive) return;

      if (!p.data) {
        setNotFound(true);
        setProfile(null);
        setPosts([]);
        setLoading(false);
        return;
      }

      setProfile(p.data as Profile);

      // 投稿取得（最新 50 件）
      const r = await supabase
        .from("posts")
        .select("*")
        .eq("author", p.data.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!alive) return;

      setPosts(r.data ?? []);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [handle, supabase]);

  if (!handle) {
    return <div className="p-6 opacity-70">読み込み中…</div>;
  }

  if (loading) {
    return (
      <div className="p-6 opacity-70">
        @{handle} のページを読み込み中…
      </div>
    );
  }

  if (serviceUnavailable) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        データサービスの設定が完了していないため、プロフィールを読み込めません。
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="p-6 space-y-2">
        <h1 className="text-xl font-semibold">@{handle}</h1>
        <p className="text-sm opacity-70">
          このユーザーは見つかりませんでした。
        </p>
      </div>
    );
  }

  const userId = profile.id;

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <img
          src={profile.avatar_url ?? "https://placehold.co/80x80"}
          alt={profile.display_name ?? profile.handle ?? "avatar"}
          className="w-16 h-16 rounded-full border object-cover"
        />
        <div className="min-w-0">
          <div className="text-xl font-semibold truncate">
            {profile.display_name ?? profile.handle ?? `@${handle}`}
          </div>
          <div className="text-sm opacity-70 truncate">@{handle}</div>
        </div>
        <div className="ml-auto">
          {userId && <FollowButton targetId={userId} />}
        </div>
      </div>

      {/* Bio */}
      {profile.bio && (
        <p className="opacity-80 whitespace-pre-wrap break-words">
          {profile.bio}
        </p>
      )}

      {/* ▼ 追加：AI キャラレーダー（投稿全体の AI サマリ） */}
      <ProfileCharacterRadar handle={handle} />

      {/* 投稿一覧 */}
      <section className="space-y-3">
        {posts.length === 0 ? (
          <div className="opacity-70 text-sm">
            @{handle} の投稿はまだありません。
          </div>
        ) : (
          posts.map((p) => <PostCard key={p.id} p={p} />)
        )}
      </section>
    </div>
  );
}
