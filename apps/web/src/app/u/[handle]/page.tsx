"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PostCard from "@/components/PostCard";

type Profile = {
  id: string;
  handle: string;
  display_name: string | null;
  bio: string | null;
};

export default function UserProfile() {
  const params = useParams<{ handle: string }>();
  const handle = params.handle;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    (async () => {
      // プロフィール取得
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("handle", handle)
        .maybeSingle();
      if (!prof) return;
      setProfile(prof);

      // 投稿取得（feed_latest を author で絞る：p.* + s.score）
      const { data: posts } = await supabase
        .from("feed_latest")
        .select("*")
        .eq("author", prof.id)
        .limit(50);
      setItems(posts ?? []);

      // 自分がフォロー済みか
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: rel } = await supabase
        .from("follows")
        .select("*")
        .eq("follower", user.id)
        .eq("followee", prof.id)
        .maybeSingle();
      setFollowing(!!rel);
    })();
  }, [handle]);

  const toggleFollow = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      location.href = `/login?next=/u/${handle}`;
      return;
    }
    if (!profile) return;
    if (following) {
      await supabase
        .from("follows")
        .delete()
        .eq("follower", user.id)
        .eq("followee", profile.id);
      setFollowing(false);
    } else {
      await supabase
        .from("follows")
        .insert({ follower: user.id, followee: profile.id });
      setFollowing(true);
    }
  };

  if (!profile) return <div>ユーザーが見つかりません。</div>;

  return (
    <div className="space-y-4">
      <div className="p-4 border rounded-xl bg-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-bold">
              {profile.display_name ?? profile.handle}
            </div>
            <div className="opacity-60">@{profile.handle}</div>
          </div>
          <button className="border rounded px-3 py-1" onClick={toggleFollow}>
            {following ? "フォロー中" : "フォロー"}
          </button>
        </div>
        {profile.bio && <p className="mt-2 whitespace-pre-wrap">{profile.bio}</p>}
      </div>

      <div className="space-y-3">
        {items.map((p) => (
          <PostCard key={p.id} p={p} />
        ))}
      </div>
    </div>
  );
}
