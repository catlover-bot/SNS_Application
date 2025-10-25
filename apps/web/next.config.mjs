// apps/web/next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@sns/core"],
  images: { remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }] },
};
export default nextConfig;
