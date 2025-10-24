export type LieInput = { text: string; keystrokes?: number[] };

/** 0.0 ~ 1.0 の嘘っぽさを返す */
export function computeLieScore(input: LieInput): number {
  const t = (input.text ?? "").trim();
  const len = t.length;

  // 文字の特徴
  const ex = (t.match(/!/g) || []).length;           // ！
  const q  = (t.match(/\?/g) || []).length;          // ？
  const caps = (t.match(/[A-ZＡ-Ｚ]/g) || []).length; // 大文字

  // タイピング間隔の分散（大きいほど不安定）
  const ks = input.keystrokes ?? [];
  let typing = 0;
  if (ks.length > 3) {
    const mean = ks.reduce((a, b) => a + b, 0) / ks.length;
    const v = ks.reduce((a, b) => a + (b - mean) * (b - mean), 0) / ks.length;
    typing = Math.min(1, Math.sqrt(v) / 200); // ざっくり正規化
  }

  // 合成（0~1）
  const textish =
    0.25 * Math.min(1, ex / 3) +
    0.25 * Math.min(1, q / 3) +
    0.20 * Math.min(1, caps / Math.max(1, len)) +
    0.30 * (len < 8 ? 0.6 : len > 200 ? 0.2 : 0.4);

  const score = 0.6 * textish + 0.4 * typing;
  return Math.max(0, Math.min(1, score));
}
