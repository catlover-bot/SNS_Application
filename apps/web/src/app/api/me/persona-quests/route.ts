import { NextResponse } from "next/server";
import {
  defaultPersonaCompat,
  findDefaultPersona,
  personaDisplayName,
} from "@/lib/personaCatalog";
import { supabaseServer } from "@/lib/supabase/server";

type UserPersonaRow = {
  persona_key: string;
  score: number | null;
};

type PersonaDefRow = {
  key: string;
  title: string | null;
  talk_style: string | null;
  vibe_tags: string[] | null;
};

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function clamp01(v: number | null | undefined) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export async function GET() {
  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const upRes = await supa
    .from("user_personas")
    .select("persona_key,score")
    .eq("user_id", user.id)
    .order("score", { ascending: false })
    .limit(6);
  const up = (upRes.data ?? []) as UserPersonaRow[];
  const mainKey = up[0]?.persona_key ?? null;

  if (!mainKey) {
    return NextResponse.json({
      quests: [],
      note: "persona_not_ready",
    });
  }

  const compatHighRes = await supa
    .from("persona_compat_norm")
    .select("b,weight")
    .eq("a", mainKey)
    .order("weight", { ascending: false })
    .limit(1)
    .maybeSingle();
  const compatLowRes = await supa
    .from("persona_compat_norm")
    .select("b,weight")
    .eq("a", mainKey)
    .order("weight", { ascending: true })
    .limit(1)
    .maybeSingle();
  const staticCompat = defaultPersonaCompat(mainKey, "friendship", 12);
  const buddyKey = compatHighRes.data?.b ?? staticCompat[0]?.target_key ?? up[1]?.persona_key ?? null;
  const contrastKey =
    compatLowRes.data?.b ?? staticCompat[staticCompat.length - 1]?.target_key ?? up[2]?.persona_key ?? null;

  const personaKeys = [mainKey, buddyKey, contrastKey].filter(Boolean) as string[];
  const defsRes = await supa
    .from("persona_defs")
    .select("key,title,talk_style,vibe_tags")
    .in("key", personaKeys);
  const defs = (defsRes.data ?? []) as PersonaDefRow[];
  personaKeys.forEach((key) => {
    if (defs.some((row) => row.key === key)) return;
    const fallback = findDefaultPersona(key);
    if (fallback) defs.push(fallback);
  });
  const defBy = new Map(defs.map((d) => [d.key, d]));

  const promptRes = await supa
    .from("prompts_of_day")
    .select("title,body,date")
    .eq("date", new Date().toISOString().slice(0, 10))
    .maybeSingle();

  const todayPostsRes = await supa
    .from("posts")
    .select("id,analysis,created_at")
    .eq("author", user.id)
    .gte("created_at", startOfTodayIso())
    .limit(200);
  const todayPosts = todayPostsRes.data ?? [];

  const todayIds = todayPosts.map((p: any) => p.id).filter(Boolean);
  const todayScoreRes =
    todayIds.length > 0
      ? await supa
          .from("post_scores")
          .select("post_id,persona_key,final_score")
          .in("post_id", todayIds)
      : { data: [] as any[] };

  const topByPost = new Map<string, string>();
  (todayScoreRes.data ?? []).forEach((r: any) => {
    if (!r?.post_id || !r?.persona_key) return;
    const cur = topByPost.get(r.post_id);
    if (!cur) {
      topByPost.set(r.post_id, r.persona_key);
      return;
    }
    const existing = (todayScoreRes.data ?? []).find((x: any) => x.post_id === r.post_id && x.persona_key === cur);
    const prevScore = clamp01(existing?.final_score);
    const nextScore = clamp01(r.final_score);
    if (nextScore > prevScore) topByPost.set(r.post_id, r.persona_key);
  });

  const todayHasPersona = (key: string | null) => {
    if (!key) return false;
    return todayPosts.some((p: any) => {
      const selected =
        p?.analysis?.persona?.selected ??
        p?.analysis?.persona?.candidates?.[0]?.key ??
        null;
      if (selected === key) return true;
      return topByPost.get(p.id) === key;
    });
  };

  const mainDef = mainKey ? defBy.get(mainKey) : null;
  const promptTitle = promptRes.data?.title ?? "今日の話題";
  const promptBody = promptRes.data?.body ?? "";
  const mainDisplayName = personaDisplayName(mainKey);
  const buddyDisplayName = buddyKey ? personaDisplayName(buddyKey) : "相性キャラ";
  const contrastDisplayName = contrastKey ? personaDisplayName(contrastKey) : "別キャラ";

  const quests = [
    {
      id: "main_streak",
      kind: "focus",
      title: `主キャラ「${mainDisplayName}」を育てる1投稿`,
      description: "主軸キャラの継続性を伸ばして、レコメンド精度を上げる。",
      xp: 40,
      completed: todayHasPersona(mainKey),
      seed: `【${mainDisplayName}モード】${mainDef?.talk_style ?? "短く明るく"}\n${promptTitle}\n${promptBody}`,
      target_persona_key: mainKey,
      target_persona_title: mainDisplayName,
    },
    {
      id: "contrast_break",
      kind: "contrast",
      title: `別の傾向「${contrastDisplayName}」で視点転換`,
      description: "あえて逆相性キャラで投稿して、会話の幅を広げる。",
      xp: 60,
      completed: todayHasPersona(contrastKey),
      seed: `【視点転換チャレンジ】普段と逆のキャラ目線で語る。\nテーマ: ${promptTitle}`,
      target_persona_key: contrastKey,
      target_persona_title: contrastKey ? contrastDisplayName : null,
    },
    {
      id: "duet_reply",
      kind: "duet",
      title: `相棒キャラ「${buddyDisplayName}」で返信1件`,
      description: "相性の良いキャラと対話すると、反応率が上がりやすい。",
      xp: 55,
      completed: false,
      seed: `【相棒返信】${mainDisplayName} × ${buddyDisplayName}\n短く質問を添えて返信する`,
      target_persona_key: buddyKey,
      target_persona_title: buddyKey ? buddyDisplayName : null,
    },
  ];

  const totalXp = quests
    .filter((q) => q.completed)
    .reduce((acc, q) => acc + q.xp, 0);

  return NextResponse.json({
    date: new Date().toISOString().slice(0, 10),
    total_xp: totalXp,
    quests,
  });
}
