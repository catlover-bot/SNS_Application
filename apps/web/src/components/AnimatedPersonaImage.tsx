"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getPersonaProfile,
  type PersonaAnimationStyle,
} from "@/lib/personaCatalog";
import type { PersonaEvolutionStageKey } from "@/lib/personaEvolution";
import { getPersonaBaseImageSrc, getPersonaImageCandidates } from "@/lib/personaImages";

export type PersonaImageVariant = "hero" | "card" | "thumbnail" | "locked";
export type PersonaMotion =
  | "idle"
  | "excited"
  | "sparkle"
  | "sleepy"
  | "logic"
  | "chaos"
  | "gentle";

type Props = {
  personaKey?: string;
  src?: string;
  imageCandidates?: string[];
  stageKey?: PersonaEvolutionStageKey;
  displayName: string;
  iconEmoji?: string;
  silhouetteEmoji?: string;
  variant?: PersonaImageVariant;
  motion?: PersonaMotion;
  locked?: boolean;
  className?: string;
};

const MOTION_STYLE_FALLBACK: Partial<Record<PersonaMotion, PersonaAnimationStyle>> = {
  logic: "logic",
  chaos: "chaos",
  sleepy: "nocturnal",
  gentle: "harmony",
};

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export default function AnimatedPersonaImage({
  personaKey,
  src,
  imageCandidates,
  stageKey,
  displayName,
  iconEmoji,
  silhouetteEmoji,
  variant = "card",
  motion = "idle",
  locked = false,
  className = "",
}: Props) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const profile = useMemo(() => getPersonaProfile(personaKey), [personaKey]);
  const animationStyle =
    profile.animationStyle ?? MOTION_STYLE_FALLBACK[motion] ?? "harmony";
  const candidateImages = useMemo(() => {
    const rawCandidates =
      imageCandidates && imageCandidates.length > 0
        ? imageCandidates
        : src?.trim()
          ? [src]
          : personaKey && stageKey
            ? getPersonaImageCandidates(personaKey, stageKey)
            : personaKey
              ? [getPersonaBaseImageSrc(personaKey)]
              : [];

    return Array.from(
      new Set(rawCandidates.map((candidate) => candidate.trim()).filter(Boolean))
    );
  }, [imageCandidates, personaKey, src, stageKey]);
  const candidateKey = candidateImages.join("\n");
  useEffect(() => {
    setCurrentImageIndex(0);
  }, [candidateKey]);
  const resolvedSrc = candidateImages[currentImageIndex] ?? "";
  const fallbackEmoji =
    iconEmoji?.trim() ||
    profile.iconEmoji ||
    silhouetteEmoji?.trim() ||
    profile.silhouetteEmoji ||
    "🦖";
  const lockedEmoji =
    silhouetteEmoji?.trim() || profile.silhouetteEmoji || fallbackEmoji;
  const accessibleName = displayName.trim() || "恐竜キャラ";
  const showImage = !locked && Boolean(resolvedSrc);

  return (
    <div
      className={joinClasses(
        "persona-motion",
        `persona-motion--${animationStyle}`,
        `persona-motion--${profile.motionIntensity}`,
        `persona-motion--${variant}`,
        `persona-motion--intent-${motion}`,
        locked && "persona-motion--is-locked",
        className
      )}
    >
      <span className="persona-motion__aura" aria-hidden="true" />
      <span className="persona-motion__ring" aria-hidden="true" />
      <span className="persona-motion__sparkle persona-motion__sparkle--one" aria-hidden="true">
        ✦
      </span>
      <span className="persona-motion__sparkle persona-motion__sparkle--two" aria-hidden="true">
        ·
      </span>
      <div className="persona-motion__hover">
        <div className="persona-motion__figure">
          {showImage ? (
            <img
              src={resolvedSrc}
              alt={accessibleName}
              loading={variant === "hero" ? "eager" : "lazy"}
              draggable={false}
              className="persona-motion__image"
              onError={() => {
                setCurrentImageIndex((index) =>
                  candidateImages[index] === resolvedSrc ? index + 1 : index
                );
              }}
            />
          ) : (
            <span
              className="persona-motion__fallback"
              role="img"
              aria-label={locked ? `${accessibleName}（未発見）` : accessibleName}
            >
              {locked ? lockedEmoji : fallbackEmoji}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
