// apps/web/src/app/search/page.tsx
"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Search() {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<any[]>([]);

  async function run() {
    const { data, error } = await supabase.rpc("search_profiles", { q });
    if (!error) setUsers(data || []);
  }
  useEffect(() => { run(); }, []); // 初期

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input className="border p-2 rounded flex-1" value={q} onChange={(e)=>setQ(e.target.value)} placeholder="ユーザー名/表示名で検索" />
        <button onClick={run} className="px-3 py-2 border rounded">検索</button>
      </div>
      <ul className="space-y-2">
        {users.map(u=>(
          <li key={u.id} className="p-3 border rounded flex gap-3 items-center">
            <img src={u.avatar_url || "/default-avatar.svg"} className="w-10 h-10 rounded-full border" />
            <div className="flex-1">
              <a className="font-medium hover:underline" href={`/user/${u.username || u.id}`}>{u.display_name || u.username || "無名"}</a>
              <div className="opacity-60">@{u.username || String(u.id).slice(0,8)}</div>
              {u.bio && <div className="opacity-70 text-sm">{u.bio}</div>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
