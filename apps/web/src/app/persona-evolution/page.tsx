import Link from "next/link";
import PersonaEvolutionChart from "@/components/PersonaEvolutionChart";

export default function PersonaEvolutionPage() {
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <header className="rounded-xl border bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
          Persona Evolution
        </div>
        <h1 className="mt-1 text-2xl font-bold">キャラ進化</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          投稿の積み重ねから、あなたの主キャラがどう変わってきたかを追跡します。
          その日の言葉遣い、話題、反応のされ方が、少しずつ社会的な個性として可視化されます。
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
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
