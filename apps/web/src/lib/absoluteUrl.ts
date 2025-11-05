// apps/web/src/lib/absoluteUrl.ts
import { headers } from "next/headers";

/** サーバーコンポーネントから /api/... を叩くときの安全な絶対URL作成 */
export async function absoluteUrl(path: string) {
  const h = await headers(); // Next16: Promise
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (host ? `${proto}://${host}` : "http://localhost:3000");
  return new URL(path, base).toString();
}
