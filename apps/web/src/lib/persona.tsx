// apps/web/src/lib/persona.tsx
export type PersonaBand = {
  key:
    | "saint"
    | "honest"
    | "prankster"
    | "wildcard"
    | "trickster"
    | "liar";
  label: string;
  emoji: string;
  colorClass: string; // Tailwind classes
  tip: string;        // 短い説明
  long: string;       // 詳細説明
  minPct: number;     // しきい値（%）
  maxPct: number;     // しきい値（%）
};

export const PERSONA_BANDS: PersonaBand[] = [
  {
    key: "saint",
    label: "聖人",
    emoji: "🕊️",
    colorClass: "bg-emerald-100 text-emerald-800",
    tip: "ほぼ偽りなし。信頼スコア最上位！",
    long:
      "事実ベースで、誇張・煽りがほとんど見られません。情報源の明示や落ち着いた文体が特徴です。",
    minPct: 0,
    maxPct: 9,
  },
  {
    key: "honest",
    label: "堅実",
    emoji: "🙂",
    colorClass: "bg-green-100 text-green-800",
    tip: "基本は正直者。たまに盛る程度。",
    long:
      "誠実なトーンが中心。ときどき強調表現や曖昧さが混じりますが、全体の信頼度は高いです。",
    minPct: 10,
    maxPct: 24,
  },
  {
    key: "prankster",
    label: "お調子者",
    emoji: "😛",
    colorClass: "bg-lime-100 text-lime-800",
    tip: "ジョークや誇張がちらほら。",
    long:
      "軽い誇張・ジョーク・ネットスラングが増加。悪意のない“盛り”やネタ感が伝わります。",
    minPct: 25,
    maxPct: 39,
  },
  {
    key: "wildcard",
    label: "ワイルドカード",
    emoji: "🃏",
    colorClass: "bg-amber-100 text-amber-900",
    tip: "真偽が半々。読み解きがいあり。",
    long:
      "確信の強い表現と曖昧な言い回しが混在。断定・記号の多用など波があります。検証の価値あり。",
    minPct: 40,
    maxPct: 59,
  },
  {
    key: "trickster",
    label: "トリックスター",
    emoji: "🌀",
    colorClass: "bg-orange-100 text-orange-900",
    tip: "話を盛りがち。要ファクトチェック。",
    long:
      "センセーショナルな言い回し、噂・憶測の提示が増えます。共有前に情報源の確認がおすすめ。",
    minPct: 60,
    maxPct: 79,
  },
  {
    key: "liar",
    label: "フェイカー",
    emoji: "🧪",
    colorClass: "bg-red-100 text-red-800",
    tip: "虚偽傾向が強め。",
    long:
      "過度な断定・対立煽り・誤情報の共有が多く見られます。コミュニティルールや通報に注意。",
    minPct: 80,
    maxPct: 100,
  },
];

export function personaFromAvg(avg: number | null) {
  const pct = Math.max(0, Math.min(100, Math.round((avg ?? 0) * 100)));
  return (
    PERSONA_BANDS.find((b) => pct >= b.minPct && pct <= b.maxPct) ??
    PERSONA_BANDS[PERSONA_BANDS.length - 1]
  );
}
