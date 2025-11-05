import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // /api にだけ簡単なレート制限（IP単位・開発用）
  if (pathname.startsWith("/api/")) {
    // ここに本番ではUpstash等のKVレートリミットを入れる
    // 例: if (tooMany(req.ip)) return NextResponse.json({error:"rate_limited"}, {status:429});
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
