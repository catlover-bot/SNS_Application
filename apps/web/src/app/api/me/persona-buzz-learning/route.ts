import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { loadPersonaBuzzCalibrationSnapshot } from "@/lib/personaBuzzCalibration";

const GLOBAL_PERSONA_KEY = "__all__";

function toNonNegativeInt(v: string | null, def: number) {
  const n = Number(v ?? "");
  if (!Number.isFinite(n)) return def;
  return Math.max(0, Math.floor(n));
}

async function buildResponse(req: NextRequest) {
  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const qp = req.nextUrl.searchParams;
  const personaKey = String(qp.get("personaKey") ?? "").trim() || GLOBAL_PERSONA_KEY;
  const maxPosts = Math.max(40, Math.min(240, toNonNegativeInt(qp.get("maxPosts"), 140)));
  const matureMinutes = Math.max(5, Math.min(720, toNonNegativeInt(qp.get("matureMinutes"), 15)));

  const snapshot = await loadPersonaBuzzCalibrationSnapshot({
    supa,
    userId: user.id,
    maxPosts,
    matureMinutes,
    persist: true,
  });
  const selected =
    snapshot.byPersona.get(personaKey) ??
    snapshot.byPersona.get(GLOBAL_PERSONA_KEY) ??
    snapshot.global;

  const entries = Array.from(snapshot.byPersona.entries())
    .map(([key, stat]) => ({
      persona_key: key,
      samples: stat.samples,
      predicted_avg: stat.predictedAvg,
      actual_avg: stat.actualAvg,
      multiplier: stat.multiplier,
      confidence: stat.confidence,
    }))
    .sort((a, b) => {
      if (b.samples !== a.samples) return b.samples - a.samples;
      return b.multiplier - a.multiplier;
    });

  return NextResponse.json({
    ok: true,
    persona_key: personaKey,
    selected: {
      samples: selected.samples,
      predicted_avg: selected.predictedAvg,
      actual_avg: selected.actualAvg,
      multiplier: selected.multiplier,
      confidence: selected.confidence,
    },
    entries,
  });
}

export async function GET(req: NextRequest) {
  return buildResponse(req);
}

export async function POST(req: NextRequest) {
  return buildResponse(req);
}
