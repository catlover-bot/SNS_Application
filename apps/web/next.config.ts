import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sns/core"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" }, // Storage画像のホスト許可（任意）
    ],
  },
  // 切り分け中にどうしても落ちる時だけ一時的に有効化し、原因修正後に戻す
  // typescript: { ignoreBuildErrors: true },
  // eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
