import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseRuntimeConfig } from "@/lib/supabase/config";

const PUBLIC_PAGE_PREFIXES = [
  "/",
  "/login",
  "/auth",
  "/legal",
  "/support",
  "/trending",
  "/search",
  "/p",
  "/u",
  "/personas",
];

const AUTH_REQUIRED_PAGE_PREFIXES = [
  "/home",
  "/compose",
  "/following",
  "/saved",
  "/notifications",
  "/messages",
  "/settings",
  "/persona-feed",
  "/persona-lab",
  "/persona-evolution",
  "/dashboard",
];

const INTERNAL_PAGE_PREFIXES = [
  "/dashboard/ab-timeseries",
  "/dashboard/push-delivery",
  "/dashboard/timeline-learning",
];

const AUTH_REQUIRED_API_PREFIXES = [
  "/api/analyze-image",
  "/api/me",
  "/api/notifications",
  "/api/personas/dialogue",
  "/api/personas/recompute",
  "/api/personas/suggest",
  "/api/prompts",
];

const INTERNAL_API_PREFIXES = [
  "/api/me/persona-feed/ab-dashboard",
  "/api/me/persona-feed/ab-timeseries",
  "/api/me/push-delivery/dashboard",
  "/api/personas/image-coverage",
];

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isPublicPage(pathname: string) {
  if (pathname === "/") return true;
  return matches(pathname, PUBLIC_PAGE_PREFIXES.filter((prefix) => prefix !== "/"));
}

function redirectToLogin(req: NextRequest, reason?: string) {
  const login = new URL("/login", req.url);
  const next = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (next && next !== "/") login.searchParams.set("next", next);
  if (reason) login.searchParams.set("reason", reason);
  return NextResponse.redirect(login);
}

function privateApiResponse(status: number, error = "authentication_required") {
  return NextResponse.json({ ok: false, error }, { status });
}

function isExplicitDevInternalAccess() {
  return process.env.NODE_ENV !== "production" && process.env.WEB_INTERNAL_ROUTES === "1";
}

function isAdminEmail(email: string | null | undefined) {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized) return false;
  const allowed = String(process.env.WEB_ADMIN_EMAILS ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(normalized);
}

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const isApi = pathname.startsWith("/api/");
  const requiresAuth =
    (isApi && matches(pathname, AUTH_REQUIRED_API_PREFIXES)) ||
    (!isApi && (matches(pathname, AUTH_REQUIRED_PAGE_PREFIXES) || (!isPublicPage(pathname) && pathname !== "/")));
  const requiresInternal =
    (isApi && matches(pathname, INTERNAL_API_PREFIXES)) ||
    (!isApi && matches(pathname, INTERNAL_PAGE_PREFIXES));

  const config = getSupabaseRuntimeConfig();
  if (isApi && !config) return privateApiResponse(503, "service_unavailable");
  if (!requiresAuth && !requiresInternal) return NextResponse.next();

  if (!config) {
    return isApi ? privateApiResponse(503, "service_unavailable") : redirectToLogin(req, "not_configured");
  }

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return isApi ? privateApiResponse(401) : redirectToLogin(req);
  }

  if (requiresInternal && !isExplicitDevInternalAccess() && !isAdminEmail(user.email)) {
    return isApi
      ? privateApiResponse(404, "not_found")
      : new NextResponse("Not found", { status: 404 });
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)"],
};
