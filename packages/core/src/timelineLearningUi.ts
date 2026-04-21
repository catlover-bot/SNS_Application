import type { TimelineSignalWeightsHistoryPoint } from "./socialDataContracts";
import type { TimelineSignalLearningInput, TimelineSignalWeights } from "./timelineRanking";

function clamp(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

export type TimelineLearningStage = "observing" | "learning" | "stable";

export type TimelineLearningDeltaSummary = {
  saved: number;
  followed: number;
  openedPenalty: number;
};

export type TimelineLearningSectionSummary = {
  title: string;
  subtitle: string;
  stage: TimelineLearningStage;
  stageLabel: string;
  stageDescription: string;
  metrics: Array<{ key: "updates" | "opened" | "saved" | "followed"; label: string; value: number }>;
  chartCaption: string;
  historyEmptyHint: string;
  unavailableHint: string;
  currentWeightsTitle: string;
  recentUpdatesTitle: string;
};

export type TimelineLearningActionTip = {
  key: string;
  label: string;
  detail: string;
  priority: number;
};

export function timelineWeightHistoryStrength(point: TimelineSignalWeightsHistoryPoint): number {
  const w = point.weights;
  const strength =
    w.followedAuthorBoost * 0.22 +
    w.savedPostBoost * 0.28 +
    w.interestedAuthorBoost * 0.18 +
    w.interestedPersonaBoost * 0.14 +
    (0.35 - w.openedPenalty) * 0.14 +
    w.predictedBuzzWeight * 0.04;
  return clamp(strength, 0, 1);
}

export function buildTimelineWeightTrendRatios(
  history: TimelineSignalWeightsHistoryPoint[],
  maxPoints = 16
): number[] {
  const values = history.slice(-Math.max(2, maxPoints)).map(timelineWeightHistoryStrength);
  if (values.length < 2) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(0.001, max - min);
  return values.map((v) => Math.max(0.12, (v - min) / span));
}

export function buildTimelineWeightTrendDeltaSummary(
  history: TimelineSignalWeightsHistoryPoint[],
  windowSize = 10
): TimelineLearningDeltaSummary | null {
  if (history.length < 2) return null;
  const windowed = history.slice(-Math.max(2, windowSize));
  const first = windowed[0];
  const last = windowed[windowed.length - 1];
  if (!first || !last) return null;
  return {
    saved: Math.round((last.weights.savedPostBoost - first.weights.savedPostBoost) * 100),
    followed: Math.round((last.weights.followedAuthorBoost - first.weights.followedAuthorBoost) * 100),
    openedPenalty: Math.round((last.weights.openedPenalty - first.weights.openedPenalty) * 100),
  };
}

export function buildTimelineLearningSectionSummary(args: {
  weightsSamples?: number | null;
  learningInput?: TimelineSignalLearningInput | null;
  historyCount?: number | null;
  weightsAvailable?: boolean;
}): TimelineLearningSectionSummary {
  const weightsSamples = Math.max(0, Math.floor(Number(args.weightsSamples ?? 0) || 0));
  const opened = Math.max(0, Math.floor(Number(args.learningInput?.openedCount ?? 0) || 0));
  const saved = Math.max(0, Math.floor(Number(args.learningInput?.savedCount ?? 0) || 0));
  const followed = Math.max(0, Math.floor(Number(args.learningInput?.followedCount ?? 0) || 0));
  const historyCount = Math.max(0, Math.floor(Number(args.historyCount ?? 0) || 0));
  const weightsAvailable = args.weightsAvailable !== false;

  const stage: TimelineLearningStage =
    weightsSamples >= 18 ? "stable" : weightsSamples >= 5 ? "learning" : "observing";
  const stageLabel =
    stage === "stable" ? "安定運用" : stage === "learning" ? "学習中" : "観測中";
  const stageDescription =
    stage === "stable"
      ? "フォロー・保存・開封の傾向が蓄積され、TLの表示順が安定して個人最適化されます。"
      : stage === "learning"
        ? "反応からおすすめ傾向を学習中です。保存・フォロー・開封が表示順に反映されます。"
        : "まずは開封・保存・フォローの反応を観測して、おすすめの基準を作ります。";

  return {
    title: "学習/おすすめ",
    subtitle: "フォロー/保存/開封の反応からTLのおすすめ順を最適化します。",
    stage,
    stageLabel,
    stageDescription,
    metrics: [
      { key: "updates", label: "更新", value: weightsSamples },
      { key: "opened", label: "開封", value: opened },
      { key: "saved", label: "保存", value: saved },
      { key: "followed", label: "フォロー", value: followed },
    ],
    chartCaption:
      "左から古い順。保存/フォロー/興味/開封抑制の重みバランスが、あなた向けにどう変わったかを表示します。",
    historyEmptyHint:
      historyCount > 0
        ? "履歴が少ないため、チャートは次回以降に表示されます。"
        : "まだ学習履歴がありません。TLを開いて投稿を見たり保存すると増えます。",
    unavailableHint:
      weightsAvailable
        ? "履歴データはまだありません。"
        : "`user_timeline_signal_weights` 系テーブル未適用のため、学習履歴は利用できません。",
    currentWeightsTitle: "現在のおすすめ重み",
    recentUpdatesTitle: "最近の学習更新",
  };
}

export function formatTimelineWeightPointLabel(
  value: number,
  opts?: { signed?: boolean; suffix?: string }
): string {
  const rounded = Math.round(Number(value) || 0);
  const suffix = opts?.suffix ?? "";
  if (opts?.signed) {
    if (rounded === 0) return `±0${suffix}`;
    return `${rounded > 0 ? "+" : ""}${rounded}${suffix}`;
  }
  return `${rounded}${suffix}`;
}

export function formatTimelineWeightPercentPoint(v: number): string {
  return `${Math.round((Number(v) || 0) * 100)}pt`;
}

export function buildTimelineLearningActionTips(args: {
  weightsSamples?: number | null;
  learningInput?: TimelineSignalLearningInput | null;
  weights?: TimelineSignalWeights | null;
  history?: TimelineSignalWeightsHistoryPoint[] | null;
  maxItems?: number;
}): TimelineLearningActionTip[] {
  const weightsSamples = Math.max(0, Math.floor(Number(args.weightsSamples ?? 0) || 0));
  const opened = Math.max(0, Math.floor(Number(args.learningInput?.openedCount ?? 0) || 0));
  const saved = Math.max(0, Math.floor(Number(args.learningInput?.savedCount ?? 0) || 0));
  const followed = Math.max(0, Math.floor(Number(args.learningInput?.followedCount ?? 0) || 0));
  const history = Array.isArray(args.history) ? args.history : [];
  const weights = args.weights ?? null;
  const maxItems = Math.max(1, Math.min(5, Math.floor(Number(args.maxItems ?? 3) || 3)));

  const tips: TimelineLearningActionTip[] = [];
  const push = (tip: TimelineLearningActionTip) => {
    if (tips.some((x) => x.key === tip.key)) return;
    tips.push(tip);
  };

  if (opened < 5) {
    push({
      key: "open-more",
      label: "まずは開封を増やす",
      detail: "TLを数件開くと、好みの傾向を学習する基準が作られます。",
      priority: 100,
    });
  }
  if (opened >= 3 && saved === 0) {
    push({
      key: "save-signal",
      label: "刺さった投稿を保存する",
      detail: "保存は強い好みシグナルです。おすすめ順が速く安定します。",
      priority: 95,
    });
  } else if (opened >= 6 && saved < Math.max(1, Math.floor(opened * 0.08))) {
    push({
      key: "save-more",
      label: "保存を少し増やす",
      detail: "開封に比べて保存が少ないため、好みの輪郭がまだ弱めです。",
      priority: 78,
    });
  }
  if (followed === 0 && opened >= 3) {
    push({
      key: "follow-authors",
      label: "好みの作者をフォローする",
      detail: "フォローは作者軸のおすすめに強く効きます。",
      priority: 92,
    });
  } else if (opened >= 10 && followed < Math.max(1, Math.floor(opened * 0.05))) {
    push({
      key: "follow-balance",
      label: "作者フォローで偏りを補強",
      detail: "保存だけでなくフォローも使うと、継続的に見たい投稿が上がりやすくなります。",
      priority: 70,
    });
  }
  if (weights && weights.openedPenalty > 0.22 && saved <= Math.max(1, Math.floor(opened * 0.1))) {
    push({
      key: "open-penalty-balance",
      label: "開封だけの反応を減らす",
      detail: "既読抑制が強めです。保存/フォローを混ぜるとおすすめが改善しやすくなります。",
      priority: 88,
    });
  }
  if (weightsSamples > 0 && history.length < 2) {
    push({
      key: "history-grow",
      label: "数回使って推移を育てる",
      detail: "学習履歴が増えると、重みの変化をチャートで追いやすくなります。",
      priority: 55,
    });
  }
  if (weightsSamples >= 18 && history.length >= 6) {
    const delta = buildTimelineWeightTrendDeltaSummary(history, 10);
    if (delta && Math.abs(delta.saved) + Math.abs(delta.followed) + Math.abs(delta.openedPenalty) < 8) {
      push({
        key: "stable-refresh",
        label: "学習は安定中",
        detail: "精度は安定しています。新しいジャンルは保存/フォローで少しずつ教えると反映されます。",
        priority: 40,
      });
    }
  }
  if (tips.length === 0) {
    push({
      key: "keep-using",
      label: "このまま使ってOK",
      detail: "開封/保存/フォローのバランスが良く、TL学習は順調です。",
      priority: 10,
    });
  }

  return tips.sort((a, b) => b.priority - a.priority).slice(0, maxItems);
}

export function getTimelineLearningPrimaryMetrics(args: {
  weightsSamples?: number | null;
  learningInput?: TimelineSignalLearningInput | null;
}): Record<"updates" | "opened" | "saved" | "followed", number> {
  return {
    updates: Math.max(0, Math.floor(Number(args.weightsSamples ?? 0) || 0)),
    opened: Math.max(0, Math.floor(Number(args.learningInput?.openedCount ?? 0) || 0)),
    saved: Math.max(0, Math.floor(Number(args.learningInput?.savedCount ?? 0) || 0)),
    followed: Math.max(0, Math.floor(Number(args.learningInput?.followedCount ?? 0) || 0)),
  };
}

export function toTimelineWeightsRows(weights?: TimelineSignalWeights | null) {
  if (!weights) return [] as Array<{ label: string; value: number }>;
  return [
    { label: "保存ブースト", value: weights.savedPostBoost },
    { label: "フォローブースト", value: weights.followedAuthorBoost },
    { label: "開封済み抑制", value: weights.openedPenalty },
    { label: "興味作者", value: weights.interestedAuthorBoost },
    { label: "興味キャラ", value: weights.interestedPersonaBoost },
    { label: "基礎スコア", value: weights.baseScoreWeight },
    { label: "予測反応", value: weights.predictedBuzzWeight },
    { label: "新しさ", value: weights.recencyWeight },
  ];
}
