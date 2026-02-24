import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type MissionRow = {
  user_id: string;
  mission_date: string;
  base_persona_key: string;
  buddy_persona_key: string;
  mission_kind: string;
  progress_count: number | null;
  target_count: number | null;
  unlocked_at: string | null;
  last_event_at: string | null;
  updated_at: string | null;
};

type MissionXpRow = {
  buddy_persona_key: string;
  xp_total: number | null;
  completed_missions: number | null;
};

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function missionXpForOpen(delta: number) {
  return clampInt(delta * 4, 0, 200);
}

function missionXpForUnlock() {
  return 12;
}

function missionLevelStats(xpTotalRaw: number | null | undefined) {
  const xpTotal = Math.max(0, Math.floor(Number(xpTotalRaw ?? 0) || 0));
  const requirementForLevel = (level: number) =>
    Math.max(24, Math.floor(36 + (level - 1) * 18 + (level - 1) * (level - 1) * 4));
  let level = 1;
  let floorXp = 0;
  let nextCost = requirementForLevel(level);
  let remaining = xpTotal;
  while (remaining >= nextCost && level < 99) {
    remaining -= nextCost;
    floorXp += nextCost;
    level += 1;
    nextCost = requirementForLevel(level);
  }
  return {
    xpTotal,
    level,
    currentLevelXp: remaining,
    nextLevelXp: nextCost,
    levelProgressRatio: nextCost > 0 ? remaining / nextCost : 0,
    floorXp,
  };
}

function isMissingRelationError(err: any, relation: string) {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes(relation.toLowerCase()) && text.includes("does not exist");
}

function normalizeDateKey(v: string | null | undefined) {
  const raw = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().slice(0, 10);
}

function normalizeMissionKind(v: string | null | undefined) {
  const raw = String(v ?? "").trim();
  return raw || "open";
}

function parseBuddyKeys(raw: string | null | undefined) {
  return Array.from(
    new Set(
      String(raw ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
    )
  ).slice(0, 24);
}

function dayBefore(dateKey: string) {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function computeStreakDays(args: {
  rows: MissionRow[];
  endDate: string;
  basePersonaKey: string;
  buddyPersonaKey: string;
  missionKind: string;
}) {
  const { rows, endDate, basePersonaKey, buddyPersonaKey, missionKind } = args;
  const unlockedByDate = new Map<string, boolean>();
  rows.forEach((row) => {
    if (String(row.base_persona_key ?? "") !== basePersonaKey) return;
    if (String(row.buddy_persona_key ?? "") !== buddyPersonaKey) return;
    if (String(row.mission_kind ?? "") !== missionKind) return;
    const date = normalizeDateKey(row.mission_date);
    const progress = Math.max(0, Math.floor(Number(row.progress_count ?? 0) || 0));
    const target = Math.max(1, Math.floor(Number(row.target_count ?? 1) || 1));
    if (progress >= target) unlockedByDate.set(date, true);
  });

  let streak = 0;
  let cursor = normalizeDateKey(endDate);
  while (cursor && unlockedByDate.get(cursor)) {
    streak += 1;
    cursor = dayBefore(cursor);
  }
  return streak;
}

async function loadStreakRows(args: {
  supa: any;
  userId: string;
  basePersonaKey: string;
  buddyKeys: string[];
  missionKind: string;
  endDate: string;
}) {
  const { supa, userId, basePersonaKey, buddyKeys, missionKind, endDate } = args;
  if (!buddyKeys.length) return { available: false, rows: [] as MissionRow[] };

  const end = normalizeDateKey(endDate);
  const start = dayBefore(end) ?? end;
  const startDate = new Date(`${start}T00:00:00.000Z`);
  startDate.setUTCDate(startDate.getUTCDate() - 44);
  const startKey = startDate.toISOString().slice(0, 10);

  const res = await supa
    .from("user_persona_buddy_mission_progress")
    .select(
      "user_id,mission_date,base_persona_key,buddy_persona_key,mission_kind,progress_count,target_count,unlocked_at,last_event_at,updated_at"
    )
    .eq("user_id", userId)
    .eq("base_persona_key", basePersonaKey)
    .eq("mission_kind", missionKind)
    .in("buddy_persona_key", buddyKeys)
    .gte("mission_date", startKey)
    .lte("mission_date", end)
    .order("mission_date", { ascending: false })
    .limit(Math.max(64, buddyKeys.length * 46));

  if (res.error) {
    if (isMissingRelationError(res.error, "user_persona_buddy_mission_progress")) {
      return { available: false, rows: [] as MissionRow[] };
    }
    return { available: false, rows: [] as MissionRow[] };
  }
  return { available: true, rows: (res.data ?? []) as MissionRow[] };
}

async function loadMissionXpState(args: {
  supa: any;
  userId: string;
  basePersonaKey: string;
  buddyKeys: string[];
}) {
  const { supa, userId, basePersonaKey, buddyKeys } = args;
  const keys = Array.from(new Set(buddyKeys.filter(Boolean)));
  if (!keys.length) return { available: false, byBuddy: new Map<string, MissionXpRow>() };

  const res = await supa
    .from("user_persona_buddy_mission_xp_state")
    .select("buddy_persona_key,xp_total,completed_missions")
    .eq("user_id", userId)
    .eq("base_persona_key", basePersonaKey)
    .in("buddy_persona_key", keys);
  if (res.error) {
    if (isMissingRelationError(res.error, "user_persona_buddy_mission_xp_state")) {
      return { available: false, byBuddy: new Map<string, MissionXpRow>() };
    }
    return { available: false, byBuddy: new Map<string, MissionXpRow>() };
  }
  const byBuddy = new Map<string, MissionXpRow>();
  ((res.data ?? []) as MissionXpRow[]).forEach((row) => {
    const key = String(row?.buddy_persona_key ?? "").trim();
    if (!key) return;
    byBuddy.set(key, row);
  });
  return { available: true, byBuddy };
}

async function applyMissionXpGain(args: {
  supa: any;
  userId: string;
  basePersonaKey: string;
  buddyPersonaKey: string;
  xpGain: number;
  completedMissionGain: number;
}) {
  const { supa, userId, basePersonaKey, buddyPersonaKey, xpGain, completedMissionGain } = args;
  const gainXp = Math.max(0, Math.floor(Number(xpGain ?? 0) || 0));
  const gainCompleted = Math.max(0, Math.floor(Number(completedMissionGain ?? 0) || 0));
  if (gainXp <= 0 && gainCompleted <= 0) {
    return {
      available: false,
      xpGain: 0,
      completedMissionGain: 0,
      xp: missionLevelStats(0),
      completedMissions: 0,
    };
  }

  const cur = await supa
    .from("user_persona_buddy_mission_xp_state")
    .select("xp_total,completed_missions")
    .eq("user_id", userId)
    .eq("base_persona_key", basePersonaKey)
    .eq("buddy_persona_key", buddyPersonaKey)
    .maybeSingle();
  if (cur.error && !isMissingRelationError(cur.error, "user_persona_buddy_mission_xp_state")) {
    return {
      available: false,
      xpGain: gainXp,
      completedMissionGain: gainCompleted,
      xp: missionLevelStats(0),
      completedMissions: 0,
    };
  }
  if (cur.error && isMissingRelationError(cur.error, "user_persona_buddy_mission_xp_state")) {
    return {
      available: false,
      xpGain: gainXp,
      completedMissionGain: gainCompleted,
      xp: missionLevelStats(gainXp),
      completedMissions: gainCompleted,
    };
  }

  const nextXpTotal = Math.max(0, Math.floor(Number(cur.data?.xp_total ?? 0) || 0) + gainXp);
  const nextCompleted = Math.max(
    0,
    Math.floor(Number(cur.data?.completed_missions ?? 0) || 0) + gainCompleted
  );
  const up = await supa.from("user_persona_buddy_mission_xp_state").upsert(
    {
      user_id: userId,
      base_persona_key: basePersonaKey,
      buddy_persona_key: buddyPersonaKey,
      xp_total: nextXpTotal,
      completed_missions: nextCompleted,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,base_persona_key,buddy_persona_key" }
  );
  if (up.error) {
    if (isMissingRelationError(up.error, "user_persona_buddy_mission_xp_state")) {
      return {
        available: false,
        xpGain: gainXp,
        completedMissionGain: gainCompleted,
        xp: missionLevelStats(nextXpTotal),
        completedMissions: nextCompleted,
      };
    }
    return {
      available: false,
      xpGain: gainXp,
      completedMissionGain: gainCompleted,
      xp: missionLevelStats(nextXpTotal),
      completedMissions: nextCompleted,
    };
  }

  return {
    available: true,
    xpGain: gainXp,
    completedMissionGain: gainCompleted,
    xp: missionLevelStats(nextXpTotal),
    completedMissions: nextCompleted,
  };
}

export async function GET(req: NextRequest) {
  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const dateKey = normalizeDateKey(url.searchParams.get("missionDate") ?? url.searchParams.get("date"));
  const basePersonaKey = String(url.searchParams.get("basePersona") ?? "").trim() || "__all__";
  const missionKind = normalizeMissionKind(url.searchParams.get("missionKind"));
  const buddyKeys = parseBuddyKeys(url.searchParams.get("buddyKeys"));
  if (!buddyKeys.length) {
    return NextResponse.json({
      ok: true,
      available: true,
      missionDate: dateKey,
      counts: {},
      streaks: {},
      missions: [],
    });
  }

  const todayRes = await supa
    .from("user_persona_buddy_mission_progress")
    .select(
      "user_id,mission_date,base_persona_key,buddy_persona_key,mission_kind,progress_count,target_count,unlocked_at,last_event_at,updated_at"
    )
    .eq("user_id", user.id)
    .eq("mission_date", dateKey)
    .eq("base_persona_key", basePersonaKey)
    .eq("mission_kind", missionKind)
    .in("buddy_persona_key", buddyKeys);

  if (todayRes.error) {
    if (isMissingRelationError(todayRes.error, "user_persona_buddy_mission_progress")) {
      return NextResponse.json({
        ok: true,
        available: false,
        missionDate: dateKey,
        counts: {},
        streaks: {},
        missions: [],
      });
    }
    return NextResponse.json(
      { error: todayRes.error.message ?? "mission_progress_read_error" },
      { status: 500 }
    );
  }

  const streakLoad = await loadStreakRows({
    supa,
    userId: user.id,
    basePersonaKey,
    buddyKeys,
    missionKind,
    endDate: dateKey,
  });
  const streakRows = streakLoad.rows;
  const xpLoad = await loadMissionXpState({
    supa,
    userId: user.id,
    basePersonaKey,
    buddyKeys,
  });
  const rows = (todayRes.data ?? []) as MissionRow[];
  const byBuddy = new Map<string, MissionRow>();
  rows.forEach((row) => {
    const key = String(row?.buddy_persona_key ?? "").trim();
    if (!key) return;
    byBuddy.set(key, row);
  });

  const missions = buddyKeys.map((buddyKey) => {
    const row = byBuddy.get(buddyKey);
    const progress = Math.max(0, Math.floor(Number(row?.progress_count ?? 0) || 0));
    const target = Math.max(1, Math.floor(Number(row?.target_count ?? 1) || 1));
    const streakDays = computeStreakDays({
      rows: streakRows,
      endDate: dateKey,
      basePersonaKey,
      buddyPersonaKey: buddyKey,
      missionKind,
    });
    const xpRow = xpLoad.byBuddy.get(buddyKey);
    const xpStats = missionLevelStats(xpRow?.xp_total);
    const completedMissions = Math.max(
      0,
      Math.floor(Number(xpRow?.completed_missions ?? 0) || 0)
    );
    return {
      buddyPersonaKey: buddyKey,
      basePersonaKey,
      missionKind,
      missionDate: dateKey,
      progressCount: progress,
      targetCount: target,
      unlockedAt: row?.unlocked_at ?? null,
      lastEventAt: row?.last_event_at ?? null,
      streakDays,
      unlocked: progress >= target,
      xp: {
        ...xpStats,
        completedMissions,
      },
    };
  });

  const counts = Object.fromEntries(
    missions.map((m) => [`${dateKey}:${m.buddyPersonaKey}`, m.progressCount])
  );
  const streaks = Object.fromEntries(missions.map((m) => [m.buddyPersonaKey, m.streakDays]));
  const xp = Object.fromEntries(
    missions.map((m) => [
      m.buddyPersonaKey,
      {
        ...m.xp,
      },
    ])
  );

  return NextResponse.json({
    ok: true,
    available: streakLoad.available,
    xpAvailable: xpLoad.available,
    missionDate: dateKey,
    counts,
    streaks,
    xp,
    missions,
  });
}

export async function POST(req: NextRequest) {
  const supa = await supabaseServer();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const missionDate = normalizeDateKey(body?.missionDate);
  const basePersonaKey = String(body?.basePersona ?? "").trim() || "__all__";
  const buddyPersonaKey = String(body?.buddyPersona ?? "").trim();
  const missionKind = normalizeMissionKind(body?.missionKind);
  const delta = Math.max(0, Math.min(8, Math.floor(Number(body?.delta ?? 1) || 1)));
  const requestedTarget = Math.max(1, Math.min(12, Math.floor(Number(body?.targetCount ?? 1) || 1)));

  if (!buddyPersonaKey) {
    return NextResponse.json({ error: "buddyPersona is required" }, { status: 400 });
  }

  const cur = await supa
    .from("user_persona_buddy_mission_progress")
    .select(
      "user_id,mission_date,base_persona_key,buddy_persona_key,mission_kind,progress_count,target_count,unlocked_at,last_event_at,updated_at"
    )
    .eq("user_id", user.id)
    .eq("mission_date", missionDate)
    .eq("base_persona_key", basePersonaKey)
    .eq("buddy_persona_key", buddyPersonaKey)
    .eq("mission_kind", missionKind)
    .maybeSingle();

  if (cur.error && !isMissingRelationError(cur.error, "user_persona_buddy_mission_progress")) {
    return NextResponse.json(
      { error: cur.error.message ?? "mission_progress_load_error" },
      { status: 500 }
    );
  }
  if (cur.error && isMissingRelationError(cur.error, "user_persona_buddy_mission_progress")) {
    return NextResponse.json({
      ok: true,
      available: false,
      missionDate,
      countKey: `${missionDate}:${buddyPersonaKey}`,
      mission: {
        buddyPersonaKey,
        basePersonaKey,
        missionKind,
        progressCount: delta,
        targetCount: requestedTarget,
        unlocked: delta >= requestedTarget,
        streakDays: 0,
      },
    });
  }

  const curRow = (cur.data ?? null) as MissionRow | null;
  const nextProgress = Math.max(
    0,
    Math.floor(Number(curRow?.progress_count ?? 0) || 0) + delta
  );
  const nextTarget = Math.max(
    requestedTarget,
    Math.floor(Number(curRow?.target_count ?? 1) || 1)
  );
  const now = new Date().toISOString();
  const unlockedAt =
    curRow?.unlocked_at ?? (nextProgress >= nextTarget ? now : null);
  const justUnlocked = !curRow?.unlocked_at && nextProgress >= nextTarget;

  const up = await supa.from("user_persona_buddy_mission_progress").upsert(
    {
      user_id: user.id,
      mission_date: missionDate,
      base_persona_key: basePersonaKey,
      buddy_persona_key: buddyPersonaKey,
      mission_kind: missionKind,
      progress_count: nextProgress,
      target_count: nextTarget,
      unlocked_at: unlockedAt,
      last_event_at: now,
      updated_at: now,
    },
    {
      onConflict:
        "user_id,mission_date,base_persona_key,buddy_persona_key,mission_kind",
    }
  );

  if (up.error) {
    if (isMissingRelationError(up.error, "user_persona_buddy_mission_progress")) {
      return NextResponse.json({
        ok: true,
        available: false,
        missionDate,
        countKey: `${missionDate}:${buddyPersonaKey}`,
        mission: {
          buddyPersonaKey,
          basePersonaKey,
          missionKind,
          progressCount: nextProgress,
          targetCount: nextTarget,
          unlocked: nextProgress >= nextTarget,
          streakDays: 0,
        },
      });
    }
    return NextResponse.json(
      { error: up.error.message ?? "mission_progress_write_error" },
      { status: 500 }
    );
  }

  const streakLoad = await loadStreakRows({
    supa,
    userId: user.id,
    basePersonaKey,
    buddyKeys: [buddyPersonaKey],
    missionKind,
    endDate: missionDate,
  });
  const streakDays = computeStreakDays({
    rows: streakLoad.rows,
    endDate: missionDate,
    basePersonaKey,
    buddyPersonaKey,
    missionKind,
  });
  const xpGain = missionXpForOpen(delta) + (justUnlocked ? missionXpForUnlock() : 0);
  const xpApply = await applyMissionXpGain({
    supa,
    userId: user.id,
    basePersonaKey,
    buddyPersonaKey,
    xpGain,
    completedMissionGain: justUnlocked ? 1 : 0,
  });

  return NextResponse.json({
    ok: true,
    available: true,
    xpAvailable: xpApply.available,
    missionDate,
    countKey: `${missionDate}:${buddyPersonaKey}`,
    mission: {
      buddyPersonaKey,
      basePersonaKey,
      missionKind,
      progressCount: nextProgress,
      targetCount: nextTarget,
      unlocked: nextProgress >= nextTarget,
      unlockedAt,
      lastEventAt: now,
      streakDays,
      xp: {
        ...xpApply.xp,
        completedMissions: xpApply.completedMissions,
        gainedXp: xpApply.xpGain,
      },
    },
  });
}
