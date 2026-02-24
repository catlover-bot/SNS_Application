import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type BuddyLearningMode = "adaptive" | "stable";
const DEFAULT_BUDDY_LEARNING_MODE: BuddyLearningMode = "adaptive";

function normalizeBuddyLearningMode(v: string | null | undefined): BuddyLearningMode {
  return String(v ?? "").trim() === "stable" ? "stable" : "adaptive";
}

function isMissingRelationError(err: any, table: string) {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes(table.toLowerCase()) && text.includes("does not exist");
}

async function readBuddyLearningMode(args: { supa: any; userId: string }) {
  const { supa, userId } = args;
  const res = await supa
    .from("user_persona_feed_preferences")
    .select("buddy_learning_mode,updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (res.error) {
    if (isMissingRelationError(res.error, "user_persona_feed_preferences")) {
      return {
        available: false,
        mode: DEFAULT_BUDDY_LEARNING_MODE,
        updatedAt: null as string | null,
      };
    }
    throw res.error;
  }

  return {
    available: true,
    mode: normalizeBuddyLearningMode(res.data?.buddy_learning_mode),
    updatedAt: (res.data?.updated_at as string | null) ?? null,
  };
}

export async function GET() {
  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  try {
    const pref = await readBuddyLearningMode({ supa, userId: user.id });
    return NextResponse.json({
      ok: true,
      buddyLearningMode: pref.mode,
      available: pref.available,
      updatedAt: pref.updatedAt,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "persona_feed_preferences_read_error",
        buddyLearningMode: DEFAULT_BUDDY_LEARNING_MODE,
        available: false,
      },
      { status: 200 }
    );
  }
}

export async function POST(req: NextRequest) {
  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const nextMode = normalizeBuddyLearningMode(body?.buddyLearningMode);

  const up = await supa.from("user_persona_feed_preferences").upsert(
    {
      user_id: user.id,
      buddy_learning_mode: nextMode,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (up.error) {
    if (isMissingRelationError(up.error, "user_persona_feed_preferences")) {
      return NextResponse.json({
        ok: false,
        available: false,
        buddyLearningMode: nextMode,
        error: "preferences_table_missing",
      });
    }
    return NextResponse.json(
      {
        ok: false,
        available: false,
        buddyLearningMode: nextMode,
        error: up.error.message ?? "persona_feed_preferences_write_error",
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    ok: true,
    available: true,
    buddyLearningMode: nextMode,
  });
}
