// apps/web/src/components/PersonaBadge.tsx
"use client";

type PersonaBadgeProps = {
  /** 0〜1 or 0〜100 の平均スコア（あれば） */
  avg?: number | null;
  /** persona_defs.key など（あれば） */
  personaKey?: string | null;
};

export function PersonaBadge({ avg, personaKey }: PersonaBadgeProps) {
  // 0〜1 / 0〜100 のどちらでもそれっぽく解釈
  let pct: number | null = null;
  if (typeof avg === "number" && !Number.isNaN(avg)) {
    const v = avg;
    if (v <= 0) {
      pct = 0;
    } else if (v <= 1) {
      // 0〜1 とみなして %
      pct = Math.round(v * 100);
    } else {
      // 0〜100 とみなしてクリップ
      pct = Math.round(Math.min(v, 100));
    }
  }

  // スコアに応じて少し色味を変える（スコアなしなら固定色）
  const hue = pct == null ? 210 : 120 - Math.min(120, pct); // 緑〜赤っぽいグラデ

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
      style={{
        background: `hsl(${hue} 70% 96%)`,
        borderColor: `hsl(${hue} 45% 65%)`,
      }}
    >
      {personaKey && (
        <span className="text-[10px] text-slate-500">@{personaKey}</span>
      )}
      {pct != null ? (
        <span className="font-semibold">{pct}%</span>
      ) : (
        <span className="text-slate-500">キャラ相性</span>
      )}
    </span>
  );
}

// default import 用
export default PersonaBadge;
