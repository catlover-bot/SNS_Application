declare module "*.css";
# --- monorepo (Next.js / Expo / pnpm / turbo) ---
node_modules/
.pnp.*
**/.next/
**/.turbo/
**/dist/
**/build/
**/.expo/
**/.expo-shared/
**/android/
**/ios/
**/.DS_Store

# env/keys（絶対コミットしない）
.env
.env.*
*.env
apps/web/.env.local
apps/mobile/.env
