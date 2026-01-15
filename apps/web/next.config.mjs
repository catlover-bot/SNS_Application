// apps/web/next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@sns/core"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }],
    // ★ ここを persona-images に
    localPatterns: [{ pathname: "/persona-images/**" }],
  },
};
export default nextConfig;
