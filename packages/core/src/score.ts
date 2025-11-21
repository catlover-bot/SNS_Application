export type ScoreInput =
  | { text: string }
  | { tokens: string[] };

export function computeLieScore(input: ScoreInput): number {
  const text =
    "text" in input ? input.text :
    "tokens" in input ? input.tokens.join(" ") : "";

  // 適当なスコア例：短い＆感嘆が多い＆誇張語が多いほど “嘘っぽい”
  const len = Math.max(1, text.length);
  const bangs = (text.match(/!/g) || []).length / len;
  const superlatives = (text.match(/\b(絶対|最強|世界一|ヤバい|超|マジ)\b/g) || []).length / Math.max(1, text.split(/\s+/).length);

  let raw = 0.2 * Math.min(1, 60 / len) + 0.5 * bangs + 0.3 * superlatives;
  raw = Math.max(0, Math.min(1, raw));
  return raw;
}
