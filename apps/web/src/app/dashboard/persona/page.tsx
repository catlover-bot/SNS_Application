// apps/web/src/app/dashboard/persona/page.tsx
import PersonaRadar from "@/components/PersonaRadar";

export const dynamic = "force-dynamic";

export default function PersonaDashboardPage() {
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">キャラ分析ダッシュボード</h1>
        <p className="text-sm opacity-70 mt-1">
          あなたの投稿や評価から推定された「キャラ構成」をざっくり可視化します。
          今後、診断テストや相性マッチングとも連動させていきます。
        </p>
      </header>

      <PersonaRadar />
    </div>
  );
}
