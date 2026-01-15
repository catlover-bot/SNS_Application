// apps/web/src/lib/ai/lieJudge.ts

export type AiDimensions = {
  truth?: number;
  exaggeration?: number;
  brag?: number;
  joke?: number;
  // 将来: empathy, flame_risk などもここに足せる
};

export type AiResult = {
  dimensions: AiDimensions;
  verdict: string;
  reason: string;
  tags: string[];
};

// LLM に渡す入力
export type LieJudgeInput = {
  text: string;
  mediaUrls: string[];
  premium?: boolean;
};

// 「インターフェイス」(関数型の簡易版クリーンアーキ)
export type LieJudgeFn = (input: LieJudgeInput) => Promise<AiResult>;

// =====================================================
// 共通ユーティリティ
// =====================================================

function clampScore(v: unknown, def: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const x = Math.round(n);
  if (x < 0) return 0;
  if (x > 100) return 100;
  return x;
}

// テンプレっぽい文言 or 空かどうか
function isTemplateLike(text: string | null | undefined): boolean {
  if (!text) return true;
  const t = text.trim();
  if (!t) return true;
  return (
    t === "短い日本語で総評を書く" ||
    t.startsWith("短い日本語で総評を書く") ||
    t.includes("短い日本語で総評を書く") ||
    t === "少し長めの日本語で理由を書く（箇条書きでなくてよい）" ||
    t.includes("少し長めの日本語で理由を書く（箇条書きでなくてよい）") ||
    t === "verdict" ||
    t === "reason"
  );
}

// スコアから総評を自動生成（ちょっとバズり気味の言い回し）
function autoVerdict(dim: AiDimensions): string {
  const truth = clampScore(dim.truth, 50);
  const exaggeration = clampScore(dim.exaggeration, 50);
  const brag = clampScore(dim.brag, 0);
  const joke = clampScore(dim.joke, 0);

  // ネタ優先
  if (joke >= 80 && truth <= 60) {
    return "完全にネタ投稿。ツッコミ待ち感マシマシです。";
  }
  if (joke >= 60 && exaggeration >= 60) {
    return "だいぶ盛られたネタ投稿で、ノリ重視の内容です。";
  }

  // 大嘘系
  if (truth <= 20 && exaggeration >= 80) {
    return "ほぼフィクション級の大盛り投稿です。信じちゃダメなやつ。";
  }

  // 自慢系
  if (brag >= 70 && truth >= 50) {
    return "事実ベースの自慢投稿。かなり自己アピール強めです。";
  }
  if (brag >= 60 && exaggeration >= 50) {
    return "盛り＋マウントがほどよく混ざったイキり投稿です。";
  }

  // かなり本当
  if (truth >= 80 && exaggeration <= 40 && joke <= 40) {
    return "かなり本当寄り。だいぶ現実的な投稿です。";
  }

  // ほどよいカオス
  if (truth >= 40 && exaggeration >= 40 && joke >= 40) {
    return "事実・盛り・ネタがいい感じに混ざったカオス系投稿です。";
  }

  return "そこそこ本当だけど、ちょい盛り＆ネタ感もあるバランス型投稿です。";
}

// スコアから理由を自動生成
function autoReason(dim: AiDimensions): string {
  const truth = clampScore(dim.truth, 50);
  const exaggeration = clampScore(dim.exaggeration, 50);
  const brag = clampScore(dim.brag, 0);
  const joke = clampScore(dim.joke, 0);

  const parts: string[] = [];

  parts.push(
    `事実っぽさは ${truth}%、盛ってる度は ${exaggeration}% と判定されました。`
  );

  if (brag >= 60) {
    parts.push(
      `自慢・マウント感も ${brag}% と高めで、自己アピール成分がかなり強いです。`
    );
  } else if (brag >= 30) {
    parts.push(
      `自慢・マウント感は ${brag}% で、ほどよく自己アピールが混ざっています。`
    );
  } else {
    parts.push(
      `自慢・マウント感は ${brag}% と控えめで、あまりイキってはいないようです。`
    );
  }

  if (joke >= 70) {
    parts.push(
      `ネタ・ジョーク度は ${joke}% とかなり高く、「ノリ優先の投稿」と見なされています。`
    );
  } else if (joke >= 40) {
    parts.push(
      `ネタ・ジョーク度は ${joke}% で、真面目さと遊び心のバランスが取れています。`
    );
  } else {
    parts.push(
      `ネタ・ジョーク度は ${joke}% と低めで、比較的まじめな印象の投稿です。`
    );
  }

  return parts.join(" ");
}

// LLM から返ってきた生データを正規化＋総評/理由を補完
function normalizeResult(raw: Partial<AiResult> | null | undefined): AiResult {
  const dims = raw?.dimensions ?? {};
  const normalizedDims: AiDimensions = {
    truth: clampScore(dims.truth, 50),
    exaggeration: clampScore(dims.exaggeration, 50),
    brag: clampScore(dims.brag, 0),
    joke: clampScore(dims.joke, 0),
  };

  let verdict = raw?.verdict ?? "";
  let reason = raw?.reason ?? "";

  // verdict が JSON 文字列になっちゃってるパターンも潰す
  const vTrim = verdict.trim();
  if (
    isTemplateLike(verdict) ||
    (vTrim.startsWith("{") && vTrim.endsWith("}"))
  ) {
    verdict = autoVerdict(normalizedDims);
  }

  if (isTemplateLike(reason)) {
    reason = autoReason(normalizedDims);
  }

  const tags = Array.isArray(raw?.tags)
    ? raw!.tags!.map((t) => String(t))
    : [];

  return {
    dimensions: normalizedDims,
    verdict,
    reason,
    tags,
  };
}

/**
 * LLM の content から JSON を頑張って抜き出してパースする。
 * - まず素直に JSON.parse
 * - ダメなら ```json ... ``` / ``` ... ``` を剥がす
 * - それでもダメなら 「最初の { 〜 最後の }」 を抽出して再チャレンジ
 */
function parseAiResultFromContent(content: string): AiResult | null {
  const text = content.trim();

  // 1) そのまま JSON としてパース
  try {
    const parsed = JSON.parse(text);
    return normalizeResult(parsed);
  } catch {
    // 続行
  }

  // 2) ```json ... ``` / ``` ... ``` を剥がす
  const fencedMatch = text.match(/```(?:json)?([\s\S]*?)```/i);
  const stripped = fencedMatch ? fencedMatch[1].trim() : text;

  try {
    const parsed = JSON.parse(stripped);
    return normalizeResult(parsed);
  } catch {
    // 続行
  }

  // 3) 最初の { 〜 最後の } だけ抜き出してトライ
  const first = stripped.indexOf("{");
  const last = stripped.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    const maybeJson = stripped.slice(first, last + 1);
    try {
      const parsed = JSON.parse(maybeJson);
      return normalizeResult(parsed);
    } catch {
      // もう諦める
    }
  }

  return null;
}

// =====================================================
// Provider: Dummy (Vercel 本番 / デフォルト)
// =====================================================

const dummyLieJudge: LieJudgeFn = async (input) => {
  const len = input.text.length;
  const base = len === 0 ? 0.5 : Math.min(1, len / 200);
  const truthRaw = 70 + Math.round((base - 0.5) * 40); // だいたい 50〜90

  const raw: Partial<AiResult> = {
    dimensions: {
      truth: truthRaw,
      exaggeration: 30,
      brag: 20,
      joke: 10,
    },
    verdict: "ベータ版：ダミー判定中",
    reason:
      "本番環境では、コスト保護のため簡易ロジックでスコアを生成しています。ローカル環境では LLM による詳細判定が行われます。",
    tags: ["beta", "dummy"],
  };

  // dummy も normalizeResult を通すことで、将来の仕様変更に耐えやすく
  return normalizeResult(raw);
};

// =====================================================
// Provider: Ollama (ローカル・開発用)
// =====================================================

const ollamaBaseUrl =
  process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const ollamaModelName =
  process.env.OLLAMA_MODEL_NAME ?? "llama3.2:1b";

const ollamaLieJudge: LieJudgeFn = async (input) => {
  const textForPrompt =
    (input.text ?? "").trim().length > 0
      ? input.text
      : "(本文なし)";

  const prompt = `
あなたはSNS投稿の「嘘/誇張/自慢/ネタ度」を数値で評価するアシスタントです。

以下の投稿本文を読み、次の項目について 0〜100 の整数でスコアを付けてください。

- truth: どのくらい事実っぽいか（高いほど本当っぽい）
- exaggeration: どのくらい盛っていそうか
- brag: 自慢・マウントのニュアンス
- joke: ネタ・冗談要素

出力フォーマットは **必ず** 次の JSON オブジェクト「のみ」にしてください。
説明文やコードブロック記法(\\\`\\\`\\\`)は付けないでください。

{
  "dimensions": { "truth": 70, "exaggeration": 40, "brag": 20, "joke": 10 },
  "verdict": "投稿全体の印象を短い日本語で総評する",
  "reason": "なぜそのように判定したのかを少し長めの日本語で説明する（箇条書きでなくてよい）",
  "tags": ["一言タグ1", "一言タグ2"]
}

投稿本文:
${textForPrompt}
`.trim();

  console.log("[ollamaLieJudge] call", {
    baseUrl: ollamaBaseUrl,
    model: ollamaModelName,
    textLength: textForPrompt.length,
  });

  const res = await fetch(`${ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ollamaModelName,
      messages: [
        {
          role: "system",
          content:
            "You are a strict JSON-only responder. Always output a single valid JSON object and nothing else.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[ollamaLieJudge] HTTP error", res.status, text);
    throw new Error(
      `Ollama error: HTTP ${res.status} ${text || res.statusText}`
    );
  }

  const json = await res.json().catch((e) => {
    console.error("[ollamaLieJudge] failed to parse JSON from Ollama:", e);
    return null as any;
  });

  console.log(
    "[ollamaLieJudge] raw response (truncated)",
    JSON.stringify(json).slice(0, 500)
  );

  const content: string =
    json?.message?.content ??
    json?.choices?.[0]?.message?.content ??
    "";

  console.log(
    "[ollamaLieJudge] content (truncated)",
    typeof content === "string" ? content.slice(0, 500) : content
  );

  const parsed = parseAiResultFromContent(content);

  if (!parsed) {
    console.warn(
      "[ollamaLieJudge] failed to parse AI result, fallback to parse_error"
    );
    return {
      dimensions: {
        truth: 50,
        exaggeration: 50,
        brag: 0,
        joke: 0,
      },
      verdict: "判定に失敗しました",
      reason: "LLM 応答の JSON 解析に失敗しました。",
      tags: ["parse_error"],
    };
  }

  return parsed;
};

// =====================================================
// Provider Factory: 環境変数で切り替え
// =====================================================

/**
 * LIE_JUDGE_PROVIDER によって使用する実装を切り替える。
 * - "ollama": ローカル開発用（Ollama に直叩き）
 * - "dummy" or 未設定: ダミー（Vercel 本番など）
 */
export function getLieJudge(): LieJudgeFn {
  const provider = process.env.LIE_JUDGE_PROVIDER ?? "dummy";

  console.log("[AI] LIE_JUDGE_PROVIDER =", provider);

  if (provider === "ollama") {
    console.log("[AI] use Ollama judge", {
      baseUrl: ollamaBaseUrl,
      model: ollamaModelName,
    });
    return ollamaLieJudge;
  }

  console.log("[AI] use dummy judge");
  return dummyLieJudge;
}
