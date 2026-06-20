// apps/web/src/app/api/me/soulmates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { safeJsonError } from "@/lib/apiSecurity";
import { findDefaultPersona } from "@/lib/personaCatalog";
import { supabaseServer } from "@/lib/supabase/server";

type Row = {
  target_user_id: string;
  target_persona_key: string;
  romance_score: number;
  relation_label: string | null;
};

type ProfileRow = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type PersonaDefRow = {
  key: string;
  title: string | null;
};

function clampInt(value: string | null, min: number, max: number, fallback: number) {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function isMissingSoulmatesRpc(error: any) {
  if (String(error?.code ?? "").trim() === "PGRST202") return true;
  const text = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  return text.includes("recommend_soulmates") &&
    (text.includes("could not find") || text.includes("not found") || text.includes("schema cache"));
}

export async function GET(req: NextRequest) {
  // supabaseServer が Promise / そのまま の両方に対応するラッパ
  const supabaseMaybe = supabaseServer() as any;
  const supabase =
    typeof supabaseMaybe.then === "function"
      ? await supabaseMaybe
      : supabaseMaybe;

  // ログインユーザー
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const p_limit = clampInt(searchParams.get("limit"), 1, 100, 20);
  const p_offset = clampInt(searchParams.get("offset"), 0, 1000, 0);

  // ① ソウルメイト候補の生データ
  const { data, error } = await supabase.rpc("recommend_soulmates", {
    p_user_id: user.id,
    p_limit,
    p_offset,
  });

  if (error) {
    if (isMissingSoulmatesRpc(error)) {
      console.warn("[soulmates] recommendation RPC unavailable; returning an empty result");
      return NextResponse.json({ soulmates: [], degraded: true });
    }
    console.error("[soulmates] recommendation RPC failed", {
      code: String(error?.code ?? "unknown"),
    });
    return safeJsonError("soulmates_unavailable", 500, { soulmates: [] });
  }

  const rows = (data ?? []) as Row[];

  if (rows.length === 0) {
    return NextResponse.json({ soulmates: [] });
  }

  // ② プロフィール情報（名前 / アイコン）
  const userIds = Array.from(new Set(rows.map((r) => r.target_user_id)));

  const {
    data: profileRows,
    error: profErr,
  } = await supabase
    .from("profiles")
    .select("id, handle, display_name, avatar_url")
    .in("id", userIds);

  if (profErr) {
    console.warn("[soulmates] candidate profiles unavailable");
  }

  const profileMap = new Map<string, ProfileRow>(
    ((profileRows ?? []) as ProfileRow[]).map((p) => [p.id, p])
  );

  // ③ キャラ名（日本語タイトル）
  const personaKeys = Array.from(
    new Set(rows.map((r) => r.target_persona_key))
  );

  const {
    data: defRows,
    error: defsErr,
  } = await supabase
    .from("persona_defs")
    .select("key, title")
    .in("key", personaKeys);

  if (defsErr) {
    console.warn("[soulmates] persona titles unavailable");
  }

  const personaMap = new Map<string, string | null>(
    ((defRows ?? []) as PersonaDefRow[]).map((d) => [d.key, d.title])
  );

  // ④ フロント用の整形
  const payload = rows.map((r) => {
    const prof = profileMap.get(r.target_user_id);
    const personaTitle =
      personaMap.get(r.target_persona_key) ??
      findDefaultPersona(r.target_persona_key)?.title ??
      r.target_persona_key;

    return {
      user_id: r.target_user_id,
      persona_key: r.target_persona_key,
      persona_title: personaTitle,
      romance_score: r.romance_score,
      percent: Math.round(r.romance_score * 100),
      relation_label: r.relation_label,
      handle: prof?.handle ?? null,
      display_name: prof?.display_name ?? null,
      avatar_url: prof?.avatar_url ?? null,
    };
  });

  return NextResponse.json({ soulmates: payload });
}
