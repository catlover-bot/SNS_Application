export type PersonaEvolutionStageKey =
  | "discovery"
  | "growth"
  | "awakening"
  | "final";

export type PersonaEvolutionStage = {
  key: PersonaEvolutionStageKey;
  level: 1 | 2 | 3 | 4;
  label: string;
  shortLabel: string;
  description: string;
  minProgress: number;
};

export type PersonaEvolutionProgress = {
  personaKey: string;
  stage: PersonaEvolutionStage;
  progressPercent: number;
  nextStage: PersonaEvolutionStage | null;
  nextRequirementText: string;
  unlockedStages: PersonaEvolutionStageKey[];
  remainingHints: string[];
};

export type PersonaEvolutionInput = {
  personaKey: string;
  score: number | null | undefined;
  confidence: number | null | undefined;
  matchingSignals?: number | null;
};

export const PERSONA_EVOLUTION_STAGES: readonly PersonaEvolutionStage[] = [
  {
    key: "discovery",
    level: 1,
    label: "発見期",
    shortLabel: "発見",
    description: "成長シグナルが見つかり、恐竜の輪郭が見え始めた状態。",
    minProgress: 0,
  },
  {
    key: "growth",
    level: 2,
    label: "成長期",
    shortLabel: "成長",
    description: "同じ投稿傾向が重なり、その恐竜らしさが安定してきた状態。",
    minProgress: 40,
  },
  {
    key: "awakening",
    level: 3,
    label: "覚醒期",
    shortLabel: "覚醒",
    description: "投稿傾向とAI判定の一貫性が高まり、個性がはっきりした状態。",
    minProgress: 70,
  },
  {
    key: "final",
    level: 4,
    label: "最終進化",
    shortLabel: "最終",
    description: "継続投稿と高いキャラスコアによって到達する特別な状態。",
    minProgress: 90,
  },
] as const;

function clampPercent(value: number | null | undefined) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  const percent = parsed <= 1 ? parsed * 100 : parsed;
  return Math.max(0, Math.min(100, percent));
}

function clampRatio(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function approximateSignalCount(score: number, confidence: number) {
  // Some lightweight callers only have user_personas. The authenticated profile
  // builder supplies the exact matching-post count instead.
  return Math.max(0, Math.min(12, Math.floor((score * 0.8 + confidence * 0.2) / 10)));
}

export function buildPersonaEvolutionProgress(
  input: PersonaEvolutionInput
): PersonaEvolutionProgress {
  const score = Math.round(clampPercent(input.score));
  const confidence = Math.round(clampPercent(input.confidence));
  const hasExactSignals =
    input.matchingSignals !== null &&
    input.matchingSignals !== undefined &&
    Number.isFinite(Number(input.matchingSignals));
  const matchingSignals = hasExactSignals
    ? Math.max(0, Math.floor(Number(input.matchingSignals)))
    : approximateSignalCount(score, confidence);

  const reachesFinal = score >= 90 && confidence >= 70 && matchingSignals >= 8;
  const reachesAwakening = score >= 70 && matchingSignals >= 5;
  const reachesGrowth = score >= 40 || matchingSignals >= 3;
  const stage = PERSONA_EVOLUTION_STAGES[
    reachesFinal ? 3 : reachesAwakening ? 2 : reachesGrowth ? 1 : 0
  ];
  const nextStage = PERSONA_EVOLUTION_STAGES[stage.level] ?? null;

  let progressPercent = 100;
  let nextRequirementText = "最終進化に到達しました。これからの投稿も、この恐竜らしさを育てます。";
  let remainingHints: string[] = [];

  if (stage.key === "discovery") {
    progressPercent = Math.round(
      Math.max(clampRatio(score / 40), clampRatio(matchingSignals / 3)) * 100
    );
    const scoreRemaining = Math.max(0, 40 - score);
    const signalRemaining = Math.max(0, 3 - matchingSignals);
    nextRequirementText = `キャラスコアをあと${scoreRemaining}pt伸ばすか、成長シグナルをあと${signalRemaining}件重ねると成長期です。`;
    remainingHints = [
      `キャラスコアをあと${scoreRemaining}pt伸ばす`,
      `同じ投稿傾向の成長シグナルをあと${signalRemaining}件重ねる`,
    ];
  } else if (stage.key === "growth") {
    progressPercent = Math.round(
      Math.min(clampRatio(score / 70), clampRatio(matchingSignals / 5)) * 100
    );
    if (score < 70) remainingHints.push(`キャラスコアをあと${70 - score}pt伸ばす`);
    if (matchingSignals < 5) {
      remainingHints.push(`この恐竜らしい成長シグナルをあと${5 - matchingSignals}件重ねる`);
    }
    nextRequirementText = remainingHints.length
      ? `残りの条件は、${remainingHints.join("、")}ことです。満たすと覚醒期に進化します。`
      : "投稿傾向を保つと覚醒期に近づきます。";
  } else if (stage.key === "awakening") {
    progressPercent = Math.round(
      Math.min(
        clampRatio(score / 90),
        clampRatio(confidence / 70),
        clampRatio(matchingSignals / 8)
      ) * 100
    );
    if (score < 90) remainingHints.push(`キャラスコアをあと${90 - score}pt伸ばす`);
    if (confidence < 70) {
      remainingHints.push(`分析の確からしさをあと${70 - confidence}%高める`);
    }
    if (matchingSignals < 8) {
      remainingHints.push(`この恐竜らしい成長シグナルをあと${8 - matchingSignals}件重ねる`);
    }
    nextRequirementText = `最終進化には、${remainingHints.join("、")}ことが必要です。`;
  }

  return {
    personaKey: input.personaKey,
    stage,
    progressPercent: Math.max(0, Math.min(100, progressPercent)),
    nextStage,
    nextRequirementText,
    unlockedStages: PERSONA_EVOLUTION_STAGES.slice(0, stage.level).map((item) => item.key),
    remainingHints,
  };
}
