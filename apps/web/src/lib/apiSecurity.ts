import { NextResponse } from "next/server";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const globalBuckets = (() => {
  const g = globalThis as typeof globalThis & {
    __personaLensRateLimitBuckets?: Map<string, RateLimitBucket>;
  };
  if (!g.__personaLensRateLimitBuckets) {
    g.__personaLensRateLimitBuckets = new Map<string, RateLimitBucket>();
  }
  return g.__personaLensRateLimitBuckets;
})();

function normalizeOrigin(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return null;
  }
}

function expectedRequestOrigin(req: Request): string | null {
  const fromUrl = normalizeOrigin(req.url);
  if (fromUrl) return fromUrl;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return null;
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`.toLowerCase();
}

export function requireSameOrigin(
  req: Request,
  opts?: { allowMissingOrigin?: boolean }
): NextResponse | null {
  const allowMissingOrigin = opts?.allowMissingOrigin ?? false;
  const requestOrigin = normalizeOrigin(req.headers.get("origin"));
  if (!requestOrigin) {
    if (allowMissingOrigin) return null;
    return NextResponse.json(
      { ok: false, error: "origin_required" },
      { status: 403 }
    );
  }

  const expected = expectedRequestOrigin(req);
  const configured = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  const allowed = new Set<string>(
    [expected, configured].filter((x): x is string => Boolean(x))
  );
  if (!allowed.size || allowed.has(requestOrigin)) {
    return null;
  }

  return NextResponse.json(
    { ok: false, error: "invalid_origin" },
    { status: 403 }
  );
}

export function requireRateLimit(args: {
  key: string;
  limit: number;
  windowMs: number;
}) {
  const now = Date.now();
  const bucket = globalBuckets.get(args.key);
  if (!bucket || bucket.resetAt <= now) {
    globalBuckets.set(args.key, {
      count: 1,
      resetAt: now + args.windowMs,
    });
    return null;
  }
  if (bucket.count >= args.limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((bucket.resetAt - now) / 1000)
    );
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limited",
        retry_after_seconds: retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds) },
      }
    );
  }
  bucket.count += 1;
  globalBuckets.set(args.key, bucket);
  return null;
}
