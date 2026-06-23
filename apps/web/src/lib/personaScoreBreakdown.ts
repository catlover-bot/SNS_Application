import { getPersonaProfile } from "@/lib/personaCatalog";

export type PersonaScoreFactor = {
  key: "persona_match" | "ai_style" | "consistency" | "reactions" | "recency";
  label: string;
  points: number;
  description: string;
};

export type PersonaScoreBreakdown = {
  personaKey: string;
  totalScore: number;
  confidence: number;
  factors: PersonaScoreFactor[];
  reason: string;
  recentSignals: string[];
};

type PersonaRow = {
  persona_key: string;
  score: number | null;
  confidence: number | null;
};

type PersonaDef = {
  key: string;
  title: string;
  theme: string | null;
};

type PostRow = {
  id: string;
  created_at: string;
  analysis: unknown;
};

type PostScoreRow = {
  post_id: string;
  persona_key: string;
  final_score: number | null;
};

type AiScoreRow = {
  post_id: string;
  truth: number | null;
  exaggeration: number | null;
  brag: number | null;
  joke: number | null;
  tags?: string[] | null;
};

type ReactionRow = {
  post_id: string;
  kind: string;
};

function clamp(value: number, min = 0, max = 1) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function normalize01(value: number | null | undefined) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return 0;
  return number <= 1 ? clamp(number) : clamp(number / 100);
}

function parseAnalysis(value: unknown): any {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return typeof value === "object" ? value : null;
}

function postAgeDays(createdAt: string, nowMs: number) {
  const createdMs = Date.parse(createdAt);
  if (!Number.isFinite(createdMs)) return 30;
  return Math.max(0, (nowMs - createdMs) / 86_400_000);
}

function recencyWeight(createdAt: string, nowMs: number) {
  return clamp(Math.pow(0.5, postAgeDays(createdAt, nowMs) / 21), 0.2, 1);
}

function analysisMatchStrength(analysisValue: unknown, personaKey: string) {
  const analysis = parseAnalysis(analysisValue);
  if (!analysis) return 0;
  const selected = String(analysis?.persona?.selected ?? "").trim();
  if (selected === personaKey) return 1;

  const candidates = Array.isArray(analysis?.persona?.candidates)
    ? analysis.persona.candidates
    : [];
  const match = candidates.find((candidate: any) => String(candidate?.key ?? "").trim() === personaKey);
  if (!match) return 0;
  const score = Number(match?.score ?? 0);
  return score > 0 ? Math.max(0.45, normalize01(score)) : 0.45;
}

function isRealAiScore(row: AiScoreRow) {
  const internalTags = new Set(["dummy", "fallback", "beta", "parse_error"]);
  return !(row.tags ?? []).some((tag) => internalTags.has(String(tag).trim().toLowerCase()));
}

function aiAffinity(args: {
  personaKey: string;
  theme: string;
  truth: number;
  exaggeration: number;
  brag: number;
  joke: number;
}) {
  const key = args.personaKey.toLowerCase();
  const truth = clamp(args.truth);
  const exaggeration = clamp(args.exaggeration);
  const brag = clamp(args.brag);
  const joke = clamp(args.joke);

  if (/fact|truth|sage|strategist/.test(key)) {
    return truth * 0.55 + (1 - exaggeration) * 0.3 + (1 - joke) * 0.15;
  }
  if (/comic|spark|host/.test(key)) {
    return joke * 0.5 + exaggeration * 0.3 + brag * 0.2;
  }
  if (/anchor|peace|garden|mood/.test(key)) {
    return truth * 0.35 + (1 - exaggeration) * 0.3 + (1 - brag) * 0.2 + (1 - joke) * 0.15;
  }
  if (args.theme === "chaos") {
    return joke * 0.5 + exaggeration * 0.35 + brag * 0.15;
  }
  if (args.theme === "logic") {
    return truth * 0.55 + (1 - exaggeration) * 0.3 + (1 - joke) * 0.15;
  }
  return truth * 0.3 + joke * 0.25 + (1 - exaggeration) * 0.25 + brag * 0.2;
}

function dominantAiSignal(averages: {
  truth: number;
  exaggeration: number;
  brag: number;
  joke: number;
}) {
  const entries = [
    ["事実っぽさ", averages.truth],
    ["盛ってる度", averages.exaggeration],
    ["自慢・マウント感", averages.brag],
    ["ネタ・ジョーク度", averages.joke],
  ] as const;
  return [...entries].sort((a, b) => b[1] - a[1])[0];
}

export function buildPersonaScoreBreakdowns(args: {
  personas: PersonaRow[];
  defs: PersonaDef[];
  posts: PostRow[];
  scoreRows?: PostScoreRow[];
  aiScoreRows?: AiScoreRow[];
  reactionRows?: ReactionRow[];
}): PersonaScoreBreakdown[] {
  const {
    personas,
    defs,
    posts,
    scoreRows = [],
    aiScoreRows = [],
    reactionRows = [],
  } = args;
  const nowMs = Date.now();
  const defsByKey = new Map(defs.map((definition) => [definition.key, definition]));
  const aiByPost = new Map(aiScoreRows.filter(isRealAiScore).map((row) => [row.post_id, row]));
  const reactionsByPost = new Map<string, number>();
  reactionRows.forEach((reaction) => {
    if (!reaction?.post_id) return;
    reactionsByPost.set(reaction.post_id, (reactionsByPost.get(reaction.post_id) ?? 0) + 1);
  });

  const postScoresByPersona = new Map<string, Map<string, number>>();
  scoreRows.forEach((row) => {
    const key = String(row?.persona_key ?? "").trim();
    if (!key || !row?.post_id) return;
    const map = postScoresByPersona.get(key) ?? new Map<string, number>();
    map.set(row.post_id, Math.max(map.get(row.post_id) ?? 0, normalize01(row.final_score)));
    postScoresByPersona.set(key, map);
  });

  return personas.map((persona) => {
    const personaKey = String(persona.persona_key ?? "").trim();
    const definition = defsByKey.get(personaKey);
    const title = getPersonaProfile(personaKey).displayName;
    const storedScore = normalize01(persona.score);
    const storedConfidence = normalize01(persona.confidence);
    const scoredPosts = postScoresByPersona.get(personaKey) ?? new Map<string, number>();

    let weightedMatch = 0;
    let totalRecencyWeight = 0;
    let matchingPosts = 0;
    let recentMatchingPosts = 0;
    let matchingRecencyTotal = 0;
    let reactionCount = 0;
    let aiWeight = 0;
    const aiTotals = { truth: 0, exaggeration: 0, brag: 0, joke: 0 };

    posts.forEach((post) => {
      const recency = recencyWeight(post.created_at, nowMs);
      totalRecencyWeight += recency;
      const strength = Math.max(
        scoredPosts.get(post.id) ?? 0,
        analysisMatchStrength(post.analysis, personaKey)
      );
      if (strength <= 0) return;

      weightedMatch += strength * recency;
      matchingPosts += 1;
      matchingRecencyTotal += recency;
      if (postAgeDays(post.created_at, nowMs) <= 14) recentMatchingPosts += 1;
      reactionCount += reactionsByPost.get(post.id) ?? 0;

      const ai = aiByPost.get(post.id);
      if (!ai) return;
      const weight = Math.max(0.25, strength * recency);
      aiWeight += weight;
      aiTotals.truth += normalize01(ai.truth) * weight;
      aiTotals.exaggeration += normalize01(ai.exaggeration) * weight;
      aiTotals.brag += normalize01(ai.brag) * weight;
      aiTotals.joke += normalize01(ai.joke) * weight;
    });

    const observedMatch = totalRecencyWeight > 0 ? clamp(weightedMatch / totalRecencyWeight) : 0;
    const matchStrength = clamp(storedScore * 0.7 + observedMatch * 0.3);
    const support = clamp(matchingPosts / Math.max(1, Math.min(6, posts.length || 6)));
    const consistency = clamp(observedMatch * 0.55 + support * 0.45);
    const averageRecency = matchingPosts > 0 ? clamp(matchingRecencyTotal / matchingPosts) : 0;
    const recentMomentum = clamp((recentMatchingPosts / 3) * 0.65 + averageRecency * 0.35);

    const averages = aiWeight > 0
      ? {
          truth: aiTotals.truth / aiWeight,
          exaggeration: aiTotals.exaggeration / aiWeight,
          brag: aiTotals.brag / aiWeight,
          joke: aiTotals.joke / aiWeight,
        }
      : null;
    const affinity = averages
      ? clamp(
          aiAffinity({
            personaKey,
            theme: String(definition?.theme ?? "").toLowerCase(),
            ...averages,
          })
        )
      : 0;

    const personaMatchPoints = Math.round(matchStrength * 40);
    const aiStylePoints = Math.round(affinity * 22);
    const consistencyPoints = Math.round(consistency * 18);
    const reactionPoints = Math.round(clamp(Math.log1p(reactionCount) / Math.log(16)) * 10);
    const recencyPoints = Math.round(recentMomentum * 10);
    const totalScore = Math.max(
      0,
      Math.min(100, personaMatchPoints + aiStylePoints + consistencyPoints + reactionPoints + recencyPoints)
    );
    const confidence = Math.round(
      clamp(storedConfidence * 0.55 + clamp(posts.length / 8) * 0.25 + consistency * 0.2) * 100
    );

    const factors: PersonaScoreFactor[] = [
      {
        key: "persona_match",
        label: "投稿傾向との一致",
        points: personaMatchPoints,
        description: `${matchingPosts}件の投稿に、${title}らしい言葉遣いや雰囲気が見つかりました。`,
      },
      {
        key: "ai_style",
        label: "AI判定による性格成分",
        points: aiStylePoints,
        description: averages
          ? `投稿文の事実っぽさ・盛ってる度・自慢・マウント感・ネタ・ジョーク度から、${title}に近い傾向を見ています。`
          : "実AI判定の投稿が増えると、言葉のクセによる加点が見えるようになります。",
      },
      {
        key: "consistency",
        label: "継続投稿ボーナス",
        points: consistencyPoints,
        description: matchingPosts >= 2
          ? `似たキャラ成長シグナルが${matchingPosts}件の投稿で繰り返し現れています。`
          : "似た投稿傾向が続けて現れると、あなたのキャラの輪郭が強くなります。",
      },
      {
        key: "reactions",
        label: "反応ボーナス",
        points: reactionPoints,
        description: reactionCount > 0
          ? `このキャラに近い投稿へ、いいね・保存・拡散が${reactionCount}件集まっています。`
          : "反応が集まると、そのキャラが周りに届いたシグナルとして加点されます。",
      },
      {
        key: "recency",
        label: "最近の勢い",
        points: recencyPoints,
        description: recentMatchingPosts > 0
          ? `直近14日で${recentMatchingPosts}件の投稿から成長シグナルが得られ、最近の傾向として反映されています。`
          : "最近の投稿ほど少し強く反映されます。",
      },
    ];

    const recentSignals: string[] = [];
    if (matchingPosts > 0) recentSignals.push(`${matchingPosts}件の投稿に近い成長傾向`);
    if (averages) {
      const [label, value] = dominantAiSignal(averages);
      recentSignals.push(`AI判定は「${label}」が${Math.round(value * 100)}%で最も強め`);
    }
    if (reactionCount > 0) recentSignals.push(`成長シグナルのある投稿に${reactionCount}件の反応`);
    if (recentMatchingPosts > 0) recentSignals.push(`直近14日の成長シグナル ${recentMatchingPosts}件`);
    if (!recentSignals.length) recentSignals.push("投稿が増えると、ここにキャラ成長の理由が表示されます");

    const strongest = [...factors].sort((a, b) => b.points - a.points).slice(0, 2);
    const reason = strongest.length >= 2
      ? `${title}らしさは「${strongest[0].label}」と「${strongest[1].label}」が主な理由です。投稿が増えるほど、最近の言葉のクセに合わせて内訳も変化します。`
      : `${title}らしさは、いま確認できる投稿傾向とキャラ成長シグナルから計算しています。`;

    return {
      personaKey,
      totalScore,
      confidence,
      factors,
      reason,
      recentSignals: recentSignals.slice(0, 4),
    };
  });
}
