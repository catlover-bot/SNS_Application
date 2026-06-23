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
  confidence?: number;
  provider?: string;
  fallback?: boolean;
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
    return "ツッコミ待ちのネタ投稿";
  }
  if (joke >= 60 && exaggeration >= 60) {
    return "盛りとユーモアが効いた投稿";
  }

  // 大嘘系
  if (truth <= 20 && exaggeration >= 80) {
    return "かなり大胆に盛った表現";
  }

  // 自慢系
  if (brag >= 70 && truth >= 50) {
    return "自信が伝わる自己アピール投稿";
  }
  if (brag >= 60 && exaggeration >= 50) {
    return "勢いのある自己アピール投稿";
  }

  // かなり本当
  if (truth >= 80 && exaggeration <= 40 && joke <= 40) {
    return "具体性のある本音寄り投稿";
  }

  // ほどよいカオス
  if (truth >= 40 && exaggeration >= 40 && joke >= 40) {
    return "本音と遊び心が混ざる投稿";
  }

  return "自然体に少し遊び心を加えた投稿";
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

function normalizeReason(reason: string, dim: AiDimensions): string {
  const source = isTemplateLike(reason) ? autoReason(dim) : reason;
  const compact = source.replace(/\s+/g, " ").trim();
  const rawSentences = compact.match(/[^。！？!?]+[。！？!?]?/g) ?? [];
  const sentences = rawSentences
    .map((sentence) => sentence.trim().replace(/[。！？!?]+$/g, ""))
    .filter(Boolean)
    .slice(0, 3)
    .map((sentence) => `${sentence}。`);

  if (sentences.length === 0) {
    return autoReason(dim);
  }

  if (sentences.length === 1) {
    const truth = clampScore(dim.truth, 50);
    const exaggeration = clampScore(dim.exaggeration, 50);
    sentences.push(
      `言葉の具体性とSNSらしい表現の強さから、事実らしさ${truth}%・誇張${exaggeration}%のバランスとして見ています。`
    );
  }

  return sentences.join("");
}

const INTERNAL_FALLBACK_TAGS = new Set(["beta", "dummy", "fallback", "parse_error"]);

function scoreBasedTags(dim: AiDimensions): string[] {
  const truth = clampScore(dim.truth, 50);
  const exaggeration = clampScore(dim.exaggeration, 50);
  const brag = clampScore(dim.brag, 0);
  const joke = clampScore(dim.joke, 0);

  return [
    truth >= 70 ? "現実味あり" : truth <= 35 ? "大胆な主張" : "本音と盛り",
    exaggeration >= 60 ? "盛り気味" : "等身大",
    brag >= 60 ? "自己アピール" : "自然体",
    joke >= 60 ? "ユーモア" : "まじめ寄り",
  ];
}

function normalizeTags(rawTags: unknown, dim: AiDimensions): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();

  const add = (raw: unknown) => {
    const tag = String(raw ?? "")
      .trim()
      .replace(/^#+/, "")
      .replace(/\s+/g, " ")
      .slice(0, 16);
    const key = tag.toLowerCase();
    if (
      !tag ||
      seen.has(key) ||
      /^一言タグ\d*$/i.test(tag) ||
      tag === "タグ1" ||
      tag === "タグ2"
    ) {
      return;
    }
    seen.add(key);
    tags.push(tag);
  };

  if (Array.isArray(rawTags)) {
    rawTags.forEach(add);
  }

  let usefulCount = tags.filter(
    (tag) => !INTERNAL_FALLBACK_TAGS.has(tag.toLowerCase())
  ).length;
  for (const fallbackTag of scoreBasedTags(dim)) {
    if (usefulCount >= 3 || tags.length >= 5) break;
    const before = tags.length;
    add(fallbackTag);
    if (tags.length > before) usefulCount += 1;
  }

  return tags.slice(0, 5);
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

  let verdict = typeof raw?.verdict === "string" ? raw.verdict : "";
  const rawReason = typeof raw?.reason === "string" ? raw.reason : "";

  // verdict が JSON 文字列になっちゃってるパターンも潰す
  const vTrim = verdict.trim();
  if (
    isTemplateLike(verdict) ||
    (vTrim.startsWith("{") && vTrim.endsWith("}"))
  ) {
    verdict = autoVerdict(normalizedDims);
  }

  verdict = verdict.trim();
  if (verdict.length > 48) verdict = autoVerdict(normalizedDims);

  const reason = normalizeReason(rawReason, normalizedDims);
  const tags = normalizeTags(raw?.tags, normalizedDims);
  const confidence =
    raw?.confidence == null ? undefined : clampScore(raw.confidence, 50);
  const provider =
    typeof raw?.provider === "string"
      ? raw.provider.trim().slice(0, 32) || undefined
      : undefined;

  return {
    dimensions: normalizedDims,
    verdict,
    reason,
    tags,
    ...(confidence == null ? {} : { confidence }),
    ...(provider ? { provider } : {}),
    ...(typeof raw?.fallback === "boolean" ? { fallback: raw.fallback } : {}),
  };
}

/**
 * LLM の content から JSON を頑張って抜き出してパースする。
 * - まず素直に JSON.parse
 * - ダメなら ```json ... ``` / ``` ... ``` を剥がす
 * - それでもダメなら 「最初の { 〜 最後の }」 を抽出して再チャレンジ
 */
function hasCompleteAiResultShape(raw: unknown): raw is AiResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;

  const candidate = raw as Record<string, unknown>;
  const dimensions = candidate.dimensions;
  if (!dimensions || typeof dimensions !== "object" || Array.isArray(dimensions)) {
    return false;
  }

  const scores = dimensions as Record<string, unknown>;
  const hasAllScores = ["truth", "exaggeration", "brag", "joke"].every(
    (key) => typeof scores[key] === "number" && Number.isFinite(scores[key])
  );

  return (
    hasAllScores &&
    typeof candidate.verdict === "string" &&
    typeof candidate.reason === "string" &&
    Array.isArray(candidate.tags) &&
    candidate.tags.every((tag) => typeof tag === "string")
  );
}

function parseAiResultFromContent(
  content: string,
  options: { requireCompleteShape?: boolean } = {}
): AiResult | null {
  const text = content.trim();

  const parseCandidate = (candidate: string): AiResult | null => {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (options.requireCompleteShape && !hasCompleteAiResultShape(parsed)) {
        return null;
      }
      return normalizeResult(parsed as Partial<AiResult>);
    } catch {
      return null;
    }
  };

  // 1) そのまま JSON としてパース
  const direct = parseCandidate(text);
  if (direct) return direct;

  // 2) ```json ... ``` / ``` ... ``` を剥がす
  const fencedMatch = text.match(/```(?:json)?([\s\S]*?)```/i);
  const stripped = fencedMatch ? fencedMatch[1].trim() : text;

  const unfenced = parseCandidate(stripped);
  if (unfenced) return unfenced;

  // 3) 最初の { 〜 最後の } だけ抜き出してトライ
  const first = stripped.indexOf("{");
  const last = stripped.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    const maybeJson = stripped.slice(first, last + 1);
    const extracted = parseCandidate(maybeJson);
    if (extracted) return extracted;
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
    tags: ["fallback", "dummy"],
    provider: "dummy",
    fallback: true,
  };

  // dummy も normalizeResult を通すことで、将来の仕様変更に耐えやすく
  return normalizeResult(raw);
};

// =====================================================
// Provider: Groq (OpenAI-compatible API)
// =====================================================

const groqApiBaseUrl =
  process.env.GROQ_API_BASE_URL ?? "https://api.groq.com/openai/v1";
const groqModelName =
  process.env.GROQ_MODEL_NAME ?? "llama-3.1-8b-instant";
const timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? 8000);

type GroqFallbackReason =
  | "missing_api_key"
  | "timeout"
  | "network_error"
  | "http_error"
  | "invalid_response";

function buildGroqPrompt(input: LieJudgeInput): string {
  const textForPrompt =
    (input.text ?? "").trim().length > 0 ? input.text : "(本文なし)";

  return `
あなたはSNS投稿の「本当っぽさ・誇張・自慢・ネタ度」を評価するAIです。

投稿本文だけを読み、外部検索や事実確認を行ったとは主張せず、文章の内容・表現・トーンから推定してください。
相手を傷つける断定、誹謗中傷、差別的または名誉を傷つける表現は避け、遊び心は保ちつつ敵対的にならないでください。

次の4項目を0〜100の整数で評価してください。
- truth: 事実らしさ、現実味。本当っぽいほど高い
- exaggeration: 盛っている感じ、誇張の強さ
- brag: 自慢、マウント、自己アピールの強さ
- joke: ネタ、冗談、皮肉、ミーム感の強さ

verdict、reason、tagsは自然な日本語にしてください。
- verdict: SNSの商品画面になじむ、短く自然な日本語フレーズにする。堅すぎず、幼すぎず、攻撃的にしない
- reason: 必ず2〜3文にする。本文の言葉遣い、トーン、具体性、SNS上のニュアンスを根拠として説明する
- reason: 外部検索や事実確認をしたとは書かず、本文から読み取れる範囲だと分かる表現にする
- tags: UIで使いやすい短い日本語タグを、重複なしで3〜5個にする
必ず次のスキーマに一致するJSONオブジェクトだけを返し、Markdownや説明文を付けないでください。

{
  "dimensions": {
    "truth": 70,
    "exaggeration": 40,
    "brag": 20,
    "joke": 10
  },
  "verdict": "具体性のある前向きな進捗投稿",
  "reason": "作業内容が具体的に書かれており、現実的な進捗報告として読めます。一方で前向きな言い切りには少し勢いがあり、控えめな自己アピールも感じられます。",
  "tags": ["進捗報告", "具体的", "前向き", "開発メモ"]
}

投稿本文:
${JSON.stringify(textForPrompt)}
`.trim();
}

function shouldRetryGroqWithoutResponseFormat(status: number, body: string) {
  if (status !== 400 && status !== 422) return false;
  return /response[_ -]?format|json_object/i.test(body);
}

async function groqFallback(
  input: LieJudgeInput,
  reason: GroqFallbackReason,
  status?: number
) {
  console.warn("[groqLieJudge] falling back to dummy", {
    reason,
    ...(typeof status === "number" ? { status } : {}),
    model: groqModelName,
  });
  return dummyLieJudge(input);
}

const groqLieJudge: LieJudgeFn = async (input) => {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    return groqFallback(input, "missing_api_key");
  }

  const prompt = buildGroqPrompt(input);
  const controller = new AbortController();
  const safeTimeoutMs =
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 8000;
  const timer = setTimeout(() => controller.abort(), safeTimeoutMs);
  const url = `${groqApiBaseUrl.replace(/\/+$/, "")}/chat/completions`;

  const request = (includeResponseFormat: boolean) =>
    fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: groqModelName,
        messages: [
          {
            role: "system",
            content:
              "You are a strict JSON-only evaluator. Return exactly one valid JSON object and no markdown.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 600,
        ...(includeResponseFormat
          ? { response_format: { type: "json_object" } }
          : {}),
      }),
      signal: controller.signal,
    });

  try {
    let res = await request(true);

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      if (shouldRetryGroqWithoutResponseFormat(res.status, errorBody)) {
        console.warn("[groqLieJudge] retrying without response_format", {
          status: res.status,
          model: groqModelName,
        });
        res = await request(false);
      } else {
        return groqFallback(input, "http_error", res.status);
      }
    }

    if (!res.ok) {
      return groqFallback(input, "http_error", res.status);
    }

    const json: any = await res.json().catch(() => null);
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return groqFallback(input, "invalid_response");
    }

    const parsed = parseAiResultFromContent(content, {
      requireCompleteShape: true,
    });
    if (!parsed) {
      return groqFallback(input, "invalid_response");
    }

    return {
      ...parsed,
      provider: "groq",
      fallback: false,
    };
  } catch {
    return groqFallback(
      input,
      controller.signal.aborted ? "timeout" : "network_error"
    );
  } finally {
    clearTimeout(timer);
  }
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
    console.error("[ollamaLieJudge] HTTP error", {
      status: res.status,
      model: ollamaModelName,
    });
    throw new Error(`Ollama error: HTTP ${res.status}`);
  }

  const json = await res.json().catch(() => {
    console.error("[ollamaLieJudge] failed to parse response JSON", {
      model: ollamaModelName,
    });
    return null as any;
  });

  const content: string =
    json?.message?.content ??
    json?.choices?.[0]?.message?.content ??
    "";

  const parsed = parseAiResultFromContent(content);

  if (!parsed) {
    console.warn(
      "[ollamaLieJudge] failed to parse AI result, fallback to parse_error"
    );
    return normalizeResult({
      dimensions: {
        truth: 50,
        exaggeration: 50,
        brag: 0,
        joke: 0,
      },
      verdict: "判定に失敗しました",
      reason: "LLM 応答の JSON 解析に失敗しました。",
      tags: ["fallback", "parse_error"],
      provider: "ollama",
      fallback: true,
    });
  }

  return {
    ...parsed,
    provider: "ollama",
    fallback: false,
  };
};

// =====================================================
// Provider Factory: 環境変数で切り替え
// =====================================================

/**
 * LIE_JUDGE_PROVIDER によって使用する実装を切り替える。
 * - "groq": 本番向け（Groq OpenAI-compatible API）
 * - "ollama": ローカル開発用（Ollama に直叩き）
 * - "dummy" or 未設定: ダミー（Vercel 本番など）
 */
export function getLieJudge(): LieJudgeFn {
  const provider = (process.env.LIE_JUDGE_PROVIDER ?? "dummy").toLowerCase();

  if (provider === "groq") {
    console.log("[AI] use Groq judge", { model: groqModelName });
    return groqLieJudge;
  }

  if (provider === "ollama") {
    console.log("[AI] use Ollama judge", {
      baseUrl: ollamaBaseUrl,
      model: ollamaModelName,
    });
    return ollamaLieJudge;
  }

  if (provider !== "dummy") {
    console.warn("[AI] unknown lie judge provider; using dummy");
  }
  console.log("[AI] use dummy judge");
  return dummyLieJudge;
}
