import type { PersonaEvolutionStageKey } from "@/lib/personaEvolution";

function uniqueNonEmpty(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function getPersonaBaseImageSrc(personaKey: string): string {
  return `/persona-images/${encodeURIComponent(personaKey)}.png`;
}

export function getPersonaImageApiSrc(personaKey: string): string {
  return `/api/personas/image/${encodeURIComponent(personaKey)}`;
}

export function getPersonaEvolutionImageSrc(
  personaKey: string,
  stageKey: PersonaEvolutionStageKey
): string {
  return `/persona-images/${encodeURIComponent(personaKey)}_${stageKey}.png`;
}

export function getPersonaImageCandidates(
  personaKey: string,
  stageKey?: PersonaEvolutionStageKey | null
): string[] {
  const candidates: string[] = [];

  if (stageKey) {
    candidates.push(getPersonaEvolutionImageSrc(personaKey, stageKey));
  }

  candidates.push(getPersonaBaseImageSrc(personaKey));
  candidates.push(getPersonaImageApiSrc(personaKey));
  return uniqueNonEmpty(candidates);
}
