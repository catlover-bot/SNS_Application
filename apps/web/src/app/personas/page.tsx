// apps/web/src/app/personas/page.tsx
import { PERSONA_BANDS } from "@/lib/persona";

export const metadata = { title: "キャラ図鑑 | 嘘スコアSNS" };

export default function PersonasPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">キャラ図鑑</h1>
      <p className="opacity-70">
        各ユーザーの「平均 嘘っぽさ」からキャラクターを割り当てます。スコアは投稿の文体・語彙・記号の使い方などの
        ヒューリスティックに基づく<span className="underline">参考指標</span>です。
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        {PERSONA_BANDS.map((b) => (
          <div key={b.key} className={`p-4 rounded border ${b.colorClass}`}>
            <div className="flex items-center gap-2 text-lg font-semibold">
              <span>{b.emoji}</span>
              <span>{b.label}</span>
              <span className="text-xs ml-2 opacity-70">
                しきい値: {b.minPct}% – {b.maxPct}%
              </span>
            </div>
            <div className="mt-2">{b.tip}</div>
            <div className="mt-1 opacity-70 text-sm">{b.long}</div>
          </div>
        ))}
      </div>

      <div className="opacity-60 text-sm">
        ※ スコアは最終的な真偽を断定するものではありません。通報や投票機能と組み合わせ、コミュニティで検証していきます。
      </div>
    </div>
  );
}
