"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Reset() {
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) setMsg("繝ｪ繝ｳ繧ｯ縺ｮ譛牙柑譛滄剞縺悟・繧後※縺・ｋ蜿ｯ閭ｽ諤ｧ縺後≠繧翫∪縺吶・);
    });
  }, []);

  const onSave = async () => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setMsg(error.message);
    else setMsg("繝代せ繝ｯ繝ｼ繝峨ｒ譖ｴ譁ｰ縺励∪縺励◆縲・login 縺九ｉ繧ｵ繧､繝ｳ繧､繝ｳ縺励※縺上□縺輔＞縲・);
  };

  return (
    <div className="max-w-md mx-auto p-6 space-y-3">
      <h1 className="text-2xl font-bold">繝代せ繝ｯ繝ｼ繝牙・險ｭ螳・/h1>
      <input
        className="border rounded p-2 w-full"
        placeholder="譁ｰ縺励＞繝代せ繝ｯ繝ｼ繝・
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button className="border rounded px-4 py-2" onClick={onSave}>
        菫晏ｭ・
      </button>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
