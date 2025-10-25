// apps/web/src/lib/labels.ts
export const LABELS = [
  { key: "funny",    emoji: "🤣", text: "おもしろい" },
  { key: "insight",  emoji: "🧠", text: "洞察" },
  { key: "toxic",    emoji: "☠️", text: "攻撃的" },
  { key: "question", emoji: "❓", text: "質問" },
  { key: "sarcasm",  emoji: "🙃", text: "皮肉" },
] as const;

export type LabelKey = typeof LABELS[number]["key"];

// よく使う補助（任意）
export const LABEL_KEYS = LABELS.map(l => l.key) as readonly LabelKey[];

export function isLabelKey(x: string): x is LabelKey {
  return (LABEL_KEYS as readonly string[]).includes(x);
}
