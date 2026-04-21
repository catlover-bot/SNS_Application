import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function toPositiveInt(v: any, fallback: number, min = 1, max = 3650) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function isMissingSchemaObjectError(err: any, name: string) {
  const text = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.hint ?? ""}`.toLowerCase();
  return text.includes(name.toLowerCase()) && text.includes("does not exist");
}

type CompressionRpcRow = {
  compressed_days?: number | null;
  deleted_rows?: number | null;
};

async function runRetentionPass(supa: any, args: { beforeDays: number; userId: string | null }) {
  const rpc = await supa.rpc("compress_user_lie_score_context_coefficient_history_daily", {
    p_before_days: args.beforeDays,
    p_user_id: args.userId ?? null,
  });
  if (rpc.error) {
    if (
      isMissingSchemaObjectError(rpc.error, "compress_user_lie_score_context_coefficient_history_daily") ||
      isMissingSchemaObjectError(rpc.error, "user_lie_score_context_coefficient_history") ||
      isMissingSchemaObjectError(rpc.error, "user_lie_score_context_coefficient_history_daily")
    ) {
      return { ok: true as const, available: false as const, compressedDays: 0, deletedRows: 0 };
    }
    return {
      ok: false as const,
      status: 500,
      error: rpc.error.message ?? "lie_score_history_retention_rpc_failed",
    };
  }

  const rows = Array.isArray(rpc.data) ? (rpc.data as CompressionRpcRow[]) : [rpc.data as CompressionRpcRow];
  const compressedDays = rows.reduce(
    (sum, row) => sum + Math.max(0, Math.floor(Number(row?.compressed_days ?? 0) || 0)),
    0
  );
  const deletedRows = rows.reduce(
    (sum, row) => sum + Math.max(0, Math.floor(Number(row?.deleted_rows ?? 0) || 0)),
    0
  );

  return {
    ok: true as const,
    available: true as const,
    compressedDays,
    deletedRows,
    shouldContinue: deletedRows > 0,
  };
}

export async function POST(req: NextRequest) {
  const secret =
    process.env.LIE_SCORE_RETENTION_SECRET?.trim() ||
    process.env.LEARNING_MAINTENANCE_SECRET?.trim() ||
    process.env.PUSH_DISPATCH_SECRET?.trim() ||
    "";
  if (!secret) {
    return NextResponse.json({ ok: false, error: "lie_score_retention_secret_not_configured" }, { status: 503 });
  }

  const provided =
    req.headers.get("x-learning-maintenance-secret")?.trim() ||
    req.headers.get("x-push-dispatch-secret")?.trim() ||
    "";
  if (!provided || provided !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const source = String(body?.source ?? req.nextUrl.searchParams.get("source") ?? "manual").slice(0, 64);
  const beforeDays = toPositiveInt(body?.beforeDays ?? req.nextUrl.searchParams.get("beforeDays"), 7, 1, 365);
  const autoReenter =
    String(body?.autoReenter ?? req.nextUrl.searchParams.get("autoReenter") ?? "true").toLowerCase() !==
    "false";
  const maxPasses = toPositiveInt(
    body?.maxPasses ??
      req.nextUrl.searchParams.get("maxPasses") ??
      process.env.LIE_SCORE_RETENTION_MAX_PASSES,
    3,
    1,
    50
  );
  const userIdRaw = String(body?.userId ?? req.nextUrl.searchParams.get("userId") ?? "").trim();
  const userId = userIdRaw || null;

  const supa = supabaseAdmin() as any;
  const passes: Array<{ pass: number; compressedDays: number; deletedRows: number; shouldContinue: boolean }> = [];
  let totalCompressedDays = 0;
  let totalDeletedRows = 0;
  let lastPass: { compressedDays: number; deletedRows: number; shouldContinue: boolean } | null = null;

  for (let pass = 1; pass <= maxPasses; pass += 1) {
    const result = await runRetentionPass(supa, { beforeDays, userId });
    if (result.ok === false) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status ?? 500 });
    }
    if (result.available === false) {
      return NextResponse.json({
        ok: true,
        available: false,
        source,
        beforeDays,
        passCount: 0,
        passes: [],
        compressedDays: 0,
        deletedRows: 0,
      });
    }

    const passSummary = {
      compressedDays: result.compressedDays,
      deletedRows: result.deletedRows,
      shouldContinue: Boolean(result.shouldContinue),
    };
    passes.push({ pass, ...passSummary });
    lastPass = passSummary;
    totalCompressedDays += result.compressedDays;
    totalDeletedRows += result.deletedRows;

    if (!(autoReenter && result.shouldContinue)) break;
  }

  return NextResponse.json({
    ok: true,
    available: true,
    source,
    beforeDays,
    autoReenter,
    maxPasses,
    userId,
    passCount: passes.length,
    compressedDays: totalCompressedDays,
    deletedRows: totalDeletedRows,
    shouldContinue: Boolean(lastPass?.shouldContinue),
    lastPass,
    passes,
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
