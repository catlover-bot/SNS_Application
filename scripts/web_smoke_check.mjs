#!/usr/bin/env node

const DEFAULT_BASE_URL = "http://localhost:3000";
const baseUrl = new URL(process.env.WEB_SMOKE_BASE_URL || DEFAULT_BASE_URL);
const TIMEOUT_MS = 10000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const GATED_STATUSES = new Set([401, 403, 404, 503]);
const SENSITIVE_ERROR_PATTERNS = [
  /supabase/i,
  /postgres/i,
  /postgrest/i,
  /\bsql\b/i,
  /\brpc\b/i,
  /stack/i,
  /trace/i,
  /relation .* does not exist/i,
  /function .* does not exist/i,
];

function isRedirect(status) {
  return REDIRECT_STATUSES.has(status);
}

function normalizeLocation(location) {
  if (!location) return "";
  try {
    const url = new URL(location, baseUrl);
    return `${url.pathname}${url.search}`;
  } catch {
    return location;
  }
}

function redactedResult(result) {
  const location = normalizeLocation(result.location);
  return `status=${result.status}${location ? ` location=${location}` : ""}`;
}

async function fetchPath(path) {
  const url = new URL(path, baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "user-agent": "sns-web-smoke-check/1.0",
      },
    });
    const contentType = response.headers.get("content-type") || "";
    const shouldReadBody = contentType.includes("application/json") || path.startsWith("/api/");
    const body = shouldReadBody ? await response.text() : "";
    return {
      ok: true,
      path,
      status: response.status,
      location: response.headers.get("location") || "",
      body,
    };
  } catch (error) {
    return {
      ok: false,
      path,
      status: 0,
      location: "",
      body: "",
      error: error instanceof Error ? error.message : "request_failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function noSensitiveErrorBody(result) {
  return !SENSITIVE_ERROR_PATTERNS.some((pattern) => pattern.test(result.body));
}

function publicPage(path) {
  return {
    label: `${path} returns 200`,
    path,
    validate(result) {
      return result.ok && result.status === 200;
    },
  };
}

function authRequiredPage(path) {
  return {
    label: `${path} requires auth`,
    path,
    validate(result) {
      const location = normalizeLocation(result.location);
      const encodedNext = encodeURIComponent(path);
      const loginRedirect =
        isRedirect(result.status) &&
        location.startsWith("/login") &&
        location.includes(`next=${encodedNext}`);
      return result.ok && (loginRedirect || GATED_STATUSES.has(result.status));
    },
  };
}

function gatedInternalPage(path) {
  return {
    label: `${path} is gated`,
    path,
    validate(result) {
      const location = normalizeLocation(result.location);
      const loginRedirect = isRedirect(result.status) && location.startsWith("/login");
      return result.ok && (loginRedirect || GATED_STATUSES.has(result.status));
    },
  };
}

const checks = [
  publicPage("/"),
  publicPage("/login"),
  publicPage("/support"),
  publicPage("/legal/privacy"),
  publicPage("/personas"),
  authRequiredPage("/compose"),
  authRequiredPage("/saved"),
  gatedInternalPage("/dashboard/ab-timeseries"),
  gatedInternalPage("/dashboard/timeline-learning"),
  {
    label: "/api/me/timeline-signals is sanitized",
    path: "/api/me/timeline-signals",
    validate(result) {
      return result.ok && GATED_STATUSES.has(result.status) && noSensitiveErrorBody(result);
    },
  },
];

console.log(`Web smoke check: ${baseUrl.origin}`);

let failed = 0;
for (const check of checks) {
  const result = await fetchPath(check.path);
  const passed = check.validate(result);
  if (passed) {
    console.log(`PASS ${check.label} (${redactedResult(result)})`);
  } else {
    failed += 1;
    const detail = result.ok ? redactedResult(result) : result.error || "request_failed";
    console.log(`FAIL ${check.label} (${detail})`);
  }
}

if (failed > 0) {
  console.log(`Smoke check failed: ${failed} check${failed === 1 ? "" : "s"} failed.`);
  process.exit(1);
}

console.log("Smoke check passed.");
