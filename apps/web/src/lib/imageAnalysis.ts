import sharp from "sharp";
import exifr from "exifr";

export type ImageAnalysis = {
  elaScore: number; // 0~1 （高いほど“加工の痕跡”が強い）
  exif: Record<string, any> | null;
  flags: {
    noExif: boolean;
    possibleAIGenerated: boolean;
    heavyEditing: boolean;
  };
  reasons: string[];
};

/** Error Level Analysis: 95%再圧縮との差分平均から 0~1 正規化 */
async function computeElaScore(buffer: Buffer): Promise<number> {
  const img = sharp(buffer).jpeg({ quality: 98 }); // 元がPNGでも内部で扱える
  const orig = await img.raw().toBuffer({ resolveWithObject: true });
  const recompressed = await sharp(buffer).jpeg({ quality: 95 }).raw().toBuffer({ resolveWithObject: true });

  if (
    orig.info.width !== recompressed.info.width ||
    orig.info.height !== recompressed.info.height ||
    orig.info.channels !== recompressed.info.channels
  ) {
    // サイズがずれたら無理せず 0
    return 0;
  }

  let diff = 0;
  for (let i = 0; i < orig.data.length; i++) {
    diff += Math.abs(orig.data[i] - recompressed.data[i]);
  }
  const mean = diff / orig.data.length; // 0~255
  // 0~1 に雑に圧縮（経験的に 25 付近で“強い加工”の閾値になることが多い）
  return Math.max(0, Math.min(1, mean / 40));
}

const AI_STRINGS = [
  "midjourney", "stable diffusion", "automatic1111", "comfyui",
  "dal.e", "dall-e", "firefly", "bing image creator", "recraft", "runway",
  "generated", "ai generated", "dreamstudio"
];

function exifHints(exif: any): { possibleAI: boolean; reasons: string[] } {
  const txt = JSON.stringify(exif || {}).toLowerCase();
  const hits = AI_STRINGS.filter(k => txt.includes(k));
  return { possibleAI: hits.length > 0, reasons: hits.map(h => `EXIFに「${h}」らしき記述`) };
}

export async function analyzeImage(buffer: Buffer): Promise<ImageAnalysis> {
  // EXIF
  let exif: any = null;
  try { exif = await exifr.parse(buffer, { userComment: true }); } catch {}
  const noExif = !exif;

  // ELA
  const elaScore = await computeElaScore(buffer);

  // ヒューリスティック判定
  const hints = exifHints(exif);
  const heavyEditing = elaScore >= 0.6; // しきい値は後で調整

  const reasons: string[] = [];
  if (noExif) reasons.push("EXIFが見つからない（編集/スクショの可能性）");
  reasons.push(...hints.reasons);
  if (heavyEditing) reasons.push("ELAで高い差分が検出（強い加工の可能性）");

  return {
    elaScore,
    exif: exif || null,
    flags: {
      noExif,
      possibleAIGenerated: hints.possibleAI,
      heavyEditing
    },
    reasons
  };
}
