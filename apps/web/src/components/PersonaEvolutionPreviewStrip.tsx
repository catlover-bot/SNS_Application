"use client";

import type { CSSProperties } from "react";
import AnimatedPersonaImage from "@/components/AnimatedPersonaImage";
import {
  PERSONA_EVOLUTION_STAGES,
  type PersonaEvolutionStage,
  type PersonaEvolutionStageKey,
} from "@/lib/personaEvolution";

type PersonaEvolutionPreviewVariant = "strip" | "showcase" | "compact";

type PersonaEvolutionPreviewStripProps = {
  personaKey: string;
  displayName: string;
  currentStageKey?: PersonaEvolutionStageKey | null;
  unlockedStages?: PersonaEvolutionStageKey[];
  variant?: PersonaEvolutionPreviewVariant;
  interactive?: boolean;
  className?: string;
};

function stageState({
  stage,
  currentStageKey,
  unlocked,
  hasKnownState,
}: {
  stage: PersonaEvolutionStage;
  currentStageKey?: PersonaEvolutionStageKey | null;
  unlocked: Set<PersonaEvolutionStageKey>;
  hasKnownState: boolean;
}) {
  const isCurrent = currentStageKey === stage.key;
  const isUnlocked = isCurrent || unlocked.has(stage.key);
  const isLocked = hasKnownState && !isUnlocked;

  if (isCurrent) {
    return {
      key: "current",
      label: "現在の姿",
      srLabel: `${stage.label}、現在の進化段階`,
      isCurrent,
      isUnlocked,
      isLocked,
    };
  }
  if (isUnlocked) {
    return {
      key: "unlocked",
      label: "解放済み",
      srLabel: `${stage.label}、解放済み`,
      isCurrent,
      isUnlocked,
      isLocked,
    };
  }
  if (isLocked) {
    return {
      key: "locked",
      label: "これから",
      srLabel: `${stage.label}、これから到達する進化段階`,
      isCurrent,
      isUnlocked,
      isLocked,
    };
  }
  return {
    key: "preview",
    label: "進化形態",
    srLabel: `${stage.label}のプレビュー`,
    isCurrent,
    isUnlocked: false,
    isLocked: false,
  };
}

function stageStyle(index: number) {
  return { "--stage-index": index } as CSSProperties;
}

export default function PersonaEvolutionPreviewStrip({
  personaKey,
  displayName,
  currentStageKey = null,
  unlockedStages,
  variant = "strip",
  interactive = false,
  className = "",
}: PersonaEvolutionPreviewStripProps) {
  const unlocked = new Set(unlockedStages ?? []);
  const hasKnownState = Boolean(currentStageKey || (unlockedStages?.length ?? 0) > 0);

  if (variant === "showcase") {
    return (
      <ol
        className={`persona-evo-showcase ${className}`}
        aria-label={`${displayName}の4つの進化形態`}
      >
        {PERSONA_EVOLUTION_STAGES.map((stage, index) => {
          const state = stageState({ stage, currentStageKey, unlocked, hasKnownState });
          return (
            <li
              key={stage.key}
              className="persona-evo-showcase__card"
              data-state={state.key}
              data-stage={stage.key}
              aria-current={state.isCurrent ? "step" : undefined}
              style={stageStyle(index)}
            >
              <span className="persona-evo-showcase__sparkle" aria-hidden="true">
                ✦
              </span>
              <div className="persona-evo-showcase__image">
                <AnimatedPersonaImage
                  personaKey={personaKey}
                  stageKey={stage.key}
                  displayName={`${displayName} ${stage.label}`}
                  variant="thumbnail"
                  motion={stage.key === "final" ? "sparkle" : "idle"}
                  className="h-full w-full rounded-3xl bg-white/80"
                />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-indigo-600">
                    Lv.{stage.level}
                  </span>
                  <span className="text-sm font-bold text-slate-950">{stage.label}</span>
                  <span className="persona-evo-state-badge">{state.label}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-600">{stage.description}</p>
                <span className="sr-only">{state.srLabel}</span>
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <div
      className={`persona-evo-strip persona-evo-strip--${variant} ${
        interactive ? "persona-evo-strip--interactive" : ""
      } ${className}`}
      role="list"
      aria-label={`${displayName}の4つの進化形態`}
    >
      <span className="persona-evo-strip__rail" aria-hidden="true" />
      {PERSONA_EVOLUTION_STAGES.map((stage, index) => {
        const state = stageState({ stage, currentStageKey, unlocked, hasKnownState });
        return (
          <div
            key={stage.key}
            className="persona-evo-strip__item"
            data-state={state.key}
            data-stage={stage.key}
            role="listitem"
            aria-current={state.isCurrent ? "step" : undefined}
            title={`${stage.label}: ${stage.description}`}
            style={stageStyle(index)}
          >
            <span className="persona-evo-strip__halo" aria-hidden="true" />
            <span className="persona-evo-strip__thumb">
              <AnimatedPersonaImage
                personaKey={personaKey}
                stageKey={stage.key}
                displayName={`${displayName} ${stage.label}`}
                variant="thumbnail"
                motion={state.isCurrent ? "sparkle" : "idle"}
                className="h-full w-full rounded-full bg-white/80"
              />
            </span>
            <span className="persona-evo-strip__label">
              {variant === "compact" ? stage.shortLabel : stage.label}
            </span>
            <span className="sr-only">{state.srLabel}</span>
          </div>
        );
      })}
    </div>
  );
}
