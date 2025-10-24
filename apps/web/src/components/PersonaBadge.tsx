"use client";

import { PERSONA_BANDS, personaFromAvg } from "@/lib/persona";

export default function PersonaBadge({ avg }: { avg: number | null }) {
  const p = personaFromAvg(avg);
  const pct = Math.round((avg ?? 0) * 100);
  const next = PERSONA_BANDS.find((b) => b.minPct > pct);

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1 rounded ${p.colorClass}`}
      title={`${p.tip}（平均 嘘っぽさ ${pct}%）`}
    >
      <span>{p.emoji}</span>
      <span className="font-medium">{p.label}</span>
      <span className="opacity-70 text-sm">（平均 嘘っぽさ {pct}%）</span>
      <details className="ml-2">
        <summary className="cursor-pointer text-xs underline">詳しく</summary>
        <div className="mt-2 text-xs max-w-[32rem] leading-relaxed">
          <div>{p.long}</div>
          {next && (
            <div className="mt-1 opacity-70">
              次のランク: <b>{next.label}</b>（{next.minPct}% 以上）まであと{" "}
              {Math.max(0, next.minPct - pct)}%
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
