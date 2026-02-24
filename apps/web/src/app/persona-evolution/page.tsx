import Link from "next/link";
import PersonaEvolutionChart from "@/components/PersonaEvolutionChart";

export default function PersonaEvolutionPage() {
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">キャラ進化</h1>
        <p className="text-sm text-gray-600">
          投稿履歴から、主キャラがどう変遷したかを日単位で追跡できます。
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/persona-feed" className="underline">
            キャラ別タイムライン
          </Link>
          <Link href="/persona-lab" className="underline">
            キャラ対話AI
          </Link>
        </div>
      </header>

      <PersonaEvolutionChart limit={90} />
    </div>
  );
}
